import json

from mcp.registry import mcp_registry
from .base import BaseTool, ToolResult


class MCPServerListTool(BaseTool):
    name = "mcp_server_list"
    description = "List configured MCP servers."
    input_schema = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    async def execute(self, **kwargs) -> ToolResult:
        servers = await mcp_registry.list_servers()
        return ToolResult(success=True, output=json.dumps(servers))
