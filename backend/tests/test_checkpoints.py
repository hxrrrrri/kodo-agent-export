from __future__ import annotations

import pytest

import memory.manager as memory_manager_mod


@pytest.mark.asyncio
async def test_checkpoint_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(memory_manager_mod, 'KODO_DIR', tmp_path)
    monkeypatch.setattr(memory_manager_mod, 'SESSIONS_DIR', tmp_path / 'sessions')
    monkeypatch.setattr(memory_manager_mod, 'CHECKPOINTS_DIR', tmp_path / 'checkpoints')
    monkeypatch.setattr(memory_manager_mod, 'GLOBAL_MEMORY_FILE', tmp_path / 'MEMORY.md')

    manager = memory_manager_mod.MemoryManager()
    messages = [
        {'role': 'user', 'content': 'hello'},
        {'role': 'assistant', 'content': 'world'},
    ]

    checkpoint_id = await manager.create_checkpoint('session-1', messages, label='before risky edit')
    rows = await manager.list_checkpoints('session-1')
    restored = await manager.restore_checkpoint('session-1', checkpoint_id)

    assert rows
    assert rows[0]['checkpoint_id'] == checkpoint_id
    assert restored == messages


@pytest.mark.asyncio
async def test_restore_checkpoint_not_found(tmp_path, monkeypatch):
    monkeypatch.setattr(memory_manager_mod, 'KODO_DIR', tmp_path)
    monkeypatch.setattr(memory_manager_mod, 'SESSIONS_DIR', tmp_path / 'sessions')
    monkeypatch.setattr(memory_manager_mod, 'CHECKPOINTS_DIR', tmp_path / 'checkpoints')
    monkeypatch.setattr(memory_manager_mod, 'GLOBAL_MEMORY_FILE', tmp_path / 'MEMORY.md')

    manager = memory_manager_mod.MemoryManager()

    with pytest.raises(ValueError):
        await manager.restore_checkpoint('session-1', 'cp_missing')
