from __future__ import annotations

import asyncio
import importlib.util
import os
import re
import sqlite3
from typing import Any
from urllib.parse import urlparse

from .base import BaseTool, ToolResult

_FORBIDDEN = {
    "drop",
    "delete",
    "insert",
    "update",
    "alter",
    "create",
    "truncate",
    "exec",
    "execute",
    "sp_",
    "xp_",
}


def _enabled() -> bool:
    default = "1" if os.getenv("DB_URL", "").strip() else "0"
    raw = os.getenv("KODO_ENABLE_DATABASE", default).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _strip_sql_comments(query: str) -> str:
    text = re.sub(r"/\*.*?\*/", " ", query, flags=re.DOTALL)
    text = re.sub(r"--[^\n]*", " ", text)
    return text.strip()


def _validate_read_only_query(query: str) -> tuple[bool, str]:
    normalized = _strip_sql_comments(query).strip()
    if not normalized:
        return False, "query is required"

    if not normalized.lower().startswith("select"):
        return False, "Only SELECT queries are allowed"

    lowered = normalized.lower()
    for token in _FORBIDDEN:
        if re.search(rf"\b{re.escape(token)}\b", lowered):
            return False, f"Forbidden SQL keyword detected: {token}"

    return True, ""


def _markdown_table(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "(no rows)"

    columns = list(rows[0].keys())
    header = "| " + " | ".join(columns) + " |"
    separator = "| " + " | ".join(["---"] * len(columns)) + " |"
    body_lines = []
    for row in rows:
        values = [str(row.get(col, "")) for col in columns]
        body_lines.append("| " + " | ".join(values) + " |")

    return "\n".join([header, separator, *body_lines])


def _sqlite_path_from_url(db_url: str) -> str:
    parsed = urlparse(db_url)
    if parsed.scheme != "sqlite":
        raise ValueError("Unsupported sqlite URL")

    if parsed.path == "/:memory:":
        return ":memory:"

    path = parsed.path or ""
    if path.startswith("/") and os.name == "nt" and len(path) > 2 and path[2] == ":":
        return path[1:]
    if parsed.netloc in {"", "localhost"}:
        # sqlite:////abs/path → path == "//abs/path" → return "/abs/path"
        # sqlite:///rel/path  → path == "/rel/path"  → return "rel/path"
        if path.startswith("//"):
            return path[1:]
        return path.lstrip("/")
    return path


def _query_sqlite(db_path: str, query: str, limit: int) -> list[dict[str, Any]]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM ({query}) LIMIT ?", (limit,))
        rows = cur.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def _query_postgres(db_url: str, query: str, limit: int) -> list[dict[str, Any]]:
    import psycopg2  # type: ignore

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT * FROM ({query}) AS kodo_subquery LIMIT %s", (limit,))
            columns = [desc[0] for desc in (cur.description or [])]
            return [dict(zip(columns, row)) for row in cur.fetchall()]


def _query_mysql(db_url: str, query: str, limit: int) -> list[dict[str, Any]]:
    import pymysql  # type: ignore

    parsed = urlparse(db_url)
    connection = pymysql.connect(
        host=parsed.hostname,
        user=parsed.username,
        password=parsed.password,
        database=(parsed.path or "/").lstrip("/"),
        port=parsed.port or 3306,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with connection.cursor() as cur:
            cur.execute(f"SELECT * FROM ({query}) AS kodo_subquery LIMIT %s", (limit,))
            return list(cur.fetchall())
    finally:
        connection.close()


class DatabaseQueryTool(BaseTool):
    name = "database_query"
    description = (
        "Execute a read-only SQL query against a configured database. "
        "Supports SQLite (local file), PostgreSQL, and MySQL. "
        "Only SELECT statements are allowed."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "SQL SELECT query"},
            "db_url": {
                "type": "string",
                "description": "Database URL. Uses DB_URL env var if omitted.",
            },
            "limit": {
                "type": "integer",
                "default": 100,
                "description": "Max rows to return",
            },
        },
        "required": ["query"],
    }

    async def execute(self, query: str, db_url: str | None = None, limit: int = 100, **kwargs) -> ToolResult:
        if not _enabled():
            return ToolResult(
                success=False,
                output="",
                error="database_query is disabled. Set KODO_ENABLE_DATABASE=1 and DB_URL.",
            )

        ok, error = _validate_read_only_query(query)
        if not ok:
            return ToolResult(success=False, output="", error=error)

        target = (db_url or os.getenv("DB_URL", "")).strip()
        if not target:
            return ToolResult(success=False, output="", error="db_url is required (or set DB_URL)")

        limit = max(1, min(int(limit or 100), 1000))
        parsed = urlparse(target)
        scheme = (parsed.scheme or "").lower()

        try:
            if scheme == "sqlite":
                db_path = _sqlite_path_from_url(target)
                rows = await asyncio.to_thread(_query_sqlite, db_path, query, limit)
            elif scheme in {"postgres", "postgresql"}:
                if importlib.util.find_spec("psycopg2") is None:
                    return ToolResult(
                        success=False,
                        output="",
                        error="psycopg2 not installed. Install with: pip install psycopg2-binary",
                    )
                rows = await asyncio.to_thread(_query_postgres, target, query, limit)
            elif scheme in {"mysql", "mariadb"}:
                if importlib.util.find_spec("pymysql") is None:
                    return ToolResult(
                        success=False,
                        output="",
                        error="pymysql not installed. Install with: pip install pymysql",
                    )
                rows = await asyncio.to_thread(_query_mysql, target, query, limit)
            else:
                return ToolResult(
                    success=False,
                    output="",
                    error="Unsupported DB scheme. Use sqlite://, postgresql://, or mysql://",
                )
        except Exception as exc:
            return ToolResult(success=False, output="", error=f"Query failed: {exc}")

        table = _markdown_table(rows)
        return ToolResult(
            success=True,
            output=table,
            metadata={"rows": len(rows), "limit": limit, "db_scheme": scheme},
        )