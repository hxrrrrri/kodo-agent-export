import os
import json
import aiofiles
from datetime import datetime
from pathlib import Path


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
        data = {
            "session_id": session_id,
            "updated_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {},
            "messages": messages,
        }
        async with aiofiles.open(session_file, "w") as f:
            await f.write(json.dumps(data, indent=2))

    async def load_session(self, session_id: str) -> list[dict]:
        session_file = SESSIONS_DIR / f"{session_id}.json"
        if not session_file.exists():
            return []
        async with aiofiles.open(session_file, "r") as f:
            data = json.loads(await f.read())
        return data.get("messages", [])

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

    async def append_to_memory(self, content: str):
        """Append a note to the global memory file."""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        note = f"\n## Note [{timestamp}]\n{content}\n"
        async with aiofiles.open(GLOBAL_MEMORY_FILE, "a") as f:
            await f.write(note)


memory_manager = MemoryManager()
