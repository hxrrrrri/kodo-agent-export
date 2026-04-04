from __future__ import annotations

from fastapi.testclient import TestClient

import api.webhooks as webhooks_mod
from main import app


client = TestClient(app)


def test_webhook_trigger_creates_task(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_WEBHOOKS", "1")
    monkeypatch.delenv("WEBHOOK_SECRET", raising=False)

    async def fake_create_task(prompt: str, project_dir: str | None = None, requested_by_session: str | None = None):
        return {"task_id": "task-webhook-1"}

    monkeypatch.setattr(webhooks_mod.task_manager, "create_task", fake_create_task)

    response = client.post(
        "/api/webhooks/trigger",
        json={
            "event_type": "custom",
            "payload": {},
            "prompt_template": "Say hello",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("task_id") == "task-webhook-1"
    assert isinstance(payload.get("queued_at"), str)


def test_webhook_signature_rejects_invalid(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_WEBHOOKS", "1")
    monkeypatch.setenv("WEBHOOK_SECRET", "test-secret")

    response = client.post(
        "/api/webhooks/trigger",
        headers={"X-Hub-Signature-256": "sha256=invalid"},
        json={
            "event_type": "custom",
            "payload": {},
            "prompt_template": "Say hello",
        },
    )

    assert response.status_code == 401


def test_render_template_substitutes_payload_fields():
    rendered = webhooks_mod._render_template(
        "Commit: {{payload.commits.0.message}}",
        {"payload": {"commits": [{"message": "Refactor parser"}]}},
    )
    assert rendered == "Commit: Refactor parser"


def test_webhooks_disabled_returns_404(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_WEBHOOKS", "0")

    response = client.get("/api/webhooks/events")
    assert response.status_code == 404
