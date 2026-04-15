from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from dotenv import set_key
from pydantic import BaseModel

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth

router = APIRouter(prefix="/settings", tags=["settings"])
logger = logging.getLogger(__name__)
_DEFAULT_DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"


class SettingsPayload(BaseModel):
    permission_mode: str | None = None
    router_mode: str | None = None
    router_strategy: str | None = None
    max_tokens: int | None = None
    max_context_messages: int | None = None
    kodo_no_telemetry: bool | None = None
    kodo_enable_image_gen: bool | None = None
    kodo_enable_tts: bool | None = None
    kodo_enable_screenshot: bool | None = None
    kodo_enable_email: bool | None = None
    kodo_enable_collab: bool | None = None
    kodo_enable_cron: bool | None = None
    kodo_enable_streaming_tools: bool | None = None
    kodo_enable_prompt_cache: bool | None = None
    kodo_enable_auto_title: bool | None = None
    kodo_enable_caveman: bool | None = None


READABLE_KEYS = {
    "PERMISSION_MODE",
    "ROUTER_MODE",
    "ROUTER_STRATEGY",
    "MAX_TOKENS",
    "MODEL",
    "PRIMARY_PROVIDER",
    "KODO_NO_TELEMETRY",
    "KODO_ENABLE_IMAGE_GEN",
    "KODO_ENABLE_TTS",
    "KODO_ENABLE_SCREENSHOT",
    "KODO_ENABLE_EMAIL",
    "KODO_ENABLE_COLLAB",
    "KODO_ENABLE_CRON",
    "KODO_ENABLE_STREAMING_TOOLS",
    "KODO_ENABLE_PROMPT_CACHE",
    "KODO_ENABLE_AUTO_TITLE",
    "KODO_ENABLE_CAVEMAN",
    "MAX_CONTEXT_MESSAGES",
    "MAX_STREAMING_LINES",
    "REPL_SESSION_TIMEOUT_SECONDS",
}


def _resolve_dotenv_path() -> Path:
    override = os.getenv("KODO_SETTINGS_DOTENV_PATH", "").strip()
    if override:
        return Path(override).expanduser()
    return _DEFAULT_DOTENV_PATH


def _persist_setting(env_key: str, value: str) -> None:
    dotenv_path = _resolve_dotenv_path()
    try:
        set_key(str(dotenv_path), env_key, value, quote_mode="auto")
    except Exception as exc:
        logger.warning("Failed to persist setting %s to %s: %s", env_key, dotenv_path, exc)


@router.get("")
async def get_settings(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "get_settings")

    current: dict[str, Any] = {}
    for key in READABLE_KEYS:
        current[key.lower()] = os.getenv(key, "")

    return {"settings": current}


@router.patch("")
async def update_settings(body: SettingsPayload, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "update_settings")

    updated: dict[str, str] = {}

    def apply(env_key: str, value: Any) -> None:
        if value is None:
            return
        str_value = str(int(value)) if isinstance(value, bool) else str(value)
        os.environ[env_key] = str_value
        _persist_setting(env_key, str_value)
        updated[env_key.lower()] = str_value

    apply("PERMISSION_MODE", body.permission_mode)
    apply("ROUTER_MODE", body.router_mode)
    apply("ROUTER_STRATEGY", body.router_strategy)
    apply("MAX_TOKENS", body.max_tokens)
    apply("MAX_CONTEXT_MESSAGES", body.max_context_messages)
    apply("KODO_NO_TELEMETRY", body.kodo_no_telemetry)
    apply("KODO_ENABLE_IMAGE_GEN", body.kodo_enable_image_gen)
    apply("KODO_ENABLE_TTS", body.kodo_enable_tts)
    apply("KODO_ENABLE_SCREENSHOT", body.kodo_enable_screenshot)
    apply("KODO_ENABLE_EMAIL", body.kodo_enable_email)
    apply("KODO_ENABLE_COLLAB", body.kodo_enable_collab)
    apply("KODO_ENABLE_CRON", body.kodo_enable_cron)
    apply("KODO_ENABLE_STREAMING_TOOLS", body.kodo_enable_streaming_tools)
    apply("KODO_ENABLE_PROMPT_CACHE", body.kodo_enable_prompt_cache)
    apply("KODO_ENABLE_AUTO_TITLE", body.kodo_enable_auto_title)
    apply("KODO_ENABLE_CAVEMAN", body.kodo_enable_caveman)

    return {"updated": updated}
