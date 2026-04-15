from __future__ import annotations

import json

from fastapi.testclient import TestClient

import api.krawlx as krawlx_api
from main import app
from tools.base import ToolResult


client = TestClient(app)


def test_krawlx_disabled_returns_404(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_KRAWLX", "0")

    response = client.post("/api/krawlx/crawl", json={"url": "https://example.com"})

    assert response.status_code == 404


def test_krawlx_requires_auth_when_configured(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_KRAWLX", "1")
    monkeypatch.setenv("API_AUTH_TOKEN", "secret-token")

    response = client.post("/api/krawlx/crawl", json={"url": "https://example.com"})

    assert response.status_code == 401


def test_krawlx_success_response(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_KRAWLX", "1")
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    async def fake_execute(self, **kwargs):
        payload = {
            "seed_url": "https://example.com",
            "pages": [
                {
                    "url": "https://example.com",
                    "title": "Home",
                    "status_code": 200,
                    "depth": 0,
                    "text_excerpt": "Welcome",
                }
            ],
            "blocked": [],
            "errors": [],
            "stats": {
                "pages_fetched": 1,
                "visited_urls": 1,
                "blocked_urls": 0,
                "errors": 0,
            },
        }
        return ToolResult(
            success=True,
            output=json.dumps(payload),
            metadata={"seed_url": "https://example.com"},
        )

    monkeypatch.setattr(krawlx_api.KrawlXTool, "execute", fake_execute)

    response = client.post(
        "/api/krawlx/crawl",
        json={
            "url": "https://example.com",
            "max_pages": 1,
            "max_depth": 0,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["stats"]["pages_fetched"] == 1


def test_krawlx_rejects_invalid_callback_url(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_KRAWLX", "1")
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    async def fake_validate(url: str) -> str:
        raise ValueError("Host is blocked by policy")

    monkeypatch.setattr(krawlx_api, "_validate_callback_target", fake_validate)

    response = client.post(
        "/api/krawlx/crawl",
        json={
            "url": "https://example.com",
            "callback_url": "https://localhost/hook",
        },
    )

    assert response.status_code == 400
    detail = response.json().get("detail", "")
    assert "Invalid callback_url" in detail


def test_krawlx_callback_delivery_included_in_response(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_KRAWLX", "1")
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    async def fake_execute(self, **kwargs):
        payload = {
            "seed_url": "https://example.com",
            "pages": [
                {
                    "url": "https://example.com",
                    "title": "Home",
                    "status_code": 200,
                    "depth": 0,
                    "text_excerpt": "Welcome",
                }
            ],
            "blocked": [],
            "errors": [],
            "stats": {
                "pages_fetched": 1,
                "visited_urls": 1,
                "blocked_urls": 0,
                "errors": 0,
            },
        }
        return ToolResult(
            success=True,
            output=json.dumps(payload),
            metadata={"seed_url": "https://example.com"},
        )

    async def fake_validate(url: str) -> str:
        return "https://hooks.example.com/krawlx"

    captured: dict[str, object] = {}

    async def fake_send_signed_webhook(**kwargs):
        captured.update(kwargs)
        return {
            "success": True,
            "delivery_id": "evt-123",
            "status_code": 202,
            "attempts": 1,
        }

    monkeypatch.setattr(krawlx_api.KrawlXTool, "execute", fake_execute)
    monkeypatch.setattr(krawlx_api, "_validate_callback_target", fake_validate)
    monkeypatch.setattr(krawlx_api, "send_signed_webhook", fake_send_signed_webhook)

    response = client.post(
        "/api/krawlx/crawl",
        json={
            "url": "https://example.com",
            "max_pages": 1,
            "max_depth": 0,
            "callback_url": "https://hooks.example.com/krawlx",
            "callback_secret": "secret",
            "callback_event_id": "evt-123",
            "callback_retries": 1,
            "callback_timeout_seconds": 5,
            "callback_headers": {
                "X-Custom": "value",
                "": "ignored",
                "X-Blank": "   ",
            },
        },
    )

    assert response.status_code == 200

    payload = response.json()
    assert payload["success"] is True
    assert payload["callback_delivery"]["success"] is True

    assert captured["url"] == "https://hooks.example.com/krawlx"
    assert captured["secret"] == "secret"
    assert captured["delivery_id"] == "evt-123"
    assert captured["timeout_seconds"] == 5.0
    assert captured["retries"] == 1
    assert captured["event_type"] == "krawlx.crawl.completed"
    assert captured["extra_headers"] == {"X-Custom": "value"}
