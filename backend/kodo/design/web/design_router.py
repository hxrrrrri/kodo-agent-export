from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from kodo.design.accessibility_auditor import audit_accessibility
from kodo.design.design_system import extract_design_tokens
from kodo.design.export import build_zip_bytes, export_clean_html, scan_code_health
from kodo.design.generator import KODO_DESIGN_GENERATION_SYSTEM, build_stream_events_from_html
from kodo.design.history import design_history
from kodo.design.intent_classifier import classify_design_request
from kodo.design.question_engine import build_question_flow
from kodo.design.region_editor import RegionEditError, patch_region_html
from kodo.design.tweaks_engine import apply_tweaks
from kodo.design.types import (
    BranchRequest,
    CheckpointRequest,
    DesignVersionCreateRequest,
    ExportRequest,
    IntentAnalysisRequest,
    IntentAnalysisResponse,
    RegionEditRequest,
    RollbackRequest,
    TweakRequest,
)
from kodo.design.web.design_ws import design_ws_hub


router = APIRouter(prefix="/api/design", tags=["kodo-design"])


SUPERIORITY_MAP = {
    "history_branching": "Every save becomes a branchable SQLite-backed version with rollback, checkpoints, and merge support.",
    "figma_support": "Clean export can emit Figma-oriented JSON and the backend shape is ready for a Figma MCP adapter without mixing tool UI into HTML.",
    "inline_comments": "Comments live in the React overlay layer and are sent with precise canvas coordinates before generation.",
    "canvas_freedom": "Selection, region, draw, and tweaks are modeled as overlay/canvas tools with independent pointer-event modes.",
    "export_to_figma": "Figma JSON export is available from clean HTML with token and section metadata.",
    "mode_switching": "Intent analysis returns auto-tools; the UI decides active mode before any generation call.",
    "compact_save": "History saves happen through a backend transaction rather than compact-layout UI state.",
    "live_build": "Build stream events are derived from SECTION markers and can be published over WebSocket.",
    "overlay_separation": "Export sanitation strips Kodo bridge/tool nodes and validates that only clean website HTML leaves the system.",
    "adaptive_questions": "Question cards are generated from detected project type and skip details already specified in the brief.",
}


PROJECT_MAP = {
    "chat_to_llm": "frontend/src/components/DesignStudio.tsx sendMessage -> /api/chat/send -> backend/api/chat.py -> agent/session_runner.py providers.",
    "design_api": "backend/api/design.py provides render/options/system docs; backend/api/design_extract.py extracts tokens from URLs.",
    "preview_iframe": "DesignStudio builds previewHtml from generated files and renders it as iframe srcDoc.",
    "overlays": "Inline comments are absolute React layers above the iframe; Kodo Design keeps selection/draw/tweaks out of exported HTML.",
    "html_creation": "LLM responses stream into fenced code blocks, then extractFiles/buildPreviewHtml turns them into preview files.",
    "current_tweaks": "Existing design-system panel controls generation prompts; new tweak endpoints patch approved CSS only.",
    "artifacts": "backend/artifacts stores provider-neutral artifacts; Design Studio currently uses direct code blocks for design files.",
}


@router.post("/intelligence/analyze", response_model=IntentAnalysisResponse)
async def analyze_design_intent(body: IntentAnalysisRequest) -> IntentAnalysisResponse:
    classification = await classify_design_request(body.prompt, body.has_current_html or bool(body.current_html))
    questions = build_question_flow(body.prompt, classification.project_type) if classification.requires_questions else []
    return IntentAnalysisResponse(
        intent=classification.intent,
        project_type=classification.project_type,
        confidence=classification.confidence,
        strategy=classification.strategy,
        requires_questions=classification.requires_questions,
        auto_tools=classification.auto_tools,
        questions=questions,
        system_prompt=KODO_DESIGN_GENERATION_SYSTEM,
        superiority_map=SUPERIORITY_MAP,
        project_map=PROJECT_MAP,
    )


@router.get("/intelligence/project-map")
async def project_map() -> dict[str, Any]:
    return {"project_map": PROJECT_MAP, "superiority_map": SUPERIORITY_MAP}


