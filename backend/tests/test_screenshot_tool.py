from __future__ import annotations

import importlib
import os
from unittest.mock import patch

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
    os.environ["KODO_ENABLE_SCREENSHOT"] = "1"
    patch_targets = {
        "playwright": None,
        "playwright.async_api": None,
    }

    with patch.dict("sys.modules", patch_targets):
        import tools.screenshot as sc_mod

        importlib.reload(sc_mod)
        tool_fresh = sc_mod.ScreenshotTool()
        result = await tool_fresh.execute(url="https://example.com")

    import tools.screenshot as sc_mod_restored

    importlib.reload(sc_mod_restored)
    assert result.success is False
    assert "playwright" in (result.error or "").lower()
    os.environ.pop("KODO_ENABLE_SCREENSHOT", None)
