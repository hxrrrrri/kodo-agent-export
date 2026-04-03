from .bash import BashTool
from .powershell import PowerShellTool
from .repl import ReplTool
from .file_read import FileReadTool
from .file_write import FileWriteTool
from .file_edit import FileEditTool
from .grep import GrepTool
from .glob_tool import GlobTool
from .web_fetch import WebFetchTool
from .task_create import TaskCreateTool
from .task_list import TaskListTool
from .task_get import TaskGetTool
from .task_stop import TaskStopTool
from .mcp_server_add import MCPServerAddTool
from .mcp_server_list import MCPServerListTool
from .mcp_server_remove import MCPServerRemoveTool
from .mcp_tool_call import MCPToolCallTool
from .agent_spawn import AgentSpawnTool
from .agent_list import AgentListTool
from .agent_get import AgentGetTool
from .agent_stop import AgentStopTool
from .skill_list import SkillListTool
from .skill_get import SkillGetTool
from .memory_write import MemoryWriteTool
from .base import BaseTool, ToolResult

ALL_TOOLS: list[BaseTool] = [
    BashTool(),
    PowerShellTool(),
    ReplTool(),
    FileReadTool(),
    FileWriteTool(),
    FileEditTool(),
    GrepTool(),
    GlobTool(),
    WebFetchTool(),
    TaskCreateTool(),
    TaskListTool(),
    TaskGetTool(),
    TaskStopTool(),
    MCPServerAddTool(),
    MCPServerListTool(),
    MCPServerRemoveTool(),
    MCPToolCallTool(),
    AgentSpawnTool(),
    AgentListTool(),
    AgentGetTool(),
    AgentStopTool(),
    SkillListTool(),
    SkillGetTool(),
    MemoryWriteTool(),
]

TOOL_MAP: dict[str, BaseTool] = {t.name: t for t in ALL_TOOLS}

__all__ = ["ALL_TOOLS", "TOOL_MAP", "BaseTool", "ToolResult"]
