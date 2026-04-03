import json

from agent.coordinator import agent_coordinator
from .base import BaseTool, ToolResult


class AgentListTool(BaseTool):
    name = "agent_list"
    description = "List spawned sub-agents and current statuses."
    input_schema = {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Maximum agents to list (default 20)."},
        },
        "required": [],
    }

    async def execute(self, limit: int = 20, **kwargs) -> ToolResult:
        payload = await agent_coordinator.list_agents(limit=limit)
        return ToolResult(success=True, output=json.dumps(payload))
