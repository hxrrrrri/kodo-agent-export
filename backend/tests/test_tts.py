from __future__ import annotations

import os

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_tts_disabled_returns_404(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_TTS", "0")
    response = client.post("/api/tts", json={"text": "Hello"})
    assert response.status_code == 404


def test_tts_no_key_returns_422(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_TTS", "1")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = client.post("/api/tts", json={"text": "Hello", "voice": "nova"})
    assert response.status_code == 422


def test_tts_invalid_voice_falls_back(monkeypatch):
    # Invalid voices should normalize to 'nova' and avoid validation errors.
    monkeypatch.setenv("KODO_ENABLE_TTS", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    response = client.post("/api/tts", json={"text": "Hello", "voice": "invalid_voice_xyz"})
    assert response.status_code in (200, 502)
