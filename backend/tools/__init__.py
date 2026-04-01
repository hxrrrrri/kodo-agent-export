from .bash import BashTool
from .file_read import FileReadTool
from .file_write import FileWriteTool
from .file_edit import FileEditTool
from .grep import GrepTool
from .glob_tool import GlobTool
from .web_fetch import WebFetchTool
from .base import BaseTool, ToolResult

ALL_TOOLS: list[BaseTool] = [
    BashTool(),
    FileReadTool(),
    FileWriteTool(),
    FileEditTool(),
    GrepTool(),
    GlobTool(),
    WebFetchTool(),
]

TOOL_MAP: dict[str, BaseTool] = {t.name: t for t in ALL_TOOLS}

__all__ = ["ALL_TOOLS", "TOOL_MAP", "BaseTool", "ToolResult"]
