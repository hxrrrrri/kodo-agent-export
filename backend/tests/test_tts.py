from __future__ import annotations

import os

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_tts_disabled_returns_404():
    """TTS endpoint returns 404 when feature flag is off."""
    os.environ["KODO_ENABLE_TTS"] = "0"
    r = client.post("/api/tts", json={"text": "Hello"})
    assert r.status_code == 404
    os.environ.pop("KODO_ENABLE_TTS", None)


def test_tts_no_key_returns_400():
    """TTS endpoint returns 400 when OPENAI_API_KEY is not set."""
    os.environ["KODO_ENABLE_TTS"] = "1"
    os.environ.pop("OPENAI_API_KEY", None)
    r = client.post("/api/tts", json={"text": "Hello", "voice": "nova"})
    assert r.status_code == 400
    os.environ.pop("KODO_ENABLE_TTS", None)


def test_tts_invalid_voice_returns_422():
    """Pydantic rejects unrecognised voice names with 422."""
    os.environ["KODO_ENABLE_TTS"] = "1"
    os.environ["OPENAI_API_KEY"] = "test-key"
    r = client.post("/api/tts", json={"text": "Hello", "voice": "invalid_voice_xyz"})
    assert r.status_code == 422
    os.environ.pop("KODO_ENABLE_TTS", None)
    os.environ.pop("OPENAI_API_KEY", None)


def test_tts_valid_request_attempts_openai():
    """With TTS enabled and a key set, a valid request reaches the OpenAI call.
    Without a real key it fails at the network layer (502), not validation (422/400/404).
    """
    os.environ["KODO_ENABLE_TTS"] = "1"
    os.environ["OPENAI_API_KEY"] = "sk-fake-key-for-testing"
    r = client.post("/api/tts", json={"text": "Hello", "voice": "nova"})
    # Reaches OpenAI → fails with auth/network error → 502
    assert r.status_code == 502
    os.environ.pop("KODO_ENABLE_TTS", None)
    os.environ.pop("OPENAI_API_KEY", None)