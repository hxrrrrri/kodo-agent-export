import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any


KODO_DIR = Path.home() / ".kodo"
BRIDGE_DIR = KODO_DIR / "bridge"
BRIDGE_SECRET_FILE = BRIDGE_DIR / "secret.key"


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _bridge_secret() -> str:
    secret = os.getenv("BRIDGE_SECRET", "").strip()
    if secret:
        return secret

    # Fallback to API auth token when bridge secret is not explicitly provided.
    api_token = os.getenv("API_AUTH_TOKEN", "").strip()
    if api_token:
        return api_token

    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
    if BRIDGE_SECRET_FILE.exists():
        persisted = BRIDGE_SECRET_FILE.read_text(encoding="utf-8").strip()
        if persisted:
            return persisted

    generated = secrets.token_urlsafe(48)
    BRIDGE_SECRET_FILE.write_text(generated, encoding="utf-8")
    return generated


def create_bridge_token(session_id: str, ttl_seconds: int = 0) -> str:
    if ttl_seconds <= 0:
        ttl_seconds = int(os.getenv("BRIDGE_TOKEN_TTL_SECONDS", "3600"))
    now = int(time.time())
    payload: dict[str, Any] = {
        "sid": session_id,
        "iat": now,
        "exp": now + max(60, ttl_seconds),
    }
    header = {"alg": "HS256", "typ": "JWT"}

    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")

    signature = hmac.new(_bridge_secret().encode("utf-8"), signing_input, hashlib.sha256).digest()
    signature_b64 = _b64url_encode(signature)
    return f"{header_b64}.{payload_b64}.{signature_b64}"


def verify_bridge_token(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid bridge token format")

    header_b64, payload_b64, signature_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_signature = hmac.new(
        _bridge_secret().encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    if not hmac.compare_digest(_b64url_encode(expected_signature), signature_b64):
        raise ValueError("Invalid bridge token signature")

    payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Invalid bridge token payload")

    exp = int(payload.get("exp", 0) or 0)
    if exp < int(time.time()):
        raise ValueError("Bridge token has expired")

    if not str(payload.get("sid", "")).strip():
        raise ValueError("Bridge token missing session id")

    return payload
