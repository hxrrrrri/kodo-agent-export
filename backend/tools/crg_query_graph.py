import json

from .base import BaseTool, ToolResult


class CRGQueryGraphTool(BaseTool):
    name = "crg_query_graph"
    description = (
        "Run a structural query against the code knowledge graph. Find callers, callees, imports, tests, inheritors, "
        "or file summaries for any symbol or file."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "description": (
                    "Query pattern: callers_of | callees_of | imports_of | importers_of | children_of | "
                    "tests_for | inheritors_of | file_summary"
                ),
            },
            "target": {
                "type": "string",
                "description": "Symbol name, qualified name, or file path to query.",
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
        "required": ["pattern", "target"],
    }

    async def execute(
        self,
        pattern: str,
        target: str,
        repo_root: str | None = None,
        detail_level: str = "standard",
        **kwargs,
    ) -> ToolResult:
        from code_review_graph_integration import manager

        result = manager.query_graph(
            pattern=pattern,
            target=target,
            repo_root=repo_root,
            detail_level=detail_level,
        )
        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )

