from __future__ import annotations

import asyncio

import pytest

import tools.repl as repl_mod
from tools.repl import NodeSession, ReplTool


class _FakeStdin:
    def __init__(self) -> None:
        self.writes: list[bytes] = []

    def write(self, data: bytes) -> None:
        self.writes.append(data)

    async def drain(self) -> None:
        return None


class _FakeNodeProcess:
    def __init__(self) -> None:
        self.stdin = _FakeStdin()
        self.stdout = None
        self.returncode: int | None = None


@pytest.mark.asyncio
async def test_python_repl_streams_output_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repl_mod, "_ensure_cleanup_loop", lambda: None)
    repl_mod._PYTHON_SESSIONS.clear()

    tool = ReplTool()
    seen: list[str] = []

    async def on_output(line: str) -> None:
        seen.append(line)

    result = await tool.execute(
        language="python",
        code="for i in range(3):\n    print(i)",
        session_id="py-stream",
        on_output=on_output,
    )

    assert result.success is True
    assert any(line.strip() == "0" for line in seen)
    assert any(line.strip() == "1" for line in seen)
    assert any(line.strip() == "2" for line in seen)


@pytest.mark.asyncio
async def test_node_repl_streams_console_log_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repl_mod, "_ensure_cleanup_loop", lambda: None)

    fake_process = _FakeNodeProcess()
    fake_session = NodeSession(process=fake_process, cwd=".", lock=asyncio.Lock())

    async def fake_ensure_node_session(key: str, cwd: str, reset: bool) -> NodeSession:
        return fake_session

    async def fake_read_node_response(
        session: NodeSession,
        timeout: int,
        on_output=None,
    ) -> dict[str, object]:
        if on_output is not None:
            await on_output("node-line-1")
            await on_output("node-line-2")
        return {"ok": True, "stdout": "node-line-1\nnode-line-2", "result": None}

    monkeypatch.setattr(repl_mod, "_ensure_node_session", fake_ensure_node_session)
    monkeypatch.setattr(repl_mod, "_read_node_response", fake_read_node_response)

    seen: list[str] = []

    async def on_output(line: str) -> None:
        seen.append(line)

    tool = ReplTool()
    result = await tool.execute(
        language="node",
        code="console.log('hello')",
        session_id="node-stream",
        cwd=".",
        on_output=on_output,
    )

    assert result.success is True
    assert seen == ["node-line-1", "node-line-2"]


@pytest.mark.asyncio
async def test_repl_without_callback_uses_batch_output(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repl_mod, "_ensure_cleanup_loop", lambda: None)
    repl_mod._PYTHON_SESSIONS.clear()

    tool = ReplTool()
    result = await tool.execute(language="python", code="print('batch-one')\nprint('batch-two')", session_id="batch")

    assert result.success is True
    assert "batch-one" in result.output
    assert "batch-two" in result.output
