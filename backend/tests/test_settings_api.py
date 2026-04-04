from __future__ import annotations

import os

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_settings_patch_updates_env_and_persists(tmp_path, monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    env_path = tmp_path / ".env"
    env_path.write_text("KODO_ENABLE_TTS=0\nROUTER_MODE=fixed\n", encoding="utf-8")
    monkeypatch.setenv("KODO_SETTINGS_DOTENV_PATH", str(env_path))

    response = client.patch(
        "/api/settings",
        json={"kodo_enable_tts": True, "router_mode": "smart"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["updated"]["kodo_enable_tts"] == "1"
    assert payload["updated"]["router_mode"] == "smart"
    assert os.environ.get("KODO_ENABLE_TTS") == "1"
    assert os.environ.get("ROUTER_MODE") == "smart"

    saved = env_path.read_text(encoding="utf-8")
    assert "KODO_ENABLE_TTS=1" in saved
    assert "ROUTER_MODE=smart" in saved


def test_settings_patch_boolean_false_roundtrip(tmp_path, monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    env_path = tmp_path / ".env"
    env_path.write_text("KODO_ENABLE_SCREENSHOT=1\n", encoding="utf-8")
    monkeypatch.setenv("KODO_SETTINGS_DOTENV_PATH", str(env_path))

    patch_response = client.patch(
        "/api/settings",
        json={"kodo_enable_screenshot": False},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["updated"]["kodo_enable_screenshot"] == "0"

    get_response = client.get("/api/settings")
    assert get_response.status_code == 200
    assert get_response.json()["settings"]["kodo_enable_screenshot"] == "0"

    saved = env_path.read_text(encoding="utf-8")
    assert "KODO_ENABLE_SCREENSHOT=0" in saved
