from __future__ import annotations

import pytest

import commands.router as commands_router


@pytest.mark.asyncio
async def test_caveman_command_sets_session_mode(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_CAVEMAN", "1")
    captured: dict[str, object] = {}

    async def fake_update_session_metadata(session_id: str, updates: dict[str, object], create_if_missing: bool = True):
        captured["session_id"] = session_id
        captured["updates"] = updates
        return updates

    monkeypatch.setattr(commands_router.memory_manager, "update_session_metadata", fake_update_session_metadata)

    result = await commands_router.execute_command("/caveman ultra", session_id="s-caveman", project_dir=None)

    assert result.name == "caveman"
    assert "ultra" in result.text.lower()
    updates = captured.get("updates")
    assert isinstance(updates, dict)
    assert updates.get("caveman_mode") == "ultra"


@pytest.mark.asyncio
async def test_caveman_commit_command_returns_run_prompt(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_CAVEMAN", "1")
    result = await commands_router.execute_command(
        "/caveman-commit auth bug fix",
        session_id="s-caveman",
        project_dir=None,
    )

    assert result.name == "caveman-commit"
    assert result.run_prompt is not None
    assert "conventional commit" in result.run_prompt.lower()


@pytest.mark.asyncio
async def test_caveman_compress_command_compresses_file(monkeypatch, tmp_path):
    monkeypatch.setenv("KODO_ENABLE_CAVEMAN", "1")
    source = tmp_path / "notes.md"
    source.write_text(
        "# Notes\n"
        "This is basically a really simple sentence that can be shorter.\n",
        encoding="utf-8",
    )

    result = await commands_router.execute_command(
        "/caveman:compress notes.md full",
        session_id="s-caveman",
        project_dir=str(tmp_path),
    )

    assert result.name == "caveman:compress"
    assert "compressed file" in result.text.lower()
    assert (tmp_path / "notes.original.md").exists()

