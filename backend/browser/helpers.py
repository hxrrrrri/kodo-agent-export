"""
Browser control helpers — async, in-process, cross-platform.

Each helper is `async def` and calls the BrowserDaemon directly via the
singleton accessor in api.browser_admin. NO Unix sockets, NO IPC.

Mirrors the API of scratch_browser_harness/helpers.py but adapted for:
- Async/await (the daemon CDP client is async)
- Cross-platform tmp dirs (Windows-friendly)
- Action logging into the daemon's ring buffer for live UI display
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


INTERNAL_URL_PREFIXES = (
    "chrome://", "chrome-untrusted://", "devtools://",
    "chrome-extension://", "edge://", "about:",
)

SKILLS_ROOT = Path(__file__).parent
DOMAIN_SKILLS_DIR = SKILLS_ROOT / "domain-skills"
INTERACTION_SKILLS_DIR = SKILLS_ROOT / "interaction-skills"


def _tmp_path(name: str = "kodo_browser_shot.png") -> str:
    """Cross-platform tmp file path."""
    return os.path.join(tempfile.gettempdir(), name)


async def _daemon():
    from api.browser_admin import get_daemon
    d = await get_daemon()
    if not d.is_running:
        raise RuntimeError("Browser is not started. Open the Browser panel and click Start.")
    return d


async def _send(req: dict) -> dict:
    d = await _daemon()
    r = await d.handle(req)
    if "error" in r:
        raise RuntimeError(r["error"])
    return r


# ── Raw CDP ──────────────────────────────────────────────────────────────────

async def cdp(method: str, session_id: Optional[str] = None, **params) -> dict:
    """Raw CDP call. cdp('Page.navigate', url='https://...')."""
    r = await _send({"method": method, "params": params, "session_id": session_id})
    return r.get("result", {})


async def drain_events() -> list[dict]:
    """Pop accumulated CDP events."""
    return (await _send({"meta": "drain_events"}))["events"]


# ── Skills lookup ────────────────────────────────────────────────────────────

def _domain_for_url(url: str) -> str:
    host = (urlparse(url).hostname or "").removeprefix("www.")
    return host.split(".")[0] if host else ""


def list_domain_skills(domain: str) -> list[str]:
    """Return skill filenames under domain-skills/<domain>/."""
    d = DOMAIN_SKILLS_DIR / domain
    if not d.is_dir():
        return []
    return sorted(p.name for p in d.rglob("*.md"))


def list_interaction_skills() -> list[str]:
    """Return all interaction-skill filenames."""
    if not INTERACTION_SKILLS_DIR.is_dir():
        return []
    return sorted(p.name for p in INTERACTION_SKILLS_DIR.rglob("*.md"))


def read_skill(domain_or_name: str, skill_name: Optional[str] = None) -> Optional[str]:
    """Read a skill markdown file.
    - read_skill("amazon", "search.md") → domain skill
    - read_skill("dialogs.md") → interaction skill
    """
    if skill_name is None:
        # Interaction skill
        name = domain_or_name if domain_or_name.endswith(".md") else domain_or_name + ".md"
        path = INTERACTION_SKILLS_DIR / name
    else:
        name = skill_name if skill_name.endswith(".md") else skill_name + ".md"
        path = DOMAIN_SKILLS_DIR / domain_or_name / name
    if not path.exists():
        return None
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return None


# ── Navigation ───────────────────────────────────────────────────────────────

async def goto_url(url: str) -> dict:
    """Navigate the active tab to a URL. Returns {frameId, ..., domain_skills}."""
    d = await _daemon()
    r = await cdp("Page.navigate", url=url)
    domain = _domain_for_url(url)
    skills = list_domain_skills(domain) if domain else []
    d._log_action("navigate", "goto", {"url": url, "domain": domain})
    return {**r, "url": url, "domain": domain, "domain_skills": skills[:10]}


async def page_info() -> dict:
    """{url, title, w, h, sx, sy, pw, ph} — viewport + scroll + page size.
    Returns {dialog: ...} if a native dialog is blocking the page."""
    dialog = (await _send({"meta": "pending_dialog"})).get("dialog")
    if dialog:
        return {"dialog": dialog}
    r = await cdp(
        "Runtime.evaluate",
        expression=(
            "JSON.stringify({"
            "url:location.href,title:document.title,"
            "w:innerWidth,h:innerHeight,"
            "sx:scrollX,sy:scrollY,"
            "pw:document.documentElement.scrollWidth,"
            "ph:document.documentElement.scrollHeight})"
        ),
        returnByValue=True,
    )
    return json.loads(r["result"]["value"])


async def wait_for_load(timeout: float = 15.0) -> bool:
    """Poll document.readyState == 'complete'."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            state = await js("document.readyState")
            if state == "complete":
                return True
        except Exception:
            pass
        await asyncio.sleep(0.3)
    return False


