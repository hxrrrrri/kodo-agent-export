from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from providers.discovery import discover_local_providers, list_available_models
from providers.smart_router import ROUTER_STRATEGIES, get_smart_router, smart_router_enabled

router = APIRouter(prefix="/api/providers", tags=["providers"])


def _provider_configured(provider: str) -> bool:
    name = provider.strip().lower()
    if name == "openai":
        return bool(os.getenv("OPENAI_API_KEY", "").strip())
    if name == "anthropic":
        return bool(os.getenv("ANTHROPIC_API_KEY", "").strip())
    if name == "gemini":
        return bool(os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip())
    if name == "deepseek":
        return bool(os.getenv("DEEPSEEK_API_KEY", "").strip())
    if name == "groq":
        return bool(os.getenv("GROQ_API_KEY", "").strip())
    if name == "openrouter":
        return bool(os.getenv("OPENROUTER_API_KEY", "").strip())
    if name == "github-models":
        return bool(os.getenv("GITHUB_MODELS_TOKEN", "").strip())
    if name == "codex":
        return bool(os.getenv("CODEX_API_KEY", "").strip())
    if name == "ollama":
        return bool(os.getenv("OLLAMA_BASE_URL", "").strip())
    if name == "atomic-chat":
        return bool(os.getenv("ATOMIC_CHAT_BASE_URL", "").strip())
    return False


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
    return ""


class RouterStrategyRequest(BaseModel):
    strategy: str = Field(min_length=1, max_length=32)


@router.get("/discover")
async def discover_providers_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "providers_discover")

    local = await discover_local_providers()
    models: dict[str, list[str]] = {}

    if local.get("ollama"):
        models["ollama"] = await list_available_models("ollama")
    if local.get("atomic_chat"):
        models["atomic_chat"] = await list_available_models("atomic_chat")

    return {
        "providers": local,
        "models": models,
    }


@router.get("/status")
async def providers_status_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "providers_status")

    if not smart_router_enabled():
        primary_provider = os.getenv("PRIMARY_PROVIDER", "anthropic").strip().lower() or "anthropic"
        candidates = [
            primary_provider,
            "anthropic",
            "openai",
            "gemini",
            "deepseek",
            "groq",
            "openrouter",
            "github-models",
            "codex",
            "ollama",
            "atomic-chat",
        ]

        provider = "none"
        seen: set[str] = set()
        for candidate in candidates:
            if candidate in seen:
                continue
            seen.add(candidate)
            if _provider_configured(candidate):
                provider = candidate
                break

        model = os.getenv("MODEL", "").strip() or _default_model_for_provider(provider)
        return {
            "mode": "fixed",
            "strategy": "fixed",
            "fallback_enabled": True,
            "providers": [
                {
                    "provider": provider,
                    "healthy": provider != "none",
                    "configured": provider != "none",
                    "latency_ms": None,
                    "errors": 0,
                    "requests": 0,
                    "error_rate": 0.0,
                    "cost_per_1k": None,
                    "big_model": model,
                    "small_model": model,
                    "score": None,
                }
            ],
        }

    router_instance = await get_smart_router()
    return router_instance.get_status()


@router.post("/router-strategy")
async def update_router_strategy(body: RouterStrategyRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "providers_router_strategy")

    if not smart_router_enabled():
        raise HTTPException(status_code=400, detail="Smart router mode is not enabled")

    strategy = body.strategy.strip().lower()
    if strategy not in ROUTER_STRATEGIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid strategy '{strategy}'. Valid: {', '.join(sorted(ROUTER_STRATEGIES))}",
        )

    router_instance = await get_smart_router()
    router_instance.set_strategy(strategy)
    return router_instance.get_status()


@router.post("/{provider_name}/ping")
async def ping_provider(provider_name: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "providers_ping")

    if not smart_router_enabled():
        raise HTTPException(status_code=400, detail="Smart router mode is not enabled")

    router_instance = await get_smart_router()
    target = provider_name.strip().lower()
    provider = next((item for item in router_instance.providers if item.name == target), None)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")

    await router_instance._ping_provider(provider)
    return {
        "provider": target,
        "healthy": provider.healthy,
        "latency_ms": round(provider.avg_latency_ms, 2),
        "error_rate": round(provider.error_rate, 4),
    }
