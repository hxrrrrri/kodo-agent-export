from __future__ import annotations

import os
from pathlib import Path

from fastapi.testclient import TestClient

import api.profiles as profiles_api
from main import app
from profiles.manager import ProviderProfile


client = TestClient(app)


def _prepare_dotenv_path(monkeypatch, tmp_path: Path) -> Path:
    target = tmp_path / "profiles-activate.env"
    target.write_text("", encoding="utf-8")
    monkeypatch.setenv("KODO_SETTINGS_DOTENV_PATH", str(target))
    return target


def test_activate_profile_updates_runtime_and_session(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    dotenv_path = _prepare_dotenv_path(monkeypatch, tmp_path)

    active = ProviderProfile.from_dict(
        {
            "name": "anthropic-fast",
            "provider": "anthropic",
            "model": "claude-sonnet-4-6",
            "base_url": None,
            "api_key": None,
            "goal": "balanced",
        }
    )

    captured: dict[str, object] = {}

    async def fake_activate_profile(name: str):
        captured["name"] = name

    async def fake_get_active_profile():
        return active

    async def fake_update_session_metadata(session_id: str, updates: dict[str, object], create_if_missing: bool = True):
        captured["session_id"] = session_id
        captured["updates"] = updates
        captured["create_if_missing"] = create_if_missing
        return updates

    monkeypatch.setattr(profiles_api.profile_manager, "activate_profile", fake_activate_profile)
    monkeypatch.setattr(profiles_api.profile_manager, "get_active_profile", fake_get_active_profile)
    monkeypatch.setattr(profiles_api.memory_manager, "update_session_metadata", fake_update_session_metadata)

    response = client.post(
        "/api/profiles/anthropic-fast/activate",
        json={"session_id": "session-abc", "persist": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["activated"] is True
    assert payload["model_override_updated"] is True

    assert os.getenv("PRIMARY_PROVIDER") == "anthropic"
    assert os.getenv("MODEL") == "claude-sonnet-4-6"
    assert os.getenv("ROUTER_MODE") == "fixed"

    updates = captured.get("updates")
    assert isinstance(updates, dict)
    assert updates.get("model_override") == "claude-sonnet-4-6"

    persisted = dotenv_path.read_text(encoding="utf-8")
    assert "PRIMARY_PROVIDER" in persisted and "anthropic" in persisted
    assert "MODEL" in persisted and "claude-sonnet-4-6" in persisted


def test_activate_ollama_profile_updates_big_small_models(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    _prepare_dotenv_path(monkeypatch, tmp_path)

    active = ProviderProfile.from_dict(
        {
            "name": "ollama-gemma",
            "provider": "ollama",
            "model": "gemma4:e2b",
            "base_url": None,
            "api_key": None,
            "goal": "balanced",
        }
    )

    async def fake_activate_profile(name: str):
        return None

    async def fake_get_active_profile():
        return active

    monkeypatch.setattr(profiles_api.profile_manager, "activate_profile", fake_activate_profile)
    monkeypatch.setattr(profiles_api.profile_manager, "get_active_profile", fake_get_active_profile)

    response = client.post(
        "/api/profiles/ollama-gemma/activate",
        json={"persist": False},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["activated"] is True

    assert os.getenv("PRIMARY_PROVIDER") == "ollama"
    assert os.getenv("MODEL") == "gemma4:e2b"
    assert os.getenv("BIG_MODEL") == "gemma4:e2b"
    assert os.getenv("SMALL_MODEL") == "gemma4:e2b"
