import asyncio
import os
import re
import shutil
import subprocess
import sys
from typing import Awaitable, Callable

from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path

# Match clearly destructive/root-level operations.
DANGEROUS_PATTERNS = [
    r"Remove-Item\s+.+-Recurse\s+-Force\s+[A-Za-z]:\\\\\s*$",
    r"Format-Volume\b",
    r"Clear-Disk\b",
    r"Initialize-Disk\b",
    r"Set-Partition\b",
    r"diskpart\b",
    r"\\\\\\.\\PhysicalDrive\d+",
]

SAFE_PATTERNS = [
    r"^Get-ChildItem(\s|$)",
    r"^Get-Location$",
    r"^Get-Content\s+",
    r"^Write-Output\s+",
    r"^Get-Command\s+",
    r"^git\s+(status|log|diff|branch|show)",
]


def _max_output_chars() -> int:
    raw = os.getenv("POWERSHELL_MAX_OUTPUT_CHARS", "20000").strip()
    try:
        value = int(raw)
    except ValueError:
        value = 20000
    return max(2000, min(value, 200000))


def _max_streaming_lines() -> int:
    raw = os.getenv("MAX_STREAMING_LINES", "200").strip()
    try:
        value = int(raw)
    except ValueError:
        value = 200
    return max(1, min(value, 5000))


class PowerShellTool(BaseTool):
    name = "powershell"
    description = (
        "Execute a PowerShell command. Best for Windows-native shell operations, "
        "script automation, and platform-specific diagnostics."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "The PowerShell command to execute",
            },
            "timeout": {
                "type": "integer",
                "description": "Timeout in seconds (default 30, max 120)",
                "default": 30,
            },
            "cwd": {
                "type": "string",
                "description": "Working directory for the command (optional)",
            },
        },
        "required": ["command"],
    }

    def prompt(self) -> str:
        return (
            "Use for Windows-native command execution. Prefer read-only cmdlets first, "
            "and keep commands scoped to the requested project directory."
        )

    def is_dangerous(self, command: str = "", **kwargs) -> bool:
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return True
        return False

    def is_safe(self, command: str = "") -> bool:
        text = command.strip()
        for pattern in SAFE_PATTERNS:
            if re.match(pattern, text, re.IGNORECASE):
                return True
        return False

    async def _spawn_process(
        self,
        command: str,
        *,
        cwd: str,
        merge_stderr: bool,
    ) -> tuple[asyncio.subprocess.Process, str]:
        stderr_target = asyncio.subprocess.STDOUT if merge_stderr else asyncio.subprocess.PIPE
        candidates = ["pwsh", "powershell", "powershell.exe"]

        seen: set[str] = set()
        for shell in candidates:
            if shell in seen:
                continue
            seen.add(shell)

            argv = [
                shell,
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command,
            ]
            try:
                proc = await asyncio.create_subprocess_exec(
                    *argv,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=stderr_target,
                    cwd=cwd,
                )
                return proc, shell
            except FileNotFoundError:
                continue

        raise FileNotFoundError("PowerShell executable not found (pwsh/powershell).")

    async def _stream_process_output(
        self,
        proc: asyncio.subprocess.Process,
        on_output: Callable[[str], Awaitable[None]],
    ) -> tuple[str, int]:
        if proc.stdout is None:
            return "", await proc.wait()

        lines: list[str] = []
        streamed_lines = 0
        dropped_lines = 0
        max_streaming_lines = _max_streaming_lines()

        async for raw_line in proc.stdout:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            lines.append(line)

            if streamed_lines < max_streaming_lines:
                try:
                    await on_output(line)
                except Exception:
                    pass
                streamed_lines += 1
            else:
                dropped_lines += 1

        return_code = await proc.wait()

        if dropped_lines > 0:
            truncated_line = f"[... output truncated - {dropped_lines} more lines ...]"
            lines.append(truncated_line)
            try:
                await on_output(truncated_line)
            except Exception:
                pass

        return "\n".join(lines), return_code

    async def execute(
        self,
        command: str,
        cwd: str | None = None,
        timeout: int | None = None,
        on_output: Callable[[str], Awaitable[None]] | None = None,
        **kwargs,
    ) -> ToolResult:
        timeout_seconds = 30 if timeout is None else max(1, min(int(timeout), 120))

        try:
            effective_cwd = enforce_allowed_path(cwd or ".")
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        if not os.path.isdir(effective_cwd):
            return ToolResult(success=False, output="", error=f"Working directory not found: {effective_cwd}")

        proc: asyncio.subprocess.Process | None = None
        shell = "pwsh"
        try:
            try:
                if on_output is None:
                    proc, shell = await self._spawn_process(command, cwd=effective_cwd, merge_stderr=False)
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
                    return_code = proc.returncode

                    out = stdout.decode("utf-8", errors="replace")
                    err = stderr.decode("utf-8", errors="replace")
                    combined = out
                    if err:
                        combined += f"\n[stderr]\n{err}" if out else err
                else:
                    proc, shell = await self._spawn_process(command, cwd=effective_cwd, merge_stderr=True)
                    combined, return_code = await asyncio.wait_for(
                        self._stream_process_output(proc, on_output),
                        timeout=timeout_seconds,
                    )
            except FileNotFoundError as exc:
                return ToolResult(success=False, output="", error=str(exc))
            except NotImplementedError:
                shell = "pwsh" if shutil.which("pwsh") else ("powershell.exe" if sys.platform == "win32" else "powershell")
                argv = [
                    shell,
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    command,
                ]
                completed = await asyncio.to_thread(
                    subprocess.run,
                    argv,
                    capture_output=True,
                    cwd=effective_cwd,
                    timeout=timeout_seconds,
                )
                stdout = completed.stdout or b""
                stderr = completed.stderr or b""
                return_code = completed.returncode

                out = stdout.decode("utf-8", errors="replace")
                err = stderr.decode("utf-8", errors="replace")
                combined = out
                if err:
                    combined += f"\n[stderr]\n{err}" if out else err

                if on_output is not None:
                    streamed_lines = 0
                    dropped_lines = 0
                    max_streaming_lines = _max_streaming_lines()
                    for line in combined.splitlines():
                        if streamed_lines < max_streaming_lines:
                            try:
                                await on_output(line)
                            except Exception:
                                pass
                            streamed_lines += 1
                        else:
                            dropped_lines += 1
                    if dropped_lines > 0:
                        truncated_line = f"[... output truncated - {dropped_lines} more lines ...]"
                        try:
                            await on_output(truncated_line)
                        except Exception:
                            pass

            max_chars = _max_output_chars()
            if len(combined) > max_chars:
                combined = combined[:max_chars] + "\n... [output truncated]"

            return ToolResult(
                success=return_code == 0,
                output=combined or "(no output)",
                error=None if return_code == 0 else f"Exit code: {return_code}",
                metadata={"exit_code": return_code, "cwd": effective_cwd, "shell": shell},
            )
        except (asyncio.TimeoutError, subprocess.TimeoutExpired):
            if proc is not None and proc.returncode is None:
                proc.kill()
                try:
                    await proc.wait()
                except Exception:
                    pass
            return ToolResult(success=False, output="", error=f"Command timed out after {timeout_seconds}s")
        except Exception as e:
            msg = str(e).strip() or e.__class__.__name__
            return ToolResult(success=False, output="", error=msg)
