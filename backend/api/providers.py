from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import set_key
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from memory.manager import memory_manager
from profiles.manager import ProviderProfile, profile_manager
from providers.discovery import discover_local_providers, list_available_models, recommend_model
from providers.smart_router import ROUTER_STRATEGIES, get_smart_router, smart_router_enabled

router = APIRouter(prefix="/api/providers", tags=["providers"])
logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = {
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
}

_DEFAULT_DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"


def _request_overrides(request: Request) -> dict[str, str]:
    raw = getattr(request.state, "api_key_overrides", None)
    return raw if isinstance(raw, dict) else {}


def _env_or_override(request: Request, key: str) -> str:
    overrides = _request_overrides(request)
    value = str(overrides.get(key, "")).strip()
    if value:
        return value
    return os.getenv(key, "").strip()


def _provider_configured(provider: str, request: Request) -> bool:
    name = provider.strip().lower()
    if name == "openai":
        return bool(_env_or_override(request, "OPENAI_API_KEY"))
    if name == "anthropic":
        return bool(_env_or_override(request, "ANTHROPIC_API_KEY"))
    if name == "gemini":
        return bool(_env_or_override(request, "GEMINI_API_KEY") or _env_or_override(request, "GOOGLE_API_KEY"))
    if name == "deepseek":
        return bool(_env_or_override(request, "DEEPSEEK_API_KEY"))
    if name == "groq":
        return bool(_env_or_override(request, "GROQ_API_KEY"))
    if name == "openrouter":
        return bool(_env_or_override(request, "OPENROUTER_API_KEY"))
    if name == "github-models":
        return bool(_env_or_override(request, "GITHUB_MODELS_TOKEN"))
    if name == "codex":
        return bool(_env_or_override(request, "CODEX_API_KEY"))
    if name == "ollama":
        return bool(os.getenv("OLLAMA_BASE_URL", "").strip())
    if name == "atomic-chat":
        return bool(os.getenv("ATOMIC_CHAT_BASE_URL", "").strip())
    return False


def _normalize_provider_name(value: str) -> str:
    normalized = value.strip().lower().replace("_", "-")
    if normalized == "atomicchat":
        return "atomic-chat"
    return normalized


def _resolve_dotenv_path() -> Path:
    override = os.getenv("KODO_SETTINGS_DOTENV_PATH", "").strip()
    if override:
        return Path(override).expanduser()
    return _DEFAULT_DOTENV_PATH


def _persist_setting(env_key: str, value: str) -> None:
    dotenv_path = _resolve_dotenv_path()
    try:
        set_key(str(dotenv_path), env_key, value, quote_mode="auto")
    except Exception as exc:
        logger.warning("Failed to persist setting %s to %s: %s", env_key, dotenv_path, exc)


def _set_runtime_setting(env_key: str, value: str, *, persist: bool) -> None:
    os.environ[env_key] = value
    if persist:
        _persist_setting(env_key, value)


async def _resolve_model_for_switch(provider: str, requested_model: str | None) -> str:
    explicit = str(requested_model or "").strip()
    if explicit:
        return explicit

    if provider in {"ollama", "atomic-chat"}:
        discovered = await list_available_models(provider)
        pick = recommend_model(discovered, "balanced") if discovered else None
        if pick:
            return pick
        if discovered:
            return discovered[0]

    return _default_model_for_provider(provider)


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


class ProviderSwitchRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=80)
    model: str | None = Field(default=None, max_length=200)
    session_id: str | None = Field(default=None, max_length=128)
    persist: bool = Field(default=True)


class OllamaSetupRequest(BaseModel):
    base_url: str | None = Field(default=None, max_length=300)
    model: str | None = Field(default=None, max_length=200)
    session_id: str | None = Field(default=None, max_length=128)
    persist: bool = Field(default=True)


def _normalize_ollama_base_url(value: str | None) -> str:
    candidate = str(value or "").strip() or os.getenv("OLLAMA_BASE_URL", "").strip() or "http://127.0.0.1:11434"
    candidate = candidate.rstrip("/")
    if candidate.endswith("/v1"):
        candidate = candidate[:-3].rstrip("/")
    if not candidate.startswith(("http://", "https://")):
        candidate = f"http://{candidate}"
    return candidate


async def _ollama_setup_status() -> dict[str, object]:
    normalized_base = _normalize_ollama_base_url(None)
    local = await discover_local_providers()
    models = await list_available_models("ollama")
    recommended = recommend_model(models, "balanced") if models else None

    return {
        "base_url": normalized_base,
        "configured": bool(os.getenv("OLLAMA_BASE_URL", "").strip()),
        "reachable": bool(local.get("ollama")),
        "models": models,
        "recommended_model": recommended,
        "active_model": os.getenv("MODEL", "").strip() or None,
    }


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
        "key_status": {
            "openai": bool(_env_or_override(request, "OPENAI_API_KEY")),
            "anthropic": bool(_env_or_override(request, "ANTHROPIC_API_KEY")),
            "gemini": bool(_env_or_override(request, "GEMINI_API_KEY") or _env_or_override(request, "GOOGLE_API_KEY")),
            "deepseek": bool(_env_or_override(request, "DEEPSEEK_API_KEY")),
            "groq": bool(_env_or_override(request, "GROQ_API_KEY")),
            "firecrawl": bool(_env_or_override(request, "FIRECRAWL_API_KEY")),
        },
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
            if _provider_configured(candidate, request):
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


