from __future__ import annotations

import asyncio
import base64
import importlib.util
import os
from urllib.parse import urlparse

from .base import BaseTool, ToolResult


def _enabled() -> bool:
    raw = os.getenv("KODO_ENABLE_SCREENSHOT", "0").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _normalize_url(url: str) -> str:
    text = url.strip()
    if not text:
        return ""
    if "://" in text and not text.startswith(("http://", "https://")):
        return ""
    if not text.startswith(("http://", "https://")):
        text = f"https://{text}"
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return text


async def _capture_with_playwright(url: str, width: int, height: int, wait_ms: int) -> bytes:
    from playwright.async_api import async_playwright  # type: ignore

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            page = await browser.new_page(viewport={"width": width, "height": height})
            await page.goto(url, wait_until="networkidle")
            if wait_ms > 0:
                await page.wait_for_timeout(wait_ms)
            return await page.screenshot(type="png", full_page=True)
        finally:
            await browser.close()


async def _capture_with_cli(url: str, width: int, height: int, wait_ms: int) -> bytes:
    candidates = [
        "chromium",
        "chromium-browser",
        "google-chrome",
        "msedge",
        "chrome",
    ]

    args = [
        "--headless",
        "--disable-gpu",
        f"--window-size={width},{height}",
        f"--virtual-time-budget={max(0, wait_ms)}",
        "--screenshot=-",
        url,
    ]

    for candidate in candidates:
        try:
            proc = await asyncio.create_subprocess_exec(
                candidate,
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            continue

        stdout, stderr = await proc.communicate()
        if proc.returncode == 0 and stdout:
            return stdout

        error = stderr.decode("utf-8", errors="ignore").strip()
        if error:
            raise RuntimeError(error)

    raise RuntimeError("No headless browser found. Install playwright or chromium.")


class ScreenshotTool(BaseTool):
    name = "screenshot"
    description = (
        "Take a screenshot of a URL using a headless browser. "
        "Returns base64 PNG image. Useful for visual QA, UI verification, "
        "and checking what a website looks like."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to screenshot"},
            "width": {"type": "integer", "default": 1280},
            "height": {"type": "integer", "default": 800},
            "wait_ms": {
                "type": "integer",
                "default": 2000,
                "description": "Milliseconds to wait after page load",
            },
        },
        "required": ["url"],
    }

    async def execute(
        self,
        url: str,
        width: int = 1280,
        height: int = 800,
        wait_ms: int = 2000,
        **kwargs,
    ) -> ToolResult:
        if not _enabled():
            return ToolResult(
                success=False,
                output="",
                error="Screenshot tool is disabled. Set KODO_ENABLE_SCREENSHOT=1.",
            )

        target = _normalize_url(url)
        if not target:
            return ToolResult(success=False, output="", error="Invalid URL. Use http:// or https://")

        width = max(320, min(int(width or 1280), 3840))
        height = max(240, min(int(height or 800), 2160))
        wait_ms = max(0, min(int(wait_ms or 2000), 30000))

        try:
            if importlib.util.find_spec("playwright") is not None:
                png_bytes = await _capture_with_playwright(target, width, height, wait_ms)
            else:
                png_bytes = await _capture_with_cli(target, width, height, wait_ms)
        except Exception as exc:
            return ToolResult(
                success=False,
                output="",
                error=(
                    f"Screenshot failed: {exc}. Install optional dependency with "
                    "'pip install playwright' and run 'playwright install chromium'."
                ),
            )

        image_base64 = base64.b64encode(png_bytes).decode("ascii")
        return ToolResult(
            success=True,
            output=f"Screenshot captured for {target}",
            metadata={
                "url": target,
                "width": width,
                "height": height,
                "image_base64": image_base64,
            },
        )
