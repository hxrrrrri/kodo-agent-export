from __future__ import annotations

import json
import logging
import os
from typing import Any, AsyncIterator

from privacy import build_httpx_async_client

logger = logging.getLogger(__name__)


def _api_base() -> str:
    return os.getenv("ATOMIC_CHAT_BASE_URL", "http://127.0.0.1:1337").rstrip("/")


def _api_url(path: str) -> str:
    return f"{_api_base()}/v1{path}"


async def check_atomic_chat_running() -> bool:
    try:
        async with build_httpx_async_client(timeout=3.0) as client:
            resp = await client.get(_api_url("/models"))
            return resp.status_code == 200
    except Exception:
        return False


async def list_atomic_chat_models() -> list[str]:
    try:
        async with build_httpx_async_client(timeout=5.0) as client:
            resp = await client.get(_api_url("/models"))
            resp.raise_for_status()
            data = resp.json()
            return [str(model.get("id", "")) for model in data.get("data", []) if model.get("id")]
    except Exception as exc:
        logger.warning("Could not list Atomic Chat models: %s", exc)
        return []


async def atomic_chat(
    *,
    model: str,
    messages: list[dict[str, Any]],
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 1.0,
) -> dict[str, Any]:
    chat_messages = list(messages)
    if system:
        chat_messages.insert(0, {"role": "system", "content": system})

    payload = {
        "model": model,
        "messages": chat_messages,
        "max_tokens": int(max_tokens),
        "temperature": float(temperature),
        "stream": False,
    }

    async with build_httpx_async_client(timeout=120.0) as client:
        resp = await client.post(_api_url("/chat/completions"), json=payload)
        resp.raise_for_status()
        data = resp.json()

    choice = data.get("choices", [{}])[0] if isinstance(data, dict) else {}
    message = choice.get("message", {}) if isinstance(choice, dict) else {}
    usage = data.get("usage", {}) if isinstance(data, dict) else {}

    return {
        "id": data.get("id", "msg_atomic_chat") if isinstance(data, dict) else "msg_atomic_chat",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": message.get("content", "") if isinstance(message, dict) else ""}],
        "model": model,
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": int(usage.get("prompt_tokens", 0) or 0) if isinstance(usage, dict) else 0,
            "output_tokens": int(usage.get("completion_tokens", 0) or 0) if isinstance(usage, dict) else 0,
        },
    }


async def atomic_chat_stream(
    *,
    model: str,
    messages: list[dict[str, Any]],
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 1.0,
) -> AsyncIterator[str]:
    chat_messages = list(messages)
    if system:
        chat_messages.insert(0, {"role": "system", "content": system})

    payload = {
        "model": model,
        "messages": chat_messages,
        "max_tokens": int(max_tokens),
        "temperature": float(temperature),
        "stream": True,
    }

    async with build_httpx_async_client(timeout=120.0) as client:
        async with client.stream("POST", _api_url("/chat/completions"), json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue

                raw = line[len("data: "):].strip()
                if raw == "[DONE]":
                    break

                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                choices = chunk.get("choices", []) if isinstance(chunk, dict) else []
                if not isinstance(choices, list) or not choices:
                    continue

                first = choices[0] if isinstance(choices[0], dict) else {}
                delta = first.get("delta") if isinstance(first, dict) else {}
                if not isinstance(delta, dict):
                    continue

                delta_text = delta.get("content")
                if isinstance(delta_text, str) and delta_text:
                    yield delta_text
