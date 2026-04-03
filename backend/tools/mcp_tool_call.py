import json
from typing import Any

from mcp.registry import mcp_registry
from mcp.stdio_client import MCPClientError
from .base import BaseTool, ToolResult


class MCPToolCallTool(BaseTool):
    name = "mcp_tool_call"
    description = "Execute a tool exposed by a configured MCP server over stdio transport."
    input_schema = {
        "type": "object",
        "properties": {
            "server_name": {
                "type": "string",
                "description": "Name of the configured MCP server.",
            },
            "tool_name": {
                "type": "string",
                "description": "MCP tool name to execute.",
            },
            "arguments": {
                "type": "object",
                "description": "Arguments object passed directly to the MCP tool.",
                "default": {},
            },
            "timeout_seconds": {
                "type": "integer",
                "description": "Execution timeout in seconds (default 20, max 120).",
                "default": 20,
            },
        },
        "required": ["server_name", "tool_name"],
    }

    async def execute(
        self,
        server_name: str,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        timeout_seconds: int = 20,
        **kwargs,
    ) -> ToolResult:
        try:
            payload = await mcp_registry.call_tool(
                server_name=server_name,
                tool_name=tool_name,
                arguments=arguments or {},
                timeout_seconds=max(3, min(timeout_seconds, 120)),
            )
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))
        except MCPClientError as e:
            return ToolResult(success=False, output="", error=f"MCP runtime error: {e}")
        except Exception as e:
            return ToolResult(success=False, output="", error=f"MCP execution failed: {e}")

        return ToolResult(success=True, output=json.dumps(payload))
