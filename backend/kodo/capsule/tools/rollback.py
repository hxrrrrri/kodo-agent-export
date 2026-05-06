from __future__ import annotations

from typing import Any

from ..storage import capsule_store
from ..types import CapsuleToolResult


class RollbackTool:
    name = "rollback"

    async def execute(self, *, capsule_id: str, version_number: int | None = None) -> CapsuleToolResult:
        try:
            if version_number is None:
                versions = await capsule_store.get_versions(capsule_id)
                return CapsuleToolResult(
                    success=True,
                    message=f"Loaded {len(versions)} versions",
                    data={"versions": [item.model_dump() for item in versions]},
                )
            capsule = await capsule_store.rollback_to_version(capsule_id, version_number)
            return CapsuleToolResult(
                success=True,
                message=f"Rolled back {capsule_id} to version {version_number}",
                data={"capsule": capsule.model_dump()},
            )
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Rollback failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        if not result.success:
            return result.message
        if "versions" in result.data:
            lines = ["Versions:"]
            for item in result.data["versions"]:
                lines.append(f"- v{item.get('version_number')}: {item.get('created_at')} {item.get('change_note') or ''}")
            return "\n".join(lines)
        return result.message

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


