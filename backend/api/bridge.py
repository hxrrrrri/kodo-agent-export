import os
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from agent.loop import AgentLoop
from bridge.auth import create_bridge_token, verify_bridge_token
from bridge.manager import bridge_session_manager
from memory.manager import memory_manager
from observability.audit import log_audit_event
from tools.path_guard import enforce_allowed_path

router = APIRouter(prefix="/api/bridge", tags=["bridge"])


class BridgeSessionCreateRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BridgeMessageRequest(BaseModel):
    bridge_session_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=12000)
    project_dir: str | None = Field(default=None, max_length=1024)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        return value.strip()


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return token.strip()


def _optional_api_auth(request: Request) -> None:
    expected = os.getenv("API_AUTH_TOKEN", "").strip()
    if not expected:
        return
    auth = request.headers.get("authorization", "").strip()
    scheme, _, token = auth.partition(" ")
    if scheme.lower() != "bearer" or token.strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid API bearer token")


@router.post("/session")
async def create_bridge_session(body: BridgeSessionCreateRequest, request: Request):
    _optional_api_auth(request)
    session = await bridge_session_manager.create_session(body.client_name, metadata=body.metadata)
    bridge_session_id = str(session.get("bridge_session_id", ""))
    ttl_seconds = int(os.getenv("BRIDGE_TOKEN_TTL_SECONDS", "3600"))
    token = create_bridge_token(bridge_session_id, ttl_seconds=ttl_seconds)

    log_audit_event(
        "bridge_session_created",
        request_id=getattr(request.state, "request_id", None),
        bridge_session_id=bridge_session_id,
        client_name=body.client_name,
    )

    return {
        "bridge_session_id": bridge_session_id,
        "token": token,
        "expires_in_seconds": ttl_seconds,
    }


@router.get("/sessions")
async def list_bridge_sessions(request: Request):
    _optional_api_auth(request)
    sessions = await bridge_session_manager.list_sessions()
    return {"sessions": sessions}


@router.get("/session/{bridge_session_id}")
async def get_bridge_session(
    bridge_session_id: str,
    authorization: str | None = Header(default=None),
):
    token = _extract_bearer_token(authorization)
    payload = verify_bridge_token(token)
    if str(payload.get("sid", "")) != bridge_session_id:
        raise HTTPException(status_code=403, detail="Token is not valid for this bridge session")

    session = await bridge_session_manager.get_session(bridge_session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Bridge session not found")
    await bridge_session_manager.touch_session(bridge_session_id)
    return session


@router.post("/message")
async def bridge_message(
    body: BridgeMessageRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    token = _extract_bearer_token(authorization)
    payload = verify_bridge_token(token)
    if str(payload.get("sid", "")) != body.bridge_session_id:
        raise HTTPException(status_code=403, detail="Token is not valid for this bridge session")

    session = await bridge_session_manager.get_session(body.bridge_session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Bridge session not found")

    project_dir = body.project_dir
    if project_dir:
        try:
            project_dir = enforce_allowed_path(project_dir)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        if not os.path.isdir(project_dir):
            raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {project_dir}")

    history = await memory_manager.load_session(body.bridge_session_id)
    agent = AgentLoop(session_id=body.bridge_session_id, project_dir=project_dir)

    parts: list[str] = []
    usage_payload: dict[str, Any] | None = None
    error_message: str | None = None

    async for event in agent.run(body.message, history):
        event_type = str(event.get("type", ""))
        if event_type == "text":
            parts.append(str(event.get("content", "")))
        elif event_type == "done" and isinstance(event.get("usage"), dict):
            usage_payload = event.get("usage")
        elif event_type == "error":
            error_message = str(event.get("message", "Unknown bridge execution error"))

    response_text = "".join(parts)
    updated_history = list(history) + [
        {"role": "user", "content": body.message},
        {"role": "assistant", "content": response_text},
    ]
    await memory_manager.save_session(
        body.bridge_session_id,
        updated_history,
        metadata={"title": "Bridge session"},
    )
    await bridge_session_manager.touch_session(body.bridge_session_id)

    log_audit_event(
        "bridge_message",
        request_id=getattr(request.state, "request_id", None),
        bridge_session_id=body.bridge_session_id,
        has_error=bool(error_message),
    )

    return {
        "bridge_session_id": body.bridge_session_id,
        "response": response_text,
        "usage": usage_payload,
        "error": error_message,
    }
