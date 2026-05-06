from __future__ import annotations

import asyncio
import json
import logging
import secrets
import string
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import aiosqlite

from .types import CapsuleVersion, CodeRef, KodoCapsule, SessionStats, TokenEvent, utc_now_iso

logger = logging.getLogger(__name__)


def _default_db_path() -> Path:
    return Path.home() / ".kodo" / "capsule" / "capsules.db"


def new_id(size: int = 21) -> str:
    alphabet = string.ascii_letters + string.digits + "_-"
    try:
        from nanoid import generate

        return str(generate(alphabet, size=size))
    except Exception:
        return "".join(secrets.choice(alphabet) for _ in range(size))


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), default=str)


def _json_loads(value: str, fallback: Any) -> Any:
    try:
        parsed = json.loads(value or "")
    except Exception:
        return fallback
    return parsed


def _code_refs_to_json(refs: list[CodeRef]) -> str:
    return _json_dumps([ref.model_dump() for ref in refs])


def _code_refs_from_json(value: str) -> list[CodeRef]:
    parsed = _json_loads(value, [])
    if not isinstance(parsed, list):
        return []
    refs: list[CodeRef] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        try:
            refs.append(CodeRef(**item))
        except Exception:
            continue
    return refs


def _text_list_from_json(value: str) -> list[str]:
    parsed = _json_loads(value, [])
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()]


SCHEMA = """
CREATE TABLE IF NOT EXISTS capsules (
    id          TEXT PRIMARY KEY,
    tag         TEXT NOT NULL,
    summary     TEXT NOT NULL,
    goals       TEXT NOT NULL,
    constraints TEXT NOT NULL,
    code_refs   TEXT NOT NULL,
    next_steps  TEXT NOT NULL,
    model_used  TEXT NOT NULL,
    provider    TEXT NOT NULL,
    tokens_at_capture     INTEGER,
    context_pct_at_capture REAL,
    agent_id    TEXT,
    team_folder TEXT DEFAULT 'default',
    tags        TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capsule_versions (
    id              TEXT PRIMARY KEY,
    capsule_id      TEXT NOT NULL REFERENCES capsules(id) ON DELETE CASCADE,
    version_number  INTEGER NOT NULL,
    summary         TEXT NOT NULL,
    goals           TEXT NOT NULL,
    constraints     TEXT NOT NULL,
    code_refs       TEXT NOT NULL,
    next_steps      TEXT NOT NULL,
    tokens_at_save  INTEGER,
    change_note     TEXT,
    created_at      TEXT NOT NULL,
    UNIQUE(capsule_id, version_number)
);

CREATE TABLE IF NOT EXISTS token_events (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    agent_id        TEXT,
    provider        TEXT NOT NULL,
    model           TEXT NOT NULL,
    input_tokens    INTEGER NOT NULL,
    output_tokens   INTEGER NOT NULL,
    cumulative_input  INTEGER NOT NULL,
    cumulative_output INTEGER NOT NULL,
    context_pct     REAL NOT NULL,
    rate_limit_pct  REAL,
    timestamp       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    agent_id    TEXT,
    provider    TEXT NOT NULL,
    model       TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    last_active TEXT NOT NULL,
    total_input_tokens  INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    capsules_created    INTEGER DEFAULT 0,
    compressions_done   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_capsules_updated ON capsules(updated_at);
CREATE INDEX IF NOT EXISTS idx_capsules_team ON capsules(team_folder);
CREATE INDEX IF NOT EXISTS idx_capsule_versions_capsule ON capsule_versions(capsule_id, version_number);
CREATE INDEX IF NOT EXISTS idx_token_events_session ON token_events(session_id, timestamp);
"""


