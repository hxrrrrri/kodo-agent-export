"""Skills Library API — list all skills, fetch content, patch enable/auto-inject."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from skills.registry import skill_registry
from skills.settings import get_skill_setting, set_skill_setting

router = APIRouter(prefix="/api/skill-library", tags=["skills"])
logger = logging.getLogger(__name__)

_DESIGN_SYS = "design-systems"


def _is_design_system(skill: dict) -> bool:
    return _DESIGN_SYS in str(skill.get("path", ""))


def _with_settings(skill: dict) -> dict:
    return {**skill, **get_skill_setting(skill["name"])}


class SkillSettingsPatch(BaseModel):
    enabled: bool | None = None
    auto_inject: bool | None = None


@router.get("")
async def list_skills(request: Request, design_systems: bool = False):
    """List all skills (bundled + custom + project) with their enable/auto-inject state."""
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "skill_library_list")

    raw = skill_registry.list_skills()
    skills = [
        _with_settings(s)
        for s in raw
        if design_systems or not _is_design_system(s)
    ]
    return {"skills": skills, "total": len(skills)}


@router.get("/{name}")
async def get_skill(name: str, request: Request):
    """Fetch full skill content + settings for one skill by name."""
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "skill_library_get")

    skill = skill_registry.get_skill(name)
    if skill is None:
        raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")
    return _with_settings(skill)


@router.patch("/{name}/settings")
async def patch_settings(name: str, body: SkillSettingsPatch, request: Request):
    """Toggle enabled or auto_inject for a skill."""
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "skill_library_patch")

    if body.enabled is None and body.auto_inject is None:
        raise HTTPException(status_code=400, detail="Provide at least one of: enabled, auto_inject")

    set_skill_setting(name, enabled=body.enabled, auto_inject=body.auto_inject)
    return {"name": name, **get_skill_setting(name)}
