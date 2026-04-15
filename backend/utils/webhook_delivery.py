from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from collections import deque
from typing import Any

from observability.audit import log_audit_event
from privacy import build_httpx_async_client

_HEADER_NAME_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")
_RESERVED_HEADER_KEYS = {
    "content-type",
    "user-agent",
    "x-kodo-webhook-event",
    "x-kodo-webhook-id",
    "x-kodo-webhook-timestamp",
    "x-kodo-webhook-nonce",
    "x-kodo-webhook-signature",
    "x-kodo-webhook-signature-alg",
}


def _env_int(name: str, default: int, min_value: int, max_value: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(min_value, min(max_value, value))


def _safe_header_value(value: str) -> str:
    text = str(value or "").strip()
    if "\n" in text or "\r" in text:
        raise ValueError("Header values cannot contain newlines")
    if len(text) > 2048:
        raise ValueError("Header value is too long")
    return text


def _sanitize_extra_headers(extra_headers: dict[str, str] | None) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for key, value in (extra_headers or {}).items():
        name = str(key or "").strip()
        if not name:
            continue
        if not _HEADER_NAME_RE.match(name):
            raise ValueError(f"Invalid callback header name: {name}")

        lowered = name.lower()
        if lowered in _RESERVED_HEADER_KEYS:
            continue

        sanitized_value = _safe_header_value(str(value or ""))
        if not sanitized_value:
            continue

        cleaned[name] = sanitized_value
    return cleaned


class _RecentDeliveryStore:
    def __init__(self, max_size: int, ttl_seconds: int) -> None:
        self._max_size = max_size
        self._ttl_seconds = ttl_seconds
        self._entries: dict[str, float] = {}
        self._order: deque[tuple[str, float]] = deque()
        self._lock = asyncio.Lock()

    def _prune(self, now: float) -> None:
        while self._order:
            delivery_id, timestamp = self._order[0]
            if (now - timestamp) <= self._ttl_seconds and len(self._entries) <= self._max_size:
                break
            self._order.popleft()
            current = self._entries.get(delivery_id)
            if current is not None and current <= timestamp:
                self._entries.pop(delivery_id, None)

    async def has(self, delivery_id: str) -> bool:
        now = time.time()
        async with self._lock:
            self._prune(now)
            return delivery_id in self._entries

    async def add(self, delivery_id: str) -> None:
        now = time.time()
        async with self._lock:
            self._entries[delivery_id] = now
            self._order.append((delivery_id, now))
            self._prune(now)


_RECENT_DELIVERIES = _RecentDeliveryStore(
    max_size=_env_int("KRAWLX_WEBHOOK_CACHE_SIZE", default=5000, min_value=100, max_value=100000),
    ttl_seconds=_env_int("KRAWLX_WEBHOOK_CACHE_TTL_SECONDS", default=1800, min_value=60, max_value=86400),
)


def _build_signature(secret: str, timestamp: int, nonce: str, delivery_id: str, body: bytes) -> str:
    secret_bytes = secret.encode("utf-8")
    prefix = f"{timestamp}.{nonce}.{delivery_id}.".encode("utf-8")
    digest = hmac.new(secret_bytes, prefix + body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def send_signed_webhook(
    *,
    url: str,
    payload: dict[str, Any],
    secret: str | None,
    timeout_seconds: float,
    retries: int,
    delivery_id: str | None = None,
    event_type: str = "krawlx.crawl.completed",
    extra_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    request_body = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    effective_delivery_id = (delivery_id or str(uuid.uuid4())).strip() or str(uuid.uuid4())

    if await _RECENT_DELIVERIES.has(effective_delivery_id):
        return {
            "success": True,
            "delivery_id": effective_delivery_id,
            "deduped": True,
            "status_code": 208,
            "attempts": 0,
        }

    timestamp = int(time.time())
    nonce = uuid.uuid4().hex

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "KODO-KrawlX-Webhook/1.0",
        "X-Kodo-Webhook-Event": event_type,
        "X-Kodo-Webhook-Id": effective_delivery_id,
        "X-Kodo-Webhook-Timestamp": str(timestamp),
        "X-Kodo-Webhook-Nonce": nonce,
    }
    headers.update(_sanitize_extra_headers(extra_headers))

    normalized_secret = (secret or "").strip()
    if normalized_secret:
        headers["X-Kodo-Webhook-Signature-Alg"] = "sha256"
        headers["X-Kodo-Webhook-Signature"] = _build_signature(
            normalized_secret,
            timestamp,
            nonce,
            effective_delivery_id,
            request_body,
        )

    attempts = max(0, retries) + 1
    last_error = ""

    for attempt in range(1, attempts + 1):
        try:
            async with build_httpx_async_client(timeout=timeout_seconds) as client:
                response = await client.post(url, content=request_body, headers=headers)

            if 200 <= response.status_code < 300:
                await _RECENT_DELIVERIES.add(effective_delivery_id)
                log_audit_event(
                    "krawlx_webhook_delivered",
                    webhook_url=url,
                    webhook_event=event_type,
                    delivery_id=effective_delivery_id,
                    status_code=response.status_code,
                    attempt=attempt,
                )
                return {
                    "success": True,
                    "delivery_id": effective_delivery_id,
                    "status_code": response.status_code,
                    "attempts": attempt,
                }

            last_error = f"HTTP {response.status_code}: {(response.text or '')[:300]}"
        except Exception as exc:
            last_error = str(exc)

        if attempt < attempts:
            await asyncio.sleep(min(4.0, 0.25 * (2 ** (attempt - 1))))

    log_audit_event(
        "krawlx_webhook_failed",
        webhook_url=url,
        webhook_event=event_type,
        delivery_id=effective_delivery_id,
        attempts=attempts,
        error=last_error,
    )

    return {
        "success": False,
        "delivery_id": effective_delivery_id,
        "status_code": None,
        "attempts": attempts,
        "error": last_error,
    }
