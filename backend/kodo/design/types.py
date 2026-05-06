from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class DesignIntent(str, Enum):
    CREATE_NEW = "create_new"
    TWEAK_EXISTING = "tweak_existing"
    REGION_EDIT = "region_edit"
    FULL_REDESIGN = "full_redesign"
    ADD_COMPONENT = "add_component"
    REMOVE_COMPONENT = "remove_component"
    STYLE_CHANGE = "style_change"
    CONTENT_CHANGE = "content_change"
    LAYOUT_CHANGE = "layout_change"
    EXPORT_REQUEST = "export_request"
    COMPARISON_REQUEST = "comparison_request"
    DEBUG_REQUEST = "debug_request"
    ACCESSIBILITY_AUDIT = "accessibility_audit"
    RESPONSIVE_CHECK = "responsive_check"


class ProjectType(str, Enum):
    LANDING_PAGE = "landing_page"
    DASHBOARD = "dashboard"
    PORTFOLIO = "portfolio"
    ECOMMERCE = "ecommerce"
    SAAS_APP = "saas_app"
    ADMIN_PANEL = "admin_panel"
    BLOG = "blog"
    DOCUMENTATION = "documentation"
    GAME = "game"


class GenerationStrategy(str, Enum):
    FULL_GENERATION = "full_generation"
    FULL_REGENERATION = "full_regeneration"
    SURGICAL_PATCH = "surgical_patch"
    LOCAL_ACTION = "local_action"
    AUDIT_ONLY = "audit_only"
    EXPORT_ONLY = "export_only"
    COMPARISON = "comparison"


class CanvasTool(str, Enum):
    CHAT = "chat"
    SELECT = "select"
    REGION = "region"
    DRAW = "draw"
    TWEAKS = "tweaks"
    HISTORY = "history"
    EXPORT = "export"


class ClarifyingQuestion(BaseModel):
    id: str
    question: str
    options: list[str] = Field(min_length=3, max_length=6)
    type: Literal["single", "multi", "text"] = "single"
    allow_free_text: bool = True
    skipped: bool = False


class IntentAnalysisRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    has_current_html: bool = False
    current_html: str | None = Field(default=None, max_length=250000)


class IntentAnalysisResponse(BaseModel):
    intent: DesignIntent
    project_type: ProjectType
    confidence: float = Field(ge=0, le=1)
    strategy: GenerationStrategy
    requires_questions: bool
    auto_tools: list[CanvasTool]
    questions: list[ClarifyingQuestion]
    system_prompt: str
    superiority_map: dict[str, str]
    project_map: dict[str, str]


class QuestionAnswer(BaseModel):
    question_id: str
    answer: str | list[str] = ""


class AuditRequest(BaseModel):
    html: str = Field(min_length=1, max_length=1_500_000)


class AuditIssue(BaseModel):
    id: str
    severity: Literal["info", "warning", "error"]
    category: str
    message: str
    selector: str | None = None
    fix_hint: str | None = None


class AuditResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    issue_count: int
    issues: list[AuditIssue]
    summary: str


class CodeHealthResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    issues: list[AuditIssue]


class ExportRequest(BaseModel):
    html: str = Field(min_length=1, max_length=1_500_000)
    format: Literal["html", "zip", "figma", "handoff"] = "html"
    filename: str = Field(default="index.html", max_length=160)


class ExportResponse(BaseModel):
    format: str
    html: str | None = None
    figma_json: dict[str, Any] | None = None
    handoff: dict[str, Any] | None = None
    code_health: CodeHealthResponse
    removed_tool_nodes: int
    valid_html: bool


class TweakOperation(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    value: str = Field(max_length=120)


class TweakRequest(BaseModel):
    html: str = Field(min_length=1, max_length=1_500_000)
    operations: list[TweakOperation]


class RegionEditRequest(BaseModel):
    html: str = Field(min_length=1, max_length=1_500_000)
    replacement_html: str = Field(min_length=1, max_length=250000)
    selector: str | None = Field(default=None, max_length=512)
    selected_outer_html: str | None = Field(default=None, max_length=250000)
    start_marker: str | None = Field(default=None, max_length=512)
    end_marker: str | None = Field(default=None, max_length=512)


class DesignVersionCreateRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=160)
    html: str = Field(min_length=1, max_length=1_500_000)
    prompt: str = Field(default="", max_length=12000)
    label: str = Field(default="Generation", max_length=160)
    parent_id: str | None = Field(default=None, max_length=80)
    branch_name: str = Field(default="main", max_length=80)
    is_checkpoint: bool = False


class BranchRequest(BaseModel):
    version_id: str = Field(min_length=1, max_length=80)
    branch_name: str = Field(min_length=1, max_length=80)


class RollbackRequest(BaseModel):
    version_id: str = Field(min_length=1, max_length=80)


class CheckpointRequest(BaseModel):
    version_id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=160)


@dataclass(frozen=True)
class DesignVersion:
    id: str
    project_id: str
    parent_id: str | None
    html: str
    thumbnail_b64: str
    label: str
    prompt_that_created_it: str
    created_at: datetime
    branch_name: str
    is_checkpoint: bool

    def to_dict(self, include_html: bool = True) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.id,
            "project_id": self.project_id,
            "parent_id": self.parent_id,
            "thumbnail_b64": self.thumbnail_b64,
            "label": self.label,
            "prompt_that_created_it": self.prompt_that_created_it,
            "created_at": self.created_at.isoformat(),
            "branch_name": self.branch_name,
            "is_checkpoint": self.is_checkpoint,
        }
        if include_html:
            payload["html"] = self.html
        return payload


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
