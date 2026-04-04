from __future__ import annotations

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_collab_disabled_returns_404(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_COLLAB", "0")
    response = client.post("/api/collab/sessions/test-id/share")
    assert response.status_code == 404


def test_collab_share_creates_token(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_COLLAB", "1")
    response = client.post("/api/collab/sessions/test-session/share")
    assert response.status_code == 200
    payload = response.json()
    assert "share_url" in payload
    assert "token" in payload
    assert "expires_at" in payload


def test_collab_revoke_removes_tokens(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_COLLAB", "1")
    client.post("/api/collab/sessions/rev-session/share")
    response = client.delete("/api/collab/sessions/rev-session/share")
    assert response.status_code == 200
    assert bool(response.json().get("revoked")) is True


def test_collab_invalid_token_rejected(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_COLLAB", "1")
    response = client.get("/api/collab/sessions/test-session/stream?token=invalid-token-xyz")
    assert response.status_code in (401, 422)