# ── Input ────────────────────────────────────────────────────────────────────

async def click_at_xy(x: float, y: float, button: str = "left", clicks: int = 1) -> None:
    d = await _daemon()
    await cdp("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button=button, clickCount=clicks)
    await cdp("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button=button, clickCount=clicks)
    d._log_action("input", "click", {"x": x, "y": y, "button": button, "clicks": clicks})


async def type_text(text: str) -> None:
    d = await _daemon()
    await cdp("Input.insertText", text=text)
    d._log_action("input", "type", {"length": len(text), "preview": text[:40]})


_KEYS = {
    "Enter": (13, "Enter", "\r"), "Tab": (9, "Tab", "\t"), "Backspace": (8, "Backspace", ""),
    "Escape": (27, "Escape", ""), "Delete": (46, "Delete", ""), " ": (32, "Space", " "),
    "ArrowLeft": (37, "ArrowLeft", ""), "ArrowUp": (38, "ArrowUp", ""),
    "ArrowRight": (39, "ArrowRight", ""), "ArrowDown": (40, "ArrowDown", ""),
    "Home": (36, "Home", ""), "End": (35, "End", ""),
    "PageUp": (33, "PageUp", ""), "PageDown": (34, "PageDown", ""),
}


async def press_key(key: str, modifiers: int = 0) -> None:
    """Modifiers bitfield: 1=Alt, 2=Ctrl, 4=Meta(Cmd), 8=Shift."""
    d = await _daemon()
    vk, code, text = _KEYS.get(
        key, (ord(key[0]) if len(key) == 1 else 0, key, key if len(key) == 1 else "")
    )
    base = {
        "key": key, "code": code, "modifiers": modifiers,
        "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
    }
    await cdp("Input.dispatchKeyEvent", type="keyDown", **base, **({"text": text} if text else {}))
    if text and len(text) == 1:
        await cdp("Input.dispatchKeyEvent", type="char", text=text, **{k: v for k, v in base.items() if k != "text"})
    await cdp("Input.dispatchKeyEvent", type="keyUp", **base)
    d._log_action("input", "press_key", {"key": key, "modifiers": modifiers})


async def scroll(x: float, y: float, dy: float = -300, dx: float = 0) -> None:
    d = await _daemon()
    await cdp("Input.dispatchMouseEvent", type="mouseWheel", x=x, y=y, deltaX=dx, deltaY=dy)
    d._log_action("input", "scroll", {"dx": dx, "dy": dy})


# ── Visual ───────────────────────────────────────────────────────────────────

async def capture_screenshot(path: Optional[str] = None, full: bool = False) -> str:
    """Capture page as PNG. Stores raw bytes in daemon for live UI streaming.
    Returns the on-disk path."""
    d = await _daemon()
    r = await cdp("Page.captureScreenshot", format="png", captureBeyondViewport=bool(full))
    raw = base64.b64decode(r["data"])
    d.set_latest_screenshot(raw)
    out_path = path or _tmp_path()
    parent = os.path.dirname(out_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(raw)
    d._log_action("visual", "screenshot", {"path": out_path, "full": full, "bytes": len(raw)})
    return out_path


async def screenshot_b64(full: bool = False) -> str:
    """Return screenshot as base64 string (no disk write)."""
    d = await _daemon()
    r = await cdp("Page.captureScreenshot", format="png", captureBeyondViewport=bool(full))
    raw = base64.b64decode(r["data"])
    d.set_latest_screenshot(raw)
    d._log_action("visual", "screenshot", {"full": full, "bytes": len(raw)})
    return r["data"]


# ── Tabs ─────────────────────────────────────────────────────────────────────

async def list_tabs(include_chrome: bool = True) -> list[dict]:
    out: list[dict] = []
    targets = (await cdp("Target.getTargets"))["targetInfos"]
    for t in targets:
        if t.get("type") != "page":
            continue
        url = t.get("url", "")
        if not include_chrome and url.startswith(INTERNAL_URL_PREFIXES):
            continue
        out.append({"targetId": t["targetId"], "title": t.get("title", ""), "url": url})
    return out


async def current_tab() -> dict:
    info = (await cdp("Target.getTargetInfo")).get("targetInfo", {})
    return {
        "targetId": info.get("targetId"),
        "url": info.get("url", ""),
        "title": info.get("title", ""),
    }


async def switch_tab(target_id: str) -> str:
    d = await _daemon()
    await cdp("Target.activateTarget", targetId=target_id)
    sid = (await cdp("Target.attachToTarget", targetId=target_id, flatten=True))["sessionId"]
    await _send({"meta": "set_session", "session_id": sid})
    d._log_action("tabs", "switch", {"target_id": target_id})
    return sid


async def new_tab(url: str = "about:blank") -> str:
    d = await _daemon()
    tid = (await cdp("Target.createTarget", url="about:blank"))["targetId"]
    await switch_tab(tid)
    if url != "about:blank":
        await goto_url(url)
    d._log_action("tabs", "new", {"target_id": tid, "url": url})
    return tid


async def close_tab(target_id: str) -> bool:
    r = await cdp("Target.closeTarget", targetId=target_id)
    return bool(r.get("success", False))


async def ensure_real_tab() -> Optional[dict]:
    """Switch to the first non-internal tab, or return current if already real."""
    tabs = await list_tabs(include_chrome=False)
    if not tabs:
        return None
    try:
        cur = await current_tab()
        if cur.get("url") and not str(cur["url"]).startswith(INTERNAL_URL_PREFIXES):
            return cur
    except Exception:
        pass
    await switch_tab(tabs[0]["targetId"])
    return tabs[0]


async def iframe_target(url_substr: str) -> Optional[str]:
    """Return first iframe targetId whose URL contains the substring."""
    targets = (await cdp("Target.getTargets"))["targetInfos"]
    for t in targets:
        if t.get("type") == "iframe" and url_substr in t.get("url", ""):
            return t["targetId"]
    return None


# ── JS execution + DOM ───────────────────────────────────────────────────────

async def js(expression: str, target_id: Optional[str] = None) -> Any:
    """Run JS in the active tab (or in an iframe target)."""
    sid: Optional[str] = None
    if target_id:
        sid = (await cdp("Target.attachToTarget", targetId=target_id, flatten=True))["sessionId"]
    if "return " in expression:
        expression = f"(function(){{{expression}}})()"
    r = await cdp(
        "Runtime.evaluate",
        session_id=sid,
        expression=expression,
        returnByValue=True,
        awaitPromise=True,
    )
    return r.get("result", {}).get("value")


_KC = {
    "Enter": 13, "Tab": 9, "Escape": 27, "Backspace": 8, " ": 32,
    "ArrowLeft": 37, "ArrowUp": 38, "ArrowRight": 39, "ArrowDown": 40,
}


async def dispatch_key(selector: str, key: str = "Enter", event: str = "keypress") -> None:
    """Dispatch a synthetic DOM KeyboardEvent on a CSS selector match."""
    kc = _KC.get(key, ord(key) if len(key) == 1 else 0)
    expr = (
        "(()=>{const e=document.querySelector(" + json.dumps(selector) + ");"
        "if(e){e.focus();e.dispatchEvent(new KeyboardEvent("
        + json.dumps(event) + ",{key:" + json.dumps(key)
        + ",code:" + json.dumps(key) + ",keyCode:" + str(kc)
        + ",which:" + str(kc) + ",bubbles:true}));}})()"
    )
    await js(expr)


async def upload_file(selector: str, path) -> None:
    """Set files on a file input via DOM.setFileInputFiles."""
    doc = await cdp("DOM.getDocument", depth=-1)
    nid = (await cdp("DOM.querySelector", nodeId=doc["root"]["nodeId"], selector=selector))["nodeId"]
    if not nid:
        raise RuntimeError(f"no element for selector: {selector}")
    files = [path] if isinstance(path, str) else list(path)
    await cdp("DOM.setFileInputFiles", files=files, nodeId=nid)


async def extract_text(selector: str = "body") -> str:
    """Extract text content of an element (defaults to entire page body)."""
    expr = (
        "(()=>{const e=document.querySelector("
        + json.dumps(selector)
        + ");return e?(e.innerText||e.textContent||''):''})()"
    )
    return await js(expr) or ""


async def get_dom_snapshot(max_chars: int = 50_000) -> str:
    """Fetch the page's outerHTML, truncated."""
    html = await js("document.documentElement.outerHTML")
    text = str(html or "")
    return text[:max_chars]


async def click_selector(selector: str) -> bool:
    """Click an element by CSS selector. Uses element center coordinates."""
    expr = (
        "(()=>{const e=document.querySelector("
        + json.dumps(selector)
        + ");if(!e)return null;const r=e.getBoundingClientRect();"
        "return{x:r.left+r.width/2,y:r.top+r.height/2,visible:r.width>0&&r.height>0}})()"
    )
    coords = await js(expr)
    if not coords or not coords.get("visible"):
        return False
    await click_at_xy(coords["x"], coords["y"])
    return True


async def fill_input(selector: str, text: str) -> bool:
    """Click an input element, clear it, then type text."""
    if not await click_selector(selector):
        return False
    # Select all, delete, then type
    await press_key("a", modifiers=2 if os.name != "darwin" else 4)  # Ctrl-A or Cmd-A
    await press_key("Backspace")
    await type_text(text)
    return True


# ── Dialogs ──────────────────────────────────────────────────────────────────

async def handle_dialog(accept: bool = True, prompt_text: str = "") -> None:
    """Accept or dismiss a native JS dialog (alert/confirm/prompt)."""
    d = await _daemon()
    payload: dict = {"accept": bool(accept)}
    if prompt_text:
        payload["promptText"] = prompt_text
    await cdp("Page.handleJavaScriptDialog", **payload)
    d._log_action("dialog", "handled", {"accept": accept})


# ── Pure HTTP (no browser) ───────────────────────────────────────────────────

def http_get(url: str, headers: Optional[dict] = None, timeout: float = 20.0) -> str:
    """Plain HTTP GET — bypasses the browser entirely. Use for static APIs."""
    h = {"User-Agent": "Mozilla/5.0 (Kodo Browser)"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


__all__ = [
    "cdp", "drain_events",
    "goto_url", "page_info", "wait_for_load",
    "click_at_xy", "type_text", "press_key", "scroll",
    "click_selector", "fill_input",
    "capture_screenshot", "screenshot_b64",
    "list_tabs", "current_tab", "switch_tab", "new_tab", "close_tab",
    "ensure_real_tab", "iframe_target",
    "js", "dispatch_key", "upload_file", "extract_text", "get_dom_snapshot",
    "handle_dialog",
    "http_get",
    "list_domain_skills", "list_interaction_skills", "read_skill",
]
