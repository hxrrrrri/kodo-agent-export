from __future__ import annotations

import json

import pytest

from tools.krawlx import KrawlXTool


@pytest.mark.asyncio
async def test_krawlx_blocks_explicitly_blocked_host(monkeypatch):
    monkeypatch.setenv("KRAWLX_BLOCKED_HOSTS", "example.com")

    tool = KrawlXTool()
    result = await tool.execute(url="https://example.com")

    assert result.success is False
    assert "blocked" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_krawlx_blocks_local_ssrf_target(monkeypatch):
    monkeypatch.setenv("KRAWLX_FORCE_HTTPS", "0")

    tool = KrawlXTool()
    result = await tool.execute(url="http://127.0.0.1")

    assert result.success is False
    assert "blocked" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_krawlx_crawls_with_bounded_depth(monkeypatch):
    monkeypatch.setenv("KRAWLX_BLOCKED_HOSTS", "")

    html_by_url = {
        "https://example.com/": "<html><title>Home</title><body>Welcome <a href='/docs'>Docs</a></body></html>",
        "https://example.com/docs": "<html><title>Docs</title><body>Guide</body></html>",
    }

    async def fake_validate(self, url: str):
        return None

    async def fake_robots(self, client, url, robots_cache, last_seen):
        return True

    async def fake_fetch(self, client, url, timeout_seconds, last_seen):
        html = html_by_url[url]
        return url, 200, "text/html", html

    monkeypatch.setattr(KrawlXTool, "_validate_target_url", fake_validate)
    monkeypatch.setattr(KrawlXTool, "_is_robots_allowed", fake_robots)
    monkeypatch.setattr(KrawlXTool, "_fetch_html_page", fake_fetch)

    tool = KrawlXTool()
    result = await tool.execute(url="https://example.com", max_pages=2, max_depth=1)

    assert result.success is True
    payload = json.loads(result.output)
    assert payload["stats"]["pages_fetched"] == 2

    urls = [row["url"] for row in payload["pages"]]
    assert "https://example.com/" in urls
    assert "https://example.com/docs" in urls


@pytest.mark.asyncio
async def test_krawlx_falls_back_to_firecrawl_when_native_fails(monkeypatch):
    monkeypatch.setenv("KRAWLX_BLOCKED_HOSTS", "")
    monkeypatch.setenv("KRAWLX_FIRECRAWL_FALLBACK", "1")
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test-key")

    async def fake_validate(self, url: str):
        return None

    async def fake_robots(self, client, url, robots_cache, last_seen):
        return True

    async def fake_fetch(self, client, url, timeout_seconds, last_seen):
        raise ValueError("403 Forbidden")

    async def fake_firecrawl(self, *, seed_url, api_key, max_pages, max_depth, timeout_seconds):
        assert api_key == "fc-test-key"
        return {
            "seed_url": seed_url,
            "pages": [
                {
                    "url": seed_url,
                    "title": "Recovered by Firecrawl",
                    "status_code": 200,
                    "depth": 0,
                    "text_excerpt": "content",
                }
            ],
            "blocked": [],
            "errors": [],
            "stats": {
                "provider": "firecrawl",
                "pages_fetched": 1,
                "visited_urls": 1,
                "blocked_urls": 0,
                "errors": 0,
            },
        }

    monkeypatch.setattr(KrawlXTool, "_validate_target_url", fake_validate)
    monkeypatch.setattr(KrawlXTool, "_is_robots_allowed", fake_robots)
    monkeypatch.setattr(KrawlXTool, "_fetch_html_page", fake_fetch)
    monkeypatch.setattr(KrawlXTool, "_crawl_with_firecrawl", fake_firecrawl)

    tool = KrawlXTool()
    result = await tool.execute(url="https://example.com", max_pages=2, max_depth=1)

    assert result.success is True
    payload = json.loads(result.output)
    assert payload["stats"]["provider"] == "firecrawl"
    assert payload["stats"]["fallback_used"] is True
    assert payload["stats"]["pages_fetched"] == 1
    assert "native_attempt" in payload


@pytest.mark.asyncio
async def test_krawlx_provider_firecrawl_requires_key(monkeypatch):
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)

    async def fake_validate(self, url: str):
        return None

    monkeypatch.setattr(KrawlXTool, "_validate_target_url", fake_validate)

    tool = KrawlXTool()
    result = await tool.execute(url="https://example.com", provider="firecrawl")

    assert result.success is False
    assert "FIRECRAWL_API_KEY" in (result.error or "")
