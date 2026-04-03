import json
import aiofiles
from datetime import datetime
from pathlib import Path
from typing import Any


KODO_DIR = Path.home() / ".kodo"
GLOBAL_MEMORY_FILE = KODO_DIR / "MEMORY.md"
SESSIONS_DIR = KODO_DIR / "sessions"

DEFAULT_MEMORY = """# KŌDO Memory

This file is automatically loaded into every conversation as context.
Edit it to tell KŌDO about your preferences, projects, and workflow.

## My Setup
- OS: (fill in)
- Primary languages: (fill in)
- Projects directory: (fill in)

## Preferences
- (Add your coding preferences here)

## Notes
- (Persistent notes for KŌDO)
"""


class MemoryManager:
    def __init__(self):
        KODO_DIR.mkdir(exist_ok=True)
        SESSIONS_DIR.mkdir(exist_ok=True)
        if not GLOBAL_MEMORY_FILE.exists():
            GLOBAL_MEMORY_FILE.write_text(DEFAULT_MEMORY, encoding="utf-8")

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
            merged_metadata.update(metadata)

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
            if not isinstance(content, str):
                content = str(content)
            normalized_messages.append({"role": role, "content": content})

        await self.save_session(
            session_id=session_id,
            messages=normalized_messages,
            metadata=metadata if isinstance(metadata, dict) else {},
        )
        return session_id


memory_manager = MemoryManager()
