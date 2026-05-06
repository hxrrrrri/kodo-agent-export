import asyncio
import base64
import io
import json
import os
import re
import shutil
import subprocess
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agent.coordinator import agent_coordinator
from agent.session_runner import SessionRunner
from agent.modes import DEFAULT_MODE, list_modes, normalize_mode
from api.collab import publish_session_event
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
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
from kodo.capsule import capsule_manager
from mcp.registry import mcp_registry
from mcp.stdio_client import MCPClientError
from memory.manager import memory_manager
from observability.audit import log_audit_event
from observability.usage import record_usage_event, summarize_usage
from skills.registry import skill_registry
from tasks.manager import task_manager
from tools import TOOL_MAP
from tools.path_guard import enforce_allowed_path

router = APIRouter(prefix="/api/chat", tags=["chat"])
SECRET_PATTERN = re.compile(r"sk-[A-Za-z0-9_\-]+")
MAX_UPLOAD_SIZE_MB = max(1, int(os.getenv("MAX_UPLOAD_SIZE_MB", "10") or 10))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
NONE_LIKE_STRINGS = {"none", "null", "undefined"}


def _safe_error_message(error: Exception) -> str:
    message = str(error).strip() or "Unexpected server error."
    message = SECRET_PATTERN.sub("[REDACTED]", message)
    return message[:500]


async def _track_capsule_usage(
    *,
    session_id: str,
    provider: str | None,
    usage_payload: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not isinstance(usage_payload, dict):
        return None
    try:
        body = {
            "model": str(usage_payload.get("model", "") or "unknown"),
            "input_tokens": int(usage_payload.get("input_tokens", 0) or 0),
            "output_tokens": int(usage_payload.get("output_tokens", 0) or 0),
            "input_cache_read_tokens": int(usage_payload.get("input_cache_read_tokens", 0) or 0),
            "input_cache_write_tokens": int(usage_payload.get("input_cache_write_tokens", 0) or 0),
        }
        state = await capsule_manager.token_tracker.record_response(
            provider=str(provider or "unknown"),
            response_body=body,
            response_headers={},
            session_id=session_id,
        )
        return state.to_payload()
    except Exception:
        return None


def _resolve_mode(requested_mode: str | None, stored_mode: str | None) -> str:
    target = requested_mode if requested_mode is not None else stored_mode
    return normalize_mode(target)


def _normalize_optional_text(value: Any) -> str:
    if value is None:
        return ""
    text = value.strip() if isinstance(value, str) else str(value).strip()
    if text.lower() in NONE_LIKE_STRINGS:
        return ""
    return text


def _looks_like_project_root(path: str) -> bool:
    markers = (
        ".git",
        "backend",
        "frontend",
        "README.md",
        "pyproject.toml",
        "package.json",
    )
    return any(Path(path, marker).exists() for marker in markers)


def _validate_project_dir_candidate(path: str) -> str | None:
    candidate = _normalize_optional_text(path)
    if not candidate:
        return None

    try:
        safe = enforce_allowed_path(candidate)
    except ValueError:
        return None

    if not os.path.isdir(safe):
        return None
    return safe


def _infer_default_project_dir() -> str | None:
    env_candidates = [
        os.getenv("KODO_DEFAULT_PROJECT_DIR", ""),
        os.getenv("PROJECT_DIR", ""),
    ]

    cwd = os.getcwd()
    parent = os.path.abspath(os.path.join(cwd, os.pardir))
    candidates = [*env_candidates, cwd, parent]

    first_valid: str | None = None
    for raw in candidates:
        safe = _validate_project_dir_candidate(raw)
        if not safe:
            continue
        if first_valid is None:
            first_valid = safe
        if _looks_like_project_root(safe):
            return safe

    return first_valid


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


def _has_non_text_content(content: Any) -> bool:
    if content is None:
        return False
    if isinstance(content, str):
        return False
    if isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                return True
            block_type = str(block.get("type", "")).strip().lower()
            if block_type and block_type != "text":
                return True
        return False
    return True


def _validate_zip_member_path(name: str) -> Path | None:
    normalized = str(name or "").replace("\\", "/")
    if not normalized or normalized.endswith("/"):
        return None

    path = Path(normalized)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Unsafe zip entry path: {name}")
    return path


def _extract_zip_to_project(zip_bytes: bytes, project_dir: str) -> list[str]:
    base_dir = Path(project_dir).resolve()
    extracted: list[str] = []

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        for info in archive.infolist():
            rel_path = _validate_zip_member_path(info.filename)
            if rel_path is None:
                continue

            target_path = (base_dir / rel_path).resolve()
            if not str(target_path).startswith(str(base_dir)):
                raise ValueError(f"Unsafe zip entry path: {info.filename}")

            target_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info, "r") as src, open(target_path, "wb") as dst:
                shutil.copyfileobj(src, dst)

            extracted.append(str(target_path))

    return extracted


