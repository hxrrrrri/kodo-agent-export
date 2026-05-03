import json

from skills.registry import skill_registry
from .base import BaseTool, ToolResult


class SkillListTool(BaseTool):
    name = "skill_list"
    description = "List project, custom, and bundled skills available for specialized workflows."
    input_schema = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    async def execute(self, **kwargs) -> ToolResult:
        return ToolResult(success=True, output=json.dumps(skill_registry.list_skills()))
