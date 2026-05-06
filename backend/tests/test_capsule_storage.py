from __future__ import annotations

from pathlib import Path

import pytest

from kodo.capsule.storage import CapsuleStore
from kodo.capsule.types import CodeRef, KodoCapsule


@pytest.mark.asyncio
async def test_capsule_store_save_search_version_and_export(tmp_path: Path) -> None:
    store = CapsuleStore(tmp_path / "capsules.db")
    capsule = KodoCapsule(
        tag="API handoff",
        summary="Implemented a FastAPI handoff flow.",
        goals=["Add API", "Verify storage"],
        constraints=["Keep local-first"],
        code_refs=[CodeRef(file="backend/main.py", snippet="app.include_router(...)", lang="python")],
        next_steps=["Run tests"],
        model_used="gpt-4o",
        provider="openai",
        tags=["api"],
    )

    capsule_id = await store.save_capsule(capsule)
    loaded = await store.get_capsule(capsule_id)

    assert loaded is not None
    assert loaded.tag == "API handoff"
    assert loaded.code_refs[0].file == "backend/main.py"

    matches = await store.search_capsules("local-first")
    assert [item.id for item in matches] == [capsule_id]

    versions = await store.get_versions(capsule_id)
    assert len(versions) == 1
    assert versions[0].version_number == 1

    export_path = tmp_path / "export.json"
    await store.export_to_json(str(export_path))
    assert export_path.exists()

    imported = await CapsuleStore(tmp_path / "imported.db").import_from_json(str(export_path))
    assert imported == 1


