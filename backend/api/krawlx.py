from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from observability.audit import log_audit_event
from privacy import feature_enabled
from tools.krawlx import KrawlXTool
from utils.webhook_delivery import send_signed_webhook

router = APIRouter(prefix="/api/krawlx", tags=["krawlx"])
_NONE_LIKE = {"none", "null", "undefined"}


def _normalize_optional_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in _NONE_LIKE:
        return ""
    return text


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _validate_callback_target(url: str) -> str:
    guard = KrawlXTool()
    normalized = guard._normalize_url(url)
    target_error = await guard._validate_target_url(normalized)
    if target_error:
        raise ValueError(target_error)
    return normalized


class KrawlXCrawlRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    max_pages: int = Field(default=20, ge=1, le=200)
    max_depth: int = Field(default=2, ge=0, le=10)
    same_origin: bool = True
    obey_robots: bool = True
    include_patterns: list[str] = Field(default_factory=list)
    exclude_patterns: list[str] = Field(default_factory=list)
    timeout_seconds: float = Field(default=10.0, gt=0.1, le=60.0)
    callback_url: str | None = Field(default=None, max_length=2048)
    callback_secret: str | None = Field(default=None, max_length=1024)
    callback_event_id: str | None = Field(default=None, max_length=128)
    callback_retries: int = Field(default=2, ge=0, le=5)
    callback_timeout_seconds: float = Field(default=8.0, gt=0.1, le=30.0)
    callback_headers: dict[str, str] = Field(default_factory=dict)

    @field_validator("url")
    @classmethod
    def _normalize_url(cls, value: str) -> str:
        return value.strip()

    @field_validator("callback_url", "callback_secret", "callback_event_id", mode="before")
    @classmethod
    def _normalize_optionals(cls, value: object) -> str | None:
        normalized = _normalize_optional_text(value)
        return normalized or None

    @field_validator("include_patterns", "exclude_patterns", mode="before")
    @classmethod
    def _normalize_patterns(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            raw_values = [value]
        elif isinstance(value, list):
            raw_values = [str(item) for item in value]
        else:
            raise ValueError("Patterns must be a string or list of strings")

        normalized: list[str] = []
        for item in raw_values:
            candidate = item.strip()
            if candidate:
                normalized.append(candidate)
        return normalized

    @field_validator("callback_headers", mode="before")
    @classmethod
    def _normalize_callback_headers(cls, value: object) -> dict[str, str]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError("callback_headers must be an object")

        normalized: dict[str, str] = {}
        for key, raw_value in value.items():
            name = _normalize_optional_text(key)
            header_value = _normalize_optional_text(raw_value)
            if not name or not header_value:
                continue
            normalized[name] = header_value
        return normalized


@router.post("/crawl")
async def crawl_website(body: KrawlXCrawlRequest, request: Request):
    require_api_auth(request)

    if not feature_enabled("KRAWLX"):
        raise HTTPException(status_code=404, detail="KrawlX is disabled")

    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "krawlx_crawl")

    callback_url: str | None = None
    if body.callback_url:
        try:
            callback_url = await _validate_callback_target(body.callback_url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid callback_url: {exc}") from exc

    tool = KrawlXTool()
    result = await tool.execute(
        url=body.url,
        max_pages=body.max_pages,
        max_depth=body.max_depth,
        same_origin=body.same_origin,
        obey_robots=body.obey_robots,
        include_patterns=body.include_patterns,
        exclude_patterns=body.exclude_patterns,
        timeout_seconds=body.timeout_seconds,
    )

    if not result.success:
        log_audit_event(
            "krawlx_api_failed",
            seed_url=body.url,
            error=(result.error or "KrawlX crawl failed"),
        )
        raise HTTPException(status_code=400, detail=result.error or "KrawlX crawl failed")

    payload: dict[str, object]
    try:
        payload = json.loads(result.output)
    except json.JSONDecodeError:
        payload = {"raw": result.output}

    response_payload = {
        "success": True,
        **payload,
        "metadata": result.metadata,
    }

    if callback_url:
        callback_payload = {
            "event": "krawlx.crawl.completed",
            "sent_at": _utc_now(),
            "request_id": getattr(request.state, "request_id", None),
            "seed_url": body.url,
            "result": {
                **payload,
                "metadata": result.metadata,
            },
        }

        delivery = await send_signed_webhook(
            url=callback_url,
            payload=callback_payload,
            secret=body.callback_secret,
            timeout_seconds=body.callback_timeout_seconds,
            retries=body.callback_retries,
            delivery_id=body.callback_event_id,
            event_type="krawlx.crawl.completed",
            extra_headers=body.callback_headers,
        )
        response_payload["callback_delivery"] = delivery

        if not delivery.get("success"):
            log_audit_event(
                "krawlx_callback_failed",
                seed_url=body.url,
                callback_url=callback_url,
                delivery_id=delivery.get("delivery_id"),
                error=delivery.get("error"),
            )

    log_audit_event(
        "krawlx_api_completed",
        seed_url=body.url,
        pages_fetched=int(((payload.get("stats") or {}).get("pages_fetched", 0)) if isinstance(payload, dict) else 0),
    )

    return response_payload
