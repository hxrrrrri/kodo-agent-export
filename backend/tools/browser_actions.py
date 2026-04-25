"""
Granular browser action tools.

Replaces the single-tool `BrowserHarnessTool` (which required the LLM to write
Python code via exec()) with a fleet of focused, schema-typed tools that map
1:1 to the browser-harness helpers. This is dramatically more reliable for
weak/local models and avoids exec() security risk.

Each tool auto-starts the daemon if not running and gates on the
BROWSER_HARNESS feature flag.
"""

from __future__ import annotations

import json as _json
from typing import Any

from privacy import feature_enabled

from .base import BaseTool, ToolResult


async def _ensure_daemon():
    """Lazy-start the daemon if not running; surface a clear error."""
    if not feature_enabled("BROWSER_HARNESS", default="0"):
        raise RuntimeError(
            "Browser is disabled. Enable 'Browser Harness (Beta)' in Settings → Feature flags."
        )
    from api.browser_admin import get_daemon
    d = await get_daemon()
    if not d.is_running:
        await d.start()
    return d


def _ok(value: Any, summary: str | None = None) -> ToolResult:
    out = summary if summary is not None else (
        _json.dumps(value, default=str)[:4000] if not isinstance(value, str) else value[:4000]
    )
    return ToolResult(success=True, output=out, metadata={"value": value})


def _err(msg: str) -> ToolResult:
    return ToolResult(success=False, output="", error=msg)


# ── browser_open ─────────────────────────────────────────────────────────────

