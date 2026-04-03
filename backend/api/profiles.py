from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from profiles.manager import ProviderProfile, profile_manager

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


class ProviderProfileRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=200)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, max_length=500)
    goal: str = Field(default="balanced", max_length=32)
    name: str | None = Field(default=None, max_length=120)


class AutoSelectRequest(BaseModel):
    goal: str = Field(default="balanced", max_length=32)


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
async def activate_profile_endpoint(name: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "profiles_activate")

    try:
        await profile_manager.activate_profile(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    active = await profile_manager.get_active_profile()
    return {"activated": True, "profile": asdict(active) if active else None}


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
