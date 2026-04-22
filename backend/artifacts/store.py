"""Session-level artifact store.

Persists artifact versions separately from chat messages so the UI can show a
version timeline and the share endpoint can serve a specific (session_id,
artifact_id) without parsing message history. LRU-capped per session to avoid
unbounded growth.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles

KODO_DIR = Path.home() / ".kodo"
ARTIFACTS_DIR = KODO_DIR / "artifacts"
MAX_VERSIONS_PER_ARTIFACT = 50
MAX_ARTIFACTS_PER_SESSION = 100


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ArtifactStore:
    """Stores artifacts on disk at ~/.kodo/artifacts/<session_id>.json."""

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}

    def _path(self, session_id: str) -> Path:
        safe = "".join(ch for ch in session_id if ch.isalnum() or ch in "-_")
        if not safe:
            raise ValueError("session_id is required")
        return ARTIFACTS_DIR / f"{safe}.json"

    def _lock(self, session_id: str) -> asyncio.Lock:
        lock = self._locks.get(session_id)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[session_id] = lock
        return lock

    async def _load(self, session_id: str) -> dict[str, Any]:
        path = self._path(session_id)
        if not path.exists():
            return {"session_id": session_id, "artifacts": {}}
        try:
            async with aiofiles.open(path, "r", encoding="utf-8") as f:
                raw = await f.read()
            payload = json.loads(raw) if raw.strip() else {}
        except Exception:
            return {"session_id": session_id, "artifacts": {}}
        if not isinstance(payload, dict):
            return {"session_id": session_id, "artifacts": {}}
        if not isinstance(payload.get("artifacts"), dict):
            payload["artifacts"] = {}
        return payload

    async def _save(self, session_id: str, payload: dict[str, Any]) -> None:
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        path = self._path(session_id)
        tmp = path.with_suffix(".json.tmp")
        async with aiofiles.open(tmp, "w", encoding="utf-8") as f:
            await f.write(json.dumps(payload, ensure_ascii=True, indent=2))
        tmp.replace(path)

    async def list(self, session_id: str) -> list[dict[str, Any]]:
        async with self._lock(session_id):
            payload = await self._load(session_id)
        rows: list[dict[str, Any]] = []
        for art_id, versions in payload.get("artifacts", {}).items():
            if not isinstance(versions, list):
                continue
            latest = versions[-1] if versions else None
            if latest:
                rows.append({
                    "id": art_id,
                    "latest_version": int(latest.get("version", 1)),
                    "type": latest.get("type", "code"),
                    "title": latest.get("title", art_id),
                    "updated_at": latest.get("updated_at"),
                    "version_count": len(versions),
                })
        return rows

    async def get(
        self,
        session_id: str,
        artifact_id: str,
        version: int | None = None,
    ) -> dict[str, Any] | None:
        async with self._lock(session_id):
            payload = await self._load(session_id)
        versions = payload.get("artifacts", {}).get(artifact_id)
        if not isinstance(versions, list) or not versions:
            return None
        if version is None:
            return versions[-1]
        for row in versions:
            if int(row.get("version", 0)) == int(version):
                return row
        return None

    async def get_all_versions(self, session_id: str, artifact_id: str) -> list[dict[str, Any]]:
        async with self._lock(session_id):
            payload = await self._load(session_id)
        versions = payload.get("artifacts", {}).get(artifact_id)
        if not isinstance(versions, list):
            return []
        return list(versions)

    async def upsert(self, session_id: str, artifact: dict[str, Any]) -> dict[str, Any]:
        """Append a new version of the artifact. `artifact` must include id, version, type, title, files."""
        artifact_id = str(artifact.get("id", "")).strip()
        if not artifact_id:
            raise ValueError("artifact.id is required")

        async with self._lock(session_id):
            payload = await self._load(session_id)
            artifacts = payload["artifacts"]

            versions = artifacts.get(artifact_id)
            if not isinstance(versions, list):
                versions = []

            new_version = int(artifact.get("version", len(versions) + 1))
            entry = dict(artifact)
            entry["version"] = new_version
            entry["updated_at"] = _utc_iso()

            # Replace existing same-version entry, else append.
            replaced = False
            for idx, row in enumerate(versions):
                if int(row.get("version", 0)) == new_version:
                    versions[idx] = entry
                    replaced = True
                    break
            if not replaced:
                versions.append(entry)

            versions.sort(key=lambda v: int(v.get("version", 0)))

            # LRU eviction per-artifact.
            if len(versions) > MAX_VERSIONS_PER_ARTIFACT:
                versions = versions[-MAX_VERSIONS_PER_ARTIFACT:]

            artifacts[artifact_id] = versions

            # LRU eviction per-session (by most recently updated).
            if len(artifacts) > MAX_ARTIFACTS_PER_SESSION:
                sortable = [
                    (aid, (vs[-1].get("updated_at") if vs else ""))
                    for aid, vs in artifacts.items()
                    if isinstance(vs, list)
                ]
                sortable.sort(key=lambda row: row[1] or "")
                keep = {aid for aid, _ in sortable[-MAX_ARTIFACTS_PER_SESSION:]}
                artifacts = {aid: vs for aid, vs in artifacts.items() if aid in keep}
                payload["artifacts"] = artifacts

            await self._save(session_id, payload)
            return entry

    async def delete(self, session_id: str, artifact_id: str) -> bool:
        async with self._lock(session_id):
            payload = await self._load(session_id)
            artifacts = payload.get("artifacts", {})
            if artifact_id not in artifacts:
                return False
            artifacts.pop(artifact_id, None)
            await self._save(session_id, payload)
            return True


artifact_store = ArtifactStore()
