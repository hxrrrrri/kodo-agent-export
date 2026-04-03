import json

from tasks.manager import task_manager
from .base import BaseTool, ToolResult


class TaskStopTool(BaseTool):
    name = "task_stop"
    description = "Stop a running background task by task_id."
    input_schema = {
        "type": "object",
        "properties": {
            "task_id": {"type": "string", "description": "Task identifier."},
        },
        "required": ["task_id"],
    }

    async def execute(self, task_id: str, **kwargs) -> ToolResult:
        stopped = await task_manager.stop_task(task_id)
        if not stopped:
            return ToolResult(success=False, output="", error=f"Task is not running or not found: {task_id}")
        payload = await task_manager.get_task(task_id)
        return ToolResult(success=True, output=json.dumps(payload or {"task_id": task_id, "status": "cancelled"}))
