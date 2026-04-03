import json

from tasks.manager import task_manager
from .base import BaseTool, ToolResult


class TaskCreateTool(BaseTool):
    name = "task_create"
    description = "Create a background task that runs an agent prompt asynchronously."
    input_schema = {
        "type": "object",
        "properties": {
            "prompt": {"type": "string", "description": "Task prompt to execute in background."},
            "project_dir": {"type": "string", "description": "Optional project directory for the task."},
            "requested_by_session": {"type": "string", "description": "Optional session id that requested this task."},
        },
        "required": ["prompt"],
    }

    async def execute(
        self,
        prompt: str,
        project_dir: str | None = None,
        requested_by_session: str | None = None,
        **kwargs,
    ) -> ToolResult:
        text = prompt.strip()
        if not text:
            return ToolResult(success=False, output="", error="prompt is required")

        task = await task_manager.create_task(
            prompt=text,
            project_dir=project_dir,
            requested_by_session=requested_by_session,
        )
        return ToolResult(success=True, output=json.dumps(task), metadata={"task_id": task.get("task_id")})
