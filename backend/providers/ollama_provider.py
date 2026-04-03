from __future__ import annotations

import json
import logging
import os
from typing import Any, AsyncIterator

from privacy import build_httpx_async_client

logger = logging.getLogger(__name__)


def _base_url() -> str:
    return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


async def check_ollama_running() -> bool:
    try:
        async with build_httpx_async_client(timeout=3.0) as client:
            resp = await client.get(f"{_base_url()}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


async def list_ollama_models() -> list[str]:
    try:
        async with build_httpx_async_client(timeout=5.0) as client:
            resp = await client.get(f"{_base_url()}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [str(model.get("name", "")) for model in data.get("models", []) if model.get("name")]
    except Exception as exc:
        logger.warning("Could not list Ollama models: %s", exc)
        return []


def normalize_ollama_model(model_name: str) -> str:
    if model_name.startswith("ollama/"):
        return model_name[len("ollama/") :]
    return model_name


def _extract_ollama_image_data(block: dict[str, Any]) -> str | None:
    source = block.get("source")
    if not isinstance(source, dict):
        return None
    if source.get("type") != "base64":
        return None
    data = source.get("data")
    if isinstance(data, str) and data:
        return data
    return None


def _anthropic_to_ollama_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ollama_messages: list[dict[str, Any]] = []
    for msg in messages:
        role = str(msg.get("role", "user"))
        content = msg.get("content", "")
        if isinstance(content, str):
            ollama_messages.append({"role": role, "content": content})
            continue

        if not isinstance(content, list):
            continue

        text_parts: list[str] = []
        image_parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                text_parts.append(block)
                continue
            if not isinstance(block, dict):
                continue

            block_type = block.get("type")
            if block_type == "text":
                text = block.get("text", "")
                if isinstance(text, str) and text:
                    text_parts.append(text)
            elif block_type == "image":
                image_data = _extract_ollama_image_data(block)
                if image_data:
                    image_parts.append(image_data)
                else:
                    text_parts.append("[image]")

        entry: dict[str, Any] = {"role": role, "content": "\n".join(text_parts)}
        if image_parts:
            entry["images"] = image_parts
        ollama_messages.append(entry)

    return ollama_messages


async def ollama_chat(
    *,
    model: str,
    messages: list[dict[str, Any]],
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 1.0,
) -> dict[str, Any]:
    resolved_model = normalize_ollama_model(model)
    ollama_messages = _anthropic_to_ollama_messages(messages)
    if system:
        ollama_messages.insert(0, {"role": "system", "content": system})

    payload = {
        "model": resolved_model,
        "messages": ollama_messages,
        "stream": False,
        "options": {
            "num_predict": int(max_tokens),
            "temperature": float(temperature),
        },
    }

    async with build_httpx_async_client(timeout=120.0) as client:
        resp = await client.post(f"{_base_url()}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()

    assistant_text = data.get("message", {}).get("content", "")
    return {
        "id": f"msg_ollama_{data.get('created_at', 'unknown')}",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": assistant_text}],
        "model": resolved_model,
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": int(data.get("prompt_eval_count", 0) or 0),
            "output_tokens": int(data.get("eval_count", 0) or 0),
        },
    }


async def ollama_chat_stream(
    *,
    model: str,
    messages: list[dict[str, Any]],
    system: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 1.0,
) -> AsyncIterator[str]:
    resolved_model = normalize_ollama_model(model)
    ollama_messages = _anthropic_to_ollama_messages(messages)
    if system:
        ollama_messages.insert(0, {"role": "system", "content": system})

    payload = {
        "model": resolved_model,
        "messages": ollama_messages,
        "stream": True,
        "options": {
            "num_predict": int(max_tokens),
            "temperature": float(temperature),
        },
    }

    async with build_httpx_async_client(timeout=120.0) as client:
        async with client.stream("POST", f"{_base_url()}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                delta_text = chunk.get("message", {}).get("content", "") if isinstance(chunk, dict) else ""
                if isinstance(delta_text, str) and delta_text:
                    yield delta_text