class BrowserOpenTool(BaseTool):
    name = "browser_open"
    description = (
        "Start the browser (if needed) and navigate to a URL. Returns the page "
        "title, URL, and a list of relevant domain-skill files for this site. "
        "Use this as the FIRST tool when working with a website."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Full URL including https://"},
            "wait_for_load": {"type": "boolean", "default": True, "description": "Wait for the page to finish loading"},
        },
        "required": ["url"],
    }

    async def execute(self, url: str, wait_for_load: bool = True, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import goto_url, wait_for_load as wfl, page_info
            r = await goto_url(url)
            if wait_for_load:
                await wfl(timeout=15.0)
            info = await page_info()
            return _ok(
                {"navigated": r, "page": info},
                f"Opened {url}\nTitle: {info.get('title', '?')}\nDomain skills: {', '.join(r.get('domain_skills', []) or ['(none)'])}",
            )
        except Exception as exc:
            return _err(str(exc))


# ── browser_screenshot ───────────────────────────────────────────────────────

class BrowserScreenshotTool(BaseTool):
    name = "browser_screenshot"
    description = (
        "Capture the current page as a PNG screenshot. Returns the on-disk path. "
        "Use this when you need to SEE the page to plan clicks. Always call after navigation."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "full": {"type": "boolean", "default": False, "description": "Capture full scroll height (not just viewport)"},
        },
    }

    async def execute(self, full: bool = False, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import capture_screenshot
            path = await capture_screenshot(full=full)
            return _ok({"path": path}, f"Screenshot saved to {path}")
        except Exception as exc:
            return _err(str(exc))


# ── browser_click ────────────────────────────────────────────────────────────

class BrowserClickTool(BaseTool):
    name = "browser_click"
    description = (
        "Click an element. Use either CSS selector OR x,y coordinates. "
        "Selector is more reliable when the element has a stable id/class. "
        "Coordinates are useful after seeing a screenshot."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "selector": {"type": "string", "description": "CSS selector (preferred). e.g. 'button.submit', '#login'"},
            "x": {"type": "number", "description": "Click X coordinate (alternative to selector)"},
            "y": {"type": "number", "description": "Click Y coordinate (alternative to selector)"},
            "button": {"type": "string", "default": "left", "enum": ["left", "right", "middle"]},
            "clicks": {"type": "integer", "default": 1, "description": "1 for single, 2 for double-click"},
        },
    }

    async def execute(self, selector: str | None = None, x: float | None = None, y: float | None = None,
                      button: str = "left", clicks: int = 1, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import click_selector, click_at_xy
            if selector:
                ok = await click_selector(selector)
                if not ok:
                    return _err(f"No visible element matched selector: {selector}")
                return _ok({"clicked": selector}, f"Clicked '{selector}'")
            if x is None or y is None:
                return _err("Provide either a selector or both x and y coordinates")
            await click_at_xy(float(x), float(y), button=button, clicks=int(clicks))
            return _ok({"clicked_at": [x, y]}, f"Clicked at ({x}, {y})")
        except Exception as exc:
            return _err(str(exc))


# ── browser_type ─────────────────────────────────────────────────────────────

class BrowserTypeTool(BaseTool):
    name = "browser_type"
    description = (
        "Type text into the currently focused input. Optionally provide a "
        "selector to click+focus an input first, clear it, then type."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "Text to type"},
            "selector": {"type": "string", "description": "Optional CSS selector to focus first"},
            "press_enter": {"type": "boolean", "default": False, "description": "Press Enter after typing"},
        },
        "required": ["text"],
    }

    async def execute(self, text: str, selector: str | None = None, press_enter: bool = False, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import fill_input, type_text, press_key
            if selector:
                ok = await fill_input(selector, text)
                if not ok:
                    return _err(f"No element matched selector: {selector}")
            else:
                await type_text(text)
            if press_enter:
                await press_key("Enter")
            return _ok({"typed": len(text)}, f"Typed {len(text)} chars" + (" + Enter" if press_enter else ""))
        except Exception as exc:
            return _err(str(exc))


# ── browser_press_key ────────────────────────────────────────────────────────

class BrowserPressKeyTool(BaseTool):
    name = "browser_press_key"
    description = (
        "Press a single key. For special keys use names: Enter, Tab, Escape, "
        "Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "key": {"type": "string", "description": "Key name or single character"},
            "modifiers": {
                "type": "integer", "default": 0,
                "description": "Bitfield: 1=Alt, 2=Ctrl, 4=Meta/Cmd, 8=Shift",
            },
        },
        "required": ["key"],
    }

    async def execute(self, key: str, modifiers: int = 0, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import press_key
            await press_key(key, int(modifiers))
            return _ok({"pressed": key, "modifiers": modifiers}, f"Pressed {key}")
        except Exception as exc:
            return _err(str(exc))


# ── browser_scroll ───────────────────────────────────────────────────────────

class BrowserScrollTool(BaseTool):
    name = "browser_scroll"
    description = "Scroll the page by a delta. Negative dy scrolls down, positive scrolls up."
    input_schema = {
        "type": "object",
        "properties": {
            "dy": {"type": "number", "default": -300, "description": "Vertical scroll delta (negative = down)"},
            "dx": {"type": "number", "default": 0, "description": "Horizontal scroll delta"},
            "x": {"type": "number", "default": 400, "description": "Pivot X coordinate"},
            "y": {"type": "number", "default": 300, "description": "Pivot Y coordinate"},
        },
    }

    async def execute(self, dy: float = -300, dx: float = 0, x: float = 400, y: float = 300, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import scroll
            await scroll(x, y, dy=dy, dx=dx)
            return _ok({"dy": dy, "dx": dx}, f"Scrolled ({dx}, {dy})")
        except Exception as exc:
            return _err(str(exc))


# ── browser_eval_js ──────────────────────────────────────────────────────────

class BrowserEvalJsTool(BaseTool):
    name = "browser_eval_js"
    description = (
        "Evaluate JavaScript in the current page context. Returns the value. "
        "Use 'return ...' to return a value from a multi-statement expression."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "expression": {"type": "string", "description": "JS expression"},
        },
        "required": ["expression"],
    }

    async def execute(self, expression: str, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import js
            value = await js(expression)
            return _ok(value, _json.dumps(value, default=str)[:4000])
        except Exception as exc:
            return _err(str(exc))


# ── browser_extract ──────────────────────────────────────────────────────────

class BrowserExtractTool(BaseTool):
    name = "browser_extract"
    description = (
        "Extract text content from the page. Use a CSS selector to target a "
        "specific element, or omit to grab the full body innerText."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "selector": {"type": "string", "default": "body", "description": "CSS selector"},
            "max_chars": {"type": "integer", "default": 8000, "description": "Truncate output"},
        },
    }

    async def execute(self, selector: str = "body", max_chars: int = 8000, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import extract_text
            text = await extract_text(selector)
            truncated = text[: int(max_chars)]
            return _ok(truncated, truncated)
        except Exception as exc:
            return _err(str(exc))


# ── browser_page_info ────────────────────────────────────────────────────────

class BrowserPageInfoTool(BaseTool):
    name = "browser_page_info"
    description = "Return current page metadata: url, title, viewport size, scroll position, and full page dimensions."
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import page_info
            info = await page_info()
            return _ok(info, _json.dumps(info, default=str)[:2000])
        except Exception as exc:
            return _err(str(exc))


# ── browser_tabs ─────────────────────────────────────────────────────────────

class BrowserTabsTool(BaseTool):
    name = "browser_tabs"
    description = "List, switch, create, or close browser tabs."
    input_schema = {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["list", "switch", "new", "close"], "description": "Operation"},
            "target_id": {"type": "string", "description": "Tab targetId (for switch/close)"},
            "url": {"type": "string", "description": "URL for new tab"},
        },
        "required": ["action"],
    }

    async def execute(self, action: str, target_id: str | None = None, url: str | None = None, **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import list_tabs, switch_tab, new_tab, close_tab
            if action == "list":
                tabs = await list_tabs(include_chrome=False)
                return _ok(tabs, _json.dumps(tabs, default=str)[:2000])
            if action == "switch":
                if not target_id:
                    return _err("target_id required")
                sid = await switch_tab(target_id)
                return _ok({"session_id": sid}, f"Switched to {target_id}")
            if action == "new":
                tid = await new_tab(url or "about:blank")
                return _ok({"target_id": tid}, f"New tab: {tid}")
            if action == "close":
                if not target_id:
                    return _err("target_id required")
                ok = await close_tab(target_id)
                return _ok({"closed": ok}, f"Closed: {ok}")
            return _err(f"unknown action: {action}")
        except Exception as exc:
            return _err(str(exc))


# ── browser_skill ────────────────────────────────────────────────────────────

class BrowserSkillTool(BaseTool):
    name = "browser_skill"
    description = (
        "Read a domain-specific or interaction skill markdown file. Use AFTER "
        "browser_open returned domain_skills, or to look up patterns like "
        "'dialogs.md', 'iframes.md', 'downloads.md'. Action 'list' enumerates them."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["list", "read"], "default": "read"},
            "domain": {"type": "string", "description": "Domain name like 'amazon', 'github'"},
            "skill": {"type": "string", "description": "Skill filename (e.g. 'search.md')"},
        },
    }

    async def execute(self, action: str = "read", domain: str | None = None, skill: str | None = None, **_) -> ToolResult:
        try:
            from browser.helpers import (
                list_domain_skills, list_interaction_skills, read_skill,
            )
            if action == "list":
                if domain:
                    items = list_domain_skills(domain)
                    return _ok({"domain": domain, "skills": items}, ", ".join(items) or "(none)")
                items = list_interaction_skills()
                return _ok({"interaction_skills": items}, ", ".join(items) or "(none)")
            # action == "read"
            if not skill:
                return _err("skill filename required")
            content = read_skill(domain, skill) if domain else read_skill(skill)
            if content is None:
                return _err(f"Skill not found: {domain or '<interaction>'}/{skill}")
            return _ok(content, content[:6000])
        except Exception as exc:
            return _err(str(exc))


