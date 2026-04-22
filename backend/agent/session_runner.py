from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Awaitable, Callable

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from agent.loop import AgentLoop, RuntimeConfig, _resolve_provider_config
from memory.manager import memory_manager
from privacy import feature_enabled


logger = logging.getLogger(__name__)


@dataclass
class SessionResult:
    session_id: str
    mode: str
    provider: str | None
    model: str | None
    usage: dict[str, Any] | None
    output: str
    error: str | None
    events_count: int


def _runtime_content(message: dict[str, Any]) -> str | list[dict[str, Any]]:
    content = message.get("content", "")
    attachment = message.get("image_attachment")
    if not isinstance(attachment, dict):
        if isinstance(content, (str, list)):
            return content
        return str(content or "")

    blocks: list[dict[str, Any]] = []
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict):
                blocks.append(item)
    elif isinstance(content, str) and content.strip():
        blocks.append({"type": "text", "text": content})
    elif content is not None and content != "":
        blocks.append({"type": "text", "text": str(content)})

    has_image_block = any(
        isinstance(block, dict) and str(block.get("type", "")).lower() == "image"
        for block in blocks
    )

    media_type = str(attachment.get("media_type") or attachment.get("mime_type") or "image/png")
    data = attachment.get("data")
    url = attachment.get("url")
    if not has_image_block and isinstance(data, str) and data.strip():
        blocks.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": data.strip(),
                },
            }
        )
    elif not has_image_block and isinstance(url, str) and url.strip():
        blocks.append(
            {
                "type": "image",
                "source": {
                    "type": "url",
                    "url": url.strip(),
                },
            }
        )

    if blocks:
        return blocks
    if isinstance(content, (str, list)):
        return content
    return str(content or "")


def _runtime_message(message: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(message)
    normalized["content"] = _runtime_content(message)
    normalized.pop("image_attachment", None)
    return normalized


def _title_from_content(content: Any) -> str:
    if isinstance(content, str):
        text = content.strip()
        return text[:60] + ("..." if len(text) > 60 else "")

    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if str(block.get("type", "")).lower() != "text":
                continue
            text: str | None = block.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
        joined = "\n".join(parts).strip()
        if joined:
            return joined[:60] + ("..." if len(joined) > 60 else "")

    return "Untitled"


def _auto_title_enabled() -> bool:
    return feature_enabled("AUTO_TITLE")


def _content_excerpt(content: Any, limit: int = 200) -> str:
    if isinstance(content, str):
        text = content.strip()
        return text[:limit]

    if isinstance(content, list):
        chunks: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if str(block.get("type", "")).lower() != "text":
                continue
            value = block.get("text")
            if isinstance(value, str) and value.strip():
                chunks.append(value.strip())
        joined = "\n".join(chunks).strip()
        return joined[:limit]

    if content is None:
        return ""
    return str(content).strip()[:limit]


def _default_session_title(messages: list[dict[str, Any]]) -> str:
    for message in messages:
        if str(message.get("role", "")).lower() == "user":
            return _title_from_content(message.get("content", ""))
    if messages:
        return _title_from_content(messages[0].get("content", ""))
    return "Untitled"


def _title_is_raw_default(current_title: str, default_title: str) -> bool:
    current = current_title.strip().lower()
    baseline = default_title.strip().lower()
    return (not current) or current == baseline


def _normalize_smart_title(raw_title: str, fallback_title: str) -> str:
    normalized = re.sub(r"\s+", " ", (raw_title or "").strip())
    normalized = normalized.strip("\"'`")
    normalized = normalized.rstrip(".,;:!?")

    words = [part for part in normalized.split(" ") if part]
    if len(words) > 8:
        normalized = " ".join(words[:8])

    return normalized or fallback_title


def _summary_runtime_config() -> RuntimeConfig:
    # Prefer a lightweight provider for title generation when available.
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()

    if openai_key:
        model = os.getenv("OPENAI_TITLE_MODEL", "").strip() or "gpt-4o-mini"
        return RuntimeConfig(
            provider="openai",
            model=model,
            api_key=openai_key,
            base_url=os.getenv("OPENAI_BASE_URL", "").strip() or None,
        )

    if anthropic_key:
        model = os.getenv("ANTHROPIC_TITLE_MODEL", "").strip() or "claude-3-5-haiku-latest"
        return RuntimeConfig(
            provider="anthropic",
            model=model,
            api_key=anthropic_key,
            base_url=os.getenv("ANTHROPIC_BASE_URL", "").strip() or None,
        )

    return _resolve_provider_config()


async def _call_title_model(summary_prompt: str) -> str:
    runtime = _summary_runtime_config()

    if runtime.provider == "anthropic":
        kwargs: dict[str, Any] = {"api_key": runtime.api_key}
        if runtime.base_url:
            kwargs["base_url"] = runtime.base_url
        anthropic_client = AsyncAnthropic(**kwargs)
        anthropic_response = await anthropic_client.messages.create(
            model=runtime.model,
            max_tokens=20,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": summary_prompt,
                }
            ],
        )

        chunks: list[str] = []
        for block in anthropic_response.content:
            if getattr(block, "type", "") != "text":
                continue
            text = getattr(block, "text", "")
            if text:
                chunks.append(str(text))
        return " ".join(chunks).strip()

    openai_client = AsyncOpenAI(
        api_key=runtime.api_key or "local",
        base_url=runtime.base_url,
    )
    openai_response = await openai_client.chat.completions.create(
        model=runtime.model,
        max_tokens=20,
        temperature=0,
        messages=[
            {
                "role": "user",
                "content": summary_prompt,
            }
        ],
    )

    if not openai_response.choices:
        return ""
    payload = openai_response.choices[0].message
    return str(getattr(payload, "content", "") or "").strip()


