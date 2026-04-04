from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from observability.audit import log_audit_event
from privacy import build_httpx_async_client, feature_enabled

router = APIRouter(prefix="/api", tags=["tts"])


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=12000)
    voice: str = Field(default="alloy", max_length=32)

    @field_validator("voice")
    @classmethod
    def validate_voice(cls, value: str) -> str:
        allowed = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
        voice = value.strip().lower()
        if voice not in allowed:
            raise ValueError(f"voice must be one of: {', '.join(sorted(allowed))}")
        return voice


@router.post("/tts")
async def text_to_speech(body: TTSRequest, request: Request):
    if not feature_enabled("TTS", default="0"):
        raise HTTPException(status_code=404, detail="TTS is disabled")

    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "tts")

    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not openai_key:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY is required for TTS")

    payload = {
        "model": "tts-1",
        "voice": body.voice,
        "input": body.text,
        "format": "mp3",
    }
    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }

    try:
        async with build_httpx_async_client(timeout=60, headers=headers) as client:
            response = await client.post("https://api.openai.com/v1/audio/speech", json=payload)
            response.raise_for_status()
            audio_bytes = response.content
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TTS request failed: {exc}") from exc

    log_audit_event(
        "tts_generated",
        request_id=getattr(request.state, "request_id", None),
        voice=body.voice,
        text_length=len(body.text),
    )

    return StreamingResponse(iter([audio_bytes]), media_type="audio/mpeg")
