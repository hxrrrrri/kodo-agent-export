import asyncio
import os
import re
from .base import BaseTool, ToolResult

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
        effective_cwd = cwd or os.getcwd()

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=effective_cwd,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            out = stdout.decode("utf-8", errors="replace")
            err = stderr.decode("utf-8", errors="replace")

            combined = out
            if err:
                combined += f"\n[stderr]\n{err}" if out else err

            # Truncate very long output
            if len(combined) > 20000:
                combined = combined[:20000] + "\n... [output truncated]"

            return ToolResult(
                success=proc.returncode == 0,
                output=combined or "(no output)",
                error=None if proc.returncode == 0 else f"Exit code: {proc.returncode}",
                metadata={"exit_code": proc.returncode, "cwd": effective_cwd},
            )
        except asyncio.TimeoutError:
            return ToolResult(success=False, output="", error=f"Command timed out after {timeout}s")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
