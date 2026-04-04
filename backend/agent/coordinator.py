import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles

from tasks.manager import task_manager

KODO_DIR = Path.home() / ".kodo"
AGENTS_DIR = KODO_DIR / "agents"
AGENTS_FILE = AGENTS_DIR / "agents.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentCoordinator:
    def __init__(self) -> None:
        AGENTS_DIR.mkdir(parents=True, exist_ok=True)

    async def _load(self) -> list[dict[str, Any]]:
        if not AGENTS_FILE.exists():
            return []
        async with aiofiles.open(AGENTS_FILE, "r") as f:
            data = json.loads(await f.read())
        if isinstance(data, list):
            return data
        return []

    async def _save(self, rows: list[dict[str, Any]]) -> None:
        tmp_file = AGENTS_FILE.with_suffix(".json.tmp")
        async with aiofiles.open(tmp_file, "w") as f:
            await f.write(json.dumps(rows, indent=2))
        tmp_file.replace(AGENTS_FILE)

    async def _sync_status(self, row: dict[str, Any]) -> dict[str, Any]:
        task_id = str(row.get("task_id", ""))
        if task_id:
            payload = await task_manager.get_task(task_id)
            if payload:
                row["status"] = payload.get("status", row.get("status", "unknown"))
                row["task_error"] = payload.get("error")
                row["task_output"] = payload.get("output", "")
                row["task_usage"] = payload.get("usage")
        return row

    async def spawn_agent(
        self,
        *,
        goal: str,
        role: str = "general",
        project_dir: str | None = None,
        parent_session_id: str | None = None,
    ) -> dict[str, Any]:
        text = goal.strip()
        if not text:
            raise ValueError("goal is required")

        agent_id = str(uuid.uuid4())
        composed_prompt = f"[Sub-Agent role={role}]\n{text}"
        task = await task_manager.create_task(
            prompt=composed_prompt,
            project_dir=project_dir,
            requested_by_session=parent_session_id,
        )

        payload = {
            "agent_id": agent_id,
            "role": role,
            "goal": text,
            "status": task.get("status", "queued"),
            "task_id": task.get("task_id"),
            "parent_session_id": parent_session_id,
            "project_dir": project_dir,
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "task_error": None,
            "task_output": "",
            "task_usage": None,
        }

        rows = await self._load()
        rows.append(payload)
        await self._save(rows)
        return payload

    async def list_agents(
        self,
        limit: int = 100,
        parent_session_id: str | None = None,
    ) -> list[dict[str, Any]]:
        rows = await self._load()
        session_filter = (parent_session_id or "").strip()
        if session_filter:
            rows = [
                row
                for row in rows
                if str(row.get("parent_session_id") or "").strip() == session_filter
            ]

        rows.sort(key=lambda row: str(row.get("updated_at", "")), reverse=True)
        items = rows[: max(1, min(limit, 500))]

        changed = False
        for row in items:
            before = row.get("status")
            await self._sync_status(row)
            row["updated_at"] = _utc_now()
            if row.get("status") != before:
                changed = True

        if changed:
            existing = {str(item.get("agent_id", "")): item for item in rows}
            for item in items:
                existing[str(item.get("agent_id", ""))] = item
            await self._save(list(existing.values()))

        return items

    async def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        rows = await self._load()
        for row in rows:
            if str(row.get("agent_id", "")) == agent_id:
                await self._sync_status(row)
                row["updated_at"] = _utc_now()
                await self._save(rows)
                return row
        return None

    async def stop_agent(self, agent_id: str) -> bool:
        rows = await self._load()
        changed = False
        for row in rows:
            if str(row.get("agent_id", "")) != agent_id:
                continue
            task_id = str(row.get("task_id", ""))
            if not task_id:
                return False
            stopped = await task_manager.stop_task(task_id)
            if stopped:
                row["status"] = "cancelled"
                row["updated_at"] = _utc_now()
                changed = True
            if changed:
                await self._save(rows)
            return stopped
        return False


agent_coordinator = AgentCoordinator()
