from __future__ import annotations

import sqlite3

import pytest

from tools.database_query import DatabaseQueryTool


tool = DatabaseQueryTool()


@pytest.mark.asyncio
async def test_rejects_non_select(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_DATABASE", "1")
    result = await tool.execute(query="DROP TABLE users")
    assert result.success is False
    assert "SELECT" in (result.error or "")


@pytest.mark.asyncio
async def test_rejects_blocked_keyword(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_DATABASE", "1")
    result = await tool.execute(query="SELECT * FROM users; DELETE FROM users")
    assert result.success is False


@pytest.mark.asyncio
async def test_no_db_url_returns_config_error(monkeypatch):
    monkeypatch.setenv("KODO_ENABLE_DATABASE", "1")
    monkeypatch.delenv("DB_URL", raising=False)
    result = await tool.execute(query="SELECT 1")
    assert result.success is False
    assert "DB_URL" in (result.error or "") or "database" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_sqlite_query_returns_markdown_table(monkeypatch, tmp_path):
    monkeypatch.setenv("KODO_ENABLE_DATABASE", "1")
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE fruit (name TEXT, qty INTEGER)")
    conn.execute("INSERT INTO fruit VALUES ('apple', 3), ('banana', 7)")
    conn.commit()
    conn.close()

    monkeypatch.setenv("DB_URL", f"sqlite:///{db_path}")
    result = await tool.execute(query="SELECT * FROM fruit")
    assert result.success is True
    assert "apple" in (result.output or "")
    assert "banana" in (result.output or "")
