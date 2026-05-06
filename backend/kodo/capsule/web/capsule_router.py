from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, require_api_auth, enforce_rate_limit

from ..capsule_manager import capsule_manager
from ..types import CaptureRequest, InjectRequest, MergeRequest, PersonaRequest, TemplateRequest
from .token_ws import capsule_usage_websocket


router = APIRouter(prefix="/api/capsule", tags=["capsule"])


class CompressRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=160)
    keep_recent: int = Field(default=8, ge=2, le=80)
    persist: bool = False


class BridgeRequest(BaseModel):
    capsule_id: str = Field(min_length=1, max_length=80)
    target_provider: str = Field(default="openai", max_length=80)
    target_model: str | None = Field(default=None, max_length=200)


class RollbackRequest(BaseModel):
    capsule_id: str = Field(min_length=1, max_length=80)
    version_number: int | None = Field(default=None, ge=1)


class ExportRequest(BaseModel):
    path: str | None = Field(default=None, max_length=2048)
    import_mode: bool = False


def _raise_if_failed(payload: dict[str, Any]) -> dict[str, Any]:
    if not payload.get("success"):
        raise HTTPException(status_code=400, detail=str(payload.get("message") or "Capsule operation failed"))
    return payload


@router.get("/capsules")
async def list_capsules(request: Request, query: str = Query(default="", max_length=400)):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_list")
    rows = await capsule_manager.search_capsules(query) if query.strip() else await capsule_manager.list_capsules()
    return {"capsules": [item.model_dump() for item in rows]}


@router.get("/capsules/{capsule_id}")
async def get_capsule(capsule_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_get")
    capsule = await capsule_manager.store.get_capsule(capsule_id)
    if capsule is None:
        raise HTTPException(status_code=404, detail="Capsule not found")
    return capsule.model_dump()


@router.delete("/capsules/{capsule_id}")
async def delete_capsule(capsule_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_delete")
    deleted = await capsule_manager.delete_capsule(capsule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Capsule not found")
    return {"deleted": True}


@router.post("/capture")
async def capture(body: CaptureRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_capture")
    return _raise_if_failed((await capsule_manager.capture_session(**body.model_dump())).model_dump())


@router.post("/inject")
async def inject(body: InjectRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_inject")
    return _raise_if_failed((await capsule_manager.inject_capsule(body.capsule_id, body.message)).model_dump())


@router.post("/compress")
async def compress(body: CompressRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_compress")
    return _raise_if_failed((await capsule_manager.compress_session(body.session_id, body.keep_recent, body.persist)).model_dump())


@router.get("/usage/{session_id}")
async def usage(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_usage")
    return _raise_if_failed((await capsule_manager.usage(session_id)).model_dump())


@router.websocket("/usage/ws")
async def usage_ws(websocket: WebSocket, session_id: str | None = Query(default=None, max_length=160)):
    await capsule_usage_websocket(websocket, session_id=session_id)


@router.post("/bridge")
async def bridge(body: BridgeRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_bridge")
    return _raise_if_failed((await capsule_manager.bridge_capsule(body.capsule_id, body.target_provider, body.target_model)).model_dump())


@router.post("/template")
async def template(body: TemplateRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_template")
    return _raise_if_failed((await capsule_manager.render_template(body.template, body.values)).model_dump())


@router.post("/persona")
async def persona(body: PersonaRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_persona")
    return _raise_if_failed((await capsule_manager.load_persona(body.name, body.project_dir)).model_dump())


@router.get("/versions/{capsule_id}")
async def versions(capsule_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_versions")
    rows = await capsule_manager.store.get_versions(capsule_id)
    return {"versions": [item.model_dump() for item in rows]}


@router.post("/rollback")
async def rollback(body: RollbackRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_rollback")
    return _raise_if_failed((await capsule_manager.rollback(body.capsule_id, body.version_number)).model_dump())


@router.post("/merge")
async def merge(body: MergeRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_merge")
    return _raise_if_failed((await capsule_manager.merge(body.capsule_ids, body.tag)).model_dump())


@router.post("/export")
async def export(body: ExportRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "capsule_export")
    path = body.path or str(Path.home() / ".kodo" / "capsule" / "capsules-export.json")
    return _raise_if_failed((await capsule_manager.export(path=path, import_mode=body.import_mode)).model_dump())


