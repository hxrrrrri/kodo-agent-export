from __future__ import annotations

from typing import Any

from ..storage import capsule_store
from ..types import CapsuleToolResult
from .inject import format_capsule_context


class BridgeTool:
    name = "bridge"

    async def execute(self, *, capsule_id: str, target_provider: str = "openai", target_model: str | None = None) -> CapsuleToolResult:
        try:
            capsule = await capsule_store.get_capsule(capsule_id)
            if capsule is None:
                raise ValueError(f"Capsule not found: {capsule_id}")
            context = format_capsule_context(capsule)
            provider = target_provider.strip().lower() or "openai"
            if provider == "anthropic":
                payload: Any = [{"role": "user", "content": [{"type": "text", "text": context}]}]
            elif provider == "gemini":
                payload = [{"role": "user", "parts": [{"text": context}]}]
            else:
                payload = [{"role": "system", "content": "Continue from this capsule context."}, {"role": "user", "content": context}]
            return CapsuleToolResult(
                success=True,
                message=f"Bridged capsule {capsule_id} to {provider}",
                data={"provider": provider, "model": target_model, "messages": payload, "text": context},
            )
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Bridge failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        return result.message if not result.success else str(result.data.get("text", ""))

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