class CapsuleStore:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = Path(db_path) if db_path else _default_db_path()
        self._init_lock = asyncio.Lock()
        self._initialized = False

    async def _connect(self) -> aiosqlite.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        db = await aiosqlite.connect(self.db_path)
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")
        await db.execute("PRAGMA busy_timeout=5000")
        return db

    @asynccontextmanager
    async def _connection(self):
        db = await self._connect()
        try:
            yield db
        finally:
            await db.close()

    async def initialize(self) -> None:
        if self._initialized:
            return
        async with self._init_lock:
            if self._initialized:
                return
            async with self._connection() as db:
                await db.executescript(SCHEMA)
                await db.commit()
            self._initialized = True

    async def _ensure(self) -> None:
        await self.initialize()

    def _capsule_from_row(self, row: aiosqlite.Row) -> KodoCapsule:
        return KodoCapsule(
            id=str(row["id"]),
            tag=str(row["tag"]),
            summary=str(row["summary"]),
            goals=_text_list_from_json(str(row["goals"])),
            constraints=_text_list_from_json(str(row["constraints"])),
            code_refs=_code_refs_from_json(str(row["code_refs"])),
            next_steps=_text_list_from_json(str(row["next_steps"])),
            model_used=str(row["model_used"]),
            provider=str(row["provider"]),
            tokens_at_capture=row["tokens_at_capture"],
            context_pct_at_capture=row["context_pct_at_capture"],
            agent_id=row["agent_id"],
            team_folder=str(row["team_folder"] or "default"),
            tags=_text_list_from_json(str(row["tags"])),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    def _version_from_row(self, row: aiosqlite.Row) -> CapsuleVersion:
        return CapsuleVersion(
            id=str(row["id"]),
            capsule_id=str(row["capsule_id"]),
            version_number=int(row["version_number"]),
            summary=str(row["summary"]),
            goals=_text_list_from_json(str(row["goals"])),
            constraints=_text_list_from_json(str(row["constraints"])),
            code_refs=_code_refs_from_json(str(row["code_refs"])),
            next_steps=_text_list_from_json(str(row["next_steps"])),
            tokens_at_save=row["tokens_at_save"],
            change_note=row["change_note"],
            created_at=str(row["created_at"]),
        )

    async def save_capsule(self, capsule: KodoCapsule) -> str:
        try:
            await self._ensure()
            now = utc_now_iso()
            capsule.id = capsule.id or new_id()
            capsule.created_at = capsule.created_at or now
            capsule.updated_at = now
            async with self._connection() as db:
                await db.execute(
                    """
                    INSERT INTO capsules (
                        id, tag, summary, goals, constraints, code_refs, next_steps,
                        model_used, provider, tokens_at_capture, context_pct_at_capture,
                        agent_id, team_folder, tags, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        tag=excluded.tag,
                        summary=excluded.summary,
                        goals=excluded.goals,
                        constraints=excluded.constraints,
                        code_refs=excluded.code_refs,
                        next_steps=excluded.next_steps,
                        model_used=excluded.model_used,
                        provider=excluded.provider,
                        tokens_at_capture=excluded.tokens_at_capture,
                        context_pct_at_capture=excluded.context_pct_at_capture,
                        agent_id=excluded.agent_id,
                        team_folder=excluded.team_folder,
                        tags=excluded.tags,
                        updated_at=excluded.updated_at
                    """,
                    (
                        capsule.id,
                        capsule.tag,
                        capsule.summary,
                        _json_dumps(capsule.goals),
                        _json_dumps(capsule.constraints),
                        _code_refs_to_json(capsule.code_refs),
                        _json_dumps(capsule.next_steps),
                        capsule.model_used,
                        capsule.provider,
                        capsule.tokens_at_capture,
                        capsule.context_pct_at_capture,
                        capsule.agent_id,
                        capsule.team_folder or "default",
                        _json_dumps(capsule.tags),
                        capsule.created_at,
                        capsule.updated_at,
                    ),
                )
                cur = await db.execute("SELECT COUNT(*) FROM capsule_versions WHERE capsule_id = ?", (capsule.id,))
                version_count = int((await cur.fetchone())[0])
                if version_count == 0:
                    await db.execute(
                        """
                        INSERT INTO capsule_versions (
                            id, capsule_id, version_number, summary, goals, constraints,
                            code_refs, next_steps, tokens_at_save, change_note, created_at
                        )
                        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            new_id(),
                            capsule.id,
                            capsule.summary,
                            _json_dumps(capsule.goals),
                            _json_dumps(capsule.constraints),
                            _code_refs_to_json(capsule.code_refs),
                            _json_dumps(capsule.next_steps),
                            capsule.tokens_at_capture,
                            "initial save",
                            now,
                        ),
                    )
                await db.execute(
                    """
                    UPDATE sessions
                    SET capsules_created = capsules_created + 1, last_active = ?
                    WHERE id = ?
                    """,
                    (now, capsule.agent_id or capsule.id),
                )
                await db.commit()
            return capsule.id
        except Exception as exc:
            raise RuntimeError(f"Failed to save capsule: {exc}") from exc

    async def get_capsule(self, id: str) -> KodoCapsule | None:
        try:
            await self._ensure()
            async with self._connection() as db:
                cur = await db.execute("SELECT * FROM capsules WHERE id = ?", (id.strip(),))
                row = await cur.fetchone()
            return self._capsule_from_row(row) if row else None
        except Exception as exc:
            raise RuntimeError(f"Failed to load capsule {id}: {exc}") from exc

    async def get_all_capsules(self) -> list[KodoCapsule]:
        try:
            await self._ensure()
            async with self._connection() as db:
                cur = await db.execute("SELECT * FROM capsules ORDER BY updated_at DESC")
                rows = await cur.fetchall()
            return [self._capsule_from_row(row) for row in rows]
        except Exception as exc:
            raise RuntimeError(f"Failed to list capsules: {exc}") from exc

    async def search_capsules(self, query: str) -> list[KodoCapsule]:
        try:
            needle = query.strip().casefold()
            capsules = await self.get_all_capsules()
            if not needle:
                return capsules
            result: list[KodoCapsule] = []
            for capsule in capsules:
                haystack = "\n".join(
                    [
                        capsule.id,
                        capsule.tag,
                        capsule.summary,
                        " ".join(capsule.goals),
                        " ".join(capsule.constraints),
                        " ".join(capsule.next_steps),
                        " ".join(capsule.tags),
                        capsule.team_folder,
                        " ".join(f"{ref.file} {ref.snippet} {ref.lang}" for ref in capsule.code_refs),
                    ]
                ).casefold()
                if needle in haystack:
                    result.append(capsule)
            return result
        except Exception as exc:
            raise RuntimeError(f"Failed to search capsules: {exc}") from exc

    async def delete_capsule(self, id: str) -> bool:
        try:
            await self._ensure()
            async with self._connection() as db:
                cur = await db.execute("DELETE FROM capsules WHERE id = ?", (id.strip(),))
                await db.commit()
                return cur.rowcount > 0
        except Exception as exc:
            raise RuntimeError(f"Failed to delete capsule {id}: {exc}") from exc

    async def add_version(self, capsule_id: str, version: CapsuleVersion, note: str) -> None:
        try:
            await self._ensure()
            now = utc_now_iso()
            async with self._connection() as db:
                cur = await db.execute("SELECT MAX(version_number) FROM capsule_versions WHERE capsule_id = ?", (capsule_id,))
                max_row = await cur.fetchone()
                next_version = int(max_row[0] or 0) + 1
                await db.execute(
                    """
                    INSERT INTO capsule_versions (
                        id, capsule_id, version_number, summary, goals, constraints,
                        code_refs, next_steps, tokens_at_save, change_note, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        version.id or new_id(),
                        capsule_id,
                        next_version,
                        version.summary,
                        _json_dumps(version.goals),
                        _json_dumps(version.constraints),
                        _code_refs_to_json(version.code_refs),
                        _json_dumps(version.next_steps),
                        version.tokens_at_save,
                        (note or version.change_note or "").strip() or None,
                        now,
                    ),
                )
                await db.execute(
                    """
                    UPDATE capsules
                    SET summary = ?, goals = ?, constraints = ?, code_refs = ?, next_steps = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        version.summary,
                        _json_dumps(version.goals),
                        _json_dumps(version.constraints),
                        _code_refs_to_json(version.code_refs),
                        _json_dumps(version.next_steps),
                        now,
                        capsule_id,
                    ),
                )
                await db.commit()
        except Exception as exc:
            raise RuntimeError(f"Failed to add capsule version: {exc}") from exc

    async def get_versions(self, capsule_id: str) -> list[CapsuleVersion]:
        try:
            await self._ensure()
            async with self._connection() as db:
                cur = await db.execute(
                    "SELECT * FROM capsule_versions WHERE capsule_id = ? ORDER BY version_number DESC",
                    (capsule_id.strip(),),
                )
                rows = await cur.fetchall()
            return [self._version_from_row(row) for row in rows]
        except Exception as exc:
            raise RuntimeError(f"Failed to list versions for capsule {capsule_id}: {exc}") from exc

    async def rollback_to_version(self, capsule_id: str, version_number: int) -> KodoCapsule:
        try:
            await self._ensure()
            async with self._connection() as db:
                cur = await db.execute(
                    "SELECT * FROM capsule_versions WHERE capsule_id = ? AND version_number = ?",
                    (capsule_id.strip(), int(version_number)),
                )
                row = await cur.fetchone()
                if row is None:
                    raise ValueError(f"Capsule version not found: {capsule_id} v{version_number}")
                version = self._version_from_row(row)
                now = utc_now_iso()
                await db.execute(
                    """
                    UPDATE capsules
                    SET summary = ?, goals = ?, constraints = ?, code_refs = ?, next_steps = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        version.summary,
                        _json_dumps(version.goals),
                        _json_dumps(version.constraints),
                        _code_refs_to_json(version.code_refs),
                        _json_dumps(version.next_steps),
                        now,
                        capsule_id,
                    ),
                )
                await db.commit()
            capsule = await self.get_capsule(capsule_id)
            if capsule is None:
                raise ValueError(f"Capsule not found after rollback: {capsule_id}")
            return capsule
        except Exception as exc:
            if isinstance(exc, ValueError):
                raise
            raise RuntimeError(f"Failed to rollback capsule {capsule_id}: {exc}") from exc

    async def export_to_json(self, path: str) -> None:
        try:
            await self._ensure()
            out_path = Path(path).expanduser()
            out_path.parent.mkdir(parents=True, exist_ok=True)
            async with self._connection() as db:
                payload: dict[str, Any] = {"exported_at": utc_now_iso(), "capsules": [], "versions": [], "token_events": [], "sessions": []}
                for table in ("capsules", "capsule_versions", "token_events", "sessions"):
                    cur = await db.execute(f"SELECT * FROM {table}")
                    rows = await cur.fetchall()
                    key = "versions" if table == "capsule_versions" else table
                    payload[key] = [dict(row) for row in rows]
            out_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        except Exception as exc:
            raise RuntimeError(f"Failed to export capsules: {exc}") from exc

    async def import_from_json(self, path: str) -> int:
        try:
            await self._ensure()
            in_path = Path(path).expanduser()
            if not in_path.exists():
                raise ValueError(f"Import file not found: {path}")
            payload = json.loads(in_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Import payload must be a JSON object")
            count = 0
            async with self._connection() as db:
                for row in payload.get("capsules", []):
                    if not isinstance(row, dict):
                        continue
                    await db.execute(
                        """
                        INSERT OR REPLACE INTO capsules (
                            id, tag, summary, goals, constraints, code_refs, next_steps,
                            model_used, provider, tokens_at_capture, context_pct_at_capture,
                            agent_id, team_folder, tags, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            row.get("id") or new_id(),
                            row.get("tag") or "Imported",
                            row.get("summary") or "",
                            row.get("goals") or "[]",
                            row.get("constraints") or "[]",
                            row.get("code_refs") or "[]",
                            row.get("next_steps") or "[]",
                            row.get("model_used") or "unknown",
                            row.get("provider") or "unknown",
                            row.get("tokens_at_capture"),
                            row.get("context_pct_at_capture"),
                            row.get("agent_id"),
                            row.get("team_folder") or "default",
                            row.get("tags") or "[]",
                            row.get("created_at") or utc_now_iso(),
                            row.get("updated_at") or utc_now_iso(),
                        ),
                    )
                    count += 1
                for row in payload.get("versions", []):
                    if not isinstance(row, dict):
                        continue
                    await db.execute(
                        """
                        INSERT OR REPLACE INTO capsule_versions (
                            id, capsule_id, version_number, summary, goals, constraints,
                            code_refs, next_steps, tokens_at_save, change_note, created_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            row.get("id") or new_id(),
                            row.get("capsule_id"),
                            int(row.get("version_number") or 1),
                            row.get("summary") or "",
                            row.get("goals") or "[]",
                            row.get("constraints") or "[]",
                            row.get("code_refs") or "[]",
                            row.get("next_steps") or "[]",
                            row.get("tokens_at_save"),
                            row.get("change_note"),
                            row.get("created_at") or utc_now_iso(),
                        ),
                    )
                await db.commit()
            return count
        except Exception as exc:
            if isinstance(exc, ValueError):
                raise
            raise RuntimeError(f"Failed to import capsules: {exc}") from exc

    async def log_token_event(self, event: TokenEvent) -> None:
        try:
            await self._ensure()
            event.id = event.id or new_id()
            now = event.timestamp or utc_now_iso()
            async with self._connection() as db:
                await db.execute(
                    """
                    INSERT INTO token_events (
                        id, session_id, agent_id, provider, model, input_tokens, output_tokens,
                        cumulative_input, cumulative_output, context_pct, rate_limit_pct, timestamp
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event.id,
                        event.session_id,
                        event.agent_id,
                        event.provider,
                        event.model,
                        event.input_tokens,
                        event.output_tokens,
                        event.cumulative_input,
                        event.cumulative_output,
                        event.context_pct,
                        event.rate_limit_pct,
                        now,
                    ),
                )
                await db.execute(
                    """
                    INSERT INTO sessions (
                        id, agent_id, provider, model, started_at, last_active,
                        total_input_tokens, total_output_tokens, capsules_created, compressions_done
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
                    ON CONFLICT(id) DO UPDATE SET
                        agent_id = COALESCE(excluded.agent_id, sessions.agent_id),
                        provider = excluded.provider,
                        model = excluded.model,
                        last_active = excluded.last_active,
                        total_input_tokens = excluded.total_input_tokens,
                        total_output_tokens = excluded.total_output_tokens
                    """,
                    (
                        event.session_id,
                        event.agent_id,
                        event.provider,
                        event.model,
                        now,
                        now,
                        event.cumulative_input,
                        event.cumulative_output,
                    ),
                )
                await db.commit()
        except Exception as exc:
            logger.warning("Failed to log capsule token event: %s", exc)

    async def get_session_stats(self, session_id: str) -> SessionStats:
        try:
            await self._ensure()
            async with self._connection() as db:
                cur = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id.strip(),))
                row = await cur.fetchone()
                event_cur = await db.execute(
                    "SELECT context_pct, rate_limit_pct FROM token_events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1",
                    (session_id.strip(),),
                )
                latest_event = await event_cur.fetchone()
            if row is None:
                return SessionStats(id=session_id, provider="unknown", model="unknown")
            context_pct = float(latest_event["context_pct"] or 0) if latest_event else 0.0
            rate_pct = latest_event["rate_limit_pct"] if latest_event else None
            worst = max(context_pct, float(rate_pct or 0))
            if worst >= 95:
                alert_level = "critical"
            elif worst >= 90:
                alert_level = "pulsating"
            elif worst >= 75:
                alert_level = "warning"
            else:
                alert_level = "idle"
            reason = f"Context window {context_pct:.1f}% full"
            if rate_pct is not None and float(rate_pct) > context_pct:
                reason = f"Rate limit {float(rate_pct):.1f}% used"
            return SessionStats(
                id=str(row["id"]),
                agent_id=row["agent_id"],
                provider=str(row["provider"]),
                model=str(row["model"]),
                started_at=str(row["started_at"]),
                last_active=str(row["last_active"]),
                total_input_tokens=int(row["total_input_tokens"] or 0),
                total_output_tokens=int(row["total_output_tokens"] or 0),
                capsules_created=int(row["capsules_created"] or 0),
                compressions_done=int(row["compressions_done"] or 0),
                context_pct=context_pct,
                alert_level=alert_level,
                alert_reason=reason,
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to load session stats for {session_id}: {exc}") from exc

    async def increment_compressions(self, session_id: str) -> None:
        try:
            await self._ensure()
            async with self._connection() as db:
                await db.execute(
                    """
                    INSERT INTO sessions (id, provider, model, started_at, last_active, compressions_done)
                    VALUES (?, 'unknown', 'unknown', ?, ?, 1)
                    ON CONFLICT(id) DO UPDATE SET
                        compressions_done = compressions_done + 1,
                        last_active = excluded.last_active
                    """,
                    (session_id, utc_now_iso(), utc_now_iso()),
                )
                await db.commit()
        except Exception as exc:
            logger.warning("Failed to increment compression count: %s", exc)


capsule_store = CapsuleStore()