@router.get("/generation-system-prompt")
async def generation_system_prompt() -> dict[str, str]:
    return {"system_prompt": KODO_DESIGN_GENERATION_SYSTEM}


@router.post("/audit")
async def audit(body: dict[str, str]):
    html = str(body.get("html") or "")
    if not html.strip():
        raise HTTPException(status_code=400, detail="html is required")
    return audit_accessibility(html)


@router.post("/code-health")
async def code_health(body: dict[str, str]):
    html = str(body.get("html") or "")
    if not html.strip():
        raise HTTPException(status_code=400, detail="html is required")
    return scan_code_health(html)


@router.post("/design-system/extract-html")
async def extract_tokens(body: dict[str, str]):
    html = str(body.get("html") or "")
    if not html.strip():
        raise HTTPException(status_code=400, detail="html is required")
    return {"tokens": extract_design_tokens(html).to_dict()}


@router.post("/export/clean")
async def export_clean(body: ExportRequest):
    if body.format == "zip":
        data = build_zip_bytes(body.html, body.filename)
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="kodo-design-export.zip"'},
        )
    return export_clean_html(body.html, body.format)


@router.post("/tweaks/apply")
async def apply_design_tweaks(body: TweakRequest):
    return {"html": apply_tweaks(body.html, body.operations)}


@router.post("/region/patch")
async def patch_region(body: RegionEditRequest):
    try:
        html = patch_region_html(
            body.html,
            body.replacement_html,
            selector=body.selector,
            selected_outer_html=body.selected_outer_html,
            start_marker=body.start_marker,
            end_marker=body.end_marker,
        )
    except RegionEditError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"html": html}


@router.post("/history/version")
async def save_version(body: DesignVersionCreateRequest):
    version = await design_history.save_version(
        project_id=body.project_id,
        html=body.html,
        prompt=body.prompt,
        label=body.label,
        parent_id=body.parent_id,
        branch_name=body.branch_name,
        is_checkpoint=body.is_checkpoint,
    )
    return {"version": version.to_dict(include_html=False)}


@router.get("/history/{project_id}")
async def timeline(project_id: str, include_html: bool = Query(default=False)):
    versions = await design_history.get_timeline(project_id)
    return {"versions": [version.to_dict(include_html=include_html) for version in versions]}


@router.get("/history/version/{version_id}")
async def get_version(version_id: str):
    try:
        version = await design_history.get_version(version_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Version not found") from exc
    return {"version": version.to_dict(include_html=True)}


@router.post("/history/rollback")
async def rollback(body: RollbackRequest):
    try:
        version = await design_history.rollback_to(body.version_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Version not found") from exc
    return {"version": version.to_dict(include_html=True)}


@router.post("/history/branch")
async def branch(body: BranchRequest):
    try:
        branch_name = await design_history.create_branch(body.version_id, body.branch_name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Version not found") from exc
    return {"branch_name": branch_name}


@router.post("/history/checkpoint")
async def checkpoint(body: CheckpointRequest):
    await design_history.mark_checkpoint(body.version_id, body.label)
    return {"ok": True}


@router.post("/build-stream/events")
async def build_stream_events(body: dict[str, str]):
    html = str(body.get("html") or "")
    return {"events": [event.__dict__ for event in build_stream_events_from_html(html)]}


@router.websocket("/ws/build/{project_id}")
async def build_ws(websocket: WebSocket, project_id: str):
    await design_ws_hub.connect(project_id, websocket)
    try:
        while True:
            raw = await websocket.receive_json()
            event_type = str(raw.get("type") or "")
            if event_type == "publish":
                await design_ws_hub.publish(project_id, dict(raw.get("payload") or {}))
            else:
                await websocket.send_json({"type": "ack", "project_id": project_id})
    except WebSocketDisconnect:
        design_ws_hub.disconnect(project_id, websocket)


@router.get("/static/{asset_name}")
async def static_asset(asset_name: str):
    safe = Path(asset_name).name
    path = Path(__file__).parent / "static" / safe
    if not path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    media = "text/css" if path.suffix == ".css" else "text/javascript"
    return Response(path.read_text(encoding="utf-8"), media_type=media)
