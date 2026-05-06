from __future__ import annotations

from typing import Any

from ..types import CapsuleToolResult


TEMPLATES: dict[str, str] = {
    "bug_hunt": "Bug Hunt\nProblem: {problem}\nObserved behavior: {observed}\nExpected behavior: {expected}\nRelevant files: {files}\nConstraints: {constraints}\nReturn: root cause, patch plan, tests.",
    "api_design": "API Design\nFeature: {feature}\nConsumers: {consumers}\nInputs: {inputs}\nOutputs: {outputs}\nFailure modes: {failure_modes}\nReturn: endpoint contract, validation, tests.",
    "agent_task": "Agent Task Briefing\nTask: {task}\nTools: {tools}\nConstraints: {constraints}\nInput data: {input_data}\nOutput format: {output_format}\nSuccess criteria: {success_criteria}",
    "code_review": "Code Review\nScope: {scope}\nRisk areas: {risk_areas}\nStandards: {standards}\nReturn findings first with file and line references.",
    "implementation": "Implementation Brief\nGoal: {goal}\nExisting context: {context}\nFiles likely touched: {files}\nValidation: {validation}\nReturn code changes and verification.",
    "handoff": "Session Handoff\nCurrent state: {state}\nDecisions: {decisions}\nOpen questions: {questions}\nNext steps: {next_steps}",
}


class TemplateTool:
    name = "template"

    async def execute(self, *, template: str = "bug_hunt", values: dict[str, Any] | None = None) -> CapsuleToolResult:
        try:
            key = template.strip().lower().replace("-", "_")
            if key not in TEMPLATES:
                raise ValueError(f"Unknown template '{template}'. Available: {', '.join(sorted(TEMPLATES))}")
            data = {name: str(value) for name, value in (values or {}).items()}
            class DefaultDict(dict[str, str]):
                def __missing__(self, missing: str) -> str:
                    return f"{{{missing}}}"
            rendered = TEMPLATES[key].format_map(DefaultDict(data))
            return CapsuleToolResult(success=True, message=f"Rendered template {key}", data={"template": key, "content": rendered})
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Template failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        return str(result.data.get("content", result.message))

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


