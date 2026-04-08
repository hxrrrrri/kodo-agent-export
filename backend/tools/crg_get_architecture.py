import json

from .base import BaseTool, ToolResult


class CRGGetArchitectureTool(BaseTool):
    name = "crg_get_architecture"
    description = (
        "Generate a high-level architecture overview of the codebase using community detection. "
        "Shows module clusters, coupling warnings, and dominant languages. Ideal for onboarding or architectural review."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "repo_root": {
                "type": "string",
                "description": "Repository root. Auto-detected if omitted.",
            },
        },
    }

    async def execute(self, repo_root: str | None = None, **kwargs) -> ToolResult:
        from code_review_graph_integration import manager

        result = manager.get_architecture_overview(repo_root=repo_root)
        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )

