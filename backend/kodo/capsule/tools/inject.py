from __future__ import annotations

from typing import Any

from ..storage import capsule_store
from ..types import CapsuleToolResult, KodoCapsule


def format_capsule_context(capsule: KodoCapsule, message: str = "", version: int | None = None) -> str:
    goals = "\n".join(f"{idx + 1}. {item}" for idx, item in enumerate(capsule.goals)) or "1. Continue the captured work."
    constraints = "\n".join(f"{idx + 1}. {item}" for idx, item in enumerate(capsule.constraints)) or "1. Preserve established project constraints."
    code_refs = []
    for ref in capsule.code_refs:
        file_label = ref.file or "conversation"
        code_refs.append(f"- {file_label} ({ref.lang})\n```{ref.lang}\n{ref.snippet}\n```")
    code_context = "\n".join(code_refs) or "- No specific code references captured."
    next_steps = "\n".join(f"{idx + 1}. {item}" for idx, item in enumerate(capsule.next_steps)) or "1. Resume from the captured summary."
    suffix = f"\n\n{message.strip()}" if message.strip() else ""
    return (
        f'<capsule_context id="{capsule.id}" tag="{capsule.tag}" version="{version or 1}">\n'
        f"SUMMARY: {capsule.summary}\n\n"
        f"GOALS:\n{goals}\n\n"
        f"CONSTRAINTS:\n{constraints}\n\n"
        f"CODE CONTEXT:\n{code_context}\n\n"
        f"CONTINUE FROM:\n{next_steps}\n"
        f"</capsule_context>"
        f"{suffix}"
    )


class InjectTool:
    name = "inject"

    async def execute(self, *, capsule_id: str, message: str = "") -> CapsuleToolResult:
        try:
            capsule = await capsule_store.get_capsule(capsule_id)
            if capsule is None:
                raise ValueError(f"Capsule not found: {capsule_id}")
            versions = await capsule_store.get_versions(capsule_id)
            version_number = max([item.version_number for item in versions], default=1)
            injected = format_capsule_context(capsule, message, version_number)
            return CapsuleToolResult(
                success=True,
                message=f"Prepared capsule injection for {capsule_id}",
                data={"injected_message": injected, "capsule": capsule.model_dump(), "version": version_number},
            )
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Inject failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        return str(result.data.get("injected_message", result.message))

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


