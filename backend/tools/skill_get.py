import json

from skills.registry import skill_registry
from .base import BaseTool, ToolResult


class SkillGetTool(BaseTool):
    name = "skill_get"
    description = "Get a project, custom, or bundled skill document by name."
    input_schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Skill name without .md extension."},
        },
        "required": ["name"],
    }

    async def execute(self, name: str, **kwargs) -> ToolResult:
        payload = skill_registry.get_skill(name)
        if payload is None:
            return ToolResult(success=False, output="", error=f"Skill not found: {name}")
        return ToolResult(success=True, output=json.dumps(payload))
