from __future__ import annotations

import pytest

from tools.caveman import CavemanTool


@pytest.mark.asyncio
async def test_caveman_tool_disabled(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_CAVEMAN", "0")
    tool = CavemanTool()
    result = await tool.execute(action="status")

    assert result.success is False
    assert "disabled" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_caveman_compress_text(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_CAVEMAN", "1")
    tool = CavemanTool()
    source = "# Title\nThis is basically a simple explanation for the new component.\n"

    result = await tool.execute(action="compress_text", text=source, mode="full")

    assert result.success is True
    assert "# Title" in result.output
    metadata = result.metadata
    assert int(metadata.get("saved_words", 0)) >= 1


@pytest.mark.asyncio
async def test_caveman_compress_file_creates_backup(monkeypatch, tmp_path):
    monkeypatch.setenv("KODO_ENABLE_CAVEMAN", "1")
    tool = CavemanTool()

    source = tmp_path / "notes.md"
    source.write_text(
        "# Notes\n"
        "This is actually a really simple paragraph with extra words.\n"
        "See https://example.com/docs for reference.\n"
        "```python\n"
        "print('unchanged')\n"
        "```\n",
        encoding="utf-8",
    )

    result = await tool.execute(action="compress_file", path=str(source), mode="full")

    assert result.success is True
    backup = tmp_path / "notes.original.md"
    assert backup.exists()
    compressed = source.read_text(encoding="utf-8")
    assert "https://example.com/docs" in compressed
    assert "print('unchanged')" in compressed

