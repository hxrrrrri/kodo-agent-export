"""Artifact persistence + share-link HTTP endpoints.

POST /api/artifacts/{session_id}      — upsert an artifact version (authed)
GET  /api/artifacts/{session_id}      — list artifacts in session (authed)
GET  /api/artifacts/{session_id}/{artifact_id} — fetch latest or specific version (authed)
GET  /api/artifacts/{session_id}/{artifact_id}/versions — all versions (authed)
GET  /api/artifacts/shared/{session_id}/{artifact_id}?token=... — public read via collab token
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from api.collab import _validate_token as validate_collab_token
from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from artifacts.store import artifact_store
from observability.audit import log_audit_event
from privacy import feature_enabled

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])

_ALLOWED_TYPES = {"html", "react", "svg", "mermaid", "markdown", "code", "dot", "html-multi", "react-multi"}
_MAX_FILE_BYTES = 2 * 1024 * 1024  # Enforced at upsert time per the hardening plan.


class ArtifactFile(BaseModel):
    path: str = Field(min_length=1, max_length=512)
    content: str = Field(max_length=_MAX_FILE_BYTES)
    language: str = Field(default="text", max_length=40)


class ArtifactUpsertRequest(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    type: str = Field(min_length=1, max_length=32)
    title: str = Field(min_length=1, max_length=200)
    version: int = Field(default=1, ge=1, le=10_000)
    files: list[ArtifactFile] = Field(default_factory=list)
    entrypoint: str | None = Field(default=None, max_length=512)
    metadata: dict[str, Any] = Field(default_factory=dict)


def _artifacts_enabled() -> bool:
    return feature_enabled("ARTIFACTS_V2", default="1")


def _validate_artifact_id(artifact_id: str) -> str:
    text = artifact_id.strip()
    if not text:
        raise HTTPException(status_code=400, detail="artifact_id is required")
    if any(ch in text for ch in {"/", "\\", "..", "\x00"}):
        raise HTTPException(status_code=400, detail="artifact_id contains invalid characters")
    return text


@router.post("/{session_id}")
async def upsert_artifact(session_id: str, body: ArtifactUpsertRequest, request: Request) -> dict[str, Any]:
    if not _artifacts_enabled():
        raise HTTPException(status_code=404, detail="Artifacts v2 disabled")
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "artifacts_upsert")

    if body.type.strip().lower() not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported artifact type: {body.type}")

    artifact_id = _validate_artifact_id(body.id)
    total_bytes = sum(len((f.content or "").encode("utf-8")) for f in body.files)
    if total_bytes > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Artifact bundle exceeds 2MB limit")

    payload = {
        "id": artifact_id,
        "type": body.type.strip().lower(),
        "title": body.title.strip(),
        "version": int(body.version),
        "files": [file.model_dump() for file in body.files],
        "entrypoint": body.entrypoint,
        "metadata": body.metadata,
    }
    stored = await artifact_store.upsert(session_id, payload)
    log_audit_event(
        "artifact_upsert",
        session_id=session_id,
        artifact_id=artifact_id,
        version=stored.get("version"),
        request_id=getattr(request.state, "request_id", None),
    )
    return {"ok": True, "artifact": stored}


@router.get("/{session_id}")
async def list_artifacts(
    session_id: str,
    request: Request,
    include_content: bool = Query(default=False),
) -> dict[str, Any]:
    if not _artifacts_enabled():
        return {"artifacts": []}
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "artifacts_list")
    return {"artifacts": await artifact_store.list_artifacts(session_id, include_content=include_content)}


@router.get("/{session_id}/{artifact_id}")
async def get_artifact(
    session_id: str,
    artifact_id: str,
    request: Request,
    version: int | None = Query(default=None, ge=1, le=10_000),
) -> dict[str, Any]:
    if not _artifacts_enabled():
        raise HTTPException(status_code=404, detail="Artifacts v2 disabled")
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "artifacts_get")

    artifact_id = _validate_artifact_id(artifact_id)
    row = await artifact_store.get(session_id, artifact_id, version=version)
    if row is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"artifact": row}


@router.get("/{session_id}/{artifact_id}/versions")
async def list_artifact_versions(session_id: str, artifact_id: str, request: Request) -> dict[str, Any]:
    if not _artifacts_enabled():
        raise HTTPException(status_code=404, detail="Artifacts v2 disabled")
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "artifacts_versions")

    artifact_id = _validate_artifact_id(artifact_id)
    return {"versions": await artifact_store.get_all_versions(session_id, artifact_id)}


@router.get("/shared/{session_id}/{artifact_id}")
async def get_shared_artifact(
    session_id: str,
    artifact_id: str,
    token: str = Query(..., max_length=256),
    version: int | None = Query(default=None, ge=1, le=10_000),
) -> dict[str, Any]:
    """Read-only public view gated by a collab share token bound to the session."""
    if not _artifacts_enabled():
        raise HTTPException(status_code=404, detail="Artifacts v2 disabled")
    if not feature_enabled("COLLAB", default="0"):
        raise HTTPException(status_code=404, detail="Sharing is disabled")

    ok = await validate_collab_token(session_id, token.strip())
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid or expired share token")

    artifact_id = _validate_artifact_id(artifact_id)
    row = await artifact_store.get(session_id, artifact_id, version=version)
    if row is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"artifact": row, "read_only": True}
