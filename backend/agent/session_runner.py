from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Awaitable, Callable

from agent.loop import AgentLoop
from memory.manager import memory_manager


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
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
        joined = "\n".join(parts).strip()
        if joined:
            return joined[:60] + ("..." if len(joined) > 60 else "")

    return "Untitled"


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
    ) -> AsyncGenerator[dict[str, Any], None]:
        assistant_parts: list[str] = []
        usage_payload: dict[str, Any] | None = None
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
            )
        except Exception as exc:
            yield {"type": "error", "message": str(exc)}
            return

        try:
            async for event in agent.run(user_message, history, approval_callback=approval_callback):
                events_count += 1
                event_type = str(event.get("type", ""))
                if event_type == "text":
                    assistant_parts.append(str(event.get("content", "")))
                elif event_type == "done" and isinstance(event.get("usage"), dict):
                    usage_payload = event.get("usage")
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
        updated_history.append({"role": "assistant", "content": assistant_text})
        title = _title_from_content(latest.get("content", ""))
        await memory_manager.save_session(
            session_id,
            updated_history,
            metadata={
                "title": title,
                "mode": mode,
                "model_override": model_override,
            },
        )

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
    ) -> SessionResult:
        async for event in self.stream(
            session_id=session_id,
            messages=messages,
            project_dir=project_dir,
            mode=mode,
            approval_callback=approval_callback,
            model_override=model_override,
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
