import asyncio
import os
import shutil
import subprocess
from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path


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
        try:
            search_path = enforce_allowed_path(path or ".")
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        if not os.path.exists(search_path):
            return ToolResult(success=False, output="", error=f"Search path not found: {search_path}")

        # Try ripgrep first, fall back to grep.
        use_rg = shutil.which("rg") is not None

        if use_rg:
            cmd = ["rg", "--line-number", "--no-heading", "--color=never"]
            if not case_sensitive:
                cmd.append("-i")
            if include:
                cmd.extend(["-g", include])
            cmd.extend(["-m", str(max_results), pattern, search_path])
        else:
            cmd = ["grep", "-rn", "--include=" + (include or "*")]
            if not case_sensitive:
                cmd.append("-i")
            cmd.extend([pattern, search_path])

        try:
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            except NotImplementedError:
                completed = await asyncio.to_thread(
                    subprocess.run,
                    cmd,
                    capture_output=True,
                    timeout=30,
                )
                stdout = completed.stdout or b""
                stderr = completed.stderr or b""

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
                metadata={"match_count": len(lines), "pattern": pattern, "path": search_path},
            )
        except asyncio.TimeoutError:
            return ToolResult(success=False, output="", error="Grep timed out after 30s")
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, output="", error="Grep timed out after 30s")
        except Exception as e:
            msg = str(e).strip() or e.__class__.__name__
            return ToolResult(success=False, output="", error=msg)