# ── browser_dialog ───────────────────────────────────────────────────────────

class BrowserDialogTool(BaseTool):
    name = "browser_dialog"
    description = "Accept or dismiss a native JavaScript dialog (alert/confirm/prompt) blocking the page."
    input_schema = {
        "type": "object",
        "properties": {
            "accept": {"type": "boolean", "default": True},
            "prompt_text": {"type": "string", "default": "", "description": "For prompt() dialogs"},
        },
    }

    async def execute(self, accept: bool = True, prompt_text: str = "", **_) -> ToolResult:
        try:
            await _ensure_daemon()
            from browser.helpers import handle_dialog
            await handle_dialog(accept=accept, prompt_text=prompt_text)
            return _ok({"accepted": accept}, "Dialog handled")
        except Exception as exc:
            return _err(str(exc))


# Public list — wired into tools/__init__.py
BROWSER_ACTION_TOOLS: list[BaseTool] = [
    BrowserOpenTool(),
    BrowserScreenshotTool(),
    BrowserClickTool(),
    BrowserTypeTool(),
    BrowserPressKeyTool(),
    BrowserScrollTool(),
    BrowserEvalJsTool(),
    BrowserExtractTool(),
    BrowserPageInfoTool(),
    BrowserTabsTool(),
    BrowserSkillTool(),
    BrowserDialogTool(),
]
