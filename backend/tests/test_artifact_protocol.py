from __future__ import annotations

import pytest

from agent import prompt_builder
from artifacts.protocol_prompt import ARTIFACT_PROTOCOL_PROMPT, build_artifact_system_block


def test_build_artifact_system_block_disabled_returns_empty():
    assert build_artifact_system_block(False) == ""


def test_build_artifact_system_block_enabled_returns_protocol():
    text = build_artifact_system_block(True)
    assert "ARTIFACT PROTOCOL" in text
    assert "type=" in text
    assert "version=" in text
    assert "bundle=true" in text


def test_artifact_protocol_prompt_is_compact():
    # Budget: under ~600 tokens even for BPE tokenizers with poor chunking.
    assert len(ARTIFACT_PROTOCOL_PROMPT) < 2600


@pytest.mark.asyncio
async def test_build_system_prompt_includes_artifact_block_when_enabled(monkeypatch):
    async def fake_load_memory(project_dir):
        return ""

    monkeypatch.setattr(prompt_builder.memory_manager, "load_memory", fake_load_memory)
    monkeypatch.setenv("KODO_ENABLE_ARTIFACTS_V2", "1")

    prompt_with = await prompt_builder.build_system_prompt(
        project_dir=None,
        mode="execute",
        artifact_mode=True,
    )
    prompt_without = await prompt_builder.build_system_prompt(
        project_dir=None,
        mode="execute",
        artifact_mode=False,
    )

    assert "ARTIFACT PROTOCOL" in prompt_with
    assert "ARTIFACT PROTOCOL" not in prompt_without


@pytest.mark.asyncio
async def test_build_system_prompt_suppresses_block_when_feature_flag_off(monkeypatch):
    async def fake_load_memory(project_dir):
        return ""

    monkeypatch.setattr(prompt_builder.memory_manager, "load_memory", fake_load_memory)
    monkeypatch.setenv("KODO_ENABLE_ARTIFACTS_V2", "0")

    prompt = await prompt_builder.build_system_prompt(
        project_dir=None,
        mode="execute",
        artifact_mode=True,
    )

    assert "ARTIFACT PROTOCOL" not in prompt
