from __future__ import annotations

from fastapi.testclient import TestClient

import api.gateway as gateway_api
from main import app


client = TestClient(app)


def test_gateway_status_respects_active_codex_cli(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("PRIMARY_PROVIDER", "codex-cli")
    monkeypatch.setenv("MODEL", "default")
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-test")

    def fake_provider_configured(provider: str) -> bool:
        return provider in {"codex-cli", "nvidia"}

    monkeypatch.setattr(gateway_api, "_provider_configured", fake_provider_configured)

    response = client.get("/api/gateway/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["primary_provider"] == "codex-cli"
    assert payload["provider"] == "codex-cli"
    assert payload["model"] == "default"
