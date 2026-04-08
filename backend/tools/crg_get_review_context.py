import json

from .base import BaseTool, ToolResult


class CRGGetReviewContextTool(BaseTool):
    name = "crg_get_review_context"
    description = (
        "Get a code-review focused context bundle for changed files, including impact radius, related symbols, "
        "and optional source snippets."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "base": {
                "type": "string",
                "description": "Git ref to diff against.",
                "default": "HEAD~1",
            },
            "changed_files": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Explicit list of changed files. Auto-detected from git if omitted.",
            },
            "include_source": {
                "type": "boolean",
                "description": "Include source snippets in review context.",
                "default": True,
            },
            "max_depth": {
                "type": "integer",
                "description": "Impact radius BFS depth.",
                "default": 2,
            },
            "repo_root": {
                "type": "string",
                "description": "Repository root. Auto-detected if omitted.",
            },
            "detail_level": {
                "type": "string",
                "description": "standard or minimal.",
                "default": "standard",
            },
        },
    }

    async def execute(
        self,
        base: str = "HEAD~1",
        changed_files: list[str] | None = None,
        include_source: bool = True,
        max_depth: int = 2,
        repo_root: str | None = None,
        detail_level: str = "standard",
        **kwargs,
    ) -> ToolResult:
        from code_review_graph_integration import manager

        result = manager.get_review_context(
            changed_files=changed_files,
            repo_root=repo_root,
            base=base,
            max_depth=max_depth,
            include_source=include_source,
            detail_level=detail_level,
        )
        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )
