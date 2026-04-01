import os
import aiofiles
from .base import BaseTool, ToolResult


class FileWriteTool(BaseTool):
    name = "file_write"
    description = (
        "Write content to a file, creating it if it doesn't exist or overwriting if it does. "
        "Creates parent directories automatically. Use file_edit for partial changes."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Path to write the file to",
            },
            "content": {
                "type": "string",
                "description": "Full content to write to the file",
            },
        },
        "required": ["path", "content"],
    }

    def is_dangerous(self, path: str = "", **kwargs) -> bool:
        dangerous_paths = ["/etc/", "/usr/", "/bin/", "/sbin/", "/boot/"]
        path = os.path.expanduser(path)
        return any(path.startswith(p) for p in dangerous_paths)

    async def execute(self, path: str, content: str, **kwargs) -> ToolResult:
        path = os.path.expanduser(path)

        try:
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            async with aiofiles.open(path, "w", encoding="utf-8") as f:
                await f.write(content)

            size = os.path.getsize(path)
            lines = content.count("\n") + 1
            return ToolResult(
                success=True,
                output=f"Written {lines} lines ({size} bytes) to {path}",
                metadata={"path": path, "size_bytes": size, "lines": lines},
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
