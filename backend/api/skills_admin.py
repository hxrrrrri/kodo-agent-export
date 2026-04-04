from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from observability.audit import log_audit_event

router = APIRouter(prefix="/api/skills/custom", tags=["skills-admin"])
CUSTOM_SKILLS_DIR = Path.home() / ".kodo" / "skills"


class CustomSkillRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=40000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        text = value.strip().lower().replace(" ", "-")
        if not text:
            raise ValueError("name is required")
        if any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for ch in text):
            raise ValueError("name can only include lowercase letters, digits, hyphen, underscore")
        return text


async def _list_files() -> list[Path]:
    def _run() -> list[Path]:
        CUSTOM_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
        return sorted(CUSTOM_SKILLS_DIR.glob("*.md"))

    return await asyncio.to_thread(_run)


@router.get("")
async def list_custom_skills(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "skills_custom_list")

    rows = []
    for path in await _list_files():
        try:
            content = await asyncio.to_thread(path.read_text, "utf-8")
        except Exception:
            continue

        description = ""
        for line in content.splitlines():
            text = line.strip()
            if not text or text.startswith("#"):
                continue
            description = text
            break

        rows.append({
            "name": path.stem,
            "path": str(path),
            "description": description,
            "content": content,
        })

    return {"skills": rows}


@router.post("")
async def upsert_custom_skill(body: CustomSkillRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "skills_custom_upsert")

    CUSTOM_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    path = CUSTOM_SKILLS_DIR / f"{body.name}.md"

    await asyncio.to_thread(path.write_text, body.content, "utf-8")
    log_audit_event(
        "custom_skill_upsert",
        request_id=getattr(request.state, "request_id", None),
        name=body.name,
    )
    return {"saved": True, "name": body.name, "path": str(path)}


@router.delete("/{name}")
async def delete_custom_skill(name: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "skills_custom_delete")

    normalized = name.strip().lower().replace(" ", "-")
    path = CUSTOM_SKILLS_DIR / f"{normalized}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Custom skill not found")

    await asyncio.to_thread(path.unlink)
    log_audit_event(
        "custom_skill_delete",
        request_id=getattr(request.state, "request_id", None),
        name=normalized,
    )
    return {"deleted": True, "name": normalized}
