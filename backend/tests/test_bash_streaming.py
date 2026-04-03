from __future__ import annotations

import sys

import pytest

from tools.bash import BashTool


@pytest.mark.asyncio
async def test_bash_streaming_callback_receives_each_line() -> None:
    tool = BashTool()
    seen: list[str] = []

    async def on_output(line: str) -> None:
        seen.append(line)

    command = f'"{sys.executable}" -c "print(\'alpha\');print(\'beta\')"'
    result = await tool.execute(command=command, on_output=on_output, timeout=20)

    assert result.success is True
    assert any("alpha" in line for line in seen)
    assert any("beta" in line for line in seen)


@pytest.mark.asyncio
async def test_bash_streaming_truncates_after_max_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    tool = BashTool()
    seen: list[str] = []

    monkeypatch.setenv("MAX_STREAMING_LINES", "2")

    async def on_output(line: str) -> None:
        seen.append(line)

    command = f'"{sys.executable}" -c "for i in range(6): print(\'line-%d\' % i)"'
    result = await tool.execute(command=command, on_output=on_output, timeout=20)

    assert result.success is True
    assert any("line-0" in line for line in seen)
    assert any("line-1" in line for line in seen)
    assert any("output truncated" in line for line in seen)


@pytest.mark.asyncio
async def test_bash_without_streaming_callback_uses_batch_output() -> None:
    tool = BashTool()
    command = f'"{sys.executable}" -c "print(\'batch-one\');print(\'batch-two\')"'
    result = await tool.execute(command=command, timeout=20)

    assert result.success is True
    assert "batch-one" in result.output
    assert "batch-two" in result.output
