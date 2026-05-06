from __future__ import annotations

import base64
import hashlib
from datetime import datetime
from pathlib import Path

import aiosqlite

from .types import DesignVersion, utc_now

try:
    from nanoid import generate as nanoid_generate
except Exception:  # pragma: no cover - dependency is in requirements, fallback keeps imports resilient
    nanoid_generate = None


KODO_DIR = Path.home() / ".kodo"
DESIGN_DIR = KODO_DIR / "design"
DB_PATH = DESIGN_DIR / "history.sqlite3"


def _new_id() -> str:
    if nanoid_generate:
        return str(nanoid_generate(size=12))
    return hashlib.sha1(str(utc_now().timestamp()).encode("utf-8")).hexdigest()[:12]


def _thumbnail_placeholder(html: str) -> str:
    digest = hashlib.sha1(html.encode("utf-8", errors="ignore")).hexdigest()[:16]
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
<rect width="320" height="180" fill="#111827"/>
<rect x="24" y="24" width="180" height="18" rx="4" fill="#f8fafc"/>
<rect x="24" y="56" width="248" height="10" rx="3" fill="#64748b"/>
<rect x="24" y="82" width="72" height="44" rx="8" fill="#2563eb"/>
<rect x="112" y="82" width="72" height="44" rx="8" fill="#14b8a6"/>
<rect x="200" y="82" width="72" height="44" rx="8" fill="#f59e0b"/>
<text x="24" y="154" fill="#94a3b8" font-family="monospace" font-size="12">{digest}</text>
</svg>"""
    return base64.b64encode(svg.encode("utf-8")).decode("ascii")


def _row_to_version(row: aiosqlite.Row) -> DesignVersion:
    created = datetime.fromisoformat(str(row["created_at"]))
    return DesignVersion(
        id=str(row["id"]),
        project_id=str(row["project_id"]),
        parent_id=str(row["parent_id"]) if row["parent_id"] else None,
        html=str(row["html"]),
        thumbnail_b64=str(row["thumbnail_b64"] or ""),
        label=str(row["label"] or ""),
        prompt_that_created_it=str(row["prompt_that_created_it"] or ""),
        created_at=created,
        branch_name=str(row["branch_name"] or "main"),
        is_checkpoint=bool(row["is_checkpoint"]),
    )


class DesignHistory:
    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = db_path
        self._initialized = False

    async def _ensure_db(self) -> None:
        if self._initialized:
            return
        DESIGN_DIR.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS design_versions (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    parent_id TEXT,
                    html TEXT NOT NULL,
                    thumbnail_b64 TEXT NOT NULL,
                    label TEXT NOT NULL,
                    prompt_that_created_it TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    branch_name TEXT NOT NULL,
                    is_checkpoint INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            await db.execute("CREATE INDEX IF NOT EXISTS idx_design_versions_project ON design_versions(project_id, created_at)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_design_versions_branch ON design_versions(project_id, branch_name, created_at)")
            await db.commit()
        self._initialized = True

    async def save_version(
        self,
        project_id: str,
        html: str,
        prompt: str,
        label: str,
        parent_id: str | None = None,
        branch_name: str = "main",
        is_checkpoint: bool = False,
        thumbnail_b64: str | None = None,
    ) -> DesignVersion:
        await self._ensure_db()
        version = DesignVersion(
            id=_new_id(),
            project_id=project_id,
            parent_id=parent_id,
            html=html,
            thumbnail_b64=thumbnail_b64 or _thumbnail_placeholder(html),
            label=label or "Generation",
            prompt_that_created_it=prompt or "",
            created_at=utc_now(),
            branch_name=branch_name or "main",
            is_checkpoint=is_checkpoint,
        )
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT INTO design_versions
                (id, project_id, parent_id, html, thumbnail_b64, label, prompt_that_created_it, created_at, branch_name, is_checkpoint)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    version.id,
                    version.project_id,
                    version.parent_id,
                    version.html,
                    version.thumbnail_b64,
                    version.label,
                    version.prompt_that_created_it,
                    version.created_at.isoformat(),
                    version.branch_name,
                    1 if version.is_checkpoint else 0,
                ),
            )
            await db.commit()
        return version

    async def get_version(self, version_id: str) -> DesignVersion:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute("SELECT * FROM design_versions WHERE id = ?", (version_id,))
            row = await cur.fetchone()
        if row is None:
            raise KeyError(version_id)
        return _row_to_version(row)

    async def get_timeline(self, project_id: str) -> list[DesignVersion]:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute(
                "SELECT * FROM design_versions WHERE project_id = ? ORDER BY created_at ASC",
                (project_id,),
            )
            rows = await cur.fetchall()
        return [_row_to_version(row) for row in rows]

    async def rollback_to(self, version_id: str) -> DesignVersion:
        source = await self.get_version(version_id)
        return await self.save_version(
            project_id=source.project_id,
            html=source.html,
            prompt=f"Rollback to {version_id}",
            label=f"Rollback: {source.label}",
            parent_id=source.id,
            branch_name=source.branch_name,
        )

    async def create_branch(self, from_version_id: str, branch_name: str) -> str:
        source = await self.get_version(from_version_id)
        await self.save_version(
            project_id=source.project_id,
            html=source.html,
            prompt=f"Branch from {from_version_id}",
            label=f"Branch start: {branch_name}",
            parent_id=source.id,
            branch_name=branch_name,
            is_checkpoint=True,
            thumbnail_b64=source.thumbnail_b64,
        )
        return branch_name

    async def merge_branch(self, project_id: str, source_branch: str, target_branch: str) -> DesignVersion:
        versions = await self.get_timeline(project_id)
        source_versions = [version for version in versions if version.branch_name == source_branch]
        target_versions = [version for version in versions if version.branch_name == target_branch]
        if not source_versions:
            raise KeyError(source_branch)
        source = source_versions[-1]
        target_parent = target_versions[-1].id if target_versions else source.parent_id
        return await self.save_version(
            project_id=project_id,
            html=source.html,
            prompt=f"Merge branch {source_branch} into {target_branch}",
            label=f"Merge: {source_branch}",
            parent_id=target_parent,
            branch_name=target_branch,
            thumbnail_b64=source.thumbnail_b64,
        )

    async def mark_checkpoint(self, version_id: str, label: str) -> None:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE design_versions SET is_checkpoint = 1, label = ? WHERE id = ?",
                (label, version_id),
            )
            await db.commit()


design_history = DesignHistory()
