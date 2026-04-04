from __future__ import annotations

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_notebook_run_persists_python_session_state():
    first = client.post(
        "/api/chat/notebook/run",
        json={
            "language": "python",
            "session_id": "nb-test-session",
            "code": "counter = 7",
        },
    )
    assert first.status_code == 200
    assert first.json().get("success") is True

    second = client.post(
        "/api/chat/notebook/run",
        json={
            "language": "python",
            "session_id": "nb-test-session",
            "code": "counter + 5",
        },
    )
    assert second.status_code == 200
    payload = second.json()
    assert payload.get("success") is True
    assert "12" in str(payload.get("output", ""))


def test_collab_share_uses_public_app_url(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_COLLAB", "1")
    monkeypatch.setenv("KODO_PUBLIC_APP_URL", "https://kodo.example.com")

    response = client.post("/api/collab/sessions/session-123/share")
    assert response.status_code == 200

    payload = response.json()
    share_url = str(payload.get("share_url", ""))
    assert share_url.startswith("https://kodo.example.com/?session_id=session-123&share_token=")
