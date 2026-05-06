from __future__ import annotations

import os
from pathlib import Path

from fastapi.testclient import TestClient

import api.providers as providers_api
from main import app


client = TestClient(app)


def _prepare_dotenv_path(monkeypatch, tmp_path: Path) -> Path:
    target = tmp_path / "switch.env"
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


def test_switch_provider_updates_runtime_and_session(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-test")
    dotenv_path = _prepare_dotenv_path(monkeypatch, tmp_path)
    captured = _mock_profile_and_memory(monkeypatch)

    response = client.post(
        "/api/providers/switch",
        json={
            "provider": "openai",
            "model": "gpt-4o-mini",
            "session_id": "session-switch-1",
            "persist": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "openai"
    assert payload["model"] == "gpt-4o-mini"
    assert payload["router_mode"] == "fixed"

    assert os.getenv("PRIMARY_PROVIDER") == "openai"
    assert os.getenv("MODEL") == "gpt-4o-mini"
    assert os.getenv("ROUTER_MODE") == "fixed"

    assert captured.get("active_profile") == "quick-openai"
    updates = captured.get("updates")
    assert isinstance(updates, dict)
    assert updates.get("model_override") == "gpt-4o-mini"

    persisted = dotenv_path.read_text(encoding="utf-8")
    assert "PRIMARY_PROVIDER" in persisted and "openai" in persisted
    assert "MODEL" in persisted and "gpt-4o-mini" in persisted


def test_switch_ollama_uses_discovered_model_when_unspecified(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    _prepare_dotenv_path(monkeypatch, tmp_path)
    _mock_profile_and_memory(monkeypatch)

    async def fake_list_available_models(provider: str):
        assert provider == "ollama"
        return ["gemma4:e2b", "gemma3:4b"]

    monkeypatch.setattr(providers_api, "list_available_models", fake_list_available_models)

    response = client.post(
        "/api/providers/switch",
        json={
            "provider": "ollama",
            "persist": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "ollama"
    assert payload["model"] == "gemma4:e2b"

    assert os.getenv("PRIMARY_PROVIDER") == "ollama"
    assert os.getenv("MODEL") == "gemma4:e2b"
    assert os.getenv("BIG_MODEL") == "gemma4:e2b"
    assert os.getenv("SMALL_MODEL") == "gemma4:e2b"


def test_switch_codex_api_falls_back_to_local_codex_cli(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("CODEX_API_KEY", raising=False)
    _prepare_dotenv_path(monkeypatch, tmp_path)
    captured = _mock_profile_and_memory(monkeypatch)

    def fake_provider_configured(provider: str, request):
        return provider == "codex-cli"

    monkeypatch.setattr(providers_api, "_provider_configured", fake_provider_configured)

    response = client.post(
        "/api/providers/switch",
        json={
            "provider": "codex",
            "model": "gpt-4o",
            "session_id": "session-codex-cli",
            "persist": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "codex-cli"
    assert payload["model"] == "default"

    assert os.getenv("PRIMARY_PROVIDER") == "codex-cli"
    assert os.getenv("MODEL") == "default"
    assert captured.get("active_profile") == "quick-codex-cli"


def test_switch_codex_cli_resets_stale_api_model(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    _prepare_dotenv_path(monkeypatch, tmp_path)
    _mock_profile_and_memory(monkeypatch)

    def fake_provider_configured(provider: str, request):
        return provider == "codex-cli"

    monkeypatch.setattr(providers_api, "_provider_configured", fake_provider_configured)

    response = client.post(
        "/api/providers/switch",
        json={
            "provider": "codex-cli",
            "model": "gpt-4o",
            "persist": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "codex-cli"
    assert payload["model"] == "default"


def test_switch_claude_cli_preserves_valid_selected_model(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    _prepare_dotenv_path(monkeypatch, tmp_path)
    _mock_profile_and_memory(monkeypatch)

    def fake_provider_configured(provider: str, request):
        return provider == "claude-cli"

    monkeypatch.setattr(providers_api, "_provider_configured", fake_provider_configured)
    monkeypatch.setattr(
        providers_api,
        "list_cli_models",
        lambda provider: ["default", "claude-sonnet-4-6", "claude-opus-4-1"] if provider == "claude-cli" else ["default"],
    )

    response = client.post(
        "/api/providers/switch",
        json={
            "provider": "claude-cli",
            "model": "claude-opus-4-1",
            "persist": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "claude-cli"
    assert payload["model"] == "claude-opus-4-1"


def test_cli_models_endpoint_returns_cli_catalog(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.setattr(
        providers_api,
        "list_cli_models",
        lambda provider: ["default", f"{provider}-model"],
    )

    response = client.get("/api/providers/cli-models")

    assert response.status_code == 200
    payload = response.json()
    assert payload["models"]["gemini-cli"] == ["default", "gemini-cli-model"]
    assert payload["models"]["copilot-cli"] == ["default", "copilot-cli-model"]


def test_discover_reads_firecrawl_key_from_override_header(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)

    async def fake_discover_local_providers():
        return {"ollama": False, "atomic_chat": False}

    monkeypatch.setattr(providers_api, "discover_local_providers", fake_discover_local_providers)

    response = client.get(
        "/api/providers/discover",
        headers={"X-Kodo-Keys": '{"FIRECRAWL_API_KEY":"fc-user-key"}'},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["key_status"]["firecrawl"] is True
