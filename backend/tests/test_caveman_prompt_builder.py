from __future__ import annotations

import pytest

from agent import prompt_builder


@pytest.mark.asyncio
async def test_caveman_prompt_included_when_enabled(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_CAVEMAN", "1")

    async def fake_load_memory(project_dir):
        return ""

    monkeypatch.setattr(prompt_builder.memory_manager, "load_memory", fake_load_memory)

    prompt = await prompt_builder.build_system_prompt(
        project_dir=None,
        mode="execute",
        caveman_mode="ultra",
    )

    assert "caveman mode active: ultra" in prompt.lower()


@pytest.mark.asyncio
async def test_caveman_prompt_omitted_when_disabled(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_CAVEMAN", "0")

    async def fake_load_memory(project_dir):
        return ""

    monkeypatch.setattr(prompt_builder.memory_manager, "load_memory", fake_load_memory)

    prompt = await prompt_builder.build_system_prompt(
        project_dir=None,
        mode="execute",
        caveman_mode="ultra",
    )

    assert "caveman mode active" not in prompt.lower()

