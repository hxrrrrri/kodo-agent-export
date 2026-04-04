from __future__ import annotations

import asyncio
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from observability.audit import log_audit_event
from privacy import feature_enabled

router = APIRouter(prefix="/api/collab", tags=["collaboration"])

_SESSION_SUBSCRIBERS: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}
_SESSION_TOKENS: dict[str, dict[str, datetime]] = {}
_COLLAPSE_LOCK = asyncio.Lock()


def _enabled() -> bool:
    return feature_enabled("COLLAB", default="0")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _ttl_seconds() -> int:
    import os

    raw = os.getenv("COLLAB_TOKEN_TTL_SECONDS", "3600").strip()
    try:
        return max(60, int(raw))
    except Exception:
        return 3600


async def _cleanup_tokens() -> None:
    now = _utc_now()
    async with _COLLAPSE_LOCK:
        for session_id in list(_SESSION_TOKENS.keys()):
            tokens = _SESSION_TOKENS.get(session_id, {})
            for token in list(tokens.keys()):
                if tokens[token] <= now:
                    tokens.pop(token, None)
            if not tokens:
                _SESSION_TOKENS.pop(session_id, None)


async def publish_session_event(session_id: str, event: dict[str, Any]) -> None:
    if not _enabled() or not session_id:
        return

    async with _COLLAPSE_LOCK:
        queues = list(_SESSION_SUBSCRIBERS.get(session_id, []))

    if not queues:
        return

    payload = dict(event)
    payload.setdefault("session_id", session_id)

    for queue in queues:
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            continue


async def _validate_token(session_id: str, token: str) -> bool:
    await _cleanup_tokens()
    async with _COLLAPSE_LOCK:
        tokens = _SESSION_TOKENS.get(session_id, {})
        expiry = tokens.get(token)
        return bool(expiry and expiry > _utc_now())


@router.post("/sessions/{session_id}/share")
async def create_share_token(session_id: str, request: Request):
    if not _enabled():
        raise HTTPException(status_code=404, detail="Collaboration is disabled")

    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "collab_share_create")

    token = secrets.token_urlsafe(24)
    expires_at = _utc_now() + timedelta(seconds=_ttl_seconds())

    async with _COLLAPSE_LOCK:
        session_tokens = _SESSION_TOKENS.setdefault(session_id, {})
        session_tokens[token] = expires_at

    share_url = f"{request.base_url}?session_id={session_id}&share_token={token}"
    log_audit_event(
        "collab_share_created",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        expires_at=_iso(expires_at),
    )
    return {"share_url": share_url, "token": token, "expires_at": _iso(expires_at)}


@router.delete("/sessions/{session_id}/share")
async def revoke_share_tokens(session_id: str, request: Request):
    if not _enabled():
        raise HTTPException(status_code=404, detail="Collaboration is disabled")

    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "collab_share_revoke")

    async with _COLLAPSE_LOCK:
        _SESSION_TOKENS.pop(session_id, None)

    log_audit_event(
        "collab_share_revoked",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
    )
    return {"revoked": True, "session_id": session_id}


@router.get("/sessions/{session_id}/viewers")
async def get_viewers(session_id: str, request: Request):
    if not _enabled():
        raise HTTPException(status_code=404, detail="Collaboration is disabled")

    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "collab_viewers")

    async with _COLLAPSE_LOCK:
        viewers = len(_SESSION_SUBSCRIBERS.get(session_id, []))
    return {"session_id": session_id, "viewers": viewers}


@router.get("/sessions/{session_id}/stream")
async def stream_collab_events(
    session_id: str,
    token: str = Query(default="", max_length=256),
):
    if not _enabled():
        raise HTTPException(status_code=404, detail="Collaboration is disabled")

    if not token or not await _validate_token(session_id, token):
        raise HTTPException(status_code=401, detail="Invalid or expired share token")

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=200)

    async with _COLLAPSE_LOCK:
        bucket = _SESSION_SUBSCRIBERS.setdefault(session_id, [])
        bucket.append(queue)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'connected', 'session_id': session_id})}\n\n"
        try:
            while True:
                payload = await queue.get()
                yield f"data: {json.dumps(payload)}\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            async with _COLLAPSE_LOCK:
                subscribers = _SESSION_SUBSCRIBERS.get(session_id, [])
                if queue in subscribers:
                    subscribers.remove(queue)
                if not subscribers:
                    _SESSION_SUBSCRIBERS.pop(session_id, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
