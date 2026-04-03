import json

from tasks.manager import task_manager
from .base import BaseTool, ToolResult


class TaskListTool(BaseTool):
    name = "task_list"
    description = "List background tasks and their statuses."
    input_schema = {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Max tasks to return (default 20)."},
        },
        "required": [],
    }

    async def execute(self, limit: int = 20, **kwargs) -> ToolResult:
        tasks = await task_manager.list_tasks(limit=limit)
        return ToolResult(success=True, output=json.dumps(tasks))
