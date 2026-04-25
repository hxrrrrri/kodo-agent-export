"""
Browser daemon admin endpoints.

Exposes a singleton BrowserDaemon to:
- Start/stop the headed Chrome instance
- Stream the latest screenshot for the BrowserPanel UI
- Stream the structured action log (live agent activity feed)
- Read domain/interaction skills

All routes are prefixed with /browser (mounted under /api by main.py).
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/browser", tags=["browser"])

# Lazy singleton — instantiated on first call
_daemon = None


async def get_daemon():
    """Return the global BrowserDaemon, creating it if needed."""
    global _daemon
    if _daemon is None:
        from browser.manager import BrowserDaemon
        _daemon = BrowserDaemon()
    return _daemon


# ── Pydantic models ──────────────────────────────────────────────────────────

class CDPRequest(BaseModel):
    method: str
    params: dict[str, Any] = {}
    session_id: Optional[str] = None
    meta: Optional[str] = None


class NavigateRequest(BaseModel):
    url: str


# ── Lifecycle ────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_status():
    """Check whether the browser daemon is running."""
    global _daemon
    running = _daemon is not None and _daemon.is_running
    info: dict[str, Any] = {"running": running}
    if running and _daemon is not None:
        try:
            from browser.helpers import current_tab
            tab = await current_tab()
            info["url"] = tab.get("url", "")
            info["title"] = tab.get("title", "")
            info["target_id"] = tab.get("targetId")
        except Exception:
            pass
        info["session"] = _daemon.session
    return info


@router.post("/start")
async def start_browser():
    """Start the browser daemon and Chrome (or attach if running)."""
    try:
        d = await get_daemon()
        if d.is_running:
            return {"status": "already_running"}
        await d.start()
        return {"status": "started"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/stop")
async def stop_browser():
    """Stop the browser daemon. Chrome is also terminated if Kodo started it."""
    try:
        global _daemon
        if _daemon is not None and _daemon.is_running:
            await _daemon.stop()
        return {"status": "stopped"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── CDP passthrough (for in-process helpers + advanced clients) ──────────────

@router.post("/cdp")
async def execute_cdp(req: CDPRequest):
    """Send a raw CDP command. Used by helpers.py via daemon.handle()."""
    try:
        d = await get_daemon()
        if not d.is_running:
            return {"error": "Browser is not running. POST /api/browser/start first."}
        return await d.handle(req.model_dump(exclude_none=True))
    except Exception as exc:
        return {"error": str(exc)}


# ── Convenience navigation ────────────────────────────────────────────────────

@router.post("/navigate")
async def navigate(body: NavigateRequest):
    """Navigate to a URL (auto-starts browser if not running)."""
    try:
        d = await get_daemon()
        if not d.is_running:
            await d.start()
        from browser.helpers import goto_url, wait_for_load
        r = await goto_url(body.url)
        await wait_for_load(timeout=15.0)
        return {"ok": True, "navigated": r}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Live screenshot ──────────────────────────────────────────────────────────

@router.get("/screenshot")
async def screenshot(refresh: bool = Query(default=True)):
    """Return the latest screenshot as PNG bytes.
    If refresh=true, captures a fresh shot first."""
    try:
        d = await get_daemon()
        if not d.is_running:
            raise HTTPException(status_code=409, detail="Browser not running")
        if refresh:
            from browser.helpers import capture_screenshot
            await capture_screenshot()
        png = d.get_latest_screenshot()
        if not png:
            raise HTTPException(status_code=404, detail="No screenshot available yet")
        return Response(content=png, media_type="image/png", headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
        })
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Action log ───────────────────────────────────────────────────────────────

@router.get("/log")
async def get_action_log(since: float = Query(default=0.0)):
    """Return the action log entries since a unix timestamp."""
    d = await get_daemon()
    if not d.is_running:
        return {"entries": [], "running": False}
    return {"entries": d.get_action_log(float(since)), "running": True}


@router.get("/log/stream")
async def stream_action_log():
    """Server-Sent Events stream of the action log + periodic screenshot beacons."""
    async def gen():
        last_ts = time.time()
        while True:
            d = await get_daemon()
            if d.is_running:
                entries = d.get_action_log(last_ts)
                for entry in entries:
                    last_ts = max(last_ts, entry.get("ts", last_ts))
                    yield f"event: action\ndata: {entry}\n\n".replace("'", '"')
                yield f"event: heartbeat\ndata: {{\"ts\": {time.time()}}}\n\n"
            else:
                yield "event: idle\ndata: {\"running\": false}\n\n"
                await asyncio.sleep(2.0)
                continue
            await asyncio.sleep(0.7)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


# ── Skills lookup ────────────────────────────────────────────────────────────

@router.get("/skills")
async def list_all_skills(domain: Optional[str] = Query(default=None)):
    """List domain-specific or interaction skills."""
    from browser.helpers import (
        list_domain_skills, list_interaction_skills,
    )
    if domain:
        return {"domain": domain, "skills": list_domain_skills(domain)}
    # No domain: return interaction skills + list of available domains
    from browser.helpers import DOMAIN_SKILLS_DIR
    domains = sorted([p.name for p in DOMAIN_SKILLS_DIR.iterdir() if p.is_dir()]) if DOMAIN_SKILLS_DIR.exists() else []
    return {
        "interaction_skills": list_interaction_skills(),
        "domains": domains,
    }


@router.get("/skills/read")
async def read_skill_endpoint(domain: Optional[str] = Query(default=None), name: str = Query(...)):
    """Read a single skill markdown file."""
    from browser.helpers import read_skill
    content = read_skill(domain, name) if domain else read_skill(name)
    if content is None:
        raise HTTPException(status_code=404, detail=f"Skill not found: {domain or '<interaction>'}/{name}")
    return {"name": name, "domain": domain, "content": content}
