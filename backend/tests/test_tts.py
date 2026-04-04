from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

import api.tts as tts_module
from main import app


client = TestClient(app)


class _FakeTTSResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def raise_for_status(self) -> None:
        return None


class _FakeTTSClient:
    async def __aenter__(self) -> "_FakeTTSClient":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        return None

    async def post(self, url: str, json: dict[str, Any]) -> _FakeTTSResponse:
        # Validate normalized voice and avoid external HTTP in CI.
        assert url.endswith("/audio/speech")
        assert json.get("voice") == "nova"
        return _FakeTTSResponse(b"fake-mp3")


def test_tts_disabled_returns_404(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_TTS", "0")
    response = client.post("/api/tts", json={"text": "Hello"})
    assert response.status_code == 404


def test_tts_no_key_returns_422(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_TTS", "1")
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = client.post("/api/tts", json={"text": "Hello", "voice": "nova"})
    assert response.status_code == 422


def test_tts_invalid_voice_falls_back(monkeypatch):
    # Invalid voices should normalize to 'nova' and avoid validation errors.
    monkeypatch.setenv("KODO_ENABLE_TTS", "1")
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(tts_module, "build_httpx_async_client", lambda **kwargs: _FakeTTSClient())
    response = client.post("/api/tts", json={"text": "Hello", "voice": "invalid_voice_xyz"})
    assert response.status_code == 200
