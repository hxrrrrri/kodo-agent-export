from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_skills_admin_delete_rejects_traversal(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    for bad_name in ["../etc", "..\\secret", "foo/bar", "foo..bar"]:
        response = client.delete(f"/api/skills/custom/{bad_name}")
        assert response.status_code in {400, 404}, (bad_name, response.status_code)


def test_skills_admin_delete_rejects_invalid_chars(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    response = client.delete("/api/skills/custom/has.dot")
    assert response.status_code == 400
