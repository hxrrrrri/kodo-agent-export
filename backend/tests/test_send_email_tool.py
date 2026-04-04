from __future__ import annotations

import pytest

from tools.send_email import SendEmailTool


tool = SendEmailTool()


@pytest.mark.asyncio
async def test_email_disabled(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_EMAIL", "0")
    result = await tool.execute(to="a@b.com", subject="Test", body="Hello")
    assert result.success is False
    assert "disabled" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_email_missing_smtp_host(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_EMAIL", "1")
    monkeypatch.delenv("SMTP_HOST", raising=False)
    result = await tool.execute(to="a@b.com", subject="Test", body="Hello")
    assert result.success is False
    assert "SMTP_HOST" in (result.error or "")


@pytest.mark.asyncio
async def test_email_connection_failure_returns_clean_error(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_EMAIL", "1")
    monkeypatch.setenv("SMTP_HOST", "invalid.host.kodo.test")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_FROM", "noreply@kodo.test")
    result = await tool.execute(to="a@b.com", subject="Test", body="Hello")
    assert result.success is False
    assert "failed" in (result.error or "").lower()