def _pick_project_dir_native() -> str | None:
    # Prefer tkinter for cross-platform native dialogs.
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        try:
            root.attributes("-topmost", True)
        except Exception:
            pass
        selected = filedialog.askdirectory(mustexist=True)
        root.destroy()
        text = str(selected or "").strip()
        if text:
            return text
    except Exception:
        pass

    # Windows fallback using FolderBrowserDialog via PowerShell.
    if os.name == "nt":
        script = (
            "Add-Type -AssemblyName System.Windows.Forms | Out-Null; "
            "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$dialog.Description = 'Select project directory'; "
            "$dialog.ShowNewFolderButton = $false; "
            "$result = $dialog.ShowDialog(); "
            "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }"
        )
        completed = subprocess.run(
            [
                "powershell",
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        text = str(completed.stdout or "").strip()
        if text:
            return text.splitlines()[-1].strip()

    return None


class ChatRequest(BaseModel):
    message: str | None = Field(default=None, max_length=12000)
    content: str | list[dict[str, Any]] | None = Field(default=None)
    image_attachment: dict[str, str] | None = Field(default=None)
    artifact_mode: bool = Field(default=False)
    disable_tools: bool = Field(default=False)
    max_tokens: int | None = Field(default=None, ge=512, le=65536)
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


class TerminalRunRequest(BaseModel):
    command: str = Field(min_length=1, max_length=4000)
    cwd: str | None = Field(default=None, max_length=1024)
    timeout: int = Field(default=30, ge=1, le=120)

    @field_validator("command")
    @classmethod
    def validate_command(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("command is required")
        return text


class NotebookRunRequest(BaseModel):
    language: str = Field(default="python", max_length=16)
    code: str = Field(min_length=1, max_length=120000)
    session_id: str | None = Field(default=None, max_length=128)
    project_dir: str | None = Field(default=None, max_length=1024)
    reset: bool = Field(default=False)
    timeout: int = Field(default=20, ge=1, le=120)

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        lang = value.strip().lower()
        if lang not in {"python", "node"}:
            raise ValueError("language must be 'python' or 'node'")
        return lang

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("code is required")
        return value


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


class CodeReviewRequest(BaseModel):
    branch: str = Field(min_length=1, max_length=200)
    base_branch: str = Field(default="main", max_length=200)
    project_dir: str | None = Field(default=None, max_length=1024)
    session_id: str | None = Field(default=None, max_length=128)

    @field_validator("branch")
    @classmethod
    def validate_branch(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("branch is required")
        return text

    @field_validator("base_branch")
    @classmethod
    def validate_base_branch(cls, value: str) -> str:
        text = value.strip() or "main"
        return text


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


class DreamRequest(BaseModel):
    session_id: str | None = Field(default=None, max_length=128)
    project_dir: str | None = Field(default=None, max_length=1024)
    focus: str | None = Field(default=None, max_length=400)

    @field_validator("focus")
    @classmethod
    def validate_focus(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        return text or None


def _format_away_label(seconds: int) -> str:
    if seconds <= 0:
        return "just now"
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h {minutes % 60}m"
    days = hours // 24
    return f"{days}d {hours % 24}h"


def _todo_item(step_id: int, title: str) -> dict[str, str]:
    return {
        "id": f"step-{step_id}",
        "title": title.strip(),
        "status": "pending",
    }


def _build_todo_plan(user_text: str, *, is_command: bool) -> list[dict[str, str]]:
    text = (user_text or "").strip()
    if not text:
        return []

    if is_command:
        lowered = text.lower()
        if lowered.startswith("/krawlx") or lowered.startswith("/crawlx") or lowered.startswith("/firecrawl"):
            titles = [
                "Validate crawl arguments and provider mode",
                "Run crawl and collect discovered pages",
                "Summarize crawl stats and next actions",
            ]
        elif lowered.startswith("/search"):
            titles = [
                "Run web search with current provider",
                "Review top results for relevance",
                "Present concise findings",
            ]
        elif lowered.startswith("/git"):
            titles = [
                "Execute read-only git command",
                "Collect command output",
                "Summarize key repository signals",
            ]
        else:
            titles = [
                "Parse command and options",
                "Execute command workflow",
                "Return final command result",
            ]
        return [_todo_item(idx + 1, title) for idx, title in enumerate(titles)]

    raw_candidates = re.split(r"[\n\r]+|[.!?]+", text)
    candidates: list[str] = []
    for part in raw_candidates:
        cleaned = re.sub(r"\s+", " ", str(part or "")).strip(" -:;\t")
        if len(cleaned) < 8:
            continue
        if cleaned.lower().startswith("/"):
            continue
        candidates.append(cleaned)

    titles: list[str] = []
    for candidate in candidates:
        title = candidate[:100].strip()
        if title:
            titles.append(title[0].upper() + title[1:])
        if len(titles) >= 5:
            break

    if not titles:
        titles = [
            "Understand the requested outcome",
            "Implement required code and configuration changes",
            "Validate behavior and summarize results",
        ]

    return [_todo_item(idx + 1, title) for idx, title in enumerate(titles)]


def _clone_todos(todos: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {
            "id": str(item.get("id", "")),
            "title": str(item.get("title", "")),
            "status": str(item.get("status", "pending")),
        }
        for item in todos
    ]


def _todo_index_by_status(todos: list[dict[str, str]], status: str) -> int:
    for idx, item in enumerate(todos):
        if str(item.get("status", "")).lower() == status:
            return idx
    return -1


def _todo_set_in_progress_if_needed(todos: list[dict[str, str]]) -> bool:
    if not todos:
        return False

    if _todo_index_by_status(todos, "in_progress") >= 0:
        return False

    pending_idx = _todo_index_by_status(todos, "pending")
    if pending_idx < 0:
        return False

    todos[pending_idx]["status"] = "in_progress"
    return True


def _todo_advance_after_success(todos: list[dict[str, str]]) -> bool:
    if not todos:
        return False

    changed = False
    current_idx = _todo_index_by_status(todos, "in_progress")
    if current_idx < 0:
        current_idx = _todo_index_by_status(todos, "pending")

    if current_idx >= 0:
        todos[current_idx]["status"] = "completed"
        changed = True

    next_idx = _todo_index_by_status(todos, "pending")
    if next_idx >= 0:
        todos[next_idx]["status"] = "in_progress"
        changed = True

    return changed


def _todo_mark_all_completed(todos: list[dict[str, str]]) -> bool:
    changed = False
    for item in todos:
        if str(item.get("status", "")).lower() != "completed":
            item["status"] = "completed"
            changed = True
    return changed


def _todo_revert_in_progress_to_pending(todos: list[dict[str, str]]) -> bool:
    idx = _todo_index_by_status(todos, "in_progress")
    if idx < 0:
        return False
    todos[idx]["status"] = "pending"
    return True


def _build_advisor_review(user_text: str, assistant_text: str, mode: str) -> dict[str, Any]:
    assistant = (assistant_text or "").strip()
    normalized = assistant.lower()
    score = 72

    if len(assistant) >= 800:
        score += 8
    elif len(assistant) < 100:
        score -= 12

    if any(token in normalized for token in ["test", "pytest", "validate", "verification"]):
        score += 8
    if any(token in normalized for token in ["risk", "rollback", "fallback", "edge case"]):
        score += 5
    if any(token in normalized for token in ["maybe", "might", "possibly"]):
        score -= 3

    score = max(0, min(100, score))

    strengths: list[str] = []
    risks: list[str] = []
    next_steps: list[str] = []

    if len(assistant) >= 200:
        strengths.append("Response includes useful implementation detail.")
    else:
        risks.append("Response may be too brief for safe execution.")

    if "test" in normalized or "validate" in normalized:
        strengths.append("Validation mindset is visible in the response.")
    else:
        risks.append("Validation steps are not explicit yet.")

    if any(token in normalized for token in ["error", "failed", "exception"]) and "fix" not in normalized:
        risks.append("Errors are mentioned without a clear fix path.")

    if mode in {"bughunter", "debug"}:
        next_steps.append("Re-run the failing path and capture before/after evidence.")
    else:
        next_steps.append("Convert the response into a short checklist before execution.")
    next_steps.append("Confirm with tests or concrete runtime checks.")

    summary = (
        f"Advisor score {score}/100. "
        f"Prompt focus: {(user_text or '').strip()[:90] or 'general workflow'}"
    )

    return {
        "score": score,
        "summary": summary,
        "strengths": strengths[:3],
        "risks": risks[:3],
        "next_steps": next_steps[:3],
        "mode": mode,
    }


async def _persist_last_assistant_advisor_review(session_id: str, review: dict[str, Any]) -> None:
    payload = await memory_manager.load_session_payload(session_id)
    if payload is None:
        return

    messages = payload.get("messages", []) if isinstance(payload, dict) else []
    if not isinstance(messages, list) or not messages:
        return

    for idx in range(len(messages) - 1, -1, -1):
        message = messages[idx]
        if not isinstance(message, dict):
            continue
        if str(message.get("role", "")).lower() != "assistant":
            continue
        updated = dict(message)
        updated["advisor_review"] = review
        messages[idx] = updated
        break
    else:
        return

    metadata = payload.get("metadata", {}) if isinstance(payload, dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}

    await memory_manager.save_session(session_id=session_id, messages=messages, metadata=metadata)


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

    project_dir: str | None = _normalize_optional_text(req.project_dir) or None
    if project_dir:
        try:
            project_dir = enforce_allowed_path(project_dir)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        if not os.path.isdir(project_dir):
            raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {project_dir}")

    session_id = req.session_id or str(uuid.uuid4())
    try:
        await memory_manager.mark_session_activity(session_id)
    except Exception:
        pass

    user_content: str | list[dict[str, Any]] = req.content if req.content is not None else (req.message or "")
    user_text = _extract_text_content(user_content)
    user_payload: dict[str, Any] = {"role": "user", "content": user_content}
    if isinstance(req.image_attachment, dict):
        user_payload["image_attachment"] = req.image_attachment

    existing_payload = await memory_manager.load_session_payload(session_id)
    history = existing_payload.get("messages", []) if existing_payload else []
    metadata = existing_payload.get("metadata", {}) if existing_payload else {}
    stored_mode = _normalize_optional_text(metadata.get("mode")) if isinstance(metadata, dict) else ""
    if not stored_mode:
        stored_mode = DEFAULT_MODE
    stored_model_override = _normalize_optional_text(metadata.get("model_override")) if isinstance(metadata, dict) else ""
    stored_project_dir = _normalize_optional_text(metadata.get("project_dir")) if isinstance(metadata, dict) else ""

    if not project_dir and stored_project_dir:
        project_dir = _validate_project_dir_candidate(stored_project_dir)

    if not project_dir:
        project_dir = _infer_default_project_dir()

    if project_dir:
        await memory_manager.update_session_metadata(
            session_id,
            {"project_dir": project_dir},
            create_if_missing=True,
        )

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

    if is_command_message(user_text) and not req.image_attachment and not _has_non_text_content(req.content):
        async def command_stream():
            meta_event = {'type': 'meta', 'request_id': request_id, 'session_id': session_id, 'mode': effective_mode}
            await publish_session_event(session_id, meta_event)
            yield f"data: {json.dumps(meta_event)}\n\n"

            # Build and emit todo plan for commands
            cmd_todos = _build_todo_plan(user_text, is_command=True)
            if cmd_todos:
                _todo_set_in_progress_if_needed(cmd_todos)
                cmd_todo_plan_event = {"type": "todo_plan", "todos": _clone_todos(cmd_todos)}
                await publish_session_event(session_id, cmd_todo_plan_event)
                yield f"data: {json.dumps(cmd_todo_plan_event)}\n\n"

            try:
                raw_overrides = getattr(request.state, "api_key_overrides", None)
                safe_overrides = raw_overrides if isinstance(raw_overrides, dict) else {}
                result = await execute_command(
                    user_text,
                    session_id=session_id,
                    project_dir=project_dir,
                    api_key_overrides=safe_overrides,
                )
            except Exception as e:
                if cmd_todos:
                    _todo_revert_in_progress_to_pending(cmd_todos)
                    cmd_todo_err = {"type": "todo_update", "todos": _clone_todos(cmd_todos)}
                    await publish_session_event(session_id, cmd_todo_err)
                    yield f"data: {json.dumps(cmd_todo_err)}\n\n"
                log_audit_event(
                    "chat_command_error",
                    request_id=request_id,
                    session_id=session_id,
                    error=str(e),
                )
                error_event = {'type': 'error', 'message': _safe_error_message(e)}
                await publish_session_event(session_id, error_event)
                yield f"data: {json.dumps(error_event)}\n\n"
                return

            # Command parsed/executed — advance first todo
            if cmd_todos:
                _todo_advance_after_success(cmd_todos)
                cmd_todo_adv = {"type": "todo_update", "todos": _clone_todos(cmd_todos)}
                await publish_session_event(session_id, cmd_todo_adv)
                yield f"data: {json.dumps(cmd_todo_adv)}\n\n"

            updated_history = list(history) + [
                {"role": "user", "content": user_text},
                {
                    "role": "assistant",
                    "content": result.text,
                    "usage": {
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "model": "command-router",
                    },
                },
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
                assistant_parts: list[str] = []
                run_messages = list(updated_history) + [{"role": "user", "content": result.run_prompt}]

                text_event = {'type': 'text', 'content': result.text}
                await publish_session_event(session_id, text_event)
                yield f"data: {json.dumps(text_event)}\n\n"

                async for event in runner.stream(
                    session_id=session_id,
                    messages=run_messages,
                    project_dir=project_dir,
                    mode=latest_mode,
                    approval_callback=approval_callback,
                ):
                    if event.get("type") == "text":
                        assistant_parts.append(str(event.get("content", "")))
                    if event.get("type") == "done" and isinstance(event.get("usage"), dict):
                        usage_payload = event["usage"]
                    await publish_session_event(session_id, event)
                    yield f"data: {json.dumps(event)}\n\n"

                    # Advance command todo on each tool success
                    if cmd_todos and event.get("type") == "tool_result" and event.get("success"):
                        if _todo_advance_after_success(cmd_todos):
                            cmd_adv_event = {"type": "todo_update", "todos": _clone_todos(cmd_todos)}
                            await publish_session_event(session_id, cmd_adv_event)
                            yield f"data: {json.dumps(cmd_adv_event)}\n\n"

                # Mark all complete after run_prompt stream finishes
                if cmd_todos:
                    _todo_mark_all_completed(cmd_todos)
                    cmd_done_event = {"type": "todo_update", "todos": _clone_todos(cmd_todos)}
                    await publish_session_event(session_id, cmd_done_event)
                    yield f"data: {json.dumps(cmd_done_event)}\n\n"

                advisor_review = _build_advisor_review(user_text, "".join(assistant_parts), latest_mode)
                advisor_event = {"type": "advisor_review", "review": advisor_review}
                await publish_session_event(session_id, advisor_event)
                yield f"data: {json.dumps(advisor_event)}\n\n"
                try:
                    await _persist_last_assistant_advisor_review(session_id, advisor_review)
                except Exception:
                    pass

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
                    await _track_capsule_usage(
                        session_id=session_id,
                        provider=str(getattr(run_result, "provider", "unknown") or "unknown"),
                        usage_payload=usage_payload,
                    )
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

            # Non-agentic command: mark all complete before done event
            if cmd_todos:
                _todo_mark_all_completed(cmd_todos)
                cmd_final_event = {"type": "todo_update", "todos": _clone_todos(cmd_todos)}
                await publish_session_event(session_id, cmd_final_event)
                yield f"data: {json.dumps(cmd_final_event)}\n\n"

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

            text_event = {'type': 'text', 'content': result.text}
            done_event = {'type': 'done', 'usage': {'input_tokens': 0, 'output_tokens': 0, 'model': 'command-router'}}
            await publish_session_event(session_id, text_event)
            await publish_session_event(session_id, done_event)
            yield f"data: {json.dumps(text_event)}\n\n"
            yield f"data: {json.dumps(done_event)}\n\n"

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
        assistant_parts: list[str] = []
        runner = SessionRunner()

        session_messages = list(history) + [user_payload]

        meta_event = {'type': 'meta', 'request_id': request_id, 'session_id': session_id, 'mode': effective_mode}
        await publish_session_event(session_id, meta_event)
        yield f"data: {json.dumps(meta_event)}\n\n"

        # Build and emit the initial todo plan immediately after meta
        active_todos = _build_todo_plan(user_text, is_command=False)
        if active_todos:
            _todo_set_in_progress_if_needed(active_todos)
            todo_plan_event = {"type": "todo_plan", "todos": _clone_todos(active_todos)}
            await publish_session_event(session_id, todo_plan_event)
            yield f"data: {json.dumps(todo_plan_event)}\n\n"

        try:
            runner_kwargs: dict[str, Any] = {
                "session_id": session_id,
                "messages": session_messages,
                "project_dir": project_dir,
                "mode": effective_mode,
                "approval_callback": approval_callback,
                "model_override": stored_model_override or None,
                "artifact_mode": bool(req.artifact_mode),
                "disable_tools": bool(req.disable_tools),
            }
            if req.max_tokens is not None:
                runner_kwargs["max_tokens"] = req.max_tokens

            async for event in runner.stream(**runner_kwargs):
                if event.get("type") == "text":
                    assistant_parts.append(str(event.get("content", "")))
                if event["type"] == "done" and isinstance(event.get("usage"), dict):
                    usage_payload = event["usage"]

                # Stream event to client
                await publish_session_event(session_id, event)
                yield f"data: {json.dumps(event)}\n\n"

                # Advance todo after each successful tool result
                if active_todos and event.get("type") == "tool_result" and event.get("success"):
                    if _todo_advance_after_success(active_todos):
                        todo_update_event = {"type": "todo_update", "todos": _clone_todos(active_todos)}
                        await publish_session_event(session_id, todo_update_event)
                        yield f"data: {json.dumps(todo_update_event)}\n\n"

                # Mark all complete when agent signals done
                if active_todos and event.get("type") == "done":
                    if _todo_mark_all_completed(active_todos):
                        todo_done_event = {"type": "todo_update", "todos": _clone_todos(active_todos)}
                        await publish_session_event(session_id, todo_done_event)
                        yield f"data: {json.dumps(todo_done_event)}\n\n"

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
                await _track_capsule_usage(
                    session_id=session_id,
                    provider=str(provider_name or "unknown"),
                    usage_payload=usage_payload,
                )
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

            advisor_review = _build_advisor_review(user_text, "".join(assistant_parts), effective_mode)
            advisor_event = {
                "type": "advisor_review",
                "review": advisor_review,
            }
            await publish_session_event(session_id, advisor_event)
            yield f"data: {json.dumps(advisor_event)}\n\n"

            try:
                await _persist_last_assistant_advisor_review(session_id, advisor_review)
            except Exception:
                pass

        except Exception as e:
            # On error: revert in-progress item back to pending so user can retry
            if active_todos:
                _todo_revert_in_progress_to_pending(active_todos)
                todo_err_event = {"type": "todo_update", "todos": _clone_todos(active_todos)}
                await publish_session_event(session_id, todo_err_event)
                yield f"data: {json.dumps(todo_err_event)}\n\n"
            log_audit_event("chat_send_error", request_id=request_id, session_id=session_id, error=str(e))
            error_event = {'type': 'error', 'message': _safe_error_message(e)}
            await publish_session_event(session_id, error_event)
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-ID": session_id,
        },
    )


@router.post("/terminal/run")
async def run_terminal_command(req: TerminalRunRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SEND_RATE_LIMITER, "terminal_run")

    request_id = getattr(request.state, "request_id", None)

    try:
        safe_cwd = enforce_allowed_path(req.cwd or ".")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not os.path.isdir(safe_cwd):
        raise HTTPException(status_code=400, detail=f"Working directory not found: {safe_cwd}")

    tool = TOOL_MAP.get("powershell")
    if tool is None:
        raise HTTPException(status_code=503, detail="PowerShell tool is not available")

    command = req.command.strip()
    if hasattr(tool, "is_dangerous") and tool.is_dangerous(command=command):
        raise HTTPException(status_code=400, detail="Blocked potentially destructive terminal command")

    encoded_command = base64.b64encode(command.encode("utf-8")).decode("ascii")
    cwd_marker = f"__KODO_CWD_{uuid.uuid4().hex}__"
    wrapped_command = (
        "$ErrorActionPreference = 'Continue'; "
        f"$__kodoMarker = '{cwd_marker}'; "
        f"$__kodoEncoded = '{encoded_command}'; "
        "$__kodoCommand = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($__kodoEncoded)); "
        "try { Invoke-Expression $__kodoCommand } "
        "finally { Write-Output $__kodoMarker; (Get-Location).Path; Write-Output $__kodoMarker }"
    )

    log_audit_event(
        "terminal_run_started",
        request_id=request_id,
        cwd=safe_cwd,
        command_preview=command[:200],
    )

    async def event_stream():
        yield f"data: {json.dumps({'type': 'start', 'cwd': safe_cwd, 'shell': 'powershell'})}\n\n"

        queue: asyncio.Queue[str | None] = asyncio.Queue()
        streamed_lines = 0
        cwd_after = safe_cwd
        capturing_cwd = False

        def process_line(raw_line: str) -> str | None:
            nonlocal cwd_after
            nonlocal capturing_cwd

            line = str(raw_line)
            if line == cwd_marker:
                capturing_cwd = not capturing_cwd
                return None

            if capturing_cwd:
                candidate = line.strip()
                if candidate:
                    cwd_after = candidate
                return None

            return line

        async def on_output(line: str) -> None:
            parsed = process_line(line)
            if parsed is None:
                return
            await queue.put(parsed)

        async def run_tool():
            return await tool.execute(
                command=wrapped_command,
                cwd=safe_cwd,
                timeout=req.timeout,
                on_output=on_output,
            )

        task = asyncio.create_task(run_tool())

        while True:
            if task.done() and queue.empty():
                break

            try:
                line = await asyncio.wait_for(queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue

            if line is None:
                continue

            streamed_lines += 1
            yield f"data: {json.dumps({'type': 'line', 'line': line})}\n\n"

        try:
            result = await task
        except Exception as exc:
            message = _safe_error_message(exc)
            log_audit_event(
                "terminal_run_error",
                request_id=request_id,
                cwd=safe_cwd,
                command_preview=command[:200],
                error=message,
            )
            yield f"data: {json.dumps({'type': 'done', 'success': False, 'error': message})}\n\n"
            return

        if streamed_lines == 0 and result.output and result.output != "(no output)":
            for raw_line in str(result.output).splitlines() or [str(result.output)]:
                line = process_line(raw_line)
                if line is None:
                    continue
                yield f"data: {json.dumps({'type': 'line', 'line': line})}\n\n"

        try:
            cwd_after = enforce_allowed_path(cwd_after)
        except ValueError:
            cwd_after = safe_cwd

        log_audit_event(
            "terminal_run_completed",
            request_id=request_id,
            cwd=safe_cwd,
            cwd_after=cwd_after,
            command_preview=command[:200],
            success=result.success,
            error=result.error,
            metadata=result.metadata,
        )

        yield f"data: {json.dumps({'type': 'done', 'success': result.success, 'error': result.error, 'cwd_after': cwd_after, 'metadata': result.metadata or {}})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/notebook/run")
async def run_notebook_cell(req: NotebookRunRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SEND_RATE_LIMITER, "notebook_run")

    request_id = getattr(request.state, "request_id", None)

    safe_project_dir: str | None = None
    if req.project_dir:
        try:
            safe_project_dir = enforce_allowed_path(req.project_dir)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if not os.path.isdir(safe_project_dir):
            raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {safe_project_dir}")

    repl_tool = TOOL_MAP.get("repl")
    if repl_tool is None:
        raise HTTPException(status_code=503, detail="REPL tool is not available")

    base_session_id = (req.session_id or "default").strip() or "default"
    repl_session_id = f"notebook-{req.language}-{base_session_id}"

    try:
        result = await repl_tool.execute(
            language=req.language,
            code=req.code,
            session_id=repl_session_id,
            reset=req.reset,
            timeout=req.timeout,
            cwd=safe_project_dir,
        )
    except Exception as exc:
        message = _safe_error_message(exc)
        log_audit_event(
            "notebook_run_error",
            request_id=request_id,
            language=req.language,
            session_id=req.session_id,
            error=message,
        )
        raise HTTPException(status_code=500, detail=message) from exc

    output = str(result.output or "").strip() or "(no output)"

    log_audit_event(
        "notebook_run",
        request_id=request_id,
        language=req.language,
        session_id=req.session_id,
        repl_session_id=repl_session_id,
        success=result.success,
        has_error=bool(result.error),
    )

    return {
        "success": bool(result.success),
        "output": output,
        "error": result.error,
        "metadata": result.metadata or {},
    }


@router.post("/project-dir/select")
async def select_project_dir(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "project_dir_select")

    try:
        selected = await asyncio.to_thread(_pick_project_dir_native)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Directory picker failed: {exc}") from exc

    if not selected:
        return {"project_dir": None}

    try:
        safe_project_dir = enforce_allowed_path(selected)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"project_dir": safe_project_dir}


@router.post("/upload-zip")
async def upload_zip(
    request: Request,
    file: UploadFile = File(...),
    project_dir: str = Form(...),
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "upload_zip")

    try:
        safe_project_dir = enforce_allowed_path(project_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not os.path.isdir(safe_project_dir):
        raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {safe_project_dir}")

    filename = (file.filename or "").strip()
    if filename and not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip archives are supported")

    blob = await file.read(MAX_UPLOAD_SIZE_BYTES + 1)
    await file.close()
    if len(blob) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"Zip exceeds {MAX_UPLOAD_SIZE_MB}MB upload limit")

    try:
        extracted = await asyncio.to_thread(_extract_zip_to_project, blob, safe_project_dir)
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid zip archive") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Zip extraction failed: {exc}") from exc

    log_audit_event(
        "upload_zip",
        request_id=getattr(request.state, "request_id", None),
        project_dir=safe_project_dir,
        extracted_count=len(extracted),
    )
    return {"project_dir": safe_project_dir, "extracted": extracted}


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
            {"name": "/capsule", "description": "Show Kodo Capsule commands"},
            {"name": "/cap save [tag]", "description": "Capture the current session as a capsule"},
            {"name": "/cap inject <id>", "description": "Prepare capsule context for injection"},
            {"name": "/cap list", "description": "List saved capsules"},
            {"name": "/cap compress", "description": "Compress current session context"},
            {"name": "/cap usage", "description": "Show capsule token usage"},
            {"name": "/cost [days]", "description": "Show token and cost usage summary"},
            {"name": "/search <query>", "description": "Search the web and return top results"},
            {"name": "/krawlx <url>", "description": "Crawl a website via KrawlX secure crawler"},
            {"name": "/firecrawl <url>", "description": "Crawl a website with Firecrawl provider"},
            {"name": "/crawlx <url>", "description": "Alias for /krawlx"},
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
            {"name": "/stop", "description": "Stop current response generation"},
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
            {"name": "/crg status", "description": "Show code-review-graph availability and graph stats"},
            {"name": "/crg build [--full] [--postprocess full|minimal|none] [--repo <path>]", "description": "Build or update the code review graph"},
            {"name": "/crg detect [base] [--detail standard|minimal] [--repo <path>]", "description": "Analyze change risk and review priorities"},
            {"name": "/crg impact [base] [--depth N] [--repo <path>]", "description": "Compute blast radius for recent changes"},
            {"name": "/crg review [base] [--depth N] [--repo <path>]", "description": "Build full review context for changes"},
            {"name": "/crg query <pattern> <target> [--detail standard|minimal] [--repo <path>]", "description": "Run a structural graph query"},
            {"name": "/crg search <query> [--kind Kind] [--limit N] [--repo <path>]", "description": "Semantic/keyword code graph search"},
            {"name": "/crg arch [--repo <path>]", "description": "Generate architecture overview from graph"},
            {"name": "/crg flows [--sort criticality|depth|node_count|name] [--limit N] [--repo <path>]", "description": "List execution flows"},
            {"name": "/crg stats [--repo <path>]", "description": "Show graph node/edge stats"},
            {"name": "/agents", "description": "List spawned sub-agents"},
            {"name": "/agents spawn <goal>", "description": "Spawn sub-agent"},
            {"name": "/agents get <agent_id>", "description": "Get sub-agent details"},
            {"name": "/agents stop <agent_id>", "description": "Stop sub-agent"},
            {"name": "/skills", "description": "List project, custom, and bundled skills"},
            {"name": "/skills show <name>", "description": "Show skill content"},
            {"name": "/skills run <name>", "description": "Run skill immediately"},
            {"name": "/teleport <mode>", "description": "Quick-switch session mode"},
            {"name": "/ultraplan <goal>", "description": "Generate a high-fidelity execution plan"},
            {"name": "/dream [focus]", "description": "Generate a bold next-iteration concept"},
            {"name": "/advisor [topic]", "description": "Run strategic advisor-style review"},
            {"name": "/bughunter <issue>", "description": "Trigger bug-hunting workflow"},
            {"name": "/caveman [mode]", "description": "Enable caveman response mode for this session"},
            {"name": "/caveman-help", "description": "Show caveman quick reference"},
            {"name": "/caveman-commit", "description": "Generate terse conventional commit output"},
            {"name": "/caveman-review", "description": "Generate one-line review findings"},
            {"name": "/caveman:compress <path> [mode]", "description": "Compress markdown/text with caveman rules"},
        ]
    }


