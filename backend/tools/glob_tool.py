import glob as glob_module
import os
from .base import BaseTool, ToolResult


class GlobTool(BaseTool):
    name = "glob"
    description = (
        "Find files matching a glob pattern. Returns a list of matching file paths. "
        "Useful for discovering files in a project."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "description": "Glob pattern, e.g. '**/*.py', 'src/**/*.ts', '*.json'",
            },
            "base_dir": {
                "type": "string",
                "description": "Base directory for the search (default: current dir)",
                "default": ".",
            },
            "max_results": {
                "type": "integer",
                "description": "Max number of results (default: 100)",
                "default": 100,
            },
        },
        "required": ["pattern"],
    }

    async def execute(self, pattern: str, base_dir: str = ".", max_results: int = 100, **kwargs) -> ToolResult:
        base_dir = os.path.expanduser(base_dir)

        try:
            full_pattern = os.path.join(base_dir, pattern)
            matches = glob_module.glob(full_pattern, recursive=True)

            # Filter out common noise
            ignore = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next"}
            matches = [m for m in matches if not any(part in ignore for part in m.split(os.sep))]
            matches.sort()

            if len(matches) > max_results:
                shown = matches[:max_results]
                output = "\n".join(shown) + f"\n... [{len(matches)} total, showing {max_results}]"
            else:
                output = "\n".join(matches) if matches else "No files found matching pattern"

            return ToolResult(
                success=True,
                output=output,
                metadata={"total_matches": len(matches), "pattern": pattern},
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
