from __future__ import annotations

import asyncio
import json
import re
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.security import enforce_rate_limit, MEMORY_RATE_LIMITER
from observability.audit import log_audit_event
from privacy import feature_enabled
from tasks.manager import task_manager

router = APIRouter(prefix="/cron", tags=["cron"])

KODO_DIR = Path.home() / ".kodo"
CRON_FILE = KODO_DIR / "cron.json"
_CRON_TASK: asyncio.Task[None] | None = None
_RECENT_RUNS: deque[dict[str, Any]] = deque(maxlen=100)


class CronJob(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    cron_expr: str = Field(min_length=9, max_length=60)
    prompt: str = Field(min_length=1, max_length=8000)
    project_dir: str | None = Field(default=None)
    enabled: bool = True


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cron_enabled() -> bool:
    return feature_enabled("CRON", default="1")


def _parse_interval_seconds(expr: str) -> int | None:
    """Parse simplified cron expressions to an interval in seconds."""
    expr = expr.strip().lower()
    m = re.match(r"every_(\d+)_minutes?", expr)
    if m:
        return max(60, int(m.group(1)) * 60)
    m = re.match(r"every_(\d+)_hours?", expr)
    if m:
        return max(3600, int(m.group(1)) * 3600)
    if re.match(r"daily_\d{2}:\d{2}", expr):
        return 86400
    if re.match(r"weekly_[a-z]+_\d{2}:\d{2}", expr):
        return 604800
    return None


async def _load_jobs() -> list[dict[str, Any]]:
    KODO_DIR.mkdir(parents=True, exist_ok=True)
    if not CRON_FILE.exists():
        return []
    async with aiofiles.open(CRON_FILE, "r", encoding="utf-8") as f:
        raw = await f.read()
    data = json.loads(raw) if raw.strip() else []
    return data if isinstance(data, list) else []


async def _save_jobs(jobs: list[dict[str, Any]]) -> None:
    tmp = CRON_FILE.with_suffix(".json.tmp")
    async with aiofiles.open(tmp, "w", encoding="utf-8") as f:
        await f.write(json.dumps(jobs, indent=2, ensure_ascii=True))
    tmp.replace(CRON_FILE)


async def _cron_loop() -> None:
    """Background loop: fires any due cron jobs once per minute."""
    while True:
        await asyncio.sleep(60)
        if not _cron_enabled():
            continue
        try:
            jobs = await _load_jobs()
            now = datetime.now(timezone.utc)
            changed = False
            for job in jobs:
                if not job.get("enabled", True):
                    continue
                interval = _parse_interval_seconds(job.get("cron_expr", ""))
                if interval is None:
                    continue
                last_run_str = job.get("last_run", "")
                if last_run_str:
                    elapsed = (now - datetime.fromisoformat(last_run_str)).total_seconds()
                    if elapsed < interval:
                        continue
                task = await task_manager.create_task(
                    prompt=job["prompt"],
                    project_dir=job.get("project_dir"),
                )
                job["last_run"] = _utc_now()
                job["last_task_id"] = task.get("task_id")
                _RECENT_RUNS.appendleft(
                    {
                        "job_name": job["name"],
                        "task_id": task.get("task_id"),
                        "fired_at": _utc_now(),
                    }
                )
                log_audit_event("cron_job_fired", name=job["name"], task_id=task.get("task_id"))
                changed = True
            if changed:
                await _save_jobs(jobs)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            import logging as _logging
            _logging.getLogger(__name__).warning("Cron loop error: %s", exc)


def start_cron_loop() -> None:
    """
    Start the background cron loop. Safe to call from ASGI lifespan startup.
    Does nothing if called outside a running event loop (e.g. during test
    collection or sync test setup).
    """
    global _CRON_TASK
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running event loop — safe to skip (sync test context, import time).
        return
    if _CRON_TASK is None or _CRON_TASK.done():
        _CRON_TASK = loop.create_task(_cron_loop())


@router.get("")
async def list_cron_jobs(request: Request) -> dict[str, Any]:
    if not _cron_enabled():
        return {"jobs": [], "enabled": False}
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_cron")
    return {"jobs": await _load_jobs(), "enabled": True}


@router.post("")
async def upsert_cron_job(body: CronJob, request: Request) -> dict[str, Any]:
    if not _cron_enabled():
        raise HTTPException(status_code=404, detail="Cron is disabled. Set KODO_ENABLE_CRON=1.")
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "upsert_cron")
    if _parse_interval_seconds(body.cron_expr) is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Invalid cron_expr. Use: every_N_minutes, every_N_hours, "
                "daily_HH:MM, or weekly_DAY_HH:MM"
            ),
        )
    jobs = await _load_jobs()
    jobs = [j for j in jobs if j.get("name") != body.name]
    jobs.append(
        {
            "name": body.name,
            "cron_expr": body.cron_expr,
            "prompt": body.prompt,
            "project_dir": body.project_dir,
            "enabled": body.enabled,
            "created_at": _utc_now(),
            "last_run": None,
            "last_task_id": None,
        }
    )
    await _save_jobs(jobs)
    log_audit_event("cron_job_saved", name=body.name)
    return {"saved": True, "name": body.name}


@router.delete("/{name}")
async def delete_cron_job(name: str, request: Request) -> dict[str, Any]:
    if not _cron_enabled():
        raise HTTPException(status_code=404, detail="Cron is disabled.")
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "delete_cron")
    jobs = await _load_jobs()
    jobs = [j for j in jobs if j.get("name") != name]
    await _save_jobs(jobs)
    log_audit_event("cron_job_deleted", name=name)
    return {"deleted": True, "name": name}


@router.get("/runs")
async def list_recent_runs(request: Request) -> dict[str, Any]:
    if not _cron_enabled():
        return {"runs": []}
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_cron_runs")
    return {"runs": list(_RECENT_RUNS)}