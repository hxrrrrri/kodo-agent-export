import json
import aiofiles
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


KODO_DIR = Path.home() / ".kodo"
GLOBAL_MEMORY_FILE = KODO_DIR / "MEMORY.md"
SESSIONS_DIR = KODO_DIR / "sessions"
CHECKPOINTS_DIR = KODO_DIR / "checkpoints"

DEFAULT_MEMORY = """# KODO Memory

This file is automatically loaded into every conversation as context.
Edit it to tell KODO about your preferences, projects, and workflow.

## My Setup
- OS: (fill in)
- Primary languages: (fill in)
- Projects directory: (fill in)

## Preferences
- (Add your coding preferences here)

## Notes
- (Persistent notes for KODO)
"""


class MemoryManager:
    def __init__(self):
        KODO_DIR.mkdir(exist_ok=True)
        SESSIONS_DIR.mkdir(exist_ok=True)
        CHECKPOINTS_DIR.mkdir(exist_ok=True)
        if not GLOBAL_MEMORY_FILE.exists():
            GLOBAL_MEMORY_FILE.write_text(DEFAULT_MEMORY, encoding="utf-8")

    async def create_checkpoint(
        self,
        session_id: str,
        messages: list[dict],
        label: str | None = None,
    ) -> str:
        checkpoint_id = f"cp_{uuid.uuid4().hex[:12]}"
        created_at = datetime.utcnow().isoformat()
        session_dir = CHECKPOINTS_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        payload = {
            "checkpoint_id": checkpoint_id,
            "session_id": session_id,
            "label": (label or "").strip() or None,
            "created_at": created_at,
            "message_count": len(messages),
            "messages": messages,
        }

        target = session_dir / f"{checkpoint_id}.json"
        tmp = session_dir / f"{checkpoint_id}.json.tmp"
        async with aiofiles.open(tmp, "w", encoding="utf-8") as f:
            await f.write(json.dumps(payload, ensure_ascii=True, indent=2))
        tmp.replace(target)
        return checkpoint_id

    async def list_checkpoints(self, session_id: str) -> list[dict]:
        session_dir = CHECKPOINTS_DIR / session_id
        if not session_dir.exists():
            return []

        rows: list[dict[str, Any]] = []
        for item in sorted(session_dir.glob("cp_*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                async with aiofiles.open(item, "r", encoding="utf-8") as f:
                    data = json.loads(await f.read())
                if not isinstance(data, dict):
                    continue
                rows.append(
                    {
                        "checkpoint_id": str(data.get("checkpoint_id", item.stem)),
                        "label": data.get("label"),
                        "message_count": int(data.get("message_count", 0) or 0),
                        "created_at": str(data.get("created_at", "")),
                    }
                )
            except Exception:
                continue
        return rows

    async def restore_checkpoint(self, session_id: str, checkpoint_id: str) -> list[dict]:
        target = CHECKPOINTS_DIR / session_id / f"{checkpoint_id}.json"
        if not target.exists():
            raise ValueError("Checkpoint not found")

        async with aiofiles.open(target, "r", encoding="utf-8") as f:
            data = json.loads(await f.read())
        if not isinstance(data, dict):
            raise ValueError("Invalid checkpoint payload")

        messages = data.get("messages", [])
        if not isinstance(messages, list):
            raise ValueError("Invalid checkpoint messages")
        return messages

    async def load_memory(self, project_dir: str | None = None) -> str:
        """Load global + project memory into a system prompt section."""
        parts = []

        # Global memory
        if GLOBAL_MEMORY_FILE.exists():
            async with aiofiles.open(GLOBAL_MEMORY_FILE, "r") as f:
                content = await f.read()
            if content.strip():
                parts.append(f"## Global Memory (from ~/.kodo/MEMORY.md)\n{content}")

        # Project memory
        if project_dir:
            project_memory = Path(project_dir) / "PROJECT.md"
            if project_memory.exists():
                async with aiofiles.open(project_memory, "r") as f:
                    content = await f.read()
                if content.strip():
                    parts.append(f"## Project Memory (from {project_dir}/PROJECT.md)\n{content}")

        if not parts:
            return ""

        return "# Persistent Memory\n" + "\n\n".join(parts)

    async def save_session(self, session_id: str, messages: list[dict], metadata: dict | None = None):
        session_file = SESSIONS_DIR / f"{session_id}.json"
        merged_metadata: dict[str, Any] = {}

        if session_file.exists():
            try:
                async with aiofiles.open(session_file, "r") as f:
                    existing = json.loads(await f.read())
                existing_metadata = existing.get("metadata", {}) if isinstance(existing, dict) else {}
                if isinstance(existing_metadata, dict):
                    merged_metadata.update(existing_metadata)
            except Exception:
                merged_metadata = {}

        if isinstance(metadata, dict):
            for key, value in metadata.items():
                normalized_key = str(key)
                if value is None:
                    merged_metadata.pop(normalized_key, None)
                else:
                    merged_metadata[normalized_key] = value

        data = {
            "session_id": session_id,
            "updated_at": datetime.utcnow().isoformat(),
            "metadata": merged_metadata,
            "messages": messages,
        }
        tmp_file = session_file.with_suffix(".json.tmp")
        async with aiofiles.open(tmp_file, "w") as f:
            await f.write(json.dumps(data, indent=2))
        tmp_file.replace(session_file)

    async def load_session(self, session_id: str) -> list[dict]:
        session_file = SESSIONS_DIR / f"{session_id}.json"
        if not session_file.exists():
            return []
        async with aiofiles.open(session_file, "r") as f:
            data = json.loads(await f.read())
        return data.get("messages", [])

    async def load_session_payload(self, session_id: str) -> dict[str, Any] | None:
        session_file = SESSIONS_DIR / f"{session_id}.json"
        if not session_file.exists():
            return None
        async with aiofiles.open(session_file, "r") as f:
            data = json.loads(await f.read())
        if not isinstance(data, dict):
            return None
        return data

    async def get_session_metadata(self, session_id: str) -> dict[str, Any]:
        payload = await self.load_session_payload(session_id)
        if payload is None:
            return {}
        metadata = payload.get("metadata", {})
        return metadata if isinstance(metadata, dict) else {}

    async def update_session_metadata(
        self,
        session_id: str,
        updates: dict[str, Any],
        *,
        create_if_missing: bool = True,
    ) -> dict[str, Any]:
        payload = await self.load_session_payload(session_id)
        if payload is None:
            if not create_if_missing:
                raise ValueError("Session not found")
            payload = {
                "session_id": session_id,
                "metadata": {},
                "messages": [],
            }

        metadata = payload.get("metadata", {})
        if not isinstance(metadata, dict):
            metadata = {}

        for key, value in updates.items():
            if value is None:
                metadata.pop(str(key), None)
            else:
                metadata[str(key)] = value

        await self.save_session(
            session_id=session_id,
            messages=payload.get("messages", []),
            metadata=metadata,
        )
        return metadata

    async def mark_session_activity(self, session_id: str) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        payload = await self.load_session_payload(session_id)

        metadata: dict[str, Any]
        if isinstance(payload, dict):
            candidate = payload.get("metadata", {})
            metadata = dict(candidate) if isinstance(candidate, dict) else {}
        else:
            metadata = {}

        previous_last_active = metadata.get("last_active_at")
        if isinstance(previous_last_active, str) and previous_last_active.strip():
            metadata["previous_active_at"] = previous_last_active
        metadata["last_active_at"] = now

        messages = payload.get("messages", []) if isinstance(payload, dict) else []
        if not isinstance(messages, list):
            messages = []

        await self.save_session(session_id=session_id, messages=messages, metadata=metadata)
        return metadata

    async def get_session_away_seconds(self, session_id: str) -> int:
        metadata = await self.get_session_metadata(session_id)
        raw_last_active = metadata.get("last_active_at")
        if not isinstance(raw_last_active, str) or not raw_last_active.strip():
            return 0

        try:
            last_active = datetime.fromisoformat(raw_last_active)
        except Exception:
            return 0

        if last_active.tzinfo is None:
            last_active = last_active.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        delta = (now - last_active).total_seconds()
        if delta <= 0:
            return 0
        return int(delta)

    async def build_session_recap(self, session_id: str, limit: int = 6) -> dict[str, Any]:
        payload = await self.load_session_payload(session_id)
        if payload is None:
            raise ValueError("Session not found")

        messages = payload.get("messages", []) if isinstance(payload, dict) else []
        if not isinstance(messages, list):
            messages = []

        away_seconds = await self.get_session_away_seconds(session_id)

        highlights: list[str] = []
        for message in messages[-max(1, limit * 2):]:
            if not isinstance(message, dict):
                continue
            role = str(message.get("role", "")).strip().lower()
            if role not in {"user", "assistant"}:
                continue

            content = message.get("content", "")
            text = ""
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                chunks: list[str] = []
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if str(block.get("type", "")).lower() != "text":
                        continue
                    value = block.get("text")
                    if isinstance(value, str) and value.strip():
                        chunks.append(value.strip())
                text = "\n".join(chunks)
            else:
                text = str(content or "")

            snippet = " ".join(text.split()).strip()
            if not snippet:
                continue
            if len(snippet) > 140:
                snippet = snippet[:137].rstrip() + "..."
            highlights.append(f"{role}: {snippet}")

        highlights = highlights[-limit:]

        if not highlights:
            summary = "No recent conversation context to recap yet."
        else:
            summary = (
                "Recent context: "
                + " | ".join(highlights[-3:])
            )

        return {
            "session_id": session_id,
            "away_seconds": away_seconds,
            "highlights": highlights,
            "summary": summary,
        }

    async def list_sessions(self) -> list[dict]:
        sessions = []
        for f in sorted(SESSIONS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                async with aiofiles.open(f, "r") as fp:
                    data = json.loads(await fp.read())
                sessions.append({
                    "session_id": data["session_id"],
                    "updated_at": data.get("updated_at", ""),
                    "message_count": len(data.get("messages", [])),
                    "title": data.get("metadata", {}).get("title", "Untitled"),
                    "mode": data.get("metadata", {}).get("mode", "execute"),
                })
            except Exception:
                continue
        return sessions

    async def delete_session(self, session_id: str) -> bool:
        session_file = SESSIONS_DIR / f"{session_id}.json"
        if session_file.exists():
            session_file.unlink()
            return True
        return False

    async def append_to_memory(self, content: str, section: str | None = None):
        """Append a note to the global memory file."""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        heading = section.strip() if isinstance(section, str) and section.strip() else "Note"
        note = f"\n## {heading} [{timestamp}]\n{content}\n"
        async with aiofiles.open(GLOBAL_MEMORY_FILE, "a") as f:
            await f.write(note)

    async def import_session_payload(
        self,
        payload: dict[str, Any],
        override_session_id: str | None = None,
    ) -> str:
        messages = payload.get("messages", [])
        metadata = payload.get("metadata", {})
        session_id = (override_session_id or payload.get("session_id") or "").strip()

        if not session_id:
            session_id = datetime.utcnow().strftime("imported-%Y%m%d%H%M%S")

        if not isinstance(messages, list):
            raise ValueError("messages must be a list")

        normalized_messages: list[dict[str, Any]] = []
        for item in messages:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role", "")).strip()
            content = item.get("content", "")
            if role not in {"user", "assistant", "system"}:
                continue
            if not isinstance(content, (str, list)):
                content = str(content)
            normalized_messages.append({"role": role, "content": content})

        await self.save_session(
            session_id=session_id,
            messages=normalized_messages,
            metadata=metadata if isinstance(metadata, dict) else {},
        )
        return session_id


memory_manager = MemoryManager()
