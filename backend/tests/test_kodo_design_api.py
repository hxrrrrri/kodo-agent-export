from __future__ import annotations

from fastapi.testclient import TestClient

from main import app
from kodo.design.types import DesignIntent
import kodo.design.web.design_router as design_router


client = TestClient(app)


def test_design_intelligence_analyze_returns_intent() -> None:
    response = client.post(
        "/api/design/intelligence/analyze",
        json={"prompt": "Create a landing page for a SaaS product"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"]
    assert payload["project_type"]
    assert isinstance(payload["auto_tools"], list)


def test_design_intelligence_analyze_falls_back_on_classifier_failure(monkeypatch) -> None:
    async def _raise_classifier_error(*args, **kwargs):
        raise ValueError("forced classifier failure")

    monkeypatch.setattr(design_router, "classify_design_request", _raise_classifier_error)

    response = client.post(
        "/api/design/intelligence/analyze",
        json={"prompt": "Adjust this existing page", "has_current_html": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == DesignIntent.TWEAK_EXISTING.value
    assert payload["strategy"] == "surgical_patch"
    assert payload["auto_tools"] == ["chat"]
