import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles

KODO_DIR = Path.home() / ".kodo"
BRIDGE_DIR = KODO_DIR / "bridge"
SESSIONS_FILE = BRIDGE_DIR / "sessions.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class BridgeSessionManager:
    def __init__(self) -> None:
        BRIDGE_DIR.mkdir(parents=True, exist_ok=True)

    async def _load(self) -> list[dict[str, Any]]:
        if not SESSIONS_FILE.exists():
            return []
        async with aiofiles.open(SESSIONS_FILE, "r") as f:
            data = json.loads(await f.read())
        if isinstance(data, list):
            return data
        return []

    async def _save(self, rows: list[dict[str, Any]]) -> None:
        async with aiofiles.open(SESSIONS_FILE, "w") as f:
            await f.write(json.dumps(rows, indent=2))

    async def create_session(self, client_name: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = {
            "bridge_session_id": str(uuid.uuid4()),
            "client_name": client_name.strip() or "unknown-client",
            "metadata": metadata or {},
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "last_seen_at": _utc_now(),
        }
        rows = await self._load()
        rows.append(payload)
        await self._save(rows)
        return payload

    async def list_sessions(self) -> list[dict[str, Any]]:
        rows = await self._load()
        rows.sort(key=lambda row: str(row.get("updated_at", "")), reverse=True)
        return rows

    async def get_session(self, bridge_session_id: str) -> dict[str, Any] | None:
        rows = await self._load()
        for row in rows:
            if str(row.get("bridge_session_id", "")) == bridge_session_id:
                return row
        return None

    async def touch_session(self, bridge_session_id: str) -> bool:
        rows = await self._load()
        touched = False
        for row in rows:
            if str(row.get("bridge_session_id", "")) == bridge_session_id:
                row["last_seen_at"] = _utc_now()
                row["updated_at"] = _utc_now()
                touched = True
                break

        if touched:
            await self._save(rows)
        return touched


bridge_session_manager = BridgeSessionManager()