@router.post("/dream")
async def dream_endpoint(body: DreamRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SEND_RATE_LIMITER, "dream")

    session_id = str(body.session_id or "").strip() or str(uuid.uuid4())
    focus = str(body.focus or "").strip() or "the highest-impact next capability for this project"

    project_dir = body.project_dir
    if project_dir:
        try:
            project_dir = enforce_allowed_path(project_dir)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        if not os.path.isdir(project_dir):
            raise HTTPException(status_code=400, detail=f"project_dir is not a directory: {project_dir}")

    payload = await memory_manager.load_session_payload(session_id)
    history = payload.get("messages", []) if isinstance(payload, dict) else []
    if not isinstance(history, list):
        history = []

    prompt = (
        "Dream mode request:\n"
        f"Focus: {focus}\n\n"
        "Propose one bold but realistic next iteration for this codebase. Include:\n"
        "1) concept title\n"
        "2) why now\n"
        "3) implementation sketch (3-7 steps)\n"
        "4) risks and fallback\n"
        "5) a fast validation experiment"
    )

    parts: list[str] = []
    usage_payload: dict[str, Any] | None = None

    async def on_event(event: dict[str, Any]) -> None:
        nonlocal usage_payload
        event_type = str(event.get("type", ""))
        if event_type == "text":
            parts.append(str(event.get("content", "")))
        elif event_type == "done" and isinstance(event.get("usage"), dict):
            usage_payload = event.get("usage")

    try:
        await memory_manager.mark_session_activity(session_id)
    except Exception:
        pass

    runner = SessionRunner()
    result = await runner.run(
        session_id=session_id,
        messages=list(history) + [{"role": "user", "content": prompt}],
        project_dir=project_dir,
        mode="ultraplan",
        stream_callback=on_event,
    )

    dream_text = "".join(parts).strip() or result.output or "No dream output generated."

    log_audit_event(
        "dream_completed",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        has_error=bool(result.error),
        provider=result.provider,
        model=result.model,
    )

    return {
        "session_id": session_id,
        "dream": dream_text,
        "usage": usage_payload,
        "provider": result.provider,
        "model": result.model,
        "error": result.error,
    }


