from __future__ import annotations

from typing import Any

from ..storage import capsule_store
from ..types import CodeRef, KodoCapsule, CapsuleToolResult


def _dedupe_text(items: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = str(item or "").strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


class MergeTool:
    name = "merge"

    async def execute(self, *, capsule_ids: list[str], tag: str | None = None, team_folder: str = "default") -> CapsuleToolResult:
        try:
            ids = [item.strip() for item in capsule_ids if item.strip()]
            if len(ids) < 2:
                raise ValueError("At least two capsule IDs are required")
            capsules = []
            for capsule_id in ids:
                capsule = await capsule_store.get_capsule(capsule_id)
                if capsule is None:
                    raise ValueError(f"Capsule not found: {capsule_id}")
                capsules.append(capsule)

            refs: list[CodeRef] = []
            ref_keys: set[str] = set()
            for capsule in capsules:
                for ref in capsule.code_refs:
                    key = f"{ref.file}\n{ref.lang}\n{ref.snippet}".casefold()
                    if key in ref_keys:
                        continue
                    ref_keys.add(key)
                    refs.append(ref)

            merged = KodoCapsule(
                tag=tag or "Merged Capsule",
                summary="\n\n".join(f"[{cap.tag}] {cap.summary}" for cap in capsules),
                goals=_dedupe_text([goal for cap in capsules for goal in cap.goals]),
                constraints=_dedupe_text([item for cap in capsules for item in cap.constraints]),
                code_refs=refs,
                next_steps=_dedupe_text([item for cap in capsules for item in cap.next_steps]),
                model_used=capsules[-1].model_used,
                provider=capsules[-1].provider,
                tokens_at_capture=sum(int(cap.tokens_at_capture or 0) for cap in capsules) or None,
                context_pct_at_capture=max([float(cap.context_pct_at_capture or 0) for cap in capsules], default=0) or None,
                agent_id=capsules[-1].agent_id,
                team_folder=team_folder or capsules[-1].team_folder,
                tags=_dedupe_text([tag for cap in capsules for tag in cap.tags] + ["merged"]),
            )
            merged_id = await capsule_store.save_capsule(merged)
            saved = await capsule_store.get_capsule(merged_id)
            return CapsuleToolResult(success=True, message=f"Merged capsules into {merged_id}", data={"capsule": saved.model_dump() if saved else merged.model_dump()})
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Merge failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        return result.message

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()


