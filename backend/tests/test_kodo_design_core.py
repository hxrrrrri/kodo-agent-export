from __future__ import annotations

import pytest

from kodo.design.accessibility_auditor import audit_accessibility
from kodo.design.export import clean_export_html, scan_code_health
from kodo.design.history import DesignHistory
from kodo.design.intent_classifier import classify_design_request
from kodo.design.question_engine import build_question_flow, detect_project_type
from kodo.design.region_editor import patch_region_html
from kodo.design.tweaks_engine import apply_tweaks
from kodo.design.types import DesignIntent, ProjectType, TweakOperation


HTML = """<!DOCTYPE html>
<html><head><title>Test</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><main><!-- SECTION: hero --><section id="hero"><h1>Hello</h1><img src="hero.png" alt="Hero"></section></main>
<script id="kodo-bridge">window.parent.postMessage({type:'KODO_READY'}, '*')</script>
<div data-kodo-tool="true">tool</div>
</body></html>"""


@pytest.mark.asyncio
async def test_intent_classifier_and_questions() -> None:
    result = await classify_design_request("Build a SaaS landing page for developers")
    assert result.intent == DesignIntent.CREATE_NEW
    assert result.requires_questions is True
    assert detect_project_type("Create an analytics dashboard") == ProjectType.DASHBOARD
    questions = build_question_flow("Create an analytics dashboard")
    assert len(questions) == 5
    assert questions[0].options


def test_export_sanitizes_tool_nodes_and_health() -> None:
    clean, removed = clean_export_html(HTML)
    assert removed == 2
    assert "kodo-bridge" not in clean
    assert "data-kodo-tool" not in clean
    assert scan_code_health(clean).score >= 80


def test_accessibility_audit_detects_missing_alt() -> None:
    html = "<!DOCTYPE html><html><head></head><body><img src='x.png'><h1>A</h1><h3>B</h3></body></html>"
    audit = audit_accessibility(html)
    categories = {issue.category for issue in audit.issues}
    assert "alt-text" in categories
    assert "headings" in categories
    assert audit.score < 100


def test_region_patch_and_tweaks() -> None:
    patched = patch_region_html(HTML, "<section id=\"hero\"><h1>Updated</h1></section>", selector="#hero")
    assert "Updated" in patched
    tweaked = apply_tweaks(patched, [TweakOperation(name="accent", value="#ff0000")])
    assert "design-tweaks-style" in tweaked
    assert "#ff0000" in tweaked


@pytest.mark.asyncio
async def test_history_branching(tmp_path) -> None:
    history = DesignHistory(tmp_path / "history.sqlite3")
    v1 = await history.save_version("project-a", HTML, "initial", "Initial")
    v2 = await history.save_version("project-a", HTML.replace("Hello", "Next"), "next", "Next", parent_id=v1.id)
    assert v2.parent_id == v1.id
    timeline = await history.get_timeline("project-a")
    assert [row.id for row in timeline] == [v1.id, v2.id]
    await history.create_branch(v1.id, "experiment")
    branch = await history.get_timeline("project-a")
    assert any(row.branch_name == "experiment" for row in branch)
    rollback = await history.rollback_to(v1.id)
    assert rollback.parent_id == v1.id
