from __future__ import annotations

from .atomic_chat_provider import (
    atomic_chat,
    atomic_chat_stream,
    check_atomic_chat_running,
    list_atomic_chat_models,
)
from .deepseek_provider import deepseek_chat, deepseek_chat_stream
from .discovery import discover_local_providers, list_available_models, recommend_model
from .gemini_provider import gemini_chat
from .groq_provider import groq_chat, groq_chat_stream
from .ollama_provider import (
    check_ollama_running,
    list_ollama_models,
    normalize_ollama_model,
    ollama_chat,
    ollama_chat_stream,
)
from .smart_router import Provider, SmartRouter, get_smart_router

__all__ = [
    "Provider",
    "SmartRouter",
    "get_smart_router",
    "check_ollama_running",
    "list_ollama_models",
    "normalize_ollama_model",
    "ollama_chat",
    "ollama_chat_stream",
    "check_atomic_chat_running",
    "list_atomic_chat_models",
    "atomic_chat",
    "atomic_chat_stream",
    "gemini_chat",
    "deepseek_chat",
    "deepseek_chat_stream",
    "groq_chat",
    "groq_chat_stream",
    "discover_local_providers",
    "list_available_models",
    "recommend_model",
]
