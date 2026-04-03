import json

from tasks.manager import task_manager
from .base import BaseTool, ToolResult


class TaskGetTool(BaseTool):
    name = "task_get"
    description = "Get details for a background task by task_id."
    input_schema = {
        "type": "object",
        "properties": {
            "task_id": {"type": "string", "description": "Task identifier."},
        },
        "required": ["task_id"],
    }

    async def execute(self, task_id: str, **kwargs) -> ToolResult:
        payload = await task_manager.get_task(task_id)
        if payload is None:
            return ToolResult(success=False, output="", error=f"Task not found: {task_id}")
        return ToolResult(success=True, output=json.dumps(payload))
