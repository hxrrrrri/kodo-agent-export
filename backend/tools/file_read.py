import os
import aiofiles
from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path

MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_KB", "500")) * 1024

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"}
BINARY_EXTENSIONS = {".exe", ".bin", ".so", ".dylib", ".pyc", ".class", ".zip", ".tar", ".gz"}


class FileReadTool(BaseTool):
    name = "file_read"
    description = (
        "Read the contents of a file at a given path. Returns the file content as text. "
        "Supports reading specific line ranges. Handles large files by truncating."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute or relative path to the file",
            },
            "start_line": {
                "type": "integer",
                "description": "Starting line number (1-indexed, optional)",
            },
            "end_line": {
                "type": "integer",
                "description": "Ending line number (1-indexed, optional)",
            },
        },
        "required": ["path"],
    }

    async def execute(self, path: str, start_line: int | None = None, end_line: int | None = None, **kwargs) -> ToolResult:
        try:
            path = enforce_allowed_path(path)
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        if not os.path.exists(path):
            return ToolResult(success=False, output="", error=f"File not found: {path}")

        if not os.path.isfile(path):
            return ToolResult(success=False, output="", error=f"Not a file: {path}")

        ext = os.path.splitext(path)[1].lower()
        if ext in BINARY_EXTENSIONS:
            return ToolResult(success=False, output="", error=f"Binary file not readable: {path}")

        if ext in IMAGE_EXTENSIONS:
            size = os.path.getsize(path)
            return ToolResult(success=True, output=f"[Image file: {path}, {size} bytes]", metadata={"type": "image"})

        file_size = os.path.getsize(path)
        if file_size > MAX_FILE_SIZE:
            return ToolResult(success=False, output="", error=f"File too large ({file_size // 1024}KB). Max: {MAX_FILE_SIZE // 1024}KB")

        try:
            async with aiofiles.open(path, "r", encoding="utf-8", errors="replace") as f:
                content = await f.read()

            lines = content.splitlines(keepends=True)
            total_lines = len(lines)

            if start_line is not None or end_line is not None:
                s = (start_line - 1) if start_line else 0
                e = end_line if end_line else total_lines
                s = max(0, s)
                e = min(total_lines, e)
                selected = lines[s:e]
                # Add line numbers
                numbered = "".join(f"{s + i + 1:4d}\t{line}" for i, line in enumerate(selected))
                return ToolResult(
                    success=True,
                    output=numbered,
                    metadata={"path": path, "lines_shown": f"{s+1}-{e}", "total_lines": total_lines},
                )

            # Add line numbers for full file
            numbered = "".join(f"{i+1:4d}\t{line}" for i, line in enumerate(lines))
            return ToolResult(
                success=True,
                output=numbered,
                metadata={"path": path, "total_lines": total_lines, "size_bytes": file_size},
            )

        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
