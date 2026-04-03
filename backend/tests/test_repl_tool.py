from __future__ import annotations

import pytest

import tools.repl as repl_mod
from tools.repl import ReplTool


@pytest.mark.asyncio
async def test_python_repl_session_persists_state(monkeypatch):
    monkeypatch.setattr(repl_mod, '_ensure_cleanup_loop', lambda: None)
    repl_mod._PYTHON_SESSIONS.clear()

    tool = ReplTool()
    first = await tool.execute(language='python', code='x = 7', session_id='t1')
    second = await tool.execute(language='python', code='x + 1', session_id='t1')

    assert first.success is True
    assert second.success is True
    assert '8' in second.output


@pytest.mark.asyncio
async def test_repl_rejects_unknown_language(monkeypatch):
    monkeypatch.setattr(repl_mod, '_ensure_cleanup_loop', lambda: None)
    tool = ReplTool()
    result = await tool.execute(language='ruby', code='puts 1')
    assert result.success is False
    assert "language must be 'python' or 'node'" in (result.error or '')


@pytest.mark.asyncio
async def test_repl_requires_code(monkeypatch):
    monkeypatch.setattr(repl_mod, '_ensure_cleanup_loop', lambda: None)
    tool = ReplTool()
    result = await tool.execute(language='python', code='   ')
    assert result.success is False
    assert result.error == 'code is required'
