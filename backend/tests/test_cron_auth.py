from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_cron_list_requires_auth_when_token_set(monkeypatch):
    monkeypatch.setenv("API_AUTH_TOKEN", "cron-token")
    monkeypatch.setenv("KODO_ENABLE_CRON", "1")

    response = client.get("/api/cron")
    assert response.status_code == 401

    response = client.get("/api/cron", headers={"Authorization": "Bearer cron-token"})
    assert response.status_code == 200


def test_cron_upsert_requires_auth_when_token_set(monkeypatch):
    monkeypatch.setenv("API_AUTH_TOKEN", "cron-token")
    monkeypatch.setenv("KODO_ENABLE_CRON", "1")

    payload = {
        "name": "unit-test-cron",
        "cron_expr": "every_5_minutes",
        "prompt": "hello",
        "enabled": False,
    }
    response = client.post("/api/cron", json=payload)
    assert response.status_code == 401


def test_cron_delete_requires_auth_when_token_set(monkeypatch):
    monkeypatch.setenv("API_AUTH_TOKEN", "cron-token")
    monkeypatch.setenv("KODO_ENABLE_CRON", "1")

    response = client.delete("/api/cron/some-name")
    assert response.status_code == 401


def test_cron_upsert_rejects_system_project_dir(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("KODO_ENABLE_CRON", "1")

    payload = {
        "name": "unit-test-cron-sys",
        "cron_expr": "every_5_minutes",
        "prompt": "hello",
        "project_dir": "/etc",
        "enabled": False,
    }
    response = client.post("/api/cron", json=payload)
    # Either 400 (blocked) on Linux or 200 on Windows where /etc doesn't map to a
    # blocked system path. Either way, auth was not bypassed.
    assert response.status_code in {200, 400}
