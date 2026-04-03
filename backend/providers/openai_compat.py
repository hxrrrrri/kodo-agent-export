from __future__ import annotations

import json
from typing import Any, AsyncIterator

from privacy import build_httpx_async_client


async def _stream_chat_chunks(
    *,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: float,
) -> AsyncIterator[str]:
    async with build_httpx_async_client(timeout=timeout, headers=headers) as client:
        async with client.stream("POST", url, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue

                raw = line[len("data: "):].strip()
                if not raw or raw == "[DONE]":
                    continue

                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                choices = chunk.get("choices") if isinstance(chunk, dict) else None
                if not isinstance(choices, list) or not choices:
                    continue

                first = choices[0] if isinstance(choices[0], dict) else {}
                delta = first.get("delta") if isinstance(first, dict) else {}
                if not isinstance(delta, dict):
                    continue

                text = delta.get("content")
                if isinstance(text, str) and text:
                    yield text


async def openai_compat_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    stream: bool = False,
    max_tokens: int = 8192,
    timeout: float = 120.0,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, Any] | AsyncIterator[str]:
    base = base_url.rstrip("/")
    url = f"{base}/chat/completions"

    headers = {
        "Content-Type": "application/json",
    }
    if api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"

    if "openrouter.ai" in base:
        headers.setdefault("HTTP-Referer", "http://localhost")
        headers.setdefault("X-Title", "kodo-agent")

    if extra_headers:
        headers.update(extra_headers)

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": int(max_tokens),
        "stream": bool(stream),
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    if stream:
        return _stream_chat_chunks(url=url, headers=headers, payload=payload, timeout=timeout)

    async with build_httpx_async_client(timeout=timeout, headers=headers) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    choices = data.get("choices", []) if isinstance(data, dict) else []
    first = choices[0] if isinstance(choices, list) and choices else {}
    message = first.get("message") if isinstance(first, dict) else {}
    text = message.get("content") if isinstance(message, dict) else ""
    usage = data.get("usage", {}) if isinstance(data, dict) else {}

    return {
        "id": data.get("id", "msg_openai_compat") if isinstance(data, dict) else "msg_openai_compat",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": text if isinstance(text, str) else ""}],
        "model": model,
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": int(usage.get("prompt_tokens", 0) or 0) if isinstance(usage, dict) else 0,
            "output_tokens": int(usage.get("completion_tokens", 0) or 0) if isinstance(usage, dict) else 0,
        },
        "raw": data,
    }
