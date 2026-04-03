import json

from agent.coordinator import agent_coordinator
from .base import BaseTool, ToolResult


class AgentGetTool(BaseTool):
    name = "agent_get"
    description = "Get details for a spawned sub-agent by agent_id."
    input_schema = {
        "type": "object",
        "properties": {
            "agent_id": {"type": "string", "description": "Agent identifier."},
        },
        "required": ["agent_id"],
    }

    async def execute(self, agent_id: str, **kwargs) -> ToolResult:
        payload = await agent_coordinator.get_agent(agent_id)
        if payload is None:
            return ToolResult(success=False, output="", error=f"Agent not found: {agent_id}")
        return ToolResult(success=True, output=json.dumps(payload))
