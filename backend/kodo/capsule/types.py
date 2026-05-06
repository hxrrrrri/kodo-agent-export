from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


ProviderName = Literal["anthropic", "openai", "gemini", "ollama", "openrouter", "deepseek", "groq", "github-models", "codex", "atomic-chat", "smart", "unknown"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def normalize_id(value: Any) -> str:
    return str(value or "").strip()


class CodeRef(BaseModel):
    file: str = Field(default="", max_length=2048)
    snippet: str = Field(default="", max_length=12000)
    lang: str = Field(default="text", max_length=64)

    @field_validator("file", "snippet", "lang")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return str(value or "").strip()

    @field_validator("lang")
    @classmethod
    def normalize_lang(cls, value: str) -> str:
        text = str(value or "").strip().lower()
        return text or "text"


class KodoCapsule(BaseModel):
    id: str = Field(default="", max_length=80)
    tag: str = Field(min_length=1, max_length=160)
    summary: str = Field(min_length=1, max_length=50000)
    goals: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    code_refs: list[CodeRef] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    model_used: str = Field(default="unknown", max_length=200)
    provider: str = Field(default="unknown", max_length=80)
    tokens_at_capture: int | None = Field(default=None, ge=0)
    context_pct_at_capture: float | None = Field(default=None, ge=0, le=100)
    agent_id: str | None = Field(default=None, max_length=160)
    team_folder: str = Field(default="default", max_length=240)
    tags: list[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)

    @field_validator("id", "tag", "summary", "model_used", "provider", "team_folder", "created_at", "updated_at")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return str(value or "").strip()

    @field_validator("agent_id")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        text = str(value or "").strip()
        return text or None

    @field_validator("goals", "constraints", "next_steps", "tags")
    @classmethod
    def normalize_list_text(cls, value: list[Any]) -> list[str]:
        rows: list[str] = []
        seen: set[str] = set()
        for item in value or []:
            text = str(item or "").strip()
            if not text:
                continue
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            rows.append(text)
        return rows

    @model_validator(mode="after")
    def validate_defaults(self) -> "KodoCapsule":
        if not self.tag.strip():
            raise ValueError("capsule tag is required")
        if not self.summary.strip():
            raise ValueError("capsule summary is required")
        if not self.team_folder.strip():
            self.team_folder = "default"
        self.provider = self.provider.strip().lower() or "unknown"
        self.model_used = self.model_used.strip() or "unknown"
        return self


class CapsuleVersion(BaseModel):
    id: str = Field(default="", max_length=80)
    capsule_id: str = Field(default="", max_length=80)
    version_number: int = Field(default=1, ge=1)
    summary: str = Field(min_length=1, max_length=50000)
    goals: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    code_refs: list[CodeRef] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    tokens_at_save: int | None = Field(default=None, ge=0)
    change_note: str | None = Field(default=None, max_length=2000)
    created_at: str = Field(default_factory=utc_now_iso)

    @field_validator("id", "capsule_id", "summary", "created_at")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return str(value or "").strip()

    @field_validator("change_note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        text = str(value or "").strip()
        return text or None

    @field_validator("goals", "constraints", "next_steps")
    @classmethod
    def normalize_list_text(cls, value: list[Any]) -> list[str]:
        rows: list[str] = []
        seen: set[str] = set()
        for item in value or []:
            text = str(item or "").strip()
            if not text:
                continue
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            rows.append(text)
        return rows


class TokenData(BaseModel):
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    rate_limit_tokens_total: int | None = Field(default=None, ge=0)
    rate_limit_tokens_remaining: int | None = Field(default=None, ge=0)
    rate_limit_reset_at: datetime | None = None
    rate_limit_requests_total: int | None = Field(default=None, ge=0)
    rate_limit_requests_remaining: int | None = Field(default=None, ge=0)
    generation_id: str | None = Field(default=None, max_length=240)
    cost_usd: float | None = Field(default=None, ge=0)
    raw: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def derive_total(self) -> "TokenData":
        if self.total_tokens <= 0:
            self.total_tokens = self.input_tokens + self.output_tokens
        return self


class TokenEvent(BaseModel):
    id: str = Field(default="", max_length=80)
    session_id: str = Field(min_length=1, max_length=160)
    agent_id: str | None = Field(default=None, max_length=160)
    provider: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=200)
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    cumulative_input: int = Field(default=0, ge=0)
    cumulative_output: int = Field(default=0, ge=0)
    context_pct: float = Field(default=0, ge=0, le=100)
    rate_limit_pct: float | None = Field(default=None, ge=0, le=100)
    timestamp: str = Field(default_factory=utc_now_iso)
    alert_level: str = Field(default="idle")
    alert_reason: str = Field(default="")

    @field_validator("id", "session_id", "provider", "model", "timestamp", "alert_level", "alert_reason")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return str(value or "").strip()

    @field_validator("agent_id")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        text = str(value or "").strip()
        return text or None


class SessionStats(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    agent_id: str | None = Field(default=None, max_length=160)
    provider: str = Field(default="unknown", max_length=80)
    model: str = Field(default="unknown", max_length=200)
    started_at: str = Field(default_factory=utc_now_iso)
    last_active: str = Field(default_factory=utc_now_iso)
    total_input_tokens: int = Field(default=0, ge=0)
    total_output_tokens: int = Field(default=0, ge=0)
    capsules_created: int = Field(default=0, ge=0)
    compressions_done: int = Field(default=0, ge=0)
    context_pct: float = Field(default=0, ge=0, le=100)
    alert_level: str = Field(default="idle")
    alert_reason: str = Field(default="")


class CapsuleToolResult(BaseModel):
    success: bool
    message: str = ""
    data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        return str(value or "").strip()


class CaptureRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=160)
    tag: str | None = Field(default=None, max_length=160)
    team_folder: str = Field(default="default", max_length=240)
    tags: list[str] = Field(default_factory=list)
    agent_id: str | None = Field(default=None, max_length=160)


class InjectRequest(BaseModel):
    capsule_id: str = Field(min_length=1, max_length=80)
    message: str = Field(default="", max_length=200000)


class MergeRequest(BaseModel):
    capsule_ids: list[str] = Field(min_length=2, max_length=20)
    tag: str | None = Field(default=None, max_length=160)


class TemplateRequest(BaseModel):
    template: str = Field(default="bug_hunt", max_length=80)
    values: dict[str, Any] = Field(default_factory=dict)


class PersonaRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    project_dir: str | None = Field(default=None, max_length=2048)

