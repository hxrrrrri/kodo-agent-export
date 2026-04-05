from __future__ import annotations

import pytest

from agent import prompt_builder


@pytest.mark.asyncio
async def test_system_prompt_explicitly_authorizes_tools(monkeypatch):
    async def fake_load_memory(project_dir):
        return ""

    monkeypatch.setattr(prompt_builder.memory_manager, "load_memory", fake_load_memory)

    prompt = await prompt_builder.build_system_prompt(project_dir=None, mode="execute")
    lowered = prompt.lower()

    assert "explicitly authorized to use all registered kodo tools" in lowered
    assert "including filesystem read/write/edit" in lowered
    assert "mcp tools" in lowered
    assert "do not claim you lack permission" in lowered
