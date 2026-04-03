from __future__ import annotations

import pytest

import tools.memory_write as memory_write_mod
from tools.memory_write import MemoryWriteTool


@pytest.mark.asyncio
async def test_memory_write_succeeds(monkeypatch):
    called: dict[str, object] = {}

    async def fake_append(content: str, section: str | None = None):
        called['content'] = content
        called['section'] = section

    monkeypatch.setattr(memory_write_mod.memory_manager, 'append_to_memory', fake_append)

    tool = MemoryWriteTool()
    result = await tool.execute(content='Remember this')

    assert result.success is True
    assert called['content'] == 'Remember this'


@pytest.mark.asyncio
async def test_memory_write_requires_content():
    tool = MemoryWriteTool()
    result = await tool.execute(content='   ')
    assert result.success is False
    assert result.error == 'content is required'


@pytest.mark.asyncio
async def test_memory_write_passes_section(monkeypatch):
    called: dict[str, object] = {}

    async def fake_append(content: str, section: str | None = None):
        called['content'] = content
        called['section'] = section

    monkeypatch.setattr(memory_write_mod.memory_manager, 'append_to_memory', fake_append)

    tool = MemoryWriteTool()
    result = await tool.execute(content='Keep this', section='Workflow')

    assert result.success is True
    assert called['section'] == 'Workflow'
