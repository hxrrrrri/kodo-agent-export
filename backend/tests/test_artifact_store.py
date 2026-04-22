from __future__ import annotations

from pathlib import Path

import pytest

from artifacts import store as store_mod
from artifacts.store import ArtifactStore


@pytest.fixture
def temp_store(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(store_mod, "ARTIFACTS_DIR", tmp_path)
    instance = ArtifactStore()
    return instance


@pytest.mark.asyncio
async def test_upsert_creates_version(temp_store: ArtifactStore):
    saved = await temp_store.upsert(
        "s1",
        {
            "id": "todo-app",
            "type": "react",
            "title": "Todo App",
            "version": 1,
            "files": [{"path": "App.jsx", "content": "export default () => null", "language": "jsx"}],
            "entrypoint": "App.jsx",
        },
    )
    assert saved["version"] == 1
    assert saved["type"] == "react"
    assert "updated_at" in saved

    rows = await temp_store.list("s1")
    assert len(rows) == 1
    assert rows[0]["id"] == "todo-app"
    assert rows[0]["latest_version"] == 1


@pytest.mark.asyncio
async def test_upsert_bumps_version(temp_store: ArtifactStore):
    await temp_store.upsert(
        "s1",
        {"id": "demo", "type": "html", "title": "Demo", "version": 1, "files": []},
    )
    await temp_store.upsert(
        "s1",
        {"id": "demo", "type": "html", "title": "Demo v2", "version": 2, "files": []},
    )
    versions = await temp_store.get_all_versions("s1", "demo")
    assert [v["version"] for v in versions] == [1, 2]

    latest = await temp_store.get("s1", "demo")
    assert latest is not None
    assert latest["version"] == 2
    assert latest["title"] == "Demo v2"

    specific = await temp_store.get("s1", "demo", version=1)
    assert specific is not None
    assert specific["version"] == 1


@pytest.mark.asyncio
async def test_get_missing_returns_none(temp_store: ArtifactStore):
    assert await temp_store.get("s1", "missing") is None
    assert await temp_store.get_all_versions("s1", "missing") == []


@pytest.mark.asyncio
async def test_upsert_rejects_blank_id(temp_store: ArtifactStore):
    with pytest.raises(ValueError):
        await temp_store.upsert("s1", {"id": "   ", "type": "html", "version": 1, "files": []})


@pytest.mark.asyncio
async def test_version_lru_eviction(temp_store: ArtifactStore, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_VERSIONS_PER_ARTIFACT", 3)

    for v in range(1, 6):
        await temp_store.upsert(
            "s1",
            {"id": "d", "type": "html", "title": "Demo", "version": v, "files": []},
        )

    versions = await temp_store.get_all_versions("s1", "d")
    # Oldest two dropped; latest three retained.
    assert [v["version"] for v in versions] == [3, 4, 5]


@pytest.mark.asyncio
async def test_delete_removes_artifact(temp_store: ArtifactStore):
    await temp_store.upsert("s1", {"id": "d", "type": "html", "title": "t", "version": 1, "files": []})
    assert await temp_store.delete("s1", "d") is True
    assert await temp_store.delete("s1", "d") is False
    assert await temp_store.list("s1") == []
