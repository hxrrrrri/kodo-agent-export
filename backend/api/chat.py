import json
import os
import re
import uuid
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from agent.loop import AgentLoop
from api.security import (
    MEMORY_RATE_LIMITER,
    SEND_RATE_LIMITER,
    SESSION_RATE_LIMITER,
    enforce_rate_limit,
    require_api_auth,
)
from memory.manager import memory_manager
from observability.audit import log_audit_event
from observability.usage import record_usage_event, summarize_usage
from tools.path_guard import enforce_allowed_path

router = APIRouter(prefix="/api/chat", tags=["chat"])
SECRET_PATTERN = re.compile(r"sk-[A-Za-z0-9_\-]+")


def _safe_error_message(error: Exception) -> str:
    message = str(error).strip() or "Unexpected server error."
    message = SECRET_PATTERN.sub("[REDACTED]", message)
    return message[:500]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    session_id: str | None = Field(default=None, max_length=128)
    project_dir: str | None = Field(default=None, max_length=1024)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("message is required")
        return text


class NewSessionResponse(BaseModel):
    session_id: str


class MemoryAppendRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return value.strip()


@router.post("/send")
async def send_message(req: ChatRequest, request: Request):
    """Send a message and stream back the agent response via SSE."""
    require_api_auth(request)
    await enforce_rate_limit(request, SEND_RATE_LIMITER, "send")
    request_id = getattr(request.state, "request_id", None)

    project_dir = req.project_dir
    if project_dir:
        try:
            project_dir = enforce_allowed_path(project_dir)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        if not os.path.isdir(project_dir):
            raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {project_dir}")

    session_id = req.session_id or str(uuid.uuid4())
    log_audit_event(
        "chat_send_started",
        request_id=request_id,
        session_id=session_id,
        has_history=bool(req.session_id),
        has_project_dir=bool(project_dir),
    )

    # Load existing history
    history = await memory_manager.load_session(session_id)

    async def event_stream():
        assistant_parts = []
        usage_payload: dict | None = None

        try:
            agent = AgentLoop(session_id=session_id, project_dir=project_dir)
        except Exception as e:
            log_audit_event("chat_send_init_error", request_id=request_id, session_id=session_id, error=str(e))
            yield f"data: {json.dumps({'type': 'error', 'message': _safe_error_message(e)})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'meta', 'request_id': request_id, 'session_id': session_id})}\n\n"

        try:
            async for event in agent.run(req.message, history):
                # Collect for history saving
                if event["type"] == "text":
                    assistant_parts.append(event["content"])
                elif event["type"] == "done" and isinstance(event.get("usage"), dict):
                    usage_payload = event["usage"]

                # Stream event to client
                yield f"data: {json.dumps(event)}\n\n"

                if event["type"] == "done":
                    # Save updated session
                    full_assistant_text = "".join(assistant_parts)
                    updated_history = list(history) + [
                        {"role": "user", "content": req.message},
                        {"role": "assistant", "content": full_assistant_text},
                    ]

                    # Generate title from first message if new session
                    title = req.message[:60] + ("..." if len(req.message) > 60 else "")
                    await memory_manager.save_session(
                        session_id,
                        updated_history,
                        metadata={"title": title},
                    )

                    if usage_payload:
                        try:
                            usage_event = record_usage_event(
                                session_id=session_id,
                                model=str(usage_payload.get("model", "")),
                                input_tokens=int(usage_payload.get("input_tokens", 0) or 0),
                                output_tokens=int(usage_payload.get("output_tokens", 0) or 0),
                                provider=agent.provider,
                            )
                        except Exception:
                            usage_event = None
                        log_audit_event(
                            "chat_send_completed",
                            request_id=request_id,
                            session_id=session_id,
                            provider=agent.provider,
                            usage=usage_event,
                        )
                    else:
                        log_audit_event(
                            "chat_send_completed",
                            request_id=request_id,
                            session_id=session_id,
                            provider=agent.provider,
                            usage=None,
                        )

        except Exception as e:
            log_audit_event("chat_send_error", request_id=request_id, session_id=session_id, error=str(e))
            yield f"data: {json.dumps({'type': 'error', 'message': _safe_error_message(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-ID": session_id,
        },
    )


@router.post("/new-session", response_model=NewSessionResponse)
async def new_session(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "new_session")
    session_id = str(uuid.uuid4())
    log_audit_event(
        "new_session",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
    )
    return NewSessionResponse(session_id=session_id)


@router.get("/sessions")
async def list_sessions(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "list_sessions")
    sessions = await memory_manager.list_sessions()
    log_audit_event(
        "list_sessions",
        request_id=getattr(request.state, "request_id", None),
        count=len(sessions),
    )
    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "get_session")
    messages = await memory_manager.load_session(session_id)
    if not messages:
        log_audit_event(
            "get_session_not_found",
            request_id=getattr(request.state, "request_id", None),
            session_id=session_id,
        )
        raise HTTPException(status_code=404, detail="Session not found")
    log_audit_event(
        "get_session",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        message_count=len(messages),
    )
    return {"session_id": session_id, "messages": messages}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "delete_session")
    deleted = await memory_manager.delete_session(session_id)
    if not deleted:
        log_audit_event(
            "delete_session_not_found",
            request_id=getattr(request.state, "request_id", None),
            session_id=session_id,
        )
        raise HTTPException(status_code=404, detail="Session not found")
    log_audit_event(
        "delete_session",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
    )
    return {"deleted": True}


@router.post("/memory/append")
async def append_memory(body: MemoryAppendRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "append_memory")
    await memory_manager.append_to_memory(body.content)
    log_audit_event(
        "append_memory",
        request_id=getattr(request.state, "request_id", None),
        content_length=len(body.content),
    )
    return {"saved": True}


@router.get("/usage")
async def usage_summary(
    request: Request,
    days: int = Query(default=7, ge=1, le=365),
    limit: int = Query(default=100, ge=1, le=500),
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "usage")
    data = summarize_usage(days=days, limit=limit)
    log_audit_event(
        "usage_summary",
        request_id=getattr(request.state, "request_id", None),
        days=days,
        limit=limit,
        events=data.get("events_count", 0),
    )
    return data
