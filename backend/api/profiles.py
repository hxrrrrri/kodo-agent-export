from __future__ import annotations

from dataclasses import asdict
import logging
import os
from pathlib import Path

from dotenv import set_key
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from memory.manager import memory_manager
from profiles.manager import ProviderProfile, profile_manager

router = APIRouter(prefix="/api/profiles", tags=["profiles"])
logger = logging.getLogger(__name__)
_DEFAULT_DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"


class ProviderProfileRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=200)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, max_length=500)
    goal: str = Field(default="balanced", max_length=32)
    name: str | None = Field(default=None, max_length=120)


class AutoSelectRequest(BaseModel):
    goal: str = Field(default="balanced", max_length=32)


class ActivateProfileRequest(BaseModel):
    session_id: str | None = Field(default=None, max_length=128)
    persist: bool = Field(default=True)


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


@router.get("")
async def list_profiles_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "profiles_list")

    rows = await profile_manager.list_profiles()
    return {"profiles": [asdict(row) for row in rows]}


@router.post("")
async def save_profile_endpoint(body: ProviderProfileRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "profiles_save")

    try:
        profile = ProviderProfile.from_dict(
            {
                "provider": body.provider,
                "model": body.model,
                "base_url": body.base_url,
                "api_key": body.api_key,
                "goal": body.goal,
                "name": body.name,
            }
        )
        await profile_manager.save_profile(profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"saved": True, "profile": asdict(profile)}


@router.delete("/{name}")
async def delete_profile_endpoint(name: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "profiles_delete")

    await profile_manager.delete_profile(name)
    return {"deleted": True, "name": name}


@router.post("/{name}/activate")
async def activate_profile_endpoint(name: str, request: Request, body: ActivateProfileRequest | None = None):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "profiles_activate")

    try:
        await profile_manager.activate_profile(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    active = await profile_manager.get_active_profile()
    model_override_updated = False
    persist = True if body is None else bool(body.persist)

    if active is not None:
        provider = str(active.provider or "").strip().lower()
        model = str(active.model or "").strip()
        if provider and model:
            _set_runtime_setting("PRIMARY_PROVIDER", provider, persist=persist)
            _set_runtime_setting("MODEL", model, persist=persist)
            _set_runtime_setting("ROUTER_MODE", "fixed", persist=persist)

            if provider in {"ollama", "atomic-chat"}:
                _set_runtime_setting("BIG_MODEL", model, persist=persist)
                _set_runtime_setting("SMALL_MODEL", model, persist=persist)

        session_id = str((body.session_id if body else "") or "").strip()
        if session_id and model:
            await memory_manager.update_session_metadata(
                session_id,
                {"model_override": model},
                create_if_missing=True,
            )
            model_override_updated = True

    return {
        "activated": True,
        "profile": asdict(active) if active else None,
        "model_override_updated": model_override_updated,
    }


@router.get("/active")
async def active_profile_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "profiles_active")

    active = await profile_manager.get_active_profile()
    return {"profile": asdict(active) if active else None}


@router.post("/auto")
async def auto_select_profile_endpoint(body: AutoSelectRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "profiles_auto")

    try:
        selected = await profile_manager.auto_select_profile(body.goal)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"profile": asdict(selected)}
