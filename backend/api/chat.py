import json
import os
import re
import uuid
from typing import Any

from agent.coordinator import agent_coordinator
from agent.session_runner import SessionRunner
from agent.modes import DEFAULT_MODE, list_modes, normalize_mode
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator

from api.security import (
    COMMANDS_RATE_LIMITER,
    MEMORY_RATE_LIMITER,
    SEND_RATE_LIMITER,
    SESSION_RATE_LIMITER,
    enforce_rate_limit,
    require_api_auth,
)
from api.permission_hub import permission_hub
from commands.router import execute_command, is_command_message
from mcp.registry import mcp_registry
from mcp.stdio_client import MCPClientError
from memory.manager import memory_manager
from observability.audit import log_audit_event
from observability.usage import record_usage_event, summarize_usage
from skills.registry import skill_registry
from tasks.manager import task_manager
from tools.path_guard import enforce_allowed_path

router = APIRouter(prefix="/api/chat", tags=["chat"])
SECRET_PATTERN = re.compile(r"sk-[A-Za-z0-9_\-]+")


def _safe_error_message(error: Exception) -> str:
    message = str(error).strip() or "Unexpected server error."
    message = SECRET_PATTERN.sub("[REDACTED]", message)
    return message[:500]


def _resolve_mode(requested_mode: str | None, stored_mode: str | None) -> str:
    target = requested_mode if requested_mode is not None else stored_mode
    return normalize_mode(target)


def _extract_text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            block_type = str(block.get("type", "")).lower()
            if block_type == "text":
                text = block.get("text", "")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return "\n".join(parts).strip()
    return str(content or "").strip()


class ChatRequest(BaseModel):
    message: str | None = Field(default=None, max_length=12000)
    content: str | list[dict[str, Any]] | None = Field(default=None)
    image_attachment: dict[str, str] | None = Field(default=None)
    session_id: str | None = Field(default=None, max_length=128)
    project_dir: str | None = Field(default=None, max_length=1024)
    mode: str | None = Field(default=None, max_length=64)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        return text or None

    @model_validator(mode="after")
    def validate_content_or_message(self) -> "ChatRequest":
        has_message = isinstance(self.message, str) and bool(self.message.strip())
        has_content = self.content is not None
        if not has_message and not has_content:
            raise ValueError("message or content is required")
        return self

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        return text or None


class NewSessionResponse(BaseModel):
    session_id: str


class SessionModeRequest(BaseModel):
    mode: str = Field(min_length=1, max_length=64)

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("mode is required")
        return text


class MemoryAppendRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return value.strip()


class SessionImportRequest(BaseModel):
    session_id: str | None = Field(default=None, max_length=128)
    metadata: dict[str, Any] = Field(default_factory=dict)
    messages: list[dict[str, Any]] = Field(default_factory=list)


class UpdateSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("title is required")
        return text


class CheckpointCreateRequest(BaseModel):
    label: str | None = Field(default=None, max_length=200)


class TaskCreateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    project_dir: str | None = Field(default=None, max_length=1024)
    requested_by_session: str | None = Field(default=None, max_length=128)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        return value.strip()


class MCPServerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    command: str = Field(min_length=1, max_length=1000)
    args: list[str] = Field(default_factory=list)
    transport: str = Field(default="stdio", max_length=32)
    configured_tools: list[str] = Field(default_factory=list)


class MCPToolCallRequest(BaseModel):
    arguments: dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int = Field(default=20, ge=1, le=120)


class AgentSpawnRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=12000)
    role: str = Field(default="general", max_length=120)
    project_dir: str | None = Field(default=None, max_length=1024)
    parent_session_id: str | None = Field(default=None, max_length=128)

    @field_validator("goal")
    @classmethod
    def validate_goal(cls, value: str) -> str:
        return value.strip()


class PermissionDecisionRequest(BaseModel):
    approve: bool
    remember: bool = False


async def _run_background_task(prompt: str, project_dir: str | None, task_id: str) -> dict[str, Any]:
    parts: list[str] = []
    usage_payload: dict[str, Any] | None = None
    events_count = 0

    runner = SessionRunner()

    async def on_event(event: dict[str, Any]) -> None:
        nonlocal usage_payload
        nonlocal events_count

        events_count += 1
        event_type = str(event.get("type", ""))
        if event_type == "text":
            parts.append(str(event.get("content", "")))
        elif event_type == "done" and isinstance(event.get("usage"), dict):
            usage_payload = event.get("usage")

    result = await runner.run(
        session_id=f"task-{task_id}",
        messages=[{"role": "user", "content": prompt}],
        project_dir=project_dir,
        mode=DEFAULT_MODE,
        stream_callback=on_event,
    )

    return {
        "output": "".join(parts),
        "error": result.error,
        "usage": usage_payload,
        "events_count": events_count,
        "provider": result.provider,
        "model": result.model,
    }


