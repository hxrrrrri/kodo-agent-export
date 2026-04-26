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


# ── Wait for element ─────────────────────────────────────────────────────────

async def wait_for_selector(
    selector: str,
    timeout: float = 10.0,
    visible: bool = True,
) -> bool:
    """Poll until a CSS selector matches a visible element (or times out).

    Returns True when found, False on timeout. Use before clicking dynamic
    content that may not yet be in the DOM.
    """
    deadline = time.time() + timeout
    expr = (
        "(()=>{const e=document.querySelector("
        + json.dumps(selector)
        + ");if(!e)return false;"
        + ("const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&window.getComputedStyle(e).visibility!=='hidden';" if visible else "return true;")
        + "})()"
    )
    while time.time() < deadline:
        try:
            found = await js(expr)
            if found:
                return True
        except Exception:
            pass
        await asyncio.sleep(0.25)
    return False


async def wait_for_text(text: str, selector: str = "body", timeout: float = 10.0) -> bool:
    """Poll until an element's text content contains the given string."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            content = await extract_text(selector)
            if text.lower() in content.lower():
                return True
        except Exception:
            pass
        await asyncio.sleep(0.3)
    return False


async def wait_for_network_idle(idle_ms: float = 500, timeout: float = 10.0) -> bool:
    """Wait until no new network requests fire for `idle_ms` milliseconds."""
    d = await _daemon()
    deadline = time.time() + timeout
    last_activity = time.time()
    initial_count = len(d.events)
    NETWORK_METHODS = {"Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"}
    while time.time() < deadline:
        current_count = len(d.events)
        if current_count > initial_count:
            # Check if any recent events are network events
            recent = list(d.events)[initial_count:]
            if any(e.get("method") in NETWORK_METHODS for e in recent):
                last_activity = time.time()
            initial_count = current_count
        if time.time() - last_activity >= idle_ms / 1000:
            return True
        await asyncio.sleep(0.1)
    return False


# ── Cookie management (cookies.md) ──────────────────────────────────────────

async def get_cookies(urls: Optional[list[str]] = None) -> list[dict]:
    """Return all cookies, optionally filtered to specific URLs."""
    if urls:
        r = await cdp("Network.getCookies", urls=urls)
    else:
        r = await cdp("Network.getAllCookies")
    return r.get("cookies", [])


async def set_cookie(name: str, value: str, domain: str = "", path: str = "/",
                     secure: bool = False, http_only: bool = False,
                     same_site: str = "None") -> bool:
    """Set a single browser cookie."""
    r = await cdp(
        "Network.setCookie",
        name=name, value=value,
        **({} if not domain else {"domain": domain}),
        path=path,
        secure=secure,
        httpOnly=http_only,
        sameSite=same_site,
    )
    return bool(r.get("success", False))


async def delete_cookies(name: str, url: str = "", domain: str = "") -> None:
    """Delete cookies matching a name (and optionally url/domain)."""
    params: dict = {"name": name}
    if url:
        params["url"] = url
    if domain:
        params["domain"] = domain
    await cdp("Network.deleteCookies", **params)


async def clear_all_cookies() -> None:
    """Delete all cookies in the browser."""
    await cdp("Network.clearBrowserCookies")


# ── Network request interception (network-requests.md) ──────────────────────

async def enable_request_interception(url_patterns: Optional[list[str]] = None) -> None:
    """Intercept outgoing fetch/XHR requests matching URL patterns.

    After enabling, the daemon event buffer will contain `Fetch.requestPaused`
    events. Call `fulfill_request` or `continue_request` for each.

    url_patterns: list of glob patterns (e.g. ['*api.example.com*']).
    """
    d = await _daemon()
    await cdp("Fetch.enable", patterns=[
        {"urlPattern": p, "requestStage": "Request"}
        for p in (url_patterns or ["*"])
    ])
    d._log_action("network", "intercept_enabled", {"patterns": url_patterns or ["*"]})


async def disable_request_interception() -> None:
    """Stop intercepting requests."""
    await cdp("Fetch.disable")


async def get_intercepted_requests() -> list[dict]:
    """Return Fetch.requestPaused events collected since last drain."""
    events = await drain_events()
    return [e for e in events if e.get("method") == "Fetch.requestPaused"]


async def fulfill_request(request_id: str, status: int = 200,
                           body: str = "", content_type: str = "application/json") -> None:
    """Respond to an intercepted request with a mock response."""
    import base64 as _b64
    await cdp(
        "Fetch.fulfillRequest",
        requestId=request_id,
        responseCode=status,
        responseHeaders=[{"name": "Content-Type", "value": content_type}],
        body=_b64.b64encode(body.encode()).decode(),
    )


async def continue_request(request_id: str, url: Optional[str] = None,
                            headers: Optional[dict] = None) -> None:
    """Continue an intercepted request, optionally modifying url/headers."""
    params: dict = {"requestId": request_id}
    if url:
        params["url"] = url
    if headers:
        params["headers"] = [{"name": k, "value": v} for k, v in headers.items()]
    await cdp("Fetch.continueRequest", **params)


# ── Drag and drop (drag-and-drop.md) ────────────────────────────────────────

async def drag_and_drop(
    from_selector: str, to_selector: str, hold_ms: float = 100
) -> bool:
    """Drag element matching from_selector to element matching to_selector.

    Uses CDP Input.dispatchDragEvent for native drag support.
    """
    d = await _daemon()
    expr_from = (
        "(()=>{const e=document.querySelector("
        + json.dumps(from_selector)
        + ");if(!e)return null;const r=e.getBoundingClientRect();"
        "return{x:r.left+r.width/2,y:r.top+r.height/2}})()"
    )
    expr_to = (
        "(()=>{const e=document.querySelector("
        + json.dumps(to_selector)
        + ");if(!e)return null;const r=e.getBoundingClientRect();"
        "return{x:r.left+r.width/2,y:r.top+r.height/2}})()"
    )
    src = await js(expr_from)
    dst = await js(expr_to)
    if not src or not dst:
        return False
    sx, sy = float(src["x"]), float(src["y"])
    dx, dy = float(dst["x"]), float(dst["y"])
    # Use CDP drag events
    await cdp("Input.dispatchDragEvent", type="dragEnter", x=sx, y=sy,
              data={"items": [], "dragOperationsMask": 1})
    await cdp("Input.dispatchDragEvent", type="dragOver", x=sx, y=sy,
              data={"items": [], "dragOperationsMask": 1})
    await asyncio.sleep(hold_ms / 1000)
    await cdp("Input.dispatchDragEvent", type="dragOver", x=dx, y=dy,
              data={"items": [], "dragOperationsMask": 1})
    await cdp("Input.dispatchDragEvent", type="drop", x=dx, y=dy,
              data={"items": [], "dragOperationsMask": 1})
    await cdp("Input.dispatchDragEvent", type="dragEnd", x=dx, y=dy,
              data={"items": [], "dragOperationsMask": 1})
    d._log_action("input", "drag_drop", {"from": from_selector, "to": to_selector})
    return True


# ── Viewport / device emulation (viewport.md) ──────────────────────────────

DEVICE_PRESETS = {
    "mobile": {"width": 390, "height": 844, "deviceScaleFactor": 3, "mobile": True},
    "tablet": {"width": 768, "height": 1024, "deviceScaleFactor": 2, "mobile": True},
    "desktop": {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False},
    "desktop-hd": {"width": 1920, "height": 1080, "deviceScaleFactor": 1, "mobile": False},
}


async def set_viewport(
    width: int = 1280,
    height: int = 800,
    device_scale_factor: float = 1.0,
    mobile: bool = False,
    preset: Optional[str] = None,
) -> None:
    """Set the browser viewport. Use `preset` ('mobile', 'tablet', 'desktop')
    or specify width/height/scale directly."""
    d = await _daemon()
    if preset and preset in DEVICE_PRESETS:
        p = DEVICE_PRESETS[preset]
        width = p["width"]
        height = p["height"]
        device_scale_factor = p["deviceScaleFactor"]
        mobile = p["mobile"]
    await cdp(
        "Emulation.setDeviceMetricsOverride",
        width=width,
        height=height,
        deviceScaleFactor=device_scale_factor,
        mobile=mobile,
    )
    d._log_action("viewport", "set", {"width": width, "height": height, "mobile": mobile})


async def reset_viewport() -> None:
    """Remove device emulation override."""
    await cdp("Emulation.clearDeviceMetricsOverride")


# ── PDF export (print-as-pdf.md) ────────────────────────────────────────────

async def export_pdf(
    path: Optional[str] = None,
    landscape: bool = False,
    print_background: bool = True,
    scale: float = 1.0,
    paper_format: str = "A4",
) -> str:
    """Export current page as PDF. Returns the on-disk path."""
    import base64 as _b64
    d = await _daemon()
    r = await cdp(
        "Page.printToPDF",
        landscape=landscape,
        printBackground=print_background,
        scale=scale,
        paperWidth=8.27 if paper_format == "A4" else 8.5,
        paperHeight=11.69 if paper_format == "A4" else 11.0,
    )
    raw = _b64.b64decode(r["data"])
    out_path = path or _tmp_path("kodo_page.pdf")
    parent = os.path.dirname(out_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(raw)
    d._log_action("visual", "pdf", {"path": out_path, "bytes": len(raw)})
    return out_path


# ── Accessibility tree ───────────────────────────────────────────────────────

async def get_accessibility_tree(max_depth: int = 10) -> list[dict]:
    """Return the full accessibility tree. Better than DOM for finding
    elements by role/name without brittle CSS selectors."""
    r = await cdp("Accessibility.getFullAXTree", depth=max_depth)
    return r.get("nodes", [])


async def find_by_role(role: str, name: Optional[str] = None) -> Optional[dict]:
    """Find first accessible element with the given ARIA role and optional name."""
    nodes = await get_accessibility_tree()
    for node in nodes:
        node_role = (node.get("role") or {}).get("value", "")
        if node_role.lower() != role.lower():
            continue
        if name is not None:
            node_name = (node.get("name") or {}).get("value", "")
            if name.lower() not in node_name.lower():
                continue
        return node
    return None


async def find_by_text_content(text: str, tag: str = "*",
                                 exact: bool = False) -> Optional[dict]:
    """Find and return coordinates of the first element containing `text`.
    Returns {x, y, selector} or None.
    """
    op = "===" if exact else "includes"
    expr = (
        f"(()=>{{const all=document.querySelectorAll('{tag}');"
        f"for(const e of all){{const t=(e.innerText||e.textContent||'').trim();"
        f"if(t.toLowerCase().{op}({json.dumps(text.lower())})){{const r=e.getBoundingClientRect();"
        f"if(r.width>0)return{{x:r.left+r.width/2,y:r.top+r.height/2,text:t.slice(0,80)}}}}}};return null}})()"
    )
    return await js(expr)


async def click_by_text(text: str, tag: str = "*", exact: bool = False) -> bool:
    """Click the first element whose text content contains `text`."""
    d = await _daemon()
    coords = await find_by_text_content(text, tag=tag, exact=exact)
    if not coords:
        return False
    await click_at_xy(coords["x"], coords["y"])
    d._log_action("input", "click_by_text", {"text": text, "x": coords["x"], "y": coords["y"]})
    return True


# ── Shadow DOM (shadow-dom.md) ───────────────────────────────────────────────

async def query_shadow(host_selector: str, inner_selector: str) -> Optional[dict]:
    """Query inside a shadow DOM root. Returns element rect or None."""
    expr = (
        "(()=>{const host=document.querySelector("
        + json.dumps(host_selector)
        + ");if(!host||!host.shadowRoot)return null;"
        "const el=host.shadowRoot.querySelector("
        + json.dumps(inner_selector)
        + ");if(!el)return null;const r=el.getBoundingClientRect();"
        "return{x:r.left+r.width/2,y:r.top+r.height/2,visible:r.width>0}})()"
    )
    return await js(expr)


async def click_shadow(host_selector: str, inner_selector: str) -> bool:
    """Click an element inside a shadow DOM root."""
    coords = await query_shadow(host_selector, inner_selector)
    if not coords or not coords.get("visible"):
        return False
    await click_at_xy(coords["x"], coords["y"])
    return True


# ── Local storage ────────────────────────────────────────────────────────────

async def get_local_storage(key: str) -> Optional[str]:
    return await js(f"localStorage.getItem({json.dumps(key)})")


async def set_local_storage(key: str, value: str) -> None:
    await js(f"localStorage.setItem({json.dumps(key)},{json.dumps(value)})")


async def clear_local_storage() -> None:
    await js("localStorage.clear()")


# ── Form helpers ─────────────────────────────────────────────────────────────

async def fill_form(fields: dict[str, str], submit_selector: Optional[str] = None) -> dict:
    """Fill multiple form fields at once. fields = {selector: value}.
    Optionally click submit_selector after filling.
    Returns per-field success dict.
    """
    results: dict[str, bool] = {}
    for selector, value in fields.items():
        ok = await fill_input(selector, value)
        results[selector] = ok
        await asyncio.sleep(0.1)
    if submit_selector:
        results["_submit"] = await click_selector(submit_selector)
    return results


async def select_option(selector: str, value: Optional[str] = None,
                         label: Optional[str] = None, index: Optional[int] = None) -> bool:
    """Select an option in a <select> element by value, label, or index."""
    if value is not None:
        expr = f"(()=>{{const e=document.querySelector({json.dumps(selector)});if(!e)return false;e.value={json.dumps(value)};e.dispatchEvent(new Event('change',{{bubbles:true}}));return true}})()"
    elif label is not None:
        expr = f"(()=>{{const e=document.querySelector({json.dumps(selector)});if(!e)return false;const opts=Array.from(e.options);const o=opts.find(o=>o.text.trim().toLowerCase().includes({json.dumps(label.lower())}));if(!o)return false;e.value=o.value;e.dispatchEvent(new Event('change',{{bubbles:true}}));return true}})()"
    elif index is not None:
        expr = f"(()=>{{const e=document.querySelector({json.dumps(selector)});if(!e||{index}>=e.options.length)return false;e.selectedIndex={index};e.dispatchEvent(new Event('change',{{bubbles:true}}));return true}})()"
    else:
        return False
    result = await js(expr)
    return bool(result)


# ── Scroll to element ─────────────────────────────────────────────────────────

async def scroll_to(selector: str, block: str = "center") -> bool:
    """Scroll element into view."""
    expr = (
        f"(()=>{{const e=document.querySelector({json.dumps(selector)});"
        f"if(!e)return false;e.scrollIntoView({{behavior:'smooth',block:{json.dumps(block)}}});return true}})()"
    )
    return bool(await js(expr))


# ── Hover ────────────────────────────────────────────────────────────────────

async def hover(selector: str) -> bool:
    """Mouse-hover over an element (triggers :hover CSS and mouseover events)."""
    expr = (
        "(()=>{const e=document.querySelector("
        + json.dumps(selector)
        + ");if(!e)return null;const r=e.getBoundingClientRect();"
        "return{x:r.left+r.width/2,y:r.top+r.height/2,visible:r.width>0}})()"
    )
    coords = await js(expr)
    if not coords or not coords.get("visible"):
        return False
    await cdp("Input.dispatchMouseEvent", type="mouseMoved", x=coords["x"], y=coords["y"])
    return True


__all__ = [
    "cdp", "drain_events",
    "goto_url", "page_info", "wait_for_load",
    "wait_for_selector", "wait_for_text", "wait_for_network_idle",
    "click_at_xy", "type_text", "press_key", "scroll", "scroll_to", "hover",
    "click_selector", "fill_input", "click_by_text", "fill_form", "select_option",
    "capture_screenshot", "screenshot_b64",
    "list_tabs", "current_tab", "switch_tab", "new_tab", "close_tab",
    "ensure_real_tab", "iframe_target",
    "js", "dispatch_key", "upload_file", "extract_text", "get_dom_snapshot",
    "handle_dialog",
    "get_cookies", "set_cookie", "delete_cookies", "clear_all_cookies",
    "enable_request_interception", "disable_request_interception",
    "get_intercepted_requests", "fulfill_request", "continue_request",
    "drag_and_drop",
    "set_viewport", "reset_viewport", "DEVICE_PRESETS",
    "export_pdf",
    "get_accessibility_tree", "find_by_role", "find_by_text_content",
    "query_shadow", "click_shadow",
    "get_local_storage", "set_local_storage", "clear_local_storage",
    "http_get",
    "list_domain_skills", "list_interaction_skills", "read_skill",
]
