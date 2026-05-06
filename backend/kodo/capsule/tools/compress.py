from __future__ import annotations

from typing import Any

from memory.manager import memory_manager

from ..storage import capsule_store
from ..types import CapsuleToolResult
from .capture import _message_text, extract_capsule_fields


class CompressTool:
    name = "compress"

    async def execute(self, *, session_id: str, keep_recent: int = 8, persist: bool = False) -> CapsuleToolResult:
        try:
            payload = await memory_manager.load_session_payload(session_id)
            if payload is None:
                raise ValueError(f"Session not found: {session_id}")
            messages = payload.get("messages", [])
            if not isinstance(messages, list) or not messages:
                raise ValueError("No session messages available to compress")

            recent_count = max(2, min(int(keep_recent), len(messages)))
            old_messages = messages[:-recent_count]
            recent_messages = messages[-recent_count:]
            fields = extract_capsule_fields(old_messages or messages)
            summary_lines = [
                "Compressed prior conversation context.",
                "",
                f"Summary: {fields['summary']}",
                "",
                "Goals:",
                *[f"- {item}" for item in fields["goals"]],
                "",
                "Constraints:",
                *[f"- {item}" for item in fields["constraints"]],
                "",
                "Next steps:",
                *[f"- {item}" for item in fields["next_steps"]],
            ]
            compressed_message = {"role": "system", "content": "\n".join(summary_lines).strip()}
            compressed_messages = [compressed_message, *recent_messages]
            original_chars = sum(len(_message_text(msg)) for msg in messages if isinstance(msg, dict))
            compressed_chars = sum(len(_message_text(msg)) for msg in compressed_messages if isinstance(msg, dict))
            saved = False
            if persist:
                metadata = payload.get("metadata", {}) if isinstance(payload, dict) else {}
                await memory_manager.save_session(session_id, compressed_messages, metadata if isinstance(metadata, dict) else {})
                await capsule_store.increment_compressions(session_id)
                saved = True
            return CapsuleToolResult(
                success=True,
                message="Compressed session context",
                data={
                    "messages": compressed_messages,
                    "persisted": saved,
                    "original_chars": original_chars,
                    "compressed_chars": compressed_chars,
                    "reduction_pct": round((1 - (compressed_chars / max(1, original_chars))) * 100, 2),
                },
            )
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Compress failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        if not result.success:
            return result.message
        return f"{result.message}: {result.data.get('reduction_pct')}% reduction"

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


