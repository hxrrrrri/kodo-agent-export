from __future__ import annotations

import os
from typing import Any

import httpx


def _env_flag(name: str, default: str = "0") -> bool:
    raw = os.getenv(name, default).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def telemetry_disabled() -> bool:
    return _env_flag("KODO_NO_TELEMETRY", "0")


def feature_enabled(feature: str, default: str = "1") -> bool:
    key = f"KODO_ENABLE_{feature.strip().upper().replace('-', '_')}"
    return _env_flag(key, default)


def sanitize_outbound_headers(headers: dict[str, str] | None = None) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for key, value in (headers or {}).items():
        if key.lower() == "user-agent" and telemetry_disabled():
            continue
        cleaned[key] = value
    return cleaned


async def _strip_user_agent(request: httpx.Request) -> None:
    if telemetry_disabled():
        request.headers.pop("User-Agent", None)


def build_httpx_async_client(
    *,
    timeout: float = 10.0,
    headers: dict[str, str] | None = None,
    **kwargs: Any,
) -> httpx.AsyncClient:
    request_hooks = list((kwargs.pop("event_hooks", {}) or {}).get("request", []))
    request_hooks.append(_strip_user_agent)

    return httpx.AsyncClient(
        timeout=timeout,
        headers=sanitize_outbound_headers(headers),
        event_hooks={"request": request_hooks},
        **kwargs,
    )
