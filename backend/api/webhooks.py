from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import re
from collections import deque
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit
from observability.audit import log_audit_event
from privacy import feature_enabled
from tasks.manager import task_manager
from tools.path_guard import enforce_allowed_path

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
_TEMPLATE_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")
_EVENT_BUFFER: deque[dict[str, Any]] = deque(maxlen=50)
_EVENT_LOCK = asyncio.Lock()


class WebhookTriggerRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=120)
    payload: dict[str, Any] = Field(default_factory=dict)
    prompt_template: str = Field(min_length=1, max_length=12000)
    project_dir: str | None = Field(default=None, max_length=1024)
    webhook_secret: str | None = Field(default=None, max_length=512)


class WebhookEvent(BaseModel):
    event_type: str
    task_id: str
    queued_at: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _webhooks_enabled() -> bool:
    return feature_enabled("WEBHOOKS")


def _lookup_payload(payload: Any, dotted_path: str) -> Any:
    current: Any = payload
    for token in dotted_path.split("."):
        if isinstance(current, dict):
            if token not in current:
                return None
            current = current[token]
            continue

        if isinstance(current, list) and token.isdigit():
            index = int(token)
            if index < 0 or index >= len(current):
                return None
            current = current[index]
            continue

        return None

    return current


def _render_template(template: str, payload: dict[str, Any]) -> str:
    def _replace(match: re.Match[str]) -> str:
        key_path = match.group(1)
        value = _lookup_payload(payload, key_path)
        if value is None:
            return match.group(0)
        if isinstance(value, (dict, list)):
            return str(value)
        return str(value)

    return _TEMPLATE_PATTERN.sub(_replace, template)


def _verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    if not signature_header.startswith("sha256="):
        return False

    actual = signature_header.split("=", 1)[1].strip()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(actual, expected)


async def _record_event(event: WebhookEvent) -> None:
    async with _EVENT_LOCK:
        _EVENT_BUFFER.appendleft(event.model_dump())


@router.post("/trigger")
async def trigger_webhook(body: WebhookTriggerRequest, request: Request):
    if not _webhooks_enabled():
        raise HTTPException(status_code=404, detail="Webhooks are disabled")

    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "webhooks_trigger")

    raw_body = await request.body()
    configured_secret = os.getenv("WEBHOOK_SECRET", "").strip()
    if configured_secret:
        signature = request.headers.get("X-Hub-Signature-256", "").strip()
        if not _verify_signature(raw_body, signature, configured_secret):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    project_dir = body.project_dir
    if project_dir:
        try:
            project_dir = enforce_allowed_path(project_dir)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not os.path.isdir(project_dir):
            raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {project_dir}")

    rendered_prompt = _render_template(body.prompt_template, body.payload)
    task = await task_manager.create_task(
        prompt=rendered_prompt,
        project_dir=project_dir,
        requested_by_session=None,
    )

    queued_at = _utc_now()
    task_id = str(task.get("task_id", ""))
    event = WebhookEvent(event_type=body.event_type, task_id=task_id, queued_at=queued_at)
    await _record_event(event)

    log_audit_event(
        "webhook_triggered",
        request_id=getattr(request.state, "request_id", None),
        webhook_event=body.event_type,
        task_id=task_id,
        has_signature=bool(configured_secret),
    )

    return {"task_id": task_id, "queued_at": queued_at}


@router.get("/events")
async def list_webhook_events(request: Request):
    if not _webhooks_enabled():
        raise HTTPException(status_code=404, detail="Webhooks are disabled")

    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "webhooks_events")
    async with _EVENT_LOCK:
        events = list(_EVENT_BUFFER)
    return {"events": events}
