import json

from .base import BaseTool, ToolResult


class CRGGetImpactRadiusTool(BaseTool):
    name = "crg_get_impact_radius"
    description = (
        "Compute the blast radius of changed files - which functions, classes, tests, and files are affected "
        "by the change. Essential before any edit to understand downstream consequences."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "changed_files": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of changed file paths relative to repo root. Auto-detected if omitted.",
            },
            "max_depth": {
                "type": "integer",
                "description": "Dependency graph traversal depth.",
                "default": 2,
            },
            "base": {
                "type": "string",
                "description": "Git ref for auto-detection.",
                "default": "HEAD~1",
            },
            "repo_root": {
                "type": "string",
                "description": "Repository root. Auto-detected if omitted.",
            },
        },
    }

    async def execute(
        self,
        changed_files: list[str] | None = None,
        max_depth: int = 2,
        base: str = "HEAD~1",
        repo_root: str | None = None,
        **kwargs,
    ) -> ToolResult:
        from code_review_graph_integration import manager

        result = manager.get_impact_radius(
            changed_files=changed_files,
            repo_root=repo_root,
            max_depth=max_depth,
            base=base,
        )
        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )

