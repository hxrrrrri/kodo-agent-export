from __future__ import annotations

import pytest

from utils import webhook_delivery


class _FakeResponse:
    def __init__(self, status_code: int, text: str = "") -> None:
        self.status_code = status_code
        self.text = text


class _FakeClient:
    def __init__(self, responder):
        self._responder = responder

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, content: bytes, headers: dict[str, str]):
        return await self._responder(url=url, content=content, headers=headers)


@pytest.mark.asyncio
async def test_send_signed_webhook_adds_signature_and_custom_headers(monkeypatch):
    monkeypatch.setattr(
        webhook_delivery,
        "_RECENT_DELIVERIES",
        webhook_delivery._RecentDeliveryStore(max_size=100, ttl_seconds=60),
    )

    captured: dict[str, object] = {}

    async def responder(url: str, content: bytes, headers: dict[str, str]):
        captured["url"] = url
        captured["content"] = content
        captured["headers"] = headers
        return _FakeResponse(202, "accepted")

    def fake_client_factory(**kwargs):
        return _FakeClient(responder)

    monkeypatch.setattr(webhook_delivery, "build_httpx_async_client", fake_client_factory)

    result = await webhook_delivery.send_signed_webhook(
        url="https://hooks.example.com/callback",
        payload={"ok": True},
        secret="super-secret",
        timeout_seconds=3.0,
        retries=0,
        delivery_id="evt-1",
        extra_headers={
            "X-Custom": "hello",
            "X-Kodo-Webhook-Event": "tampered",
        },
    )

    assert result["success"] is True
    headers = captured["headers"]
    assert isinstance(headers, dict)
    assert headers["X-Custom"] == "hello"
    assert headers["X-Kodo-Webhook-Event"] == "krawlx.crawl.completed"
    assert headers["X-Kodo-Webhook-Signature-Alg"] == "sha256"

    content = captured["content"]
    assert isinstance(content, bytes)
    expected_signature = webhook_delivery._build_signature(
        "super-secret",
        int(headers["X-Kodo-Webhook-Timestamp"]),
        headers["X-Kodo-Webhook-Nonce"],
        headers["X-Kodo-Webhook-Id"],
        content,
    )
    assert headers["X-Kodo-Webhook-Signature"] == expected_signature
    assert captured["url"] == "https://hooks.example.com/callback"


@pytest.mark.asyncio
async def test_send_signed_webhook_dedupes_delivery_id(monkeypatch):
    monkeypatch.setattr(
        webhook_delivery,
        "_RECENT_DELIVERIES",
        webhook_delivery._RecentDeliveryStore(max_size=100, ttl_seconds=60),
    )

    call_count = 0

    async def responder(url: str, content: bytes, headers: dict[str, str]):
        nonlocal call_count
        call_count += 1
        return _FakeResponse(200, "ok")

    def fake_client_factory(**kwargs):
        return _FakeClient(responder)

    monkeypatch.setattr(webhook_delivery, "build_httpx_async_client", fake_client_factory)

    first = await webhook_delivery.send_signed_webhook(
        url="https://hooks.example.com/callback",
        payload={"run": 1},
        secret=None,
        timeout_seconds=2.0,
        retries=0,
        delivery_id="evt-dedupe",
    )
    second = await webhook_delivery.send_signed_webhook(
        url="https://hooks.example.com/callback",
        payload={"run": 2},
        secret=None,
        timeout_seconds=2.0,
        retries=0,
        delivery_id="evt-dedupe",
    )

    assert first["success"] is True
    assert second["success"] is True
    assert second["deduped"] is True
    assert second["status_code"] == 208
    assert second["attempts"] == 0
    assert call_count == 1


@pytest.mark.asyncio
async def test_send_signed_webhook_retries_and_reports_failure(monkeypatch):
    monkeypatch.setattr(
        webhook_delivery,
        "_RECENT_DELIVERIES",
        webhook_delivery._RecentDeliveryStore(max_size=100, ttl_seconds=60),
    )

    attempts: list[int] = []
    statuses = [500, 502, 503]

    async def responder(url: str, content: bytes, headers: dict[str, str]):
        attempt_number = len(attempts)
        attempts.append(attempt_number)
        return _FakeResponse(statuses[min(attempt_number, len(statuses) - 1)], "server-error")

    async def fast_sleep(seconds: float) -> None:
        return

    def fake_client_factory(**kwargs):
        return _FakeClient(responder)

    monkeypatch.setattr(webhook_delivery, "build_httpx_async_client", fake_client_factory)
    monkeypatch.setattr(webhook_delivery.asyncio, "sleep", fast_sleep)

    result = await webhook_delivery.send_signed_webhook(
        url="https://hooks.example.com/callback",
        payload={"ok": False},
        secret="s",
        timeout_seconds=2.0,
        retries=2,
        delivery_id="evt-fail",
    )

    assert result["success"] is False
    assert result["attempts"] == 3
    assert "HTTP" in (result["error"] or "")
    assert len(attempts) == 3


@pytest.mark.asyncio
async def test_send_signed_webhook_rejects_invalid_header_value(monkeypatch):
    monkeypatch.setattr(
        webhook_delivery,
        "_RECENT_DELIVERIES",
        webhook_delivery._RecentDeliveryStore(max_size=100, ttl_seconds=60),
    )

    def fake_client_factory(**kwargs):
        raise AssertionError("network should not be called for invalid headers")

    monkeypatch.setattr(webhook_delivery, "build_httpx_async_client", fake_client_factory)

    with pytest.raises(ValueError):
        await webhook_delivery.send_signed_webhook(
            url="https://hooks.example.com/callback",
            payload={"ok": True},
            secret=None,
            timeout_seconds=1.0,
            retries=0,
            extra_headers={"X-Bad": "line1\nline2"},
        )
