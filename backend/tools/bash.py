import asyncio
import os
import re
import subprocess
from typing import Awaitable, Callable
from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path

DANGEROUS_PATTERNS = [
    r"rm\s+-rf\s+/",
    r"sudo\s+rm",
    r">\s*/dev/sd",
    r"mkfs\.",
    r"dd\s+if=.*of=/dev",
    r"chmod\s+777\s+/",
    r":(){ :|:& };:",  # fork bomb
    r"curl.*\|\s*bash",
    r"wget.*\|\s*sh",
]

SAFE_PATTERNS = [
    r"^git\s+(status|log|diff|branch|show)",
    r"^ls(\s|$)",
    r"^pwd$",
    r"^cat\s+",
    r"^echo\s+",
    r"^which\s+",
    r"^python\s+--version",
    r"^node\s+--version",
    r"^npm\s+(list|outdated|audit)",
]


def _max_output_chars() -> int:
    raw = os.getenv("BASH_MAX_OUTPUT_CHARS", "20000").strip()
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


def _translate_windows_unix_command(command: str) -> str | None:
    """Translate common unix shell commands to PowerShell on Windows hosts."""
    raw = (command or "").strip()
    if not raw:
        return None

    normalized = " ".join(raw.split())
    lowered = normalized.lower()

    if lowered == "pwd":
        return "(Get-Location).Path"

    if lowered == "ls" or lowered.startswith("ls "):
        recursive = "--recursive" in lowered or bool(re.search(r"(^|\s)-[a-z]*r[a-z]*(\s|$)", lowered))
        force = bool(re.search(r"(^|\s)-[a-z]*a[a-z]*(\s|$)", lowered))

        parts = ["Get-ChildItem"]
        if recursive:
            parts.append("-Recurse")
        if force:
            parts.append("-Force")
        parts.append("-Name")
        return " ".join(parts)

    return None


class BashTool(BaseTool):
    name = "bash"
    description = (
        "Execute a bash command in the shell. Use for running scripts, git operations, "
        "installing packages, running tests, or any shell operation. "
        "Returns stdout and stderr. Timeout defaults to 30 seconds."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "The bash command to execute",
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
            "Use for shell automation and diagnostics. Prefer non-destructive commands, "
            "and keep execution scoped to the intended project directory."
        )

    def is_dangerous(self, command: str = "", **kwargs) -> bool:
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return True
        return False

    def is_safe(self, command: str = "") -> bool:
        for pattern in SAFE_PATTERNS:
            if re.match(pattern, command.strip(), re.IGNORECASE):
                return True
        return False

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

        while True:
            raw_line = await proc.stdout.readline()
            if not raw_line:
                break

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
        timeout: int = 30,
        cwd: str | None = None,
        on_output: Callable[[str], Awaitable[None]] | None = None,
        **kwargs,
    ) -> ToolResult:
        timeout = min(timeout, 120)
        try:
            effective_cwd = enforce_allowed_path(cwd or ".")
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        if not os.path.isdir(effective_cwd):
            return ToolResult(success=False, output="", error=f"Working directory not found: {effective_cwd}")

        if os.name == "nt":
            translated = _translate_windows_unix_command(command)
            if translated:
                from .powershell import PowerShellTool

                ps_tool = PowerShellTool()
                return await ps_tool.execute(
                    command=translated,
                    timeout=timeout,
                    cwd=effective_cwd,
                    on_output=on_output,
                )

        proc: asyncio.subprocess.Process | None = None
        try:
            try:
                if on_output is None:
                    proc = await asyncio.create_subprocess_shell(
                        command,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=effective_cwd,
                    )
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                    return_code = proc.returncode
                    out = stdout.decode("utf-8", errors="replace")
                    err = stderr.decode("utf-8", errors="replace")
                    combined = out
                    if err:
                        combined += f"\n[stderr]\n{err}" if out else err
                else:
                    proc = await asyncio.create_subprocess_shell(
                        command,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT,
                        cwd=effective_cwd,
                    )
                    combined, return_code = await asyncio.wait_for(
                        self._stream_process_output(proc, on_output),
                        timeout=timeout,
                    )
            except NotImplementedError:
                # Some Windows event loop policies do not support asyncio subprocesses.
                completed = await asyncio.to_thread(
                    subprocess.run,
                    command,
                    shell=True,
                    capture_output=True,
                    cwd=effective_cwd,
                    timeout=timeout,
                )
                stdout = completed.stdout or b""
                stderr = completed.stderr or b""
                return_code = completed.returncode
                out = stdout.decode("utf-8", errors="replace")
                err = stderr.decode("utf-8", errors="replace")
                combined = out
                if err:
                    combined += f"\n[stderr]\n{err}" if out else err

            max_chars = _max_output_chars()
            if len(combined) > max_chars:
                combined = combined[:max_chars] + "\n... [output truncated]"

            error_text: str | None
            if return_code == 0:
                error_text = None
            else:
                detail = combined.strip()
                if detail:
                    compact = " ".join(detail.split())
                    error_text = f"Exit code: {return_code}. {compact[:500]}"
                else:
                    error_text = f"Exit code: {return_code}"

            return ToolResult(
                success=return_code == 0,
                output=combined or "(no output)",
                error=error_text,
                metadata={"exit_code": return_code, "cwd": effective_cwd},
            )
        except (asyncio.TimeoutError, subprocess.TimeoutExpired):
            if proc is not None and proc.returncode is None:
                proc.kill()
                try:
                    await proc.wait()
                except Exception:
                    pass
            return ToolResult(success=False, output="", error=f"Command timed out after {timeout}s")
        except Exception as e:
            msg = str(e).strip() or e.__class__.__name__
            return ToolResult(success=False, output="", error=msg)
