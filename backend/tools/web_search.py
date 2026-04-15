from __future__ import annotations

import json
import os
import re
from typing import Any

from privacy import build_httpx_async_client

from .base import BaseTool, ToolResult


def _strip_html(text: str) -> str:
    collapsed = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", collapsed).strip()


class WebSearchTool(BaseTool):
    name = "web_search"
    description = (
        "Search the web for current information. Returns a list of results "
        "with title, URL, and snippet. Use when the user asks about recent "
        "events, current prices, docs, or anything requiring live data."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "num_results": {
                "type": "integer",
                "description": "Number of results to return (1-10, default 5)",
                "default": 5,
            },
        },
        "required": ["query"],
    }

    async def _search_firecrawl(self, query: str, num_results: int, api_key: str = "") -> list[dict[str, str]]:
        key = str(api_key or "").strip() or os.getenv("FIRECRAWL_API_KEY", "").strip()
        if not key:
            raise ValueError("firecrawl key missing")

        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        payload = {"query": query, "limit": num_results}

        async with build_httpx_async_client(timeout=20.0, headers=headers) as client:
            response = await client.post("https://api.firecrawl.dev/v1/search", json=payload)
            response.raise_for_status()
            data = response.json()

        rows: list[dict[str, str]] = []
        for item in data.get("data", []) if isinstance(data, dict) else []:
            meta = item.get("metadata", {}) if isinstance(item, dict) else {}
            title = str(meta.get("title", "") or "").strip()
            url = str(meta.get("sourceURL", "") or "").strip()
            snippet = _strip_html(str(meta.get("description", "") or ""))
            if url:
                rows.append({"title": title or url, "url": url, "snippet": snippet})
        return rows[:num_results]

    async def _search_tavily(self, query: str, num_results: int, api_key: str = "") -> list[dict[str, str]]:
        key = str(api_key or "").strip() or os.getenv("TAVILY_API_KEY", "").strip()
        if not key:
            raise ValueError("tavily key missing")

        payload = {
            "query": query,
            "max_results": num_results,
            "api_key": key,
        }
        headers = {"Content-Type": "application/json"}

        async with build_httpx_async_client(timeout=20.0, headers=headers) as client:
            response = await client.post("https://api.tavily.com/search", json=payload)
            response.raise_for_status()
            data = response.json()

        rows: list[dict[str, str]] = []
        for item in data.get("results", []) if isinstance(data, dict) else []:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "") or "").strip()
            url = str(item.get("url", "") or "").strip()
            snippet = _strip_html(str(item.get("content", "") or ""))
            if url:
                rows.append({"title": title or url, "url": url, "snippet": snippet})
        return rows[:num_results]

    async def _search_serpapi(self, query: str, num_results: int, api_key: str = "") -> list[dict[str, str]]:
        key = str(api_key or "").strip() or os.getenv("SERPAPI_KEY", "").strip()
        if not key:
            raise ValueError("serpapi key missing")

        params = {
            "q": query,
            "num": str(num_results),
            "api_key": key,
        }

        async with build_httpx_async_client(timeout=20.0) as client:
            response = await client.get("https://serpapi.com/search.json", params=params)
            response.raise_for_status()
            data = response.json()

        rows: list[dict[str, str]] = []
        for item in data.get("organic_results", []) if isinstance(data, dict) else []:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "") or "").strip()
            url = str(item.get("link", "") or "").strip()
            snippet = _strip_html(str(item.get("snippet", "") or ""))
            if url:
                rows.append({"title": title or url, "url": url, "snippet": snippet})
        return rows[:num_results]

    def _collect_ddg_topics(self, items: list[Any], rows: list[dict[str, str]], limit: int) -> None:
        for item in items:
            if len(rows) >= limit:
                return
            if not isinstance(item, dict):
                continue

            # RelatedTopics can be nested via "Topics".
            nested = item.get("Topics")
            if isinstance(nested, list):
                self._collect_ddg_topics(nested, rows, limit)
                continue

            text = str(item.get("Text", "") or "").strip()
            url = str(item.get("FirstURL", "") or "").strip()
            if not url:
                continue
            rows.append(
                {
                    "title": (text.split(" - ", 1)[0] if text else url),
                    "url": url,
                    "snippet": _strip_html(text),
                }
            )

    async def _search_duckduckgo(self, query: str, num_results: int) -> list[dict[str, str]]:
        params = {
            "q": query,
            "format": "json",
            "no_html": "1",
            "skip_disambig": "1",
        }
        async with build_httpx_async_client(timeout=20.0) as client:
            response = await client.get("https://api.duckduckgo.com/", params=params)
            response.raise_for_status()
            data = response.json()

        rows: list[dict[str, str]] = []
        related = data.get("RelatedTopics", []) if isinstance(data, dict) else []
        if isinstance(related, list):
            self._collect_ddg_topics(related, rows, num_results)
        return rows[:num_results]

    async def execute(self, query: str, num_results: int = 5, **kwargs) -> ToolResult:
        normalized_query = (query or "").strip()
        if not normalized_query:
            return ToolResult(success=False, output="", error="query is required")

        try:
            limit = int(num_results)
        except (TypeError, ValueError):
            limit = 5
        limit = max(1, min(10, limit))

        raw_overrides = kwargs.get("api_key_overrides")
        overrides = raw_overrides if isinstance(raw_overrides, dict) else {}

        firecrawl_key = str(overrides.get("FIRECRAWL_API_KEY", "")).strip()
        tavily_key = str(overrides.get("TAVILY_API_KEY", "")).strip()
        serpapi_key = str(overrides.get("SERPAPI_KEY", "")).strip()

        providers: list[tuple[str, Any]] = [
            ("firecrawl", lambda q, n: self._search_firecrawl(q, n, firecrawl_key)),
            ("tavily", lambda q, n: self._search_tavily(q, n, tavily_key)),
            ("serpapi", lambda q, n: self._search_serpapi(q, n, serpapi_key)),
            ("duckduckgo", self._search_duckduckgo),
        ]

        for provider_name, provider_fn in providers:
            try:
                results = await provider_fn(normalized_query, limit)
                return ToolResult(
                    success=True,
                    output=json.dumps(results, indent=2),
                    metadata={
                        "provider": provider_name,
                        "query": normalized_query,
                        "count": len(results),
                    },
                )
            except Exception:
                continue

        return ToolResult(
            success=False,
            output="",
            error=(
                "Web search unavailable. Configure FIRECRAWL_API_KEY, "
                "TAVILY_API_KEY, or SERPAPI_KEY."
            ),
        )
