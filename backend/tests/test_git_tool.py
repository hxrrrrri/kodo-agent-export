from __future__ import annotations

import asyncio

import pytest

import tools.git_tool as git_tool_mod
from tools.git_tool import GitTool


@pytest.mark.asyncio
async def test_git_tool_blocks_write_command():
    tool = GitTool()
    result = await tool.execute(command='push origin main')

    assert result.success is False
    assert 'Blocked git command' in (result.error or '')


@pytest.mark.asyncio
async def test_git_tool_allows_read_only_status(monkeypatch):
    class FakeProc:
        returncode = 0

        async def communicate(self):
            return b' M backend/main.py\n', b''

    async def fake_exec(*args, **kwargs):
        assert args[0] == 'git'
        assert 'status' in args
        return FakeProc()

    monkeypatch.setattr(git_tool_mod, 'enforce_allowed_path', lambda value: 'C:/repo')
    monkeypatch.setattr(git_tool_mod.os.path, 'isdir', lambda value: True)
    monkeypatch.setattr(git_tool_mod.asyncio, 'create_subprocess_exec', fake_exec)

    tool = GitTool()
    result = await tool.execute(command='status --short', cwd='.')

    assert result.success is True
    assert 'backend/main.py' in result.output
    assert result.metadata is not None
    assert result.metadata.get('command') == 'git status --short'


@pytest.mark.asyncio
async def test_git_tool_timeout(monkeypatch):
    class SlowProc:
        returncode = 0

        async def communicate(self):
            await asyncio.sleep(0.5)
            return b'', b''

    async def fake_exec(*args, **kwargs):
        return SlowProc()

    async def fake_wait_for(awaitable, timeout):
        close_fn = getattr(awaitable, 'close', None)
        if callable(close_fn):
            close_fn()
        raise asyncio.TimeoutError

    monkeypatch.setattr(git_tool_mod, 'enforce_allowed_path', lambda value: 'C:/repo')
    monkeypatch.setattr(git_tool_mod.os.path, 'isdir', lambda value: True)
    monkeypatch.setattr(git_tool_mod.asyncio, 'create_subprocess_exec', fake_exec)
    monkeypatch.setattr(git_tool_mod.asyncio, 'wait_for', fake_wait_for)

    tool = GitTool()
    result = await tool.execute(command='log --oneline -5')

    assert result.success is False
    assert 'timed out' in (result.error or '')
