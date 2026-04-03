import json

from agent.coordinator import agent_coordinator
from .base import BaseTool, ToolResult


class AgentSpawnTool(BaseTool):
    name = "agent_spawn"
    description = "Spawn a sub-agent as a background task with a specific goal and role."
    input_schema = {
        "type": "object",
        "properties": {
            "goal": {"type": "string", "description": "Goal prompt for the sub-agent."},
            "role": {"type": "string", "description": "Optional role label for the sub-agent."},
            "project_dir": {"type": "string", "description": "Optional project directory context."},
            "parent_session_id": {"type": "string", "description": "Optional parent session id."},
        },
        "required": ["goal"],
    }

    async def execute(
        self,
        goal: str,
        role: str = "general",
        project_dir: str | None = None,
        parent_session_id: str | None = None,
        **kwargs,
    ) -> ToolResult:
        try:
            payload = await agent_coordinator.spawn_agent(
                goal=goal,
                role=role,
                project_dir=project_dir,
                parent_session_id=parent_session_id,
            )
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        return ToolResult(success=True, output=json.dumps(payload), metadata={"agent_id": payload.get("agent_id")})
