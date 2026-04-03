import os
import difflib
import aiofiles
from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path


class FileEditTool(BaseTool):
    name = "file_edit"
    description = (
        "Edit a file by replacing a specific string with new content. "
        "The old_str must match EXACTLY (including whitespace/indentation) and appear exactly once. "
        "Prefer this over file_write for targeted changes."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Path to the file to edit",
            },
            "old_str": {
                "type": "string",
                "description": "The exact string to find and replace (must be unique in file)",
            },
            "new_str": {
                "type": "string",
                "description": "The replacement string",
            },
        },
        "required": ["path", "old_str", "new_str"],
    }

    async def execute(self, path: str, old_str: str, new_str: str, **kwargs) -> ToolResult:
        try:
            path = enforce_allowed_path(path)
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        if not os.path.exists(path):
            return ToolResult(success=False, output="", error=f"File not found: {path}")

        try:
            async with aiofiles.open(path, "r", encoding="utf-8", errors="replace") as f:
                content = await f.read()

            count = content.count(old_str)
            if count == 0:
                # Try to give helpful context
                lines = content.splitlines()
                preview = "\n".join(f"  {i+1}: {line_text}" for i, line_text in enumerate(lines[:20]))
                return ToolResult(
                    success=False,
                    output="",
                    error=f"old_str not found in file. First 20 lines:\n{preview}",
                )
            if count > 1:
                return ToolResult(
                    success=False,
                    output="",
                    error=f"old_str found {count} times — must be unique. Make old_str more specific.",
                )

            new_content = content.replace(old_str, new_str, 1)

            async with aiofiles.open(path, "w", encoding="utf-8") as f:
                await f.write(new_content)

            original_lines = content.splitlines(keepends=True)
            updated_lines = new_content.splitlines(keepends=True)
            diff_lines = list(
                difflib.unified_diff(
                    original_lines,
                    updated_lines,
                    fromfile=f"a/{os.path.basename(path)}",
                    tofile=f"b/{os.path.basename(path)}",
                    lineterm="",
                )
            )
            diff_text = "\n".join(diff_lines)
            changed_lines = len(
                [line for line in diff_lines if (line.startswith("+") or line.startswith("-")) and not line.startswith(("+++", "---"))]
            )

            return ToolResult(
                success=True,
                output=f"Edit applied to {path}",
                metadata={
                    "path": path,
                    "diff": diff_text,
                    "lines_changed": changed_lines,
                },
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
