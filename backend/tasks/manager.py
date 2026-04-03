import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

import aiofiles

KODO_DIR = Path.home() / ".kodo"
TASKS_DIR = KODO_DIR / "tasks"

TaskRunner = Callable[[str, str | None, str], Awaitable[dict[str, Any]]]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TaskManager:
    def __init__(self) -> None:
        TASKS_DIR.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._running: dict[str, asyncio.Task[Any]] = {}
        self._runner: TaskRunner | None = None

    def set_runner(self, runner: TaskRunner) -> None:
        self._runner = runner

    def _task_file(self, task_id: str) -> Path:
        return TASKS_DIR / f"{task_id}.json"

    async def _save(self, payload: dict[str, Any]) -> None:
        task_id = str(payload.get("task_id", "")).strip()
        if not task_id:
            raise ValueError("task_id missing in payload")
        payload["updated_at"] = _utc_now()
        async with aiofiles.open(self._task_file(task_id), "w") as f:
            await f.write(json.dumps(payload, indent=2))

    async def _load(self, task_id: str) -> dict[str, Any] | None:
        task_file = self._task_file(task_id)
        if not task_file.exists():
            return None
        async with aiofiles.open(task_file, "r") as f:
            return json.loads(await f.read())

    async def create_task(
        self,
        prompt: str,
        project_dir: str | None = None,
        requested_by_session: str | None = None,
    ) -> dict[str, Any]:
        task_id = str(uuid.uuid4())
        payload: dict[str, Any] = {
            "task_id": task_id,
            "status": "queued",
            "prompt": prompt,
            "project_dir": project_dir,
            "requested_by_session": requested_by_session,
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "started_at": None,
            "completed_at": None,
            "provider": None,
            "model": None,
            "usage": None,
            "output": "",
            "error": None,
            "events_count": 0,
        }
        await self._save(payload)

        async with self._lock:
            task = asyncio.create_task(self._run_task(task_id))
            self._running[task_id] = task

        return payload

    async def _run_task(self, task_id: str) -> None:
        payload = await self._load(task_id)
        if payload is None:
            return

        payload["status"] = "running"
        payload["started_at"] = _utc_now()
        await self._save(payload)

        try:
            if self._runner is None:
                raise RuntimeError("Task runner is not configured")

            result = await self._runner(
                str(payload.get("prompt", "")),
                payload.get("project_dir"),
                task_id,
            )
            payload["status"] = "completed"
            payload["completed_at"] = _utc_now()
            payload["provider"] = result.get("provider")
            payload["model"] = result.get("model")
            payload["usage"] = result.get("usage")
            payload["output"] = str(result.get("output", ""))
            payload["error"] = result.get("error")
            payload["events_count"] = int(result.get("events_count", 0) or 0)

            if payload["error"]:
                payload["status"] = "failed"

            await self._save(payload)

        except asyncio.CancelledError:
            payload["status"] = "cancelled"
            payload["completed_at"] = _utc_now()
            payload["error"] = "Task cancelled"
            await self._save(payload)
            raise
        except Exception as e:
            payload["status"] = "failed"
            payload["completed_at"] = _utc_now()
            payload["error"] = str(e)
            await self._save(payload)
        finally:
            async with self._lock:
                self._running.pop(task_id, None)

    async def get_task(self, task_id: str) -> dict[str, Any] | None:
        return await self._load(task_id)

    async def list_tasks(self, limit: int = 100) -> list[dict[str, Any]]:
        max_items = max(1, min(limit, 500))
        items: list[tuple[float, dict[str, Any]]] = []
        for task_file in TASKS_DIR.glob("*.json"):
            try:
                async with aiofiles.open(task_file, "r") as f:
                    payload = json.loads(await f.read())
                items.append((task_file.stat().st_mtime, payload))
            except Exception:
                continue

        items.sort(key=lambda item: item[0], reverse=True)
        return [item[1] for item in items[:max_items]]

    async def stop_task(self, task_id: str) -> bool:
        async with self._lock:
            running = self._running.get(task_id)
            if running:
                running.cancel()
                return True

        payload = await self._load(task_id)
        if payload is None:
            return False

        status = str(payload.get("status", ""))
        if status in {"completed", "failed", "cancelled"}:
            return False

        payload["status"] = "cancelled"
        payload["completed_at"] = _utc_now()
        payload["error"] = "Task cancelled"
        await self._save(payload)
        return True


task_manager = TaskManager()