@router.post("/switch")
async def switch_provider_endpoint(body: ProviderSwitchRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "providers_switch")

    provider = _normalize_provider_name(body.provider)
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider '{body.provider}'.",
        )

    if not _provider_configured(provider, request):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Provider '{provider}' is not configured. Add credentials/base URL and retry."
            ),
        )

    resolved_model = (await _resolve_model_for_switch(provider, body.model)).strip()
    if not resolved_model:
        raise HTTPException(
            status_code=400,
            detail=f"Could not resolve model for provider '{provider}'.",
        )

    _set_runtime_setting("PRIMARY_PROVIDER", provider, persist=body.persist)
    _set_runtime_setting("MODEL", resolved_model, persist=body.persist)
    _set_runtime_setting("ROUTER_MODE", "fixed", persist=body.persist)
    if provider in {"ollama", "atomic-chat"}:
        _set_runtime_setting("BIG_MODEL", resolved_model, persist=body.persist)
        _set_runtime_setting("SMALL_MODEL", resolved_model, persist=body.persist)

    profile_name = f"quick-{provider}"
    profile = ProviderProfile.from_dict(
        {
            "name": profile_name,
            "provider": provider,
            "model": resolved_model,
            "goal": "balanced",
            "base_url": None,
            "api_key": None,
        }
    )
    await profile_manager.save_profile(profile)
    await profile_manager.activate_profile(profile_name)

    session_id = str(body.session_id or "").strip()
    if session_id:
        await memory_manager.update_session_metadata(
            session_id,
            {"model_override": resolved_model},
            create_if_missing=True,
        )

    return {
        "provider": provider,
        "model": resolved_model,
        "router_mode": "fixed",
        "profile": profile_name,
        "persisted": bool(body.persist),
    }


@router.get("/ollama/setup")
async def ollama_setup_status_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "providers_ollama_setup_status")
    return await _ollama_setup_status()


@router.post("/ollama/setup")
async def ollama_setup_endpoint(body: OllamaSetupRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "providers_ollama_setup")

    normalized_base = _normalize_ollama_base_url(body.base_url)
    _set_runtime_setting("OLLAMA_BASE_URL", normalized_base, persist=body.persist)

    models = await list_available_models("ollama")
    selected_model = str(body.model or "").strip()
    if not selected_model:
        selected_model = recommend_model(models, "balanced") or (models[0] if models else "")
    if not selected_model:
        selected_model = _default_model_for_provider("ollama")

    _set_runtime_setting("PRIMARY_PROVIDER", "ollama", persist=body.persist)
    _set_runtime_setting("MODEL", selected_model, persist=body.persist)
    _set_runtime_setting("BIG_MODEL", selected_model, persist=body.persist)
    _set_runtime_setting("SMALL_MODEL", selected_model, persist=body.persist)
    _set_runtime_setting("ROUTER_MODE", "fixed", persist=body.persist)

    profile_name = "quick-ollama"
    profile = ProviderProfile.from_dict(
        {
            "name": profile_name,
            "provider": "ollama",
            "model": selected_model,
            "goal": "balanced",
            "base_url": normalized_base,
            "api_key": None,
        }
    )
    await profile_manager.save_profile(profile)
    await profile_manager.activate_profile(profile_name)

    session_id = str(body.session_id or "").strip()
    if session_id:
        await memory_manager.update_session_metadata(
            session_id,
            {"model_override": selected_model},
            create_if_missing=True,
        )

    status = await _ollama_setup_status()
    return {
        "provider": "ollama",
        "model": selected_model,
        "profile": profile_name,
        "persisted": bool(body.persist),
        **status,
    }


@router.get("/openrouter/models")
async def openrouter_models_endpoint(request: Request):
    """Fetch all available models from OpenRouter API."""
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "providers_openrouter_models")

    api_key = _env_or_override(request, "OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="OPENROUTER_API_KEY not configured")

    import httpx

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "http://localhost",
                    "X-Title": "kodo-agent",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter API error: {exc.response.status_code}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch OpenRouter models: {exc}") from exc

    raw_models = data.get("data", []) if isinstance(data, dict) else []
    models = []
    for m in raw_models:
        if not isinstance(m, dict):
            continue
        model_id = str(m.get("id", "")).strip()
        if model_id:
            models.append({
                "id": model_id,
                "name": str(m.get("name", model_id)).strip(),
                "context_length": m.get("context_length"),
                "pricing": m.get("pricing"),
            })

    models.sort(key=lambda x: x["id"])
    return {"models": models, "count": len(models)}
