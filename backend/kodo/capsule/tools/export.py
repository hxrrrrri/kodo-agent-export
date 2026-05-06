from __future__ import annotations

from pathlib import Path
from typing import Any

from ..storage import capsule_store
from ..types import CapsuleToolResult


class ExportTool:
    name = "export"

    async def execute(self, *, path: str, import_mode: bool = False) -> CapsuleToolResult:
        try:
            target = str(Path(path).expanduser())
            if import_mode:
                count = await capsule_store.import_from_json(target)
                return CapsuleToolResult(success=True, message=f"Imported {count} capsules", data={"path": target, "imported": count})
            await capsule_store.export_to_json(target)
            return CapsuleToolResult(success=True, message=f"Exported capsules to {target}", data={"path": target})
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Export failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        return result.message

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


