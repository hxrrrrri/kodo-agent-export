import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles
from mcp.stdio_client import MCPClientError, call_tool_for_server, list_tools_for_server

KODO_DIR = Path.home() / ".kodo"
MCP_DIR = KODO_DIR / "mcp"
SERVERS_FILE = MCP_DIR / "servers.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MCPRegistry:
    def __init__(self) -> None:
        MCP_DIR.mkdir(parents=True, exist_ok=True)

    async def _load_servers(self) -> list[dict[str, Any]]:
        if not SERVERS_FILE.exists():
            return []
        async with aiofiles.open(SERVERS_FILE, "r") as f:
            data = json.loads(await f.read())
        if isinstance(data, list):
            return data
        return []

    async def _save_servers(self, servers: list[dict[str, Any]]) -> None:
        async with aiofiles.open(SERVERS_FILE, "w") as f:
            await f.write(json.dumps(servers, indent=2))

    async def list_servers(self) -> list[dict[str, Any]]:
        servers = await self._load_servers()
        servers.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
        return servers

    async def add_server(
        self,
        *,
        name: str,
        command: str,
        args: list[str] | None = None,
        transport: str = "stdio",
        env: dict[str, str] | None = None,
        configured_tools: list[str] | None = None,
    ) -> dict[str, Any]:
        server_name = name.strip()
        if not server_name:
            raise ValueError("name is required")
        if not command.strip():
            raise ValueError("command is required")

        servers = await self._load_servers()
        servers = [item for item in servers if str(item.get("name", "")) != server_name]

        payload: dict[str, Any] = {
            "name": server_name,
            "transport": transport.strip() or "stdio",
            "command": command.strip(),
            "args": list(args or []),
            "env": dict(env or {}),
            "configured_tools": list(configured_tools or []),
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
        }
        servers.append(payload)
        await self._save_servers(servers)
        return payload

    async def remove_server(self, name: str) -> bool:
        server_name = name.strip()
        servers = await self._load_servers()
        kept = [item for item in servers if str(item.get("name", "")) != server_name]
        removed = len(servers) != len(kept)
        if removed:
            await self._save_servers(kept)
        return removed

    async def get_server(self, name: str) -> dict[str, Any] | None:
        server_name = name.strip()
        for item in await self._load_servers():
            if str(item.get("name", "")) == server_name:
                return item
        return None

    async def discover_tools(self, name: str) -> list[dict[str, Any]]:
        server = await self.get_server(name)
        if server is None:
            raise ValueError("MCP server not found")

        configured = server.get("configured_tools", [])
        if not isinstance(configured, list):
            configured = []

        tools: list[dict[str, Any]] = []
        for item in configured:
            tool_name = str(item).strip()
            if not tool_name:
                continue
            tools.append({
                "name": tool_name,
                "source": "configured",
                "server": str(server.get("name", "")),
            })

        try:
            discovered = await list_tools_for_server(server, timeout_seconds=8)
        except (MCPClientError, ValueError):
            discovered = []

        existing_names = {str(item.get("name", "")) for item in tools}
        for item in discovered:
            tool_name = str(item.get("name", "")).strip()
            if not tool_name or tool_name in existing_names:
                continue
            tools.append({
                "name": tool_name,
                "description": str(item.get("description", "")),
                "source": "mcp-live",
                "server": str(server.get("name", "")),
            })
            existing_names.add(tool_name)

        return tools

    async def call_tool(
        self,
        server_name: str,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        timeout_seconds: int = 20,
    ) -> dict[str, Any]:
        server = await self.get_server(server_name)
        if server is None:
            raise ValueError("MCP server not found")

        resolved_name = str(tool_name).strip()
        if not resolved_name:
            raise ValueError("tool_name is required")

        payload = arguments or {}
        if not isinstance(payload, dict):
            raise ValueError("arguments must be an object")

        result = await call_tool_for_server(
            server,
            tool_name=resolved_name,
            arguments=payload,
            timeout_seconds=max(3, min(timeout_seconds, 120)),
        )

        return {
            "server": str(server.get("name", "")),
            "tool": resolved_name,
            "arguments": payload,
            "result": result,
            "executed_at": _utc_now(),
        }


mcp_registry = MCPRegistry()
