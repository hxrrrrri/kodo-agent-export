from __future__ import annotations

import importlib.util

import pytest

from tools.screenshot import ScreenshotTool


tool = ScreenshotTool()


@pytest.mark.asyncio
async def test_screenshot_disabled(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_SCREENSHOT", "0")
    result = await tool.execute(url="https://example.com")
    assert result.success is False
    assert "disabled" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_screenshot_non_http_url_rejected(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_SCREENSHOT", "1")
    result = await tool.execute(url="file:///etc/passwd")
    assert result.success is False
    assert "http" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_screenshot_playwright_missing_returns_instructions(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_SCREENSHOT", "1")
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: None)
    result = await tool.execute(url="https://example.com")
    assert result.success is False
    assert "playwright" in (result.error or "").lower()
