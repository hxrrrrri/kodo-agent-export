from __future__ import annotations

from fastapi.testclient import TestClient

import api.chat as chat_api
from main import app


client = TestClient(app)


def test_session_recap_endpoint(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    async def fake_build_session_recap(session_id: str):
        return {
            "session_id": session_id,
            "away_seconds": 650,
            "summary": "Recent context: fixed provider switching and settings persistence.",
            "highlights": [
                "user: make profile switching seamless",
                "assistant: added /api/providers/switch endpoint",
            ],
        }

    async def fake_mark_session_activity(session_id: str):
        return {"last_active_at": "now"}

    monkeypatch.setattr(chat_api.memory_manager, "build_session_recap", fake_build_session_recap)
    monkeypatch.setattr(chat_api.memory_manager, "mark_session_activity", fake_mark_session_activity)

    response = client.get("/api/chat/sessions/session-1/recap")
    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == "session-1"
    assert payload["away_seconds"] == 650
    assert payload["away_label"] == "10m"
    assert payload["highlights"]


def test_dream_endpoint(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    class DummyResult:
        error = None
        provider = "test-provider"
        model = "test-model"
        output = ""

    async def fake_load_session_payload(session_id: str):
        return {
            "session_id": session_id,
            "metadata": {"mode": "execute"},
            "messages": [{"role": "user", "content": "current status"}],
        }

    async def fake_mark_session_activity(session_id: str):
        return {"last_active_at": "now"}

    async def fake_run(self, session_id: str, messages: list[dict], project_dir: str | None, mode: str, stream_callback, **kwargs):
        assert mode == "ultraplan"
        await stream_callback({"type": "text", "content": "Ship local-first provider onboarding."})
        await stream_callback({"type": "done", "usage": {"input_tokens": 10, "output_tokens": 20}})
        return DummyResult()

    monkeypatch.setattr(chat_api.memory_manager, "load_session_payload", fake_load_session_payload)
    monkeypatch.setattr(chat_api.memory_manager, "mark_session_activity", fake_mark_session_activity)
    monkeypatch.setattr(chat_api.SessionRunner, "run", fake_run)

    response = client.post(
        "/api/chat/dream",
        json={
            "session_id": "dream-session-1",
            "focus": "local ollama onboarding",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == "dream-session-1"
    assert "local-first" in payload["dream"]
    assert payload["provider"] == "test-provider"
    assert payload["error"] is None
