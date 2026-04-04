from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from observability.audit import log_audit_event
from privacy import feature_enabled
from tasks.manager import task_manager

router = APIRouter(prefix="/cron", tags=["cron"])

KODO_DIR = Path.home() / ".kodo"
CRON_FILE = KODO_DIR / "cron.json"

_CRON_TASK: asyncio.Task[None] | None = None
_RECENT_RUNS: deque[dict[str, Any]] = deque(maxlen=100)

logger = logging.getLogger(__name__)


class CronJob(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    cron_expr: str = Field(
        min_length=9,
        max_length=60,
        description=(
            "Simplified cron: every_N_minutes, every_N_hours, "
            "daily_HH:MM, weekly_DAY_HH:MM"
        ),
    )
    prompt: str = Field(min_length=1, max_length=8000)
    project_dir: str | None = Field(default=None)
    enabled: bool = True


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cron_enabled() -> bool:
    return feature_enabled("CRON", default="1")


def _parse_interval_seconds(expr: str) -> int | None:
    value = expr.strip().lower()

    minute_match = re.match(r"every_(\d+)_minutes?", value)
    if minute_match:
        minutes = int(minute_match.group(1))
        return max(60, minutes * 60)

    hour_match = re.match(r"every_(\d+)_hours?", value)
    if hour_match:
        hours = int(hour_match.group(1))
        return max(3600, hours * 3600)

    if re.match(r"daily_\d{2}:\d{2}", value):
        return 86400

    if re.match(r"weekly_[a-z]+_\d{2}:\d{2}", value):
        return 604800

    return None


def _parse_iso(value: str | None) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


async def _load_jobs() -> list[dict[str, Any]]:
    KODO_DIR.mkdir(parents=True, exist_ok=True)
    if not CRON_FILE.exists():
        return []

    async with aiofiles.open(CRON_FILE, "r", encoding="utf-8") as handle:
        raw = await handle.read()

    try:
        data = json.loads(raw) if raw.strip() else []
    except json.JSONDecodeError:
        return []

    return data if isinstance(data, list) else []


async def _save_jobs(jobs: list[dict[str, Any]]) -> None:
    KODO_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CRON_FILE.with_suffix(".json.tmp")
    async with aiofiles.open(tmp, "w", encoding="utf-8") as handle:
        await handle.write(json.dumps(jobs, indent=2, ensure_ascii=True))
    tmp.replace(CRON_FILE)


async def _cron_loop() -> None:
    while True:
        await asyncio.sleep(60)

        if not _cron_enabled():
            continue

        try:
            jobs = await _load_jobs()
            if not jobs:
                continue

            now = datetime.now(timezone.utc)
            changed = False

            for job in jobs:
                if not bool(job.get("enabled", True)):
                    continue

                interval_seconds = _parse_interval_seconds(str(job.get("cron_expr", "")))
                if interval_seconds is None:
                    continue

                last_run = _parse_iso(job.get("last_run"))
                if last_run is not None:
                    elapsed = (now - last_run).total_seconds()
                    if elapsed < interval_seconds:
                        continue

                task = await task_manager.create_task(
                    prompt=str(job.get("prompt", "")).strip(),
                    project_dir=str(job.get("project_dir") or "").strip() or None,
                    requested_by_session=f"cron:{job.get('name', 'job')}",
                )

                task_id = str(task.get("task_id", "")).strip()
                fired_at = _utc_now()
                job["last_run"] = fired_at
                job["last_task_id"] = task_id or None
                changed = True

                _RECENT_RUNS.appendleft(
                    {
                        "job_name": str(job.get("name", "")).strip() or "unnamed",
                        "task_id": task_id,
                        "fired_at": fired_at,
                    }
                )
                log_audit_event("cron_job_fired", name=job.get("name"), task_id=task_id)

            if changed:
                await _save_jobs(jobs)

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Cron loop error: %s", exc)


def start_cron_loop() -> None:
    global _CRON_TASK
    if _CRON_TASK is None or _CRON_TASK.done():
        _CRON_TASK = asyncio.create_task(_cron_loop())


@router.get("")
async def list_cron_jobs(request: Request):
    require_api_auth(request)
    if not _cron_enabled():
        return {"jobs": [], "enabled": False}

    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_cron")
    return {"jobs": await _load_jobs(), "enabled": True}


@router.post("")
async def upsert_cron_job(body: CronJob, request: Request):
    require_api_auth(request)
    if not _cron_enabled():
        raise HTTPException(status_code=404, detail="Cron is disabled.")

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
    preserved = next((row for row in jobs if str(row.get("name")) == body.name), None)

    jobs = [row for row in jobs if str(row.get("name")) != body.name]
    jobs.append(
        {
            "name": body.name,
            "cron_expr": body.cron_expr,
            "prompt": body.prompt,
            "project_dir": body.project_dir,
            "enabled": body.enabled,
            "created_at": str((preserved or {}).get("created_at") or _utc_now()),
            "last_run": (preserved or {}).get("last_run"),
            "last_task_id": (preserved or {}).get("last_task_id"),
        }
    )

    await _save_jobs(jobs)
    log_audit_event("cron_job_saved", name=body.name)
    return {"saved": True, "name": body.name}


@router.delete("/{name}")
async def delete_cron_job(name: str, request: Request):
    require_api_auth(request)
    if not _cron_enabled():
        raise HTTPException(status_code=404, detail="Cron is disabled.")

    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "delete_cron")

    jobs = await _load_jobs()
    next_jobs = [row for row in jobs if str(row.get("name")) != name]
    await _save_jobs(next_jobs)
    return {"deleted": True, "name": name}


@router.get("/runs")
async def list_recent_runs(request: Request):
    require_api_auth(request)
    if not _cron_enabled():
        return {"runs": []}

    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "list_cron_runs")
    return {"runs": list(_RECENT_RUNS)}
