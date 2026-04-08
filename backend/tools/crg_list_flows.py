import json

from .base import BaseTool, ToolResult


class CRGListFlowsTool(BaseTool):
    name = "crg_list_flows"
    description = (
        "List execution flows (call chains from entry points) in the codebase, sorted by criticality. "
        "Shows HTTP handlers, CLI commands, test functions, and their full call chains."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "repo_root": {
                "type": "string",
                "description": "Repository root. Auto-detected if omitted.",
            },
            "sort_by": {
                "type": "string",
                "description": "Sort column: criticality | depth | node_count | name",
                "default": "criticality",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum flows to return.",
                "default": 50,
            },
        },
    }

    async def execute(
        self,
        repo_root: str | None = None,
        sort_by: str = "criticality",
        limit: int = 50,
        **kwargs,
    ) -> ToolResult:
        from code_review_graph_integration import manager

        result = manager.list_flows(repo_root=repo_root, sort_by=sort_by, limit=limit)
        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )

