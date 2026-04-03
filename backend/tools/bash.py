import asyncio
import os
import re
import subprocess
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

    async def execute(self, command: str, timeout: int = 30, cwd: str | None = None, **kwargs) -> ToolResult:
        timeout = min(timeout, 120)
        try:
            effective_cwd = enforce_allowed_path(cwd or ".")
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        if not os.path.isdir(effective_cwd):
            return ToolResult(success=False, output="", error=f"Working directory not found: {effective_cwd}")

        try:
            try:
                proc = await asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=effective_cwd,
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                return_code = proc.returncode
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

            return ToolResult(
                success=return_code == 0,
                output=combined or "(no output)",
                error=None if return_code == 0 else f"Exit code: {return_code}",
                metadata={"exit_code": return_code, "cwd": effective_cwd},
            )
        except (asyncio.TimeoutError, subprocess.TimeoutExpired):
            return ToolResult(success=False, output="", error=f"Command timed out after {timeout}s")
        except Exception as e:
            msg = str(e).strip() or e.__class__.__name__
            return ToolResult(success=False, output="", error=msg)
