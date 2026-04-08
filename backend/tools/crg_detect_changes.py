import json

from .base import BaseTool, ToolResult


class CRGDetectChangesTool(BaseTool):
    name = "crg_detect_changes"
    description = (
        "Analyze the risk and blast radius of recent git changes. Returns risk score, affected functions, "
        "broken flows, test coverage gaps, and prioritized review items. Primary tool for pre-commit and PR code review."
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
                "description": "Include source snippets for changed functions.",
                "default": False,
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
        include_source: bool = False,
        max_depth: int = 2,
        repo_root: str | None = None,
        detail_level: str = "standard",
        **kwargs,
    ) -> ToolResult:
        from code_review_graph_integration import manager

        result = manager.detect_changes(
            repo_root=repo_root,
            base=base,
            changed_files=changed_files,
            include_source=include_source,
            max_depth=max_depth,
            detail_level=detail_level,
        )
        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )

