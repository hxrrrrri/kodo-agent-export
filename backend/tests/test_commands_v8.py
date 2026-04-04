from __future__ import annotations

import pytest

import commands.router as commands_router


@pytest.mark.asyncio
async def test_teleport_sets_mode(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_update_session_metadata(session_id: str, updates: dict[str, object], create_if_missing: bool = True):
        captured["session_id"] = session_id
        captured["updates"] = updates
        captured["create_if_missing"] = create_if_missing
        return updates

    monkeypatch.setattr(commands_router.memory_manager, "update_session_metadata", fake_update_session_metadata)

    result = await commands_router.execute_command("/teleport coord", session_id="s-v8", project_dir=None)

    assert result.name == "teleport"
    assert "coordinator" in result.text.lower()
    updates = captured.get("updates")
    assert isinstance(updates, dict)
    assert updates.get("mode") == "coordinator"


@pytest.mark.asyncio
async def test_dream_command_returns_run_prompt():
    result = await commands_router.execute_command("/dream local ollama ux", session_id="s-v8", project_dir=None)

    assert result.name == "dream"
    assert result.run_prompt is not None
    assert "local ollama ux" in result.run_prompt.lower()


@pytest.mark.asyncio
async def test_bughunter_command_returns_run_prompt():
    result = await commands_router.execute_command("/bughunter save button disabled", session_id="s-v8", project_dir=None)

    assert result.name == "bughunter"
    assert result.run_prompt is not None
    assert "save button disabled" in result.run_prompt.lower()
