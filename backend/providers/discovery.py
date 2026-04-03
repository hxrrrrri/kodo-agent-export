from __future__ import annotations

import re
from typing import Literal

from privacy import feature_enabled

from .atomic_chat_provider import list_atomic_chat_models
from .ollama_provider import check_ollama_running, list_ollama_models

Goal = Literal["coding", "balanced", "latency", "creative"]

CODING_PRIORITY = ["qwen2.5-coder", "deepseek-coder", "codellama", "llama3"]
CREATIVE_PRIORITY = ["mistral", "mixtral", "llama3"]
BALANCED_PRIORITY = ["llama3.1:8b", "llama3.1", "llama3"]


def _goal(value: str) -> Goal:
    normalized = value.strip().lower()
    if normalized in {"coding", "balanced", "latency", "creative"}:
        return normalized  # type: ignore[return-value]
    return "balanced"


def _extract_size_hint(model_name: str) -> float:
    lowered = model_name.lower()

    # Handle common Ollama suffixes like :8b, :3.8b, 70b, 1.5b
    match = re.search(r"(\d+(?:\.\d+)?)\s*b\b", lowered)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return 9999.0

    # Handle tiny models with q4/q8 tags as a weak size proxy.
    if "q4" in lowered:
        return 4.0
    if "q8" in lowered:
        return 8.0

    return 9999.0


def _first_by_preference(available: list[str], preferred_tokens: list[str]) -> str | None:
    lowered = [(item, item.lower()) for item in available]
    for token in preferred_tokens:
        token_l = token.lower()
        for original, probe in lowered:
            if token_l in probe:
                return original
    return None


async def discover_local_providers() -> dict[str, bool]:
    if not feature_enabled("PROVIDER_DISCOVERY"):
        return {"ollama": False, "atomic_chat": False}

    ollama_ok = await check_ollama_running()
    atomic_models = await list_atomic_chat_models()
    return {
        "ollama": bool(ollama_ok),
        "atomic_chat": bool(atomic_models),
    }


async def list_available_models(provider: str) -> list[str]:
    if not feature_enabled("PROVIDER_DISCOVERY"):
        return []

    normalized = provider.strip().lower().replace("-", "_")
    if normalized == "ollama":
        return await list_ollama_models()
    if normalized == "atomic_chat":
        return await list_atomic_chat_models()
    return []


def recommend_model(available: list[str], goal: str) -> str | None:
    if not available:
        return None

    target = _goal(goal)

    if target == "coding":
        pick = _first_by_preference(available, CODING_PRIORITY)
        return pick or available[0]

    if target == "creative":
        pick = _first_by_preference(available, CREATIVE_PRIORITY)
        return pick or available[0]

    if target == "balanced":
        pick = _first_by_preference(available, BALANCED_PRIORITY)
        return pick or available[0]

    # latency: smallest parameter count wins
    sorted_models = sorted(available, key=_extract_size_hint)
    return sorted_models[0] if sorted_models else None
