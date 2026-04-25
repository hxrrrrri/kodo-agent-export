from .bash import BashTool
from .powershell import PowerShellTool
from .repl import ReplTool
from .file_read import FileReadTool
from .file_write import FileWriteTool
from .file_edit import FileEditTool
from .grep import GrepTool
from .glob_tool import GlobTool
from .web_fetch import WebFetchTool
from .krawlx import KrawlXTool
from .web_search import WebSearchTool
from .git_tool import GitTool
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
from .image_gen import ImageGenTool
from .screenshot import ScreenshotTool
from .database_query import DatabaseQueryTool
from .send_email import SendEmailTool
from .caveman import CavemanTool
from .crg_build_graph import CRGBuildGraphTool
from .crg_detect_changes import CRGDetectChangesTool
from .crg_get_impact_radius import CRGGetImpactRadiusTool
from .crg_query_graph import CRGQueryGraphTool
from .crg_semantic_search import CRGSemanticSearchTool
from .crg_get_architecture import CRGGetArchitectureTool
from .crg_list_flows import CRGListFlowsTool
from .crg_refactor import CRGRefactorTool
from .crg_get_review_context import CRGGetReviewContextTool
from .browser_harness import BrowserHarnessTool
from .browser_actions import BROWSER_ACTION_TOOLS
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
    KrawlXTool(),
    WebSearchTool(),
    GitTool(),
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
    ImageGenTool(),
    ScreenshotTool(),
    DatabaseQueryTool(),
    SendEmailTool(),
    CavemanTool(),
    CRGBuildGraphTool(),
    CRGDetectChangesTool(),
    CRGGetImpactRadiusTool(),
    CRGQueryGraphTool(),
    CRGSemanticSearchTool(),
    CRGGetArchitectureTool(),
    CRGListFlowsTool(),
    CRGRefactorTool(),
    CRGGetReviewContextTool(),
    BrowserHarnessTool(),
    *BROWSER_ACTION_TOOLS,
]

TOOL_MAP: dict[str, BaseTool] = {t.name: t for t in ALL_TOOLS}

__all__ = ["ALL_TOOLS", "TOOL_MAP", "BaseTool", "ToolResult"]
