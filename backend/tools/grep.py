import asyncio
import os
from .base import BaseTool, ToolResult


class GrepTool(BaseTool):
    name = "grep"
    description = (
        "Search for a pattern in files using ripgrep (or grep as fallback). "
        "Returns matching lines with file paths and line numbers. "
        "Supports regex patterns."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "description": "Regex pattern to search for",
            },
            "path": {
                "type": "string",
                "description": "Directory or file to search in (default: current dir)",
                "default": ".",
            },
            "include": {
                "type": "string",
                "description": "File glob to include, e.g. '*.py' or '*.ts'",
            },
            "case_sensitive": {
                "type": "boolean",
                "description": "Whether search is case-sensitive (default: false)",
                "default": False,
            },
            "max_results": {
                "type": "integer",
                "description": "Max number of results (default: 50)",
                "default": 50,
            },
        },
        "required": ["pattern"],
    }

    async def execute(
        self,
        pattern: str,
        path: str = ".",
        include: str | None = None,
        case_sensitive: bool = False,
        max_results: int = 50,
        **kwargs,
    ) -> ToolResult:
        path = os.path.expanduser(path)

        # Try ripgrep first, fall back to grep
        try:
            proc = await asyncio.create_subprocess_shell("which rg", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            await proc.communicate()
            use_rg = proc.returncode == 0
        except Exception:
            use_rg = False

        if use_rg:
            cmd = ["rg", "--line-number", "--no-heading", "--color=never"]
            if not case_sensitive:
                cmd.append("-i")
            if include:
                cmd.extend(["-g", include])
            cmd.extend(["-m", str(max_results), pattern, path])
        else:
            cmd = ["grep", "-rn", "--include=" + (include or "*")]
            if not case_sensitive:
                cmd.append("-i")
            cmd.extend([pattern, path])

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            output = stdout.decode("utf-8", errors="replace").strip()

            if not output:
                return ToolResult(success=True, output=f"No matches found for: {pattern}")

            lines = output.splitlines()
            if len(lines) > max_results:
                lines = lines[:max_results]
                output = "\n".join(lines) + f"\n... [{len(lines)} results shown, limit reached]"
            else:
                output = "\n".join(lines)

            return ToolResult(
                success=True,
                output=output,
                metadata={"match_count": len(lines), "pattern": pattern},
            )
        except asyncio.TimeoutError:
            return ToolResult(success=False, output="", error="Grep timed out after 30s")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
