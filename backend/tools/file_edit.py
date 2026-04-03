import os
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

            # Build a minimal diff preview
            old_lines = old_str.splitlines()
            new_lines = new_str.splitlines()
            diff_preview = "\n".join(f"- {line_text}" for line_text in old_lines[:5])
            diff_preview += "\n" + "\n".join(f"+ {line_text}" for line_text in new_lines[:5])
            if len(old_lines) > 5 or len(new_lines) > 5:
                diff_preview += "\n... (truncated)"

            return ToolResult(
                success=True,
                output=f"Edit applied to {path}\n\n{diff_preview}",
                metadata={"path": path},
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
