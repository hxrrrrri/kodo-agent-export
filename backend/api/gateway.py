from __future__ import annotations

import os

from fastapi import APIRouter, Request

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth

router = APIRouter(prefix="/api/gateway", tags=["gateway"])

_SUPPORTED_PROVIDER_KEYS = {
    "openai": ("OPENAI_API_KEY",),
    "anthropic": ("ANTHROPIC_API_KEY",),
    "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "deepseek": ("DEEPSEEK_API_KEY",),
    "groq": ("GROQ_API_KEY",),
    "openrouter": ("OPENROUTER_API_KEY",),
    "github-models": ("GITHUB_MODELS_TOKEN",),
    "codex": ("CODEX_API_KEY",),
    "ollama": ("OLLAMA_BASE_URL",),
    "atomic-chat": ("ATOMIC_CHAT_BASE_URL",),
    "nvidia": ("NVIDIA_API_KEY",),
}


def _first_non_empty_env(*keys: str) -> str:
    for key in keys:
        value = os.getenv(key, "").strip()
        if value:
            return value
    return ""


def _provider_configured(provider: str) -> bool:
    keys = _SUPPORTED_PROVIDER_KEYS.get(provider, ())
    return bool(_first_non_empty_env(*keys))


def _default_model_for_provider(provider: str) -> str:
    name = provider.strip().lower()
    if name == "anthropic":
        return "claude-sonnet-4-6"
    if name == "openai":
        return "gpt-4o"
    if name == "gemini":
        return "gemini-2.0-flash"
    if name == "deepseek":
        return "deepseek-chat"
    if name == "groq":
        return "llama-3.3-70b-versatile"
    if name == "openrouter":
        return "anthropic/claude-sonnet-4-6"
    if name == "github-models":
        return "gpt-4o"
    if name == "codex":
        return "gpt-4o"
    if name == "ollama":
        return "llama3"
    if name == "atomic-chat":
        return "default"
    if name == "nvidia":
        return "meta/llama-3.1-8b-instruct"
    return ""


@router.get("/status")
async def gateway_status_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "gateway_status")

    openai_key_set = _provider_configured("openai")
    anthropic_key_set = _provider_configured("anthropic")
    primary_provider = os.getenv("PRIMARY_PROVIDER", "").strip().lower()

    # Resolve actual active provider — respect PRIMARY_PROVIDER before falling back
    ALL_PROVIDERS = [
        "nvidia", "ollama", "anthropic", "openai", "gemini", "deepseek",
        "groq", "openrouter", "github-models", "codex", "atomic-chat",
    ]
    if primary_provider and _provider_configured(primary_provider):
        provider = primary_provider
    else:
        # Fall back to first configured provider
        provider = next((p for p in ALL_PROVIDERS if _provider_configured(p)), None)

    resolved_provider = provider or primary_provider or "anthropic"
    default_model = _default_model_for_provider(resolved_provider) if resolved_provider != "none" else ""

    return {
        "status": "ok",
        "api_auth_enabled": bool(os.getenv("API_AUTH_TOKEN", "").strip()),
        "request_id_enabled": True,
        "permission_mode": os.getenv("PERMISSION_MODE", "ask"),
        "router_mode": os.getenv("ROUTER_MODE", "fixed"),
        "router_strategy": os.getenv("ROUTER_STRATEGY", "balanced"),
        "primary_provider": primary_provider,
        "provider": provider,
        "model": os.getenv("MODEL", default_model),
        "audit_log_file": str(os.path.expanduser("~/.kodo/audit/events.jsonl")),
        "usage_log_file": str(os.path.expanduser("~/.kodo/usage/events.jsonl")),
        "telemetry_disabled": bool(os.getenv("KODO_NO_TELEMETRY", "").strip() in {"1", "true", "yes", "on"}),
        "providers": {
            "openai": openai_key_set,
            "anthropic": anthropic_key_set,
            "gemini": _provider_configured("gemini"),
            "deepseek": _provider_configured("deepseek"),
            "groq": _provider_configured("groq"),
            "openrouter": _provider_configured("openrouter"),
            "github_models": _provider_configured("github-models"),
            "codex": _provider_configured("codex"),
            "ollama": _provider_configured("ollama"),
            "atomic_chat": _provider_configured("atomic-chat"),
            "nvidia": _provider_configured("nvidia"),
        },
    }
