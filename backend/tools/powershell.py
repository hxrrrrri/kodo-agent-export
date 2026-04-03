import asyncio
import os
import re
import subprocess
import sys

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

    async def execute(self, command: str, timeout: int = 30, cwd: str | None = None, **kwargs) -> ToolResult:
        timeout = max(1, min(int(timeout), 120))

        try:
            effective_cwd = enforce_allowed_path(cwd or ".")
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        if not os.path.isdir(effective_cwd):
            return ToolResult(success=False, output="", error=f"Working directory not found: {effective_cwd}")

        shell = "powershell.exe" if sys.platform == "win32" else "pwsh"
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
                stderr=asyncio.subprocess.PIPE,
                cwd=effective_cwd,
            )
        except FileNotFoundError:
            return ToolResult(
                success=False,
                output="",
                error=f"PowerShell executable not found ({shell}).",
            )
        except NotImplementedError:
            proc = None
        except Exception as e:
            msg = str(e).strip() or e.__class__.__name__
            return ToolResult(success=False, output="", error=msg)

        try:
            if proc is not None:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                return_code = proc.returncode
            else:
                completed = await asyncio.to_thread(
                    subprocess.run,
                    argv,
                    capture_output=True,
                    cwd=effective_cwd,
                    timeout=timeout,
                )
                stdout = completed.stdout or b""
                stderr = completed.stderr or b""
                return_code = completed.returncode
        except asyncio.TimeoutError:
            if proc is not None:
                proc.kill()
                await proc.wait()
            return ToolResult(success=False, output="", error=f"Command timed out after {timeout}s")
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, output="", error=f"Command timed out after {timeout}s")

        out = stdout.decode("utf-8", errors="replace")
        err = stderr.decode("utf-8", errors="replace")

        combined = out
        if err:
            combined += f"\n[stderr]\n{err}" if out else err

        if len(combined) > 20000:
            combined = combined[:20000] + "\n... [output truncated]"

        return ToolResult(
            success=return_code == 0,
            output=combined or "(no output)",
            error=None if return_code == 0 else f"Exit code: {return_code}",
            metadata={"exit_code": return_code, "cwd": effective_cwd, "shell": shell},
        )