task_manager.set_runner(_run_background_task)


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
    user_content: str | list[dict[str, Any]] = req.content if req.content is not None else (req.message or "")
    user_text = _extract_text_content(user_content)
    user_payload: dict[str, Any] = {"role": "user", "content": user_content}
    if isinstance(req.image_attachment, dict):
        user_payload["image_attachment"] = req.image_attachment

    existing_payload = await memory_manager.load_session_payload(session_id)
    history = existing_payload.get("messages", []) if existing_payload else []
    metadata = existing_payload.get("metadata", {}) if existing_payload else {}
    stored_mode = str(metadata.get("mode", DEFAULT_MODE)) if isinstance(metadata, dict) else DEFAULT_MODE
    stored_model_override = str(metadata.get("model_override", "")).strip() if isinstance(metadata, dict) else ""

    try:
        effective_mode = _resolve_mode(req.mode, stored_mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if req.mode is not None:
        await memory_manager.update_session_metadata(
            session_id,
            {"mode": effective_mode},
            create_if_missing=True,
        )

    log_audit_event(
        "chat_send_started",
        request_id=request_id,
        session_id=session_id,
        has_history=bool(req.session_id),
        has_project_dir=bool(project_dir),
        mode=effective_mode,
    )

    async def approval_callback(tool_name: str, input_preview: str, tool_description: str) -> bool:
        policy = await permission_hub.get_policy(session_id, tool_name)
        if policy is not None:
            log_audit_event(
                "permission_policy_applied",
                request_id=request_id,
                session_id=session_id,
                tool_name=tool_name,
                approved=policy,
            )
            return policy

        challenge = await permission_hub.create_challenge(
            session_id=session_id,
            tool_name=tool_name,
            input_preview=input_preview,
            tool_description=tool_description,
        )
        challenge_id = str(challenge.get("challenge_id", ""))
        log_audit_event(
            "permission_challenge_created",
            request_id=request_id,
            session_id=session_id,
            challenge_id=challenge_id,
            tool_name=tool_name,
        )

        timeout_seconds = max(10, int(os.getenv("PERMISSION_REQUEST_TIMEOUT_SECONDS", "120")))
        approved, remember, outcome = await permission_hub.wait_for_decision(
            challenge_id,
            timeout_seconds=timeout_seconds,
        )

        log_audit_event(
            "permission_challenge_resolved",
            request_id=request_id,
            session_id=session_id,
            challenge_id=challenge_id,
            tool_name=tool_name,
            approved=approved,
            remember=remember,
            outcome=outcome,
        )
        return approved

    if req.content is None and is_command_message(user_text):
        async def command_stream():
            yield f"data: {json.dumps({'type': 'meta', 'request_id': request_id, 'session_id': session_id, 'mode': effective_mode})}\n\n"

            try:
                result = await execute_command(user_text, session_id=session_id, project_dir=project_dir)
            except Exception as e:
                log_audit_event(
                    "chat_command_error",
                    request_id=request_id,
                    session_id=session_id,
                    error=str(e),
                )
                yield f"data: {json.dumps({'type': 'error', 'message': _safe_error_message(e)})}\n\n"
                return

            updated_history = list(history) + [
                {"role": "user", "content": user_text},
                {"role": "assistant", "content": result.text},
            ]
            title = user_text[:60] + ("..." if len(user_text) > 60 else "")
            latest_mode = effective_mode
            latest_metadata = await memory_manager.get_session_metadata(session_id)
            if isinstance(latest_metadata, dict):
                try:
                    latest_mode = normalize_mode(str(latest_metadata.get("mode", effective_mode)))
                except ValueError:
                    latest_mode = effective_mode
            if result.run_prompt:
                runner = SessionRunner()
                usage_payload: dict[str, Any] | None = None
                run_messages = list(updated_history) + [{"role": "user", "content": result.run_prompt}]

                yield f"data: {json.dumps({'type': 'text', 'content': result.text})}\n\n"

                async for event in runner.stream(
                    session_id=session_id,
                    messages=run_messages,
                    project_dir=project_dir,
                    mode=latest_mode,
                    approval_callback=approval_callback,
                ):
                    if event.get("type") == "done" and isinstance(event.get("usage"), dict):
                        usage_payload = event["usage"]
                    yield f"data: {json.dumps(event)}\n\n"

                run_result = getattr(runner, "_last_result", None)
                if usage_payload is not None:
                    try:
                        usage_event = record_usage_event(
                            session_id=session_id,
                            model=str(usage_payload.get("model", "")),
                            input_tokens=int(usage_payload.get("input_tokens", 0) or 0),
                            output_tokens=int(usage_payload.get("output_tokens", 0) or 0),
                            provider=str(getattr(run_result, "provider", "unknown") or "unknown"),
                            input_cache_read_tokens=int(usage_payload.get("input_cache_read_tokens", 0) or 0),
                            input_cache_write_tokens=int(usage_payload.get("input_cache_write_tokens", 0) or 0),
                        )
                    except Exception:
                        usage_event = None
                else:
                    usage_event = None

                log_audit_event(
                    "chat_command_executed",
                    request_id=request_id,
                    session_id=session_id,
                    command=result.name,
                    mode=latest_mode,
                    usage=usage_event,
                )
                return

            await memory_manager.save_session(
                session_id,
                updated_history,
                metadata={"title": title, "mode": latest_mode},
            )

            log_audit_event(
                "chat_command_executed",
                request_id=request_id,
                session_id=session_id,
                command=result.name,
                mode=latest_mode,
            )

            yield f"data: {json.dumps({'type': 'text', 'content': result.text})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'usage': {'input_tokens': 0, 'output_tokens': 0, 'model': 'command-router'}})}\n\n"

        return StreamingResponse(
            command_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Session-ID": session_id,
            },
        )

    async def event_stream():
        usage_payload: dict | None = None
        runner = SessionRunner()

        session_messages = list(history) + [user_payload]

        yield f"data: {json.dumps({'type': 'meta', 'request_id': request_id, 'session_id': session_id, 'mode': effective_mode})}\n\n"

        try:
            async for event in runner.stream(
                session_id=session_id,
                messages=session_messages,
                project_dir=project_dir,
                mode=effective_mode,
                approval_callback=approval_callback,
                model_override=stored_model_override or None,
            ):
                if event["type"] == "done" and isinstance(event.get("usage"), dict):
                    usage_payload = event["usage"]

                # Stream event to client
                yield f"data: {json.dumps(event)}\n\n"

            run_result = getattr(runner, "_last_result", None)
            provider_name = run_result.provider if run_result is not None else None

            if usage_payload:
                try:
                    usage_event = record_usage_event(
                        session_id=session_id,
                        model=str(usage_payload.get("model", "")),
                        input_tokens=int(usage_payload.get("input_tokens", 0) or 0),
                        output_tokens=int(usage_payload.get("output_tokens", 0) or 0),
                        provider=str(provider_name or "unknown"),
                        input_cache_read_tokens=int(usage_payload.get("input_cache_read_tokens", 0) or 0),
                        input_cache_write_tokens=int(usage_payload.get("input_cache_write_tokens", 0) or 0),
                    )
                except Exception:
                    usage_event = None
                log_audit_event(
                    "chat_send_completed",
                    request_id=request_id,
                    session_id=session_id,
                    provider=provider_name,
                    mode=effective_mode,
                    usage=usage_event,
                )
            else:
                log_audit_event(
                    "chat_send_completed",
                    request_id=request_id,
                    session_id=session_id,
                    provider=provider_name,
                    mode=effective_mode,
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


@router.get("/permissions/pending")
async def list_pending_permissions(
    request: Request,
    session_id: str | None = Query(default=None, max_length=128),
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "permissions_pending")
    pending = await permission_hub.list_pending(session_id=session_id)
    return {"pending": pending}


@router.post("/permissions/{challenge_id}/decision")
async def decide_permission(challenge_id: str, body: PermissionDecisionRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "permissions_decision")
    payload = await permission_hub.set_decision(
        challenge_id,
        approve=body.approve,
        remember=body.remember,
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Permission challenge not found")

    log_audit_event(
        "permission_decision",
        request_id=getattr(request.state, "request_id", None),
        challenge_id=challenge_id,
        session_id=payload.get("session_id"),
        tool_name=payload.get("tool_name"),
        approve=body.approve,
        remember=body.remember,
    )
    return {"saved": True, "challenge": payload}


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


@router.post("/sessions", response_model=NewSessionResponse)
async def create_session(request: Request):
    return await new_session(request)


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


@router.patch("/sessions/{session_id}")
async def update_session(session_id: str, body: UpdateSessionRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "update_session")

    payload = await memory_manager.load_session_payload(session_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")

    metadata = await memory_manager.update_session_metadata(
        session_id,
        {"title": body.title},
        create_if_missing=False,
    )

    log_audit_event(
        "update_session",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        title=body.title,
    )
    return {
        "session_id": session_id,
        "metadata": metadata,
    }


@router.post("/sessions/{session_id}/checkpoint")
async def create_checkpoint_endpoint(
    session_id: str,
    body: CheckpointCreateRequest,
    request: Request,
):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "create_checkpoint")

    payload = await memory_manager.load_session_payload(session_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = payload.get("messages", [])
    if not isinstance(messages, list):
        messages = []

    checkpoint_id = await memory_manager.create_checkpoint(
        session_id=session_id,
        messages=messages,
        label=body.label,
    )

    log_audit_event(
        "checkpoint_created",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        checkpoint_id=checkpoint_id,
    )
    return {
        "session_id": session_id,
        "checkpoint_id": checkpoint_id,
    }


@router.get("/sessions/{session_id}/checkpoints")
async def list_checkpoints_endpoint(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "list_checkpoints")
    checkpoints = await memory_manager.list_checkpoints(session_id)
    return {
        "session_id": session_id,
        "checkpoints": checkpoints,
    }


@router.post("/sessions/{session_id}/checkpoints/{checkpoint_id}/restore")
async def restore_checkpoint_endpoint(
    session_id: str,
    checkpoint_id: str,
    request: Request,
):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "restore_checkpoint")

    payload = await memory_manager.load_session_payload(session_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")

    metadata = payload.get("metadata", {}) if isinstance(payload, dict) else {}
    try:
        messages = await memory_manager.restore_checkpoint(session_id, checkpoint_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    await memory_manager.save_session(
        session_id=session_id,
        messages=messages,
        metadata=metadata if isinstance(metadata, dict) else {},
    )

    log_audit_event(
        "checkpoint_restored",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        checkpoint_id=checkpoint_id,
        message_count=len(messages),
    )
    return {
        "restored": True,
        "session_id": session_id,
        "checkpoint_id": checkpoint_id,
        "message_count": len(messages),
    }


@router.get("/modes")
async def list_modes_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "modes")
    return {
        "default_mode": DEFAULT_MODE,
        "modes": list_modes(),
    }


@router.get("/sessions/{session_id}/mode")
async def get_session_mode_endpoint(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "get_session_mode")

    metadata = await memory_manager.get_session_metadata(session_id)
    raw_mode = str(metadata.get("mode", DEFAULT_MODE))
    try:
        mode = normalize_mode(raw_mode)
    except ValueError:
        mode = DEFAULT_MODE

    return {
        "session_id": session_id,
        "mode": mode,
    }


@router.post("/sessions/{session_id}/mode")
async def set_session_mode_endpoint(session_id: str, body: SessionModeRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "set_session_mode")

    try:
        mode = normalize_mode(body.mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    metadata = await memory_manager.update_session_metadata(
        session_id,
        {"mode": mode},
        create_if_missing=True,
    )

    log_audit_event(
        "set_session_mode",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        mode=mode,
    )
    return {
        "session_id": session_id,
        "mode": str(metadata.get("mode", mode)),
    }


@router.get("/commands")
async def list_commands_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, COMMANDS_RATE_LIMITER, "commands")
    return {
        "commands": [
            {"name": "/help", "description": "Show available commands"},
            {"name": "/cost [days]", "description": "Show token and cost usage summary"},
            {"name": "/search <query>", "description": "Search the web and return top results"},
            {"name": "/git <subcommand>", "description": "Run safe, read-only git command"},
            {"name": "/session", "description": "List recent sessions"},
            {"name": "/session current", "description": "Show current session id"},
            {"name": "/memory <text>", "description": "Append note to global memory"},
            {"name": "/memory show", "description": "Show loaded memory context"},
            {"name": "/checkpoint", "description": "Create checkpoint for current session"},
            {"name": "/checkpoint list", "description": "List session checkpoints"},
            {"name": "/checkpoint restore <id> --yes", "description": "Restore a checkpoint"},
            {"name": "/mode", "description": "Show current session mode"},
            {"name": "/mode list", "description": "List available execution modes"},
            {"name": "/mode set <name>", "description": "Set session execution mode"},
            {"name": "/mode reset", "description": "Reset mode to default"},
            {"name": "/provider", "description": "Show provider profiles and active provider"},
            {"name": "/provider list", "description": "List saved provider profiles"},
            {"name": "/provider set <name>", "description": "Activate a provider profile"},
            {"name": "/router", "description": "Show smart router status"},
            {"name": "/router strategy <name>", "description": "Set router strategy"},
            {"name": "/model", "description": "Show current model and provider"},
            {"name": "/model set <model>", "description": "Set model override for this session"},
            {"name": "/doctor", "description": "Run runtime health checks"},
            {"name": "/doctor report", "description": "Run and save full runtime report"},
            {"name": "/privacy", "description": "Show telemetry privacy mode status"},
            {"name": "/tasks", "description": "List background tasks"},
            {"name": "/tasks create <prompt>", "description": "Create a background task"},
            {"name": "/tasks get <task_id>", "description": "Get task details"},
            {"name": "/tasks stop <task_id>", "description": "Stop a background task"},
            {"name": "/mcp list", "description": "List MCP server entries"},
            {"name": "/mcp add <name> <command>", "description": "Add MCP server entry"},
            {"name": "/mcp remove <name>", "description": "Remove MCP server entry"},
            {"name": "/mcp tools <name>", "description": "List configured MCP tools for server"},
            {"name": "/mcp call <name> <tool> [json_args]", "description": "Call MCP tool with optional JSON arguments"},
            {"name": "/agents", "description": "List spawned sub-agents"},
            {"name": "/agents spawn <goal>", "description": "Spawn sub-agent"},
            {"name": "/agents get <agent_id>", "description": "Get sub-agent details"},
            {"name": "/agents stop <agent_id>", "description": "Stop sub-agent"},
            {"name": "/skills", "description": "List bundled skills"},
            {"name": "/skills show <name>", "description": "Show skill content"},
            {"name": "/skills run <name>", "description": "Run bundled skill immediately"},
        ]
    }


@router.post("/tasks")
async def create_task_endpoint(body: TaskCreateRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "create_task")

    project_dir = body.project_dir
    if project_dir:
        try:
            project_dir = enforce_allowed_path(project_dir)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        if not os.path.isdir(project_dir):
            raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {project_dir}")

    task = await task_manager.create_task(
        prompt=body.prompt,
        project_dir=project_dir,
        requested_by_session=body.requested_by_session,
    )
    log_audit_event(
        "task_created",
        request_id=getattr(request.state, "request_id", None),
        task_id=task.get("task_id"),
        requested_by_session=body.requested_by_session,
    )
    return task


@router.get("/tasks")
async def list_tasks_endpoint(
    request: Request,
    limit: int = Query(default=20, ge=1, le=500),
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_tasks")
    tasks = await task_manager.list_tasks(limit=limit)
    return {"tasks": tasks}


@router.get("/tasks/{task_id}")
async def get_task_endpoint(task_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "get_task")
    payload = await task_manager.get_task(task_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return payload


@router.post("/tasks/{task_id}/stop")
async def stop_task_endpoint(task_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "stop_task")
    stopped = await task_manager.stop_task(task_id)
    if not stopped:
        raise HTTPException(status_code=404, detail="Task not running or not found")
    payload = await task_manager.get_task(task_id)
    return payload or {"task_id": task_id, "status": "cancelled"}


@router.get("/mcp/servers")
async def list_mcp_servers_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_mcp_servers")
    return {"servers": await mcp_registry.list_servers()}


@router.post("/mcp/servers")
async def add_mcp_server_endpoint(body: MCPServerRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "add_mcp_server")
    try:
        payload = await mcp_registry.add_server(
            name=body.name,
            command=body.command,
            args=body.args,
            transport=body.transport,
            configured_tools=body.configured_tools,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    log_audit_event(
        "mcp_server_added",
        request_id=getattr(request.state, "request_id", None),
        name=body.name,
        transport=body.transport,
    )
    return payload


@router.delete("/mcp/servers/{name}")
async def remove_mcp_server_endpoint(name: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "remove_mcp_server")
    removed = await mcp_registry.remove_server(name)
    if not removed:
        raise HTTPException(status_code=404, detail="MCP server not found")
    log_audit_event(
        "mcp_server_removed",
        request_id=getattr(request.state, "request_id", None),
        name=name,
    )
    return {"removed": True, "name": name}


@router.get("/mcp/servers/{name}/tools")
async def list_mcp_server_tools_endpoint(name: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_mcp_tools")
    try:
        tools = await mcp_registry.discover_tools(name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"name": name, "tools": tools}


@router.post("/mcp/servers/{name}/tools/{tool_name}/call")
async def call_mcp_server_tool_endpoint(
    name: str,
    tool_name: str,
    body: MCPToolCallRequest,
    request: Request,
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "call_mcp_tool")

    try:
        payload = await mcp_registry.call_tool(
            server_name=name,
            tool_name=tool_name,
            arguments=body.arguments,
            timeout_seconds=body.timeout_seconds,
        )
    except ValueError as e:
        detail = str(e)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from e
    except MCPClientError as e:
        raise HTTPException(status_code=502, detail=f"MCP runtime error: {e}") from e

    log_audit_event(
        "mcp_tool_called",
        request_id=getattr(request.state, "request_id", None),
        name=name,
        tool_name=tool_name,
    )
    return payload


@router.post("/agents")
async def spawn_agent_endpoint(body: AgentSpawnRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "spawn_agent")

    project_dir = body.project_dir
    if project_dir:
        try:
            project_dir = enforce_allowed_path(project_dir)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        if not os.path.isdir(project_dir):
            raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {project_dir}")

    try:
        payload = await agent_coordinator.spawn_agent(
            goal=body.goal,
            role=body.role,
            project_dir=project_dir,
            parent_session_id=body.parent_session_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    log_audit_event(
        "agent_spawned",
        request_id=getattr(request.state, "request_id", None),
        agent_id=payload.get("agent_id"),
        task_id=payload.get("task_id"),
        role=body.role,
    )
    return payload


@router.get("/agents")
async def list_agents_endpoint(
    request: Request,
    limit: int = Query(default=20, ge=1, le=500),
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_agents")
    return {"agents": await agent_coordinator.list_agents(limit=limit)}


@router.get("/agents/{agent_id}")
async def get_agent_endpoint(agent_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "get_agent")
    payload = await agent_coordinator.get_agent(agent_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return payload


@router.post("/agents/{agent_id}/stop")
async def stop_agent_endpoint(agent_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "stop_agent")
    stopped = await agent_coordinator.stop_agent(agent_id)
    if not stopped:
        raise HTTPException(status_code=404, detail="Agent not running or not found")
    payload = await agent_coordinator.get_agent(agent_id)
    return payload or {"agent_id": agent_id, "status": "cancelled"}


@router.get("/skills")
async def list_skills_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_skills")
    return {"skills": skill_registry.list_skills()}


@router.get("/skills/{name}")
async def get_skill_endpoint(name: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "get_skill")
    payload = skill_registry.get_skill(name)
    if payload is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return payload


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "get_session")
    payload = await memory_manager.load_session_payload(session_id)
    if payload is None:
        log_audit_event(
            "get_session_not_found",
            request_id=getattr(request.state, "request_id", None),
            session_id=session_id,
        )
        raise HTTPException(status_code=404, detail="Session not found")

    messages = payload.get("messages", [])
    metadata = payload.get("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}

    raw_mode = str(metadata.get("mode", DEFAULT_MODE))
    try:
        normalized_mode = normalize_mode(raw_mode)
    except ValueError:
        normalized_mode = DEFAULT_MODE
    metadata["mode"] = normalized_mode

    log_audit_event(
        "get_session",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        message_count=len(messages),
    )
    return {"session_id": session_id, "messages": messages, "metadata": metadata}


@router.get("/sessions/{session_id}/export")
async def export_session(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "export_session")
    payload = await memory_manager.load_session_payload(session_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    log_audit_event(
        "export_session",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        message_count=len(payload.get("messages", [])),
    )
    return payload


@router.post("/sessions/import", response_model=NewSessionResponse)
async def import_session(body: SessionImportRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "import_session")
    payload = {
        "session_id": body.session_id,
        "metadata": body.metadata,
        "messages": body.messages,
    }
    try:
        imported_session_id = await memory_manager.import_session_payload(
            payload,
            override_session_id=body.session_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    log_audit_event(
        "import_session",
        request_id=getattr(request.state, "request_id", None),
        session_id=imported_session_id,
        message_count=len(body.messages),
    )
    return NewSessionResponse(session_id=imported_session_id)


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
