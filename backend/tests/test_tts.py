from __future__ import annotations

import pytest

import api.tts as tts_mod
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_tts_disabled_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    """TTS endpoint returns 404 when the feature flag is off."""
    monkeypatch.setenv("KODO_ENABLE_TTS", "0")
    r = client.post("/api/tts", json={"text": "Hello"})
    assert r.status_code == 404


def test_tts_no_key_returns_4xx(monkeypatch: pytest.MonkeyPatch) -> None:
    """TTS endpoint returns a 4xx error when OPENAI_API_KEY is not configured."""
    monkeypatch.setenv("KODO_ENABLE_TTS", "1")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = client.post("/api/tts", json={"text": "Hello", "voice": "nova"})
    assert r.status_code in (400, 422)


def test_tts_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """TTS returns 200 audio/mpeg when the upstream call succeeds."""
    monkeypatch.setenv("KODO_ENABLE_TTS", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    class _FakeResponse:
        status_code = 200
        content = b"fake-audio-bytes"

        def raise_for_status(self) -> None:
            return None

    class _FakeClient:
        async def __aenter__(self) -> "_FakeClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, url: str, **kwargs: object) -> _FakeResponse:
            return _FakeResponse()

    # Must patch the name as bound in api.tts (not in the privacy module).
    # api/tts.py does: from privacy import build_httpx_async_client
    # so the live reference lives at api.tts.build_httpx_async_client.
    monkeypatch.setattr(tts_mod, "build_httpx_async_client", lambda **kwargs: _FakeClient())

    r = client.post("/api/tts", json={"text": "Hello", "voice": "nova"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/mpeg"