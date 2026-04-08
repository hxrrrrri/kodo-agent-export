import json

from .base import BaseTool, ToolResult


class CRGRefactorTool(BaseTool):
    name = "crg_refactor"
    description = (
        "Graph-powered refactoring operations. Preview symbol renames with full impact analysis, detect dead code, "
        "or get community-driven refactoring suggestions. Use apply_refactor after previewing."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "mode": {
                "type": "string",
                "description": "Operation: rename | dead_code | suggest",
            },
            "old_name": {
                "type": "string",
                "description": "Current symbol name for rename mode.",
            },
            "new_name": {
                "type": "string",
                "description": "New symbol name for rename mode.",
            },
            "refactor_id": {
                "type": "string",
                "description": "Refactor preview id to apply.",
            },
            "apply": {
                "type": "boolean",
                "description": "If true, applies a previously previewed refactor_id.",
                "default": False,
            },
            "repo_root": {
                "type": "string",
                "description": "Repository root. Auto-detected if omitted.",
            },
        },
        "required": ["mode"],
    }

    async def execute(
        self,
        mode: str,
        old_name: str | None = None,
        new_name: str | None = None,
        refactor_id: str | None = None,
        apply: bool = False,
        repo_root: str | None = None,
        **kwargs,
    ) -> ToolResult:
        from code_review_graph_integration import manager

        if apply:
            if not refactor_id:
                return ToolResult(
                    success=False,
                    output="",
                    error="refactor_id is required when apply=true",
                )
            result = manager.apply_refactor(refactor_id=refactor_id, repo_root=repo_root)
        else:
            result = manager.refactor_preview(
                mode=mode,
                old_name=old_name,
                new_name=new_name,
                repo_root=repo_root,
            )

        success = result.get("status") == "ok"
        return ToolResult(
            success=success,
            output=json.dumps(result, default=str),
            error=None if success else result.get("error"),
        )

