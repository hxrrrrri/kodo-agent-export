from __future__ import annotations

from pathlib import Path
from typing import Any

from .storage import capsule_store
from .token_tracker import token_tracker
from .tools import (
    BridgeTool,
    CaptureTool,
    CompressTool,
    ExportTool,
    InjectTool,
    MergeTool,
    PersonaTool,
    RollbackTool,
    TemplateTool,
    UsageTool,
)
from .types import CapsuleToolResult, KodoCapsule


class CapsuleManager:
    def __init__(self) -> None:
        self.store = capsule_store
        self.token_tracker = token_tracker
        self.capture_tool = CaptureTool()
        self.inject_tool = InjectTool()
        self.compress_tool = CompressTool()
        self.bridge_tool = BridgeTool()
        self.template_tool = TemplateTool()
        self.persona_tool = PersonaTool()
        self.usage_tool = UsageTool()
        self.rollback_tool = RollbackTool()
        self.merge_tool = MergeTool()
        self.export_tool = ExportTool()

    async def capture_session(self, session_id: str, **kwargs: Any) -> CapsuleToolResult:
        return await self.capture_tool.execute(session_id=session_id, **kwargs)

    async def inject_capsule(self, capsule_id: str, message: str = "") -> CapsuleToolResult:
        return await self.inject_tool.execute(capsule_id=capsule_id, message=message)

    async def compress_session(self, session_id: str, keep_recent: int = 8, persist: bool = False) -> CapsuleToolResult:
        return await self.compress_tool.execute(session_id=session_id, keep_recent=keep_recent, persist=persist)

    async def bridge_capsule(self, capsule_id: str, target_provider: str = "openai", target_model: str | None = None) -> CapsuleToolResult:
        return await self.bridge_tool.execute(capsule_id=capsule_id, target_provider=target_provider, target_model=target_model)

    async def render_template(self, template: str, values: dict[str, Any] | None = None) -> CapsuleToolResult:
        return await self.template_tool.execute(template=template, values=values or {})

    async def load_persona(self, name: str, project_dir: str | None = None) -> CapsuleToolResult:
        return await self.persona_tool.execute(name=name, project_dir=project_dir)

    async def usage(self, session_id: str) -> CapsuleToolResult:
        return await self.usage_tool.execute(session_id=session_id)

    async def rollback(self, capsule_id: str, version_number: int | None = None) -> CapsuleToolResult:
        return await self.rollback_tool.execute(capsule_id=capsule_id, version_number=version_number)

    async def merge(self, capsule_ids: list[str], tag: str | None = None, team_folder: str = "default") -> CapsuleToolResult:
        return await self.merge_tool.execute(capsule_ids=capsule_ids, tag=tag, team_folder=team_folder)

    async def export(self, path: str | None = None, import_mode: bool = False) -> CapsuleToolResult:
        target = path or str(Path.home() / ".kodo" / "capsule" / "capsules-export.json")
        return await self.export_tool.execute(path=target, import_mode=import_mode)

    async def list_capsules(self) -> list[KodoCapsule]:
        return await self.store.get_all_capsules()

    async def search_capsules(self, query: str) -> list[KodoCapsule]:
        return await self.store.search_capsules(query)

    async def delete_capsule(self, capsule_id: str) -> bool:
        return await self.store.delete_capsule(capsule_id)


capsule_manager = CapsuleManager()
Capsule = CapsuleManager


