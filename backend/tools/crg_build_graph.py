import json

from .base import BaseTool, ToolResult


class CRGBuildGraphTool(BaseTool):
    name = "crg_build_graph"
    description = (
        "Build or incrementally update the structural code knowledge graph for the current project. "
        "Uses Tree-sitter to parse all source files and store relationships in a local SQLite graph. "
        "Call this before any code review or analysis."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "full_rebuild": {
                "type": "boolean",
                "description": "If true, re-parse all files from scratch. Default: false (incremental).",
                "default": False,
            },
            "repo_root": {
                "type": "string",
                "description": "Repository root path. Auto-detected if omitted.",
            },
            "postprocess": {
                "type": "string",
                "description": "Post-processing level: full, minimal, or none.",
                "default": "full",
            },
        },
    }

    async def execute(
        self,
        full_rebuild: bool = False,
        repo_root: str | None = None,
        postprocess: str = "full",
        **kwargs,
    ) -> ToolResult:
        from code_review_graph_integration import manager

        result = manager.build_graph(
            repo_root=repo_root,
            full_rebuild=full_rebuild,
            postprocess=postprocess,
        )
        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )
