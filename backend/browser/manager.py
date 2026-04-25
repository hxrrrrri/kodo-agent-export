"""
BrowserDaemon — single-process CDP wrapper around a controlled Chromium instance.

Architecture:
- One BrowserDaemon per backend process (singleton via api/browser_admin.py).
- Spawns Chrome on port 9222 (or attaches to existing one).
- Holds the active CDP WebSocket and current page session.
- Maintains an in-memory event ring buffer + structured action log.
- Caches the latest screenshot bytes for live streaming to the frontend.

This is intentionally NOT a Unix-socket daemon — we run the CDP loop
in-process and expose helpers as native async functions (no IPC).
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import subprocess
import time
import urllib.request
from collections import deque
from typing import Any, Optional

import logging

logger = logging.getLogger(__name__)

# ── Chrome / Edge auto-detect (Windows + macOS + Linux) ───────────────────────
CHROME_PATHS = [
    # Windows
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    # macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    # Linux
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
]


def find_chrome() -> Optional[str]:
    """Return the first existing Chrome/Edge/Chromium binary path."""
    override = os.environ.get("KODO_BROWSER_PATH", "").strip()
    if override and os.path.exists(override):
        return override
    for p in CHROME_PATHS:
        if os.path.exists(p):
            return p
    return None


# ── Cross-platform user-data dir ──────────────────────────────────────────────
def _user_data_dir() -> str:
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "KodoBrowserData")
    return os.path.join(os.path.expanduser("~"), ".kodo", "browser-data")


# Internal-page filter (matches browser-harness behaviour)
INTERNAL_URL_PREFIXES = (
    "chrome://", "chrome-untrusted://", "devtools://",
    "chrome-extension://", "edge://", "about:",
)


def _is_real_page(target: dict) -> bool:
    return target.get("type") == "page" and not str(target.get("url", "")).startswith(INTERNAL_URL_PREFIXES)


class BrowserDaemon:
    """Singleton wrapping one CDP WebSocket connection.

    All helpers in browser.helpers call into this instance via the global
    accessor in api.browser_admin — there is NO IPC, NO Unix socket, NO TCP
    bridge. This is single-process, async-native.
    """

    def __init__(self) -> None:
        self.cdp: Any = None  # cdp_use.client.CDPClient
        self.session: Optional[str] = None
        self.events: deque[dict] = deque(maxlen=500)
        self.action_log: deque[dict] = deque(maxlen=200)
        self.dialog: Optional[dict] = None
        self.is_running = False
        self._process: Optional[subprocess.Popen] = None
        self._port = 9222
        self._latest_screenshot: Optional[bytes] = None
        self._lock = asyncio.Lock()

    # ── Lifecycle ───────────────────────────────────────────────────────────
    async def start(self) -> None:
        async with self._lock:
            if self.is_running:
                return

            try:
                from cdp_use.client import CDPClient
            except ImportError as exc:
                raise RuntimeError(
                    "cdp_use library not installed. Run: pip install cdp-use"
                ) from exc

            port = self._port
            # Reuse Chrome if already on this port
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.8)
            running_already = sock.connect_ex(("127.0.0.1", port)) == 0
            sock.close()

            if not running_already:
                chrome_path = find_chrome()
                if not chrome_path:
                    raise RuntimeError(
                        "Chrome/Edge not found. Install Chrome or set KODO_BROWSER_PATH."
                    )
                user_data = _user_data_dir()
                os.makedirs(user_data, exist_ok=True)
                args = [
                    chrome_path,
                    f"--remote-debugging-port={port}",
                    f"--user-data-dir={user_data}",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-features=PrivacySandboxSettings4",
                ]
                # Detach from parent so it survives backend restarts cleanly
                creationflags = 0x00000008 if os.name == "nt" else 0  # DETACHED_PROCESS
                self._process = subprocess.Popen(
                    args,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creationflags,
                )
                # Wait for the debugger port to bind
                deadline = time.time() + 15
                bound = False
                while time.time() < deadline:
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(0.5)
                    if s.connect_ex(("127.0.0.1", port)) == 0:
                        s.close()
                        bound = True
                        break
                    s.close()
                    await asyncio.sleep(0.4)
                if not bound:
                    raise RuntimeError(f"Chrome failed to bind port {port}")

            # Discover WS URL
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=5) as r:
                    ws_url = json.loads(r.read())["webSocketDebuggerUrl"]
            except Exception as exc:
                raise RuntimeError(f"Failed to read /json/version: {exc}") from exc

            self.cdp = CDPClient(ws_url)
            await self.cdp.start()
            await self.attach_first_page()

            # Wrap event handler to populate our event ring + dialog tracker
            orig_handle = self.cdp._event_registry.handle_event

            async def _tap(method: str, params: dict, session_id: Optional[str] = None):
                try:
                    self.events.append({
                        "method": method,
                        "params": params,
                        "session_id": session_id,
                        "ts": time.time(),
                    })
                    if method == "Page.javascriptDialogOpening":
                        self.dialog = params
                    elif method == "Page.javascriptDialogClosed":
                        self.dialog = None
                except Exception:
                    pass
                return await orig_handle(method, params, session_id)

            self.cdp._event_registry.handle_event = _tap
            self.is_running = True
            self._log_action("daemon", "started", {"port": port, "ws": ws_url})

    async def stop(self) -> None:
        async with self._lock:
            if self._process:
                try:
                    self._process.terminate()
                    self._process.wait(timeout=3)
                except Exception:
                    try:
                        self._process.kill()
                    except Exception:
                        pass
                self._process = None
            if self.cdp:
                try:
                    await self.cdp.stop()
                except Exception:
                    pass
                self.cdp = None
            self.session = None
            self.is_running = False
            self._log_action("daemon", "stopped", {})

    async def attach_first_page(self) -> dict:
        """Attach to the first real page (creating one if none exist)."""
        targets = (await self.cdp.send_raw("Target.getTargets"))["targetInfos"]
        pages = [t for t in targets if _is_real_page(t)]
        if not pages:
            tid = (await self.cdp.send_raw(
                "Target.createTarget", {"url": "about:blank"}
            ))["targetId"]
            pages = [{"targetId": tid, "url": "about:blank", "type": "page"}]
        self.session = (await self.cdp.send_raw(
            "Target.attachToTarget",
            {"targetId": pages[0]["targetId"], "flatten": True},
        ))["sessionId"]
        for domain in ("Page", "DOM", "Runtime", "Network"):
            try:
                await asyncio.wait_for(
                    self.cdp.send_raw(f"{domain}.enable", session_id=self.session),
                    timeout=5,
                )
            except Exception:
                pass
        return pages[0]

    # ── Action log + helpers ────────────────────────────────────────────────
    def _log_action(self, kind: str, action: str, detail: dict) -> None:
        """Record a structured action for the frontend log feed."""
        self.action_log.append({
            "kind": kind,
            "action": action,
            "detail": detail,
            "ts": time.time(),
        })

    def get_action_log(self, since_ts: float = 0.0) -> list[dict]:
        return [e for e in self.action_log if e.get("ts", 0) > since_ts]

    def get_latest_screenshot(self) -> Optional[bytes]:
        return self._latest_screenshot

    def set_latest_screenshot(self, data: bytes) -> None:
        self._latest_screenshot = data

    # ── Generic CDP request handler (used by helpers + admin endpoint) ──────
    async def handle(self, req: dict) -> dict:
        """Unified request dispatcher. Used by both internal helpers and the
        public /browser/cdp endpoint."""
        if not self.is_running and req.get("meta") not in ("status",):
            return {"error": "Browser daemon not running. Call start_browser() first."}

        meta = req.get("meta")
        if meta == "drain_events":
            out = list(self.events)
            self.events.clear()
            return {"events": out}
        if meta == "session":
            return {"session_id": self.session}
        if meta == "set_session":
            self.session = req.get("session_id")
            try:
                await asyncio.wait_for(
                    self.cdp.send_raw("Page.enable", session_id=self.session),
                    timeout=3,
                )
            except Exception:
                pass
            return {"session_id": self.session}
        if meta == "pending_dialog":
            return {"dialog": self.dialog}
        if meta == "action_log":
            since = float(req.get("since", 0) or 0)
            return {"log": self.get_action_log(since)}

        # Plain CDP method
        method = req.get("method")
        if not method:
            return {"error": "method required"}
        params = req.get("params") or {}
        # Browser-level Target.* calls must NOT use a session id
        sid = None if str(method).startswith("Target.") else (req.get("session_id") or self.session)
        try:
            result = await self.cdp.send_raw(method, params, session_id=sid)
            return {"result": result}
        except Exception as exc:
            msg = str(exc)
            # Auto-recover from stale sessions
            if "Session with given id not found" in msg and sid == self.session and sid:
                try:
                    await self.attach_first_page()
                    result = await self.cdp.send_raw(method, params, session_id=self.session)
                    return {"result": result}
                except Exception as exc2:
                    return {"error": f"{msg} (recovery failed: {exc2})"}
            return {"error": msg}
