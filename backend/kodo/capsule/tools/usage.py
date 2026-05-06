from __future__ import annotations

from typing import Any

from ..storage import capsule_store
from ..token_tracker import token_tracker
from ..types import CapsuleToolResult


class UsageTool:
    name = "usage"

    async def execute(self, *, session_id: str) -> CapsuleToolResult:
        try:
            stats = await capsule_store.get_session_stats(session_id)
            state = token_tracker.get_state(session_id)
            data = stats.model_dump()
            if state is not None:
                data.update(state.to_payload())
            return CapsuleToolResult(success=True, message="Loaded capsule usage", data=data)
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Usage failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        if not result.success:
            return result.message
        return (
            f"Context: {float(result.data.get('context_pct', 0)):.1f}% | "
            f"Input: {int(result.data.get('total_input_tokens', result.data.get('total_input', 0))):,} | "
            f"Output: {int(result.data.get('total_output_tokens', result.data.get('total_output', 0))):,} | "
            f"Alert: {result.data.get('alert_level', 'idle')}"
        )

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


