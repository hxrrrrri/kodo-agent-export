"""
OpenAI-compatible chat completion client.

Supports any provider that implements the /v1/chat/completions endpoint:
NVIDIA NIM, Ollama, Groq, OpenRouter, DeepSeek, OpenAI, etc.

Includes retry with exponential backoff for transient failures.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator

from privacy import build_httpx_async_client

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.0
RETRY_MAX_DELAY = 10.0
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


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
    temperature: float | None = None,
    top_p: float | None = None,
    timeout: float = 120.0,
    extra_headers: dict[str, str] | None = None,
    max_retries: int = MAX_RETRIES,
) -> dict[str, Any] | AsyncIterator[str]:
    """Call an OpenAI-compatible chat completion endpoint.

    Includes retry with exponential backoff for transient failures (429, 5xx).
    Supports temperature, top_p, and max_tokens parameters.
    """
    base = base_url.rstrip("/")
    url = f"{base}/chat/completions"

    headers = {
        "Content-Type": "application/json",
    }
    clean_key = api_key.strip().strip("'\"")
    if clean_key:
        headers["Authorization"] = f"Bearer {clean_key}"

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
    if temperature is not None:
        payload["temperature"] = float(temperature)
    if top_p is not None:
        payload["top_p"] = float(top_p)
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    if stream:
        return _stream_chat_chunks(url=url, headers=headers, payload=payload, timeout=timeout)

    # Non-streaming: retry with exponential backoff
    import httpx

    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            async with build_httpx_async_client(timeout=timeout, headers=headers) as client:
                response = await client.post(url, json=payload)

                if response.status_code < 300:
                    data = response.json()
                    return _parse_response(data, model)

                # Retryable?
                if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_retries:
                    delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
                    logger.warning(
                        "OpenAI-compat %s %s (attempt %d/%d), retry in %.1fs",
                        url, response.status_code, attempt + 1, max_retries + 1, delay,
                    )
                    await asyncio.sleep(delay)
                    continue

                # Non-retryable error
                response.raise_for_status()

        except (httpx.ConnectError, httpx.TimeoutException, httpx.ConnectTimeout) as e:
            last_error = e
            if attempt < max_retries:
                delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
                logger.warning(
                    "OpenAI-compat connection error (attempt %d/%d): %s, retry in %.1fs",
                    attempt + 1, max_retries + 1, type(e).__name__, delay,
                )
                await asyncio.sleep(delay)
                continue
            raise RuntimeError(
                f"Connection failed after {max_retries + 1} attempts: {e}"
            ) from e
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"API error {e.response.status_code}: {e.response.text[:300]}"
            ) from e
        except RuntimeError:
            raise
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
                await asyncio.sleep(delay)
                continue
            raise

    raise RuntimeError(
        f"OpenAI-compat request failed after {max_retries + 1} attempts"
        + (f": {last_error}" if last_error else "")
    )


def _parse_response(data: dict[str, Any], model: str) -> dict[str, Any]:
    """Parse an OpenAI-compatible chat completion response into our standard format."""
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
