from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from observability.audit import log_audit_event
from utils.templates import render_template

router = APIRouter(prefix="/api/prompts", tags=["prompts"])
KODO_DIR = Path.home() / ".kodo"
PROMPTS_FILE = KODO_DIR / "prompts.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_variables(content: str) -> list[str]:
    import re

    matches = re.findall(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}", content)
    unique: list[str] = []
    seen = set()
    for item in matches:
        key = item.strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(key)
    return unique


async def _load_prompts() -> list[dict[str, Any]]:
    def _load() -> list[dict[str, Any]]:
        if not PROMPTS_FILE.exists():
            return []
        try:
            payload = json.loads(PROMPTS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        return []

    return await asyncio.to_thread(_load)


async def _save_prompts(rows: list[dict[str, Any]]) -> None:
    def _save() -> None:
        KODO_DIR.mkdir(parents=True, exist_ok=True)
        tmp = PROMPTS_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(rows, indent=2), encoding="utf-8")
        tmp.replace(PROMPTS_FILE)

    await asyncio.to_thread(_save)


class PromptUpsertRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=12000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("name is required")
        return text


class PromptRenderRequest(BaseModel):
    variables: dict[str, Any] = Field(default_factory=dict)


@router.get("")
async def list_prompts(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "prompts_list")
    rows = await _load_prompts()
    rows.sort(key=lambda row: str(row.get("updated_at", row.get("created_at", ""))), reverse=True)
    return {"prompts": rows}


@router.post("")
async def upsert_prompt(body: PromptUpsertRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "prompts_upsert")

    rows = await _load_prompts()
    now = _utc_now()
    variables = _extract_variables(body.content)

    updated = False
    for row in rows:
        if str(row.get("name", "")).strip().lower() == body.name.lower():
            row["name"] = body.name
            row["content"] = body.content
            row["variables"] = variables
            row["updated_at"] = now
            updated = True
            break

    if not updated:
        rows.append(
            {
                "name": body.name,
                "content": body.content,
                "variables": variables,
                "created_at": now,
                "updated_at": now,
            }
        )

    await _save_prompts(rows)
    log_audit_event(
        "prompt_upsert",
        request_id=getattr(request.state, "request_id", None),
        name=body.name,
        updated=updated,
    )
    return {"saved": True, "name": body.name, "updated": updated}


@router.delete("/{name}")
async def delete_prompt(name: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "prompts_delete")

    rows = await _load_prompts()
    before = len(rows)
    remaining = [row for row in rows if str(row.get("name", "")).strip().lower() != name.strip().lower()]
    if len(remaining) == before:
        raise HTTPException(status_code=404, detail="Prompt not found")

    await _save_prompts(remaining)
    log_audit_event(
        "prompt_delete",
        request_id=getattr(request.state, "request_id", None),
        name=name,
    )
    return {"deleted": True, "name": name}


@router.post("/{name}/render")
async def render_prompt(name: str, body: PromptRenderRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "prompts_render")

    rows = await _load_prompts()
    for row in rows:
        if str(row.get("name", "")).strip().lower() == name.strip().lower():
            content = str(row.get("content", ""))
            rendered = render_template(content, body.variables)
            return {
                "name": row.get("name", name),
                "rendered": rendered,
                "variables": row.get("variables", []),
            }

    raise HTTPException(status_code=404, detail="Prompt not found")
