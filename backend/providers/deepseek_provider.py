from __future__ import annotations

import os
from typing import Any, AsyncIterator

from .openai_compat import openai_compat_chat


async def deepseek_chat(
    *,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    stream: bool = False,
    max_tokens: int = 8192,
    base_url: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any] | AsyncIterator[str]:
    key = (api_key or os.getenv("DEEPSEEK_API_KEY", "")).strip()
    if not key:
        raise ValueError("DEEPSEEK_API_KEY is not configured")

    return await openai_compat_chat(
        base_url=(base_url or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")).strip(),
        api_key=key,
        model=model,
        messages=messages,
        tools=tools,
        stream=stream,
        max_tokens=max_tokens,
    )


async def deepseek_chat_stream(
    *,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    max_tokens: int = 8192,
    base_url: str | None = None,
    api_key: str | None = None,
) -> AsyncIterator[str]:
    result = await deepseek_chat(
        model=model,
        messages=messages,
        tools=tools,
        stream=True,
        max_tokens=max_tokens,
        base_url=base_url,
        api_key=api_key,
    )
    if hasattr(result, "__aiter__"):
        async for chunk in result:  # type: ignore[union-attr]
            yield chunk
