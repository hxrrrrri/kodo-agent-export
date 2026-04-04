from __future__ import annotations

import asyncio

import pytest

from tools.powershell import PowerShellTool


class _AsyncLineStream:
    def __init__(self, lines: list[str]) -> None:
        self._lines = [f"{line}\n".encode("utf-8") for line in lines]

    def __aiter__(self) -> "_AsyncLineStream":
        return self

    async def __anext__(self) -> bytes:
        if not self._lines:
            raise StopAsyncIteration
        return self._lines.pop(0)


class _FakeProcess:
    def __init__(self, *, stream_lines: list[str] | None = None, batch_stdout: str = "", batch_stderr: str = "", returncode: int = 0) -> None:
        self.stdout = _AsyncLineStream(stream_lines or [])
        self.returncode: int | None = None
        self._batch_stdout = batch_stdout
        self._batch_stderr = batch_stderr
        self._target_code = returncode

    async def communicate(self) -> tuple[bytes, bytes]:
        self.returncode = self._target_code
        return self._batch_stdout.encode("utf-8"), self._batch_stderr.encode("utf-8")

    async def wait(self) -> int:
        if self.returncode is None:
            self.returncode = self._target_code
        return self.returncode

    def kill(self) -> None:
        self.returncode = -9


@pytest.mark.asyncio
async def test_powershell_streaming_callback_receives_each_line(monkeypatch: pytest.MonkeyPatch) -> None:
    tool = PowerShellTool()
    seen: list[str] = []

    async def fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(stream_lines=["alpha", "beta"])

    async def on_output(line: str) -> None:
        seen.append(line)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    result = await tool.execute(command="Write-Output alpha; Write-Output beta", cwd=".", on_output=on_output)

    assert result.success is True
    assert any("alpha" in line for line in seen)
    assert any("beta" in line for line in seen)


@pytest.mark.asyncio
async def test_powershell_without_callback_uses_batch_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    tool = PowerShellTool()

    async def fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(batch_stdout="batch-one\nbatch-two")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    result = await tool.execute(command="Write-Output 'batch-one'; Write-Output 'batch-two'", cwd=".")

    assert result.success is True
    assert "batch-one" in result.output
    assert "batch-two" in result.output


@pytest.mark.asyncio
async def test_powershell_streaming_truncates_after_max_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    tool = PowerShellTool()
    seen: list[str] = []

    async def fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(stream_lines=[f"line-{idx}" for idx in range(6)])

    async def on_output(line: str) -> None:
        seen.append(line)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)
    monkeypatch.setenv("MAX_STREAMING_LINES", "2")

    result = await tool.execute(command="Write-Output 'stream'", cwd=".", on_output=on_output)

    assert result.success is True
    assert any("line-0" in line for line in seen)
    assert any("line-1" in line for line in seen)
    assert any("output truncated" in line for line in seen)