async def _generate_smart_title(messages: list[dict[str, Any]]) -> str:
    fallback_title = _default_session_title(messages)
    summary_prompt = (
        "In 8 words or fewer, summarise what this conversation accomplished. "
        "Reply with only the summary, no punctuation at the end.\n\n"
        + "\n".join(
            f"{str(m.get('role', 'user')).upper()}: {_content_excerpt(m.get('content', ''))[:200]}"
            for m in messages[-6:]
        )
    )

    try:
        generated = await _call_title_model(summary_prompt)
    except Exception as exc:
        logger.warning("Auto-title model call failed: %s", exc)
        return fallback_title

    return _normalize_smart_title(generated, fallback_title)


async def _apply_auto_title(session_id: str, messages: list[dict[str, Any]], current_title: str) -> None:
    try:
        generated_title = await _generate_smart_title(messages)
        if not generated_title.strip():
            return
        if generated_title.strip() == current_title.strip():
            return
        await memory_manager.save_session(
            session_id,
            messages,
            metadata={"title": generated_title},
        )
    except Exception as exc:
        logger.warning("Auto-title update failed for session %s: %s", session_id, exc)


class SessionRunner:
    """
    Manages one agent session lifecycle with streaming, cancellation, and persistence.
    """

    async def stream(
        self,
        *,
        session_id: str,
        messages: list[dict[str, Any]],
        project_dir: str | None,
        mode: str,
        approval_callback: Callable[[str, str, str], Awaitable[bool]] | None = None,
        model_override: str | None = None,
        artifact_mode: bool = False,
    ) -> AsyncGenerator[dict[str, Any], None]:
        assistant_parts: list[str] = []
        usage_payload: dict[str, Any] | None = None
        tool_calls: list[dict[str, Any]] = []
        error_message: str | None = None
        events_count = 0

        if not messages:
            payload = {"type": "error", "message": "SessionRunner received no messages."}
            yield payload
            return

        latest = messages[-1]
        user_message = _runtime_content(latest)
        history = [_runtime_message(msg) for msg in messages[:-1] if isinstance(msg, dict)]

        try:
            agent = AgentLoop(
                session_id=session_id,
                project_dir=project_dir,
                mode=mode,
                model_override=model_override,
                artifact_mode=bool(artifact_mode),
            )
        except Exception as exc:
            yield {"type": "error", "message": str(exc)}
            return

        try:
            def _resolve_tool_call_index(tool_use_id: str) -> int:
                if tool_use_id:
                    for idx, call in enumerate(tool_calls):
                        if str(call.get("tool_use_id", "")) == tool_use_id:
                            return idx
                return len(tool_calls) - 1

            def _safe_metadata(value: Any) -> dict[str, Any] | None:
                if not isinstance(value, dict):
                    return None
                try:
                    json.dumps(value)
                    return value
                except Exception:
                    return {"raw": str(value)}

            async for event in agent.run(user_message, history, approval_callback=approval_callback):
                events_count += 1
                event_type = str(event.get("type", ""))
                if event_type == "text":
                    assistant_parts.append(str(event.get("content", "")))
                elif event_type == "done" and isinstance(event.get("usage"), dict):
                    usage_payload = event.get("usage")
                elif event_type == "tool_start":
                    tool_name = str(event.get("tool", "")).strip()
                    tool_use_id = str(event.get("tool_use_id", "")).strip()
                    raw_input = event.get("input", {})
                    tool_input = raw_input if isinstance(raw_input, dict) else {}
                    row: dict[str, Any] = {
                        "tool": tool_name,
                        "input": tool_input,
                        "stream_lines": [],
                    }
                    if tool_use_id:
                        row["tool_use_id"] = tool_use_id
                    if "approved" in event:
                        row["approved"] = bool(event.get("approved"))
                    tool_calls.append(row)
                elif event_type == "tool_output":
                    line = str(event.get("line", ""))
                    if line:
                        tool_use_id = str(event.get("tool_use_id", "")).strip()
                        idx = _resolve_tool_call_index(tool_use_id)
                        if idx >= 0:
                            row = dict(tool_calls[idx])
                            stream_lines = row.get("stream_lines", [])
                            if not isinstance(stream_lines, list):
                                stream_lines = []
                            stream_lines.append(line)
                            row["stream_lines"] = stream_lines
                            tool_calls[idx] = row
                elif event_type == "tool_result":
                    tool_use_id = str(event.get("tool_use_id", "")).strip()
                    idx = _resolve_tool_call_index(tool_use_id)
                    if idx < 0:
                        row = {
                            "tool": str(event.get("tool", "")).strip(),
                            "input": {},
                            "stream_lines": [],
                        }
                        if tool_use_id:
                            row["tool_use_id"] = tool_use_id
                        tool_calls.append(row)
                        idx = len(tool_calls) - 1

                    row = dict(tool_calls[idx])
                    if tool_use_id and not row.get("tool_use_id"):
                        row["tool_use_id"] = tool_use_id
                    row["output"] = str(event.get("output", ""))
                    if "success" in event:
                        row["success"] = bool(event.get("success"))
                    metadata = _safe_metadata(event.get("metadata"))
                    if metadata is not None:
                        row["metadata"] = metadata
                    tool_calls[idx] = row
                elif event_type == "error":
                    error_message = str(event.get("message", "Session runner failed"))

                yield event

        except asyncio.CancelledError:
            error_message = "Session cancelled"
            yield {"type": "error", "message": error_message}
        except Exception as exc:
            error_message = str(exc)
            yield {"type": "error", "message": error_message}

        assistant_text = "".join(assistant_parts)
        updated_history = list(messages)
        assistant_entry: dict[str, Any] = {
            "role": "assistant",
            "content": assistant_text,
        }
        if isinstance(usage_payload, dict):
            assistant_entry["usage"] = usage_payload
        if tool_calls:
            assistant_entry["tool_calls"] = tool_calls
        updated_history.append(assistant_entry)

        existing_payload = await memory_manager.load_session_payload(session_id)
        existing_metadata = existing_payload.get("metadata", {}) if isinstance(existing_payload, dict) else {}
        if not isinstance(existing_metadata, dict):
            existing_metadata = {}

        default_title = _default_session_title(updated_history)
        current_title = str(existing_metadata.get("title", "")).strip() or default_title

        metadata_payload: dict[str, Any] = {
            "title": current_title,
            "mode": mode,
        }
        if isinstance(model_override, str) and model_override.strip():
            metadata_payload["model_override"] = model_override.strip()

        await memory_manager.save_session(
            session_id,
            updated_history,
            metadata=metadata_payload,
        )

        if (
            _auto_title_enabled()
            and len(updated_history) >= 4
            and _title_is_raw_default(current_title, default_title)
        ):
            asyncio.create_task(_apply_auto_title(session_id, updated_history, current_title))

        self._last_result = SessionResult(
            session_id=session_id,
            mode=mode,
            provider=getattr(agent, "provider", None),
            model=getattr(agent, "model", None),
            usage=usage_payload,
            output=assistant_text,
            error=error_message,
            events_count=events_count,
        )

    async def run(
        self,
        session_id: str,
        messages: list[dict[str, Any]],
        project_dir: str | None,
        mode: str,
        stream_callback: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
        approval_callback: Callable[[str, str, str], Awaitable[bool]] | None = None,
        model_override: str | None = None,
        artifact_mode: bool = False,
    ) -> SessionResult:
        async for event in self.stream(
            session_id=session_id,
            messages=messages,
            project_dir=project_dir,
            mode=mode,
            approval_callback=approval_callback,
            model_override=model_override,
            artifact_mode=bool(artifact_mode),
        ):
            if stream_callback is not None:
                await stream_callback(event)

        return getattr(
            self,
            "_last_result",
            SessionResult(
                session_id=session_id,
                mode=mode,
                provider=None,
                model=None,
                usage=None,
                output="",
                error="No result generated",
                events_count=0,
            ),
        )


