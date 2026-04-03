import json

from mcp.registry import mcp_registry
from .base import BaseTool, ToolResult


class MCPServerAddTool(BaseTool):
    name = "mcp_server_add"
    description = "Register or update an MCP server definition."
    input_schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Unique MCP server name."},
            "command": {"type": "string", "description": "Executable command for MCP server."},
            "args": {"type": "array", "items": {"type": "string"}, "description": "Optional command args."},
            "transport": {"type": "string", "description": "Transport type, usually stdio."},
            "configured_tools": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional declared tool names for discovery display.",
            },
        },
        "required": ["name", "command"],
    }

    async def execute(
        self,
        name: str,
        command: str,
        args: list[str] | None = None,
        transport: str = "stdio",
        configured_tools: list[str] | None = None,
        **kwargs,
    ) -> ToolResult:
        try:
            payload = await mcp_registry.add_server(
                name=name,
                command=command,
                args=args,
                transport=transport,
                configured_tools=configured_tools,
            )
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        return ToolResult(success=True, output=json.dumps(payload))
