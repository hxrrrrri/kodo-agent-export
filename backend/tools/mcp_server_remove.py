import json

from mcp.registry import mcp_registry
from .base import BaseTool, ToolResult


class MCPServerRemoveTool(BaseTool):
    name = "mcp_server_remove"
    description = "Remove a configured MCP server by name."
    input_schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "MCP server name."},
        },
        "required": ["name"],
    }

    async def execute(self, name: str, **kwargs) -> ToolResult:
        removed = await mcp_registry.remove_server(name)
        if not removed:
            return ToolResult(success=False, output="", error=f"MCP server not found: {name}")
        return ToolResult(success=True, output=json.dumps({"removed": True, "name": name}))
