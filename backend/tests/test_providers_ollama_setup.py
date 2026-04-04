from __future__ import annotations

import os
from pathlib import Path

from fastapi.testclient import TestClient

import api.providers as providers_api
from main import app


client = TestClient(app)


def _prepare_dotenv_path(monkeypatch, tmp_path: Path) -> Path:
    target = tmp_path / "ollama-setup.env"
    target.write_text("", encoding="utf-8")
    monkeypatch.setenv("KODO_SETTINGS_DOTENV_PATH", str(target))
    return target


def _mock_profile_and_memory(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_save_profile(profile):
        captured["saved_profile"] = profile

    async def fake_activate_profile(name: str):
        captured["active_profile"] = name

    async def fake_update_session_metadata(session_id: str, updates: dict[str, object], create_if_missing: bool = True):
        captured["session_id"] = session_id
        captured["updates"] = updates
        captured["create_if_missing"] = create_if_missing
        return updates

    monkeypatch.setattr(providers_api.profile_manager, "save_profile", fake_save_profile)
    monkeypatch.setattr(providers_api.profile_manager, "activate_profile", fake_activate_profile)
    monkeypatch.setattr(providers_api.memory_manager, "update_session_metadata", fake_update_session_metadata)
    return captured


def test_get_ollama_setup_status(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    async def fake_discover_local_providers():
        return {"ollama": True, "atomic_chat": False}

    async def fake_list_available_models(provider: str):
        assert provider == "ollama"
        return ["gemma4:e2b", "llama3.1:8b"]

    monkeypatch.setattr(providers_api, "discover_local_providers", fake_discover_local_providers)
    monkeypatch.setattr(providers_api, "list_available_models", fake_list_available_models)

    response = client.get("/api/providers/ollama/setup")
    assert response.status_code == 200
    payload = response.json()
    assert payload["reachable"] is True
    assert "gemma4:e2b" in payload["models"]


def test_post_ollama_setup_updates_runtime_and_session(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    dotenv_path = _prepare_dotenv_path(monkeypatch, tmp_path)
    captured = _mock_profile_and_memory(monkeypatch)

    async def fake_discover_local_providers():
        return {"ollama": True, "atomic_chat": False}

    async def fake_list_available_models(provider: str):
        assert provider == "ollama"
        return ["gemma4:e2b", "llama3.1:8b"]

    monkeypatch.setattr(providers_api, "discover_local_providers", fake_discover_local_providers)
    monkeypatch.setattr(providers_api, "list_available_models", fake_list_available_models)

    response = client.post(
        "/api/providers/ollama/setup",
        json={
            "base_url": "http://127.0.0.1:11434",
            "session_id": "session-ollama-1",
            "persist": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "ollama"
    assert payload["model"] == "llama3.1:8b"

    assert os.getenv("OLLAMA_BASE_URL") == "http://127.0.0.1:11434"
    assert os.getenv("PRIMARY_PROVIDER") == "ollama"
    assert os.getenv("MODEL") == "llama3.1:8b"
    assert os.getenv("BIG_MODEL") == "llama3.1:8b"
    assert os.getenv("SMALL_MODEL") == "llama3.1:8b"

    assert captured.get("active_profile") == "quick-ollama"
    updates = captured.get("updates")
    assert isinstance(updates, dict)
    assert updates.get("model_override") == "llama3.1:8b"

    persisted = dotenv_path.read_text(encoding="utf-8")
    assert "OLLAMA_BASE_URL" in persisted
    assert "PRIMARY_PROVIDER" in persisted and "ollama" in persisted
