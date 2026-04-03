from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator

from privacy import build_httpx_async_client


def _gemini_key(api_key: str | None = None) -> str:
    key = (api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY is not configured")
    return key


def _gemini_model(model: str | None = None) -> str:
    return (model or os.getenv("GEMINI_MODEL") or "gemini-2.0-flash").strip()


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
                continue
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str) and text:
                    parts.append(text)
        return "\n".join(parts)
    return ""


def _to_gemini_contents(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = []
    for message in messages:
        role = str(message.get("role", "user")).lower()
        if role not in {"user", "assistant", "model"}:
            role = "user"

        mapped_role = "model" if role in {"assistant", "model"} else "user"
        text = _extract_text(message.get("content", ""))
        if text:
            contents.append({"role": mapped_role, "parts": [{"text": text}]})
    return contents


def _to_gemini_tools(tools: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    declarations: list[dict[str, Any]] = []
    for tool in tools or []:
        if not isinstance(tool, dict):
            continue

        if "function" in tool and isinstance(tool["function"], dict):
            func = tool["function"]
            name = func.get("name")
            description = func.get("description", "")
            parameters = func.get("parameters", {"type": "object", "properties": {}})
        else:
            name = tool.get("name")
            description = tool.get("description", "")
            parameters = tool.get("input_schema", {"type": "object", "properties": {}})

        if not isinstance(name, str) or not name.strip():
            continue

        declarations.append({
            "name": name,
            "description": description if isinstance(description, str) else "",
            "parameters": parameters if isinstance(parameters, dict) else {"type": "object", "properties": {}},
        })

    if not declarations:
        return []
    return [{"function_declarations": declarations}]


def _extract_candidate_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates", [])
    if not isinstance(candidates, list) or not candidates:
        return ""

    parts = candidates[0].get("content", {}).get("parts", []) if isinstance(candidates[0], dict) else []
    text_parts: list[str] = []
    for part in parts if isinstance(parts, list) else []:
        if isinstance(part, dict):
            text = part.get("text")
            if isinstance(text, str) and text:
                text_parts.append(text)
    return "".join(text_parts)


async def gemini_chat(
    *,
    messages: list[dict[str, Any]],
    model: str | None = None,
    system: str | None = None,
    max_tokens: int = 8192,
    stream: bool = False,
    tools: list[dict[str, Any]] | None = None,
    api_key: str | None = None,
) -> dict[str, Any] | AsyncIterator[str]:
    key = _gemini_key(api_key)
    resolved_model = _gemini_model(model)

    payload: dict[str, Any] = {
        "contents": _to_gemini_contents(messages),
        "generationConfig": {
            "maxOutputTokens": int(max_tokens),
        },
    }

    if system and system.strip():
        payload["system_instruction"] = {"parts": [{"text": system.strip()}]}

    gemini_tools = _to_gemini_tools(tools)
    if gemini_tools:
        payload["tools"] = gemini_tools

    base = "https://generativelanguage.googleapis.com/v1beta"
    if stream:
        url = f"{base}/models/{resolved_model}:streamGenerateContent"
        params = {"alt": "sse", "key": key}

        async def _stream() -> AsyncIterator[str]:
            async with build_httpx_async_client(timeout=120.0) as client:
                async with client.stream("POST", url, params=params, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        raw = line[len("data: "):].strip()
                        if not raw:
                            continue
                        try:
                            chunk = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        text = _extract_candidate_text(chunk if isinstance(chunk, dict) else {})
                        if text:
                            yield text

        return _stream()

    url = f"{base}/models/{resolved_model}:generateContent"
    async with build_httpx_async_client(timeout=120.0) as client:
        response = await client.post(url, params={"key": key}, json=payload)
        response.raise_for_status()
        data = response.json()

    usage = data.get("usageMetadata", {}) if isinstance(data, dict) else {}
    text = _extract_candidate_text(data if isinstance(data, dict) else {})

    return {
        "id": "msg_gemini",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": text}],
        "model": resolved_model,
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": int(usage.get("promptTokenCount", 0) or 0) if isinstance(usage, dict) else 0,
            "output_tokens": int(usage.get("candidatesTokenCount", 0) or 0) if isinstance(usage, dict) else 0,
        },
    }
