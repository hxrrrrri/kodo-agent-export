from __future__ import annotations

import json
import re
from typing import Any

from memory.manager import memory_manager

from ..storage import capsule_store
from ..token_tracker import token_tracker
from ..types import CodeRef, KodoCapsule, CapsuleToolResult


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if str(block.get("type", "")).lower() == "text":
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return str(content or "")


def _conversation_text(messages: list[dict[str, Any]], max_chars: int = 120_000) -> str:
    rows: list[str] = []
    for message in messages:
        role = str(message.get("role", "user")).upper()
        text = _message_text(message).strip()
        if not text:
            continue
        rows.append(f"{role}: {text}")
    rendered = "\n\n".join(rows)
    if len(rendered) <= max_chars:
        return rendered
    return rendered[-max_chars:]


def _split_sentences(text: str, limit: int = 5) -> list[str]:
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        return []
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    return [part.strip() for part in parts if part.strip()][:limit]


def _dedupe(items: list[str], limit: int = 12) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = re.sub(r"\s+", " ", str(item or "")).strip(" -\t")
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
        if len(result) >= limit:
            break
    return result


def _extract_code_refs(text: str) -> list[CodeRef]:
    refs: list[CodeRef] = []
    fence_re = re.compile(r"```([A-Za-z0-9_+\-.]*)\n([\s\S]*?)```", re.MULTILINE)
    for idx, match in enumerate(fence_re.finditer(text)):
        lang = match.group(1).strip() or "text"
        snippet = match.group(2).strip()
        if not snippet:
            continue
        before = text[max(0, match.start() - 220):match.start()]
        file_match = re.search(r"([\w./\\-]+\.(?:py|ts|tsx|js|jsx|json|md|html|css|sql|yml|yaml|toml))", before)
        refs.append(
            CodeRef(
                file=file_match.group(1) if file_match else f"conversation-snippet-{idx + 1}",
                snippet=snippet[:2000],
                lang=lang,
            )
        )
        if len(refs) >= 20:
            break
    return refs


def extract_capsule_fields(messages: list[dict[str, Any]]) -> dict[str, Any]:
    text = _conversation_text(messages)
    user_messages = [_message_text(msg) for msg in messages if str(msg.get("role", "")).lower() == "user"]
    assistant_messages = [_message_text(msg) for msg in messages if str(msg.get("role", "")).lower() == "assistant"]
    recent_text = "\n".join((_message_text(msg) for msg in messages[-6:])).strip()

    summary_source = "\n".join(_split_sentences(recent_text, 5))
    if not summary_source:
        summary_source = "\n".join(_split_sentences(text, 5))
    summary = summary_source or "Conversation context captured for continuation."

    goals: list[str] = []
    for item in user_messages:
        first = _split_sentences(item, 1)
        if first:
            goals.append(first[0][:240])

    constraint_lines: list[str] = []
    for line in text.splitlines():
        normalized = line.strip()
        lower = normalized.lower()
        if any(term in lower for term in ("must ", "must not", "do not", "never ", "always ", "require", "constraint", "rule", "should ")):
            constraint_lines.append(normalized[:280])

    next_steps: list[str] = []
    for line in text.splitlines():
        normalized = line.strip(" -\t")
        lower = normalized.lower()
        if lower.startswith(("next", "todo", "follow up", "continue")) or "next step" in lower:
            next_steps.append(normalized[:260])
    if not next_steps and user_messages:
        next_steps.append(f"Continue from the latest request: {user_messages[-1][:220]}")

    tag_seed = " ".join(user_messages[-1].split()[:4]) if user_messages else "Session Capsule"
    tag_seed = re.sub(r"[^A-Za-z0-9 _-]+", "", tag_seed).strip() or "Session Capsule"

    usage = {}
    for message in reversed(assistant_messages):
        if isinstance(message, dict):
            usage = message.get("usage", {})
            break

    return {
        "summary": summary[:5000],
        "goals": _dedupe(goals, 10),
        "constraints": _dedupe(constraint_lines, 12),
        "code_refs": _extract_code_refs(text),
        "next_steps": _dedupe(next_steps, 10),
        "suggested_tag": tag_seed[:80],
    }


class CaptureTool:
    name = "capture"

    async def execute(
        self,
        *,
        session_id: str,
        tag: str | None = None,
        team_folder: str = "default",
        tags: list[str] | None = None,
        agent_id: str | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> CapsuleToolResult:
        try:
            messages = conversation_history
            if messages is None:
                payload = await memory_manager.load_session_payload(session_id)
                if payload is None:
                    raise ValueError(f"Session not found: {session_id}")
                raw_messages = payload.get("messages", [])
                messages = raw_messages if isinstance(raw_messages, list) else []
            if not messages:
                raise ValueError("No conversation messages available to capture")

            fields = extract_capsule_fields(messages)
            state = token_tracker.get_state(session_id)
            provider = state.provider if state else "unknown"
            model = state.model if state else "unknown"
            tokens = (state.total_input + state.total_output) if state else None
            context_pct = state.context_pct if state else None
            capsule = KodoCapsule(
                tag=(tag or fields["suggested_tag"] or "Session Capsule"),
                summary=fields["summary"],
                goals=fields["goals"],
                constraints=fields["constraints"],
                code_refs=fields["code_refs"],
                next_steps=fields["next_steps"],
                model_used=model,
                provider=provider,
                tokens_at_capture=tokens,
                context_pct_at_capture=context_pct,
                agent_id=agent_id,
                team_folder=team_folder or "default",
                tags=tags or [],
            )
            capsule_id = await capsule_store.save_capsule(capsule)
            saved = await capsule_store.get_capsule(capsule_id)
            return CapsuleToolResult(
                success=True,
                message=f"Saved capsule {capsule_id}",
                data={"capsule": saved.model_dump() if saved else capsule.model_dump()},
            )
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Capture failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        if not result.success:
            return result.message
        capsule = result.data.get("capsule", {})
        return f"Saved capsule {capsule.get('id')} | {capsule.get('tag')}"

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


