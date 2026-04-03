from __future__ import annotations

from memory.manager import memory_manager

from .base import BaseTool, ToolResult


class MemoryWriteTool(BaseTool):
    name = "memory_write"
    description = (
        "Append a persistent note to global memory (MEMORY.md). "
        "Use this when the user asks you to remember something, or when "
        "you discover a fact that would be useful in future sessions."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "content": {"type": "string", "description": "Text to append"},
            "section": {"type": "string", "description": "Optional section heading"},
        },
        "required": ["content"],
    }

    async def execute(self, content: str, section: str | None = None, **kwargs) -> ToolResult:
        note = (content or "").strip()
        if not note:
            return ToolResult(success=False, output="", error="content is required")

        await memory_manager.append_to_memory(note, section=(section or None))
        return ToolResult(
            success=True,
            output="Saved note to global memory.",
            metadata={"section": (section or "").strip() or None},
        )