@router.post("/code-review")
async def run_code_review(req: CodeReviewRequest, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SEND_RATE_LIMITER, "code_review")

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
    prompt = (
        "Perform a risk-first code review for this branch diff.\n"
        f"Compare `{req.base_branch}` to `{req.branch}` in the current repository.\n"
        "Use git tooling to inspect the diff, then provide:\n"
        "1) Findings ordered by severity (critical/high/medium/low)\n"
        "2) File and line references when possible\n"
        "3) Missing test coverage and edge cases\n"
        "4) A concise change summary after findings\n"
        "If there are no findings, state that explicitly and mention residual risks."
    )

    parts: list[str] = []
    usage_payload: dict[str, Any] | None = None

    async def on_event(event: dict[str, Any]) -> None:
        nonlocal usage_payload
        event_type = str(event.get("type", ""))
        if event_type == "text":
            parts.append(str(event.get("content", "")))
        elif event_type == "done" and isinstance(event.get("usage"), dict):
            usage_payload = event.get("usage")

    runner = SessionRunner()
    result = await runner.run(
        session_id=session_id,
        messages=[{"role": "user", "content": prompt}],
        project_dir=project_dir,
        mode="review",
        stream_callback=on_event,
    )

    review = "".join(parts).strip()
    if not review and result.error:
        review = f"Review failed: {result.error}"

    log_audit_event(
        "code_review_completed",
        request_id=request_id,
        session_id=session_id,
        branch=req.branch,
        base_branch=req.base_branch,
        has_error=bool(result.error),
    )

    return {
        "session_id": session_id,
        "branch": req.branch,
        "base_branch": req.base_branch,
        "review": review,
        "error": result.error,
        "provider": result.provider,
        "model": result.model,
        "usage": usage_payload,
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
    session_id: str | None = Query(default=None, max_length=128),
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_tasks")
    tasks = await task_manager.list_tasks(limit=limit, requested_by_session=session_id)
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
    session_id: str | None = Query(default=None, max_length=128),
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_agents")
    return {"agents": await agent_coordinator.list_agents(limit=limit, parent_session_id=session_id)}


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


@router.get("/sessions/{session_id}/recap")
async def get_session_recap(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "get_session_recap")

    try:
        recap = await memory_manager.build_session_recap(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    away_seconds = int(recap.get("away_seconds", 0) or 0)
    recap["away_label"] = _format_away_label(away_seconds)

    try:
        await memory_manager.mark_session_activity(session_id)
    except Exception:
        pass

    log_audit_event(
        "get_session_recap",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        away_seconds=away_seconds,
        highlights=len(recap.get("highlights", []) if isinstance(recap.get("highlights"), list) else []),
    )
    return recap


@router.get("/sessions/{session_id}/events")
async def get_session_events(session_id: str, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "get_session_events")

    payload = await memory_manager.load_session_payload(session_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = payload.get("messages", [])
    if not isinstance(messages, list):
        messages = []

    events: list[dict[str, Any]] = []
    event_index = 0

    def _push(event_type: str, **kwargs: Any) -> None:
        nonlocal event_index
        timestamp = str(kwargs.pop("timestamp", "")).strip() or datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        event = {
            "event_index": event_index,
            "event_type": event_type,
            "timestamp": timestamp,
        }
        event.update(kwargs)
        events.append(event)
        event_index += 1

    def _extract_text(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if not isinstance(block, dict):
                    continue
                if str(block.get("type", "")).lower() != "text":
                    continue
                value = block.get("text")
                if isinstance(value, str):
                    parts.append(value)
            return "\n".join(parts).strip()
        return str(content or "")

    for message in messages:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role", "")).lower()
        content = _extract_text(message.get("content", ""))
        timestamp = str(message.get("timestamp", "")).strip()

        if role == "user":
            _push("user_message", timestamp=timestamp, content=content)
            continue

        if role == "assistant":
            _push("assistant_text", timestamp=timestamp, content=content)

            advisor_review = message.get("advisor_review")
            if isinstance(advisor_review, dict):
                _push(
                    "advisor_review",
                    timestamp=timestamp,
                    content=str(advisor_review.get("summary", "")).strip(),
                    review=advisor_review,
                )

            for tool_call in message.get("tool_calls", []) if isinstance(message.get("tool_calls"), list) else []:
                if not isinstance(tool_call, dict):
                    continue
                tool_name = str(tool_call.get("tool", ""))
                tool_input = tool_call.get("input", {})
                tool_output = str(tool_call.get("output", ""))
                _push(
                    "tool_call",
                    timestamp=timestamp,
                    content=f"Tool call: {tool_name}",
                    tool_name=tool_name,
                    tool_input=tool_input,
                )
                _push(
                    "tool_result",
                    timestamp=timestamp,
                    content=tool_output,
                    tool_name=tool_name,
                    tool_output=tool_output,
                )

    log_audit_event(
        "get_session_events",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        events_count=len(events),
    )

    return {"session_id": session_id, "events": events}


@router.get("/read-design-file")
async def read_design_file(request: Request, path: str = Query(..., max_length=1024)):
    """Read a file from disk for Design Studio display. Only allows safe, non-system paths."""
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "read_design_file")
    from tools.path_guard import enforce_allowed_path
    try:
        safe_path = enforce_allowed_path(path)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    if not os.path.isfile(safe_path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(safe_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    filename = os.path.basename(safe_path)
    return {"path": path, "filename": filename, "content": content}


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


class ForkSessionRequest(BaseModel):
    at_index: int = Field(ge=0, description="Fork after this message index (0 = fork before first message)")
    title: str | None = Field(default=None, max_length=200)


@router.post("/sessions/{session_id}/fork", response_model=NewSessionResponse)
async def fork_session(session_id: str, body: ForkSessionRequest, request: Request):
    """Fork a session at a given message index, creating a new session with the same messages up to that point."""
    require_api_auth(request)
    await enforce_rate_limit(request, SESSION_RATE_LIMITER, "fork_session")

    payload = await memory_manager.load_session_payload(session_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = list(payload.get("messages", []))
    forked_messages = messages[: body.at_index + 1]

    new_id = str(uuid.uuid4())
    parent_metadata = payload.get("metadata", {}) or {}
    fork_metadata: dict[str, Any] = {
        "mode": parent_metadata.get("mode", DEFAULT_MODE),
        "title": body.title or f"Fork of {parent_metadata.get('title', session_id[:8])}",
        "forked_from": session_id,
        "forked_at_index": body.at_index,
    }
    if "project_dir" in parent_metadata:
        fork_metadata["project_dir"] = parent_metadata["project_dir"]

    await memory_manager.save_session(
        session_id=new_id,
        messages=forked_messages,
        metadata=fork_metadata,
    )
    log_audit_event(
        "fork_session",
        request_id=getattr(request.state, "request_id", None),
        session_id=session_id,
        new_session_id=new_id,
        at_index=body.at_index,
    )
    return NewSessionResponse(session_id=new_id)


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
    breakdown: str = Query(default="model", pattern="^(model|sessions)$"),
):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "usage")
    data = summarize_usage(days=days, limit=limit, include_raw=(breakdown == "sessions"))

    if breakdown == "sessions":
        by_session: dict[str, dict[str, float | int]] = {}
        for event in data.get("raw_events", []):
            if not isinstance(event, dict):
                continue
            session_id = str(event.get("session_id", "")).strip() or "unknown"
            row = by_session.setdefault(
                session_id,
                {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "input_cache_read_tokens": 0,
                    "input_cache_write_tokens": 0,
                    "cost_usd_total": 0.0,
                },
            )

            inp = int(event.get("input_tokens", 0) or 0)
            outp = int(event.get("output_tokens", 0) or 0)
            cache_read = int(event.get("input_cache_read_tokens", 0) or 0)
            cache_write = int(event.get("input_cache_write_tokens", 0) or 0)
            cost = float(event.get("cost_usd_estimated", event.get("estimated_cost_usd", 0.0)) or 0.0)

            row["input_tokens"] = int(row["input_tokens"]) + inp
            row["output_tokens"] = int(row["output_tokens"]) + outp
            row["input_cache_read_tokens"] = int(row["input_cache_read_tokens"]) + cache_read
            row["input_cache_write_tokens"] = int(row["input_cache_write_tokens"]) + cache_write
            row["cost_usd_total"] = round(float(row["cost_usd_total"]) + cost, 8)

        data["by_session"] = {
            sid: {
                **row,
                "estimated_cost_usd": row.get("cost_usd_total", 0.0),
            }
            for sid, row in by_session.items()
        }
    else:
        data["by_session"] = {}

    log_audit_event(
        "usage_summary",
        request_id=getattr(request.state, "request_id", None),
        days=days,
        limit=limit,
        breakdown=breakdown,
        events=data.get("events_count", 0),
    )
    return data
