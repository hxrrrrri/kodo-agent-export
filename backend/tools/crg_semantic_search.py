import json

from .base import BaseTool, ToolResult


class CRGSemanticSearchTool(BaseTool):
    name = "crg_semantic_search"
    description = (
        "Search the code knowledge graph by name, keyword, or semantic meaning. Finds functions, classes, files, "
        "and tests matching the query. Uses vector embeddings when available, keyword search otherwise."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search string - function name, concept, or description.",
            },
            "kind": {
                "type": "string",
                "description": "Filter by node type: File | Class | Function | Type | Test",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum results to return.",
                "default": 20,
            },
            "repo_root": {
                "type": "string",
                "description": "Repository root. Auto-detected if omitted.",
            },
        },
        "required": ["query"],
    }

    async def execute(
        self,
        query: str,
        kind: str | None = None,
        limit: int = 20,
        repo_root: str | None = None,
        **kwargs,
    ) -> ToolResult:
        from code_review_graph_integration import manager

        result = manager.semantic_search(
            query=query,
            kind=kind,
            limit=limit,
            repo_root=repo_root,
        )
        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )

