from __future__ import annotations

import json

import pytest

from tools.web_search import WebSearchTool


@pytest.mark.asyncio
async def test_web_search_requires_query():
    tool = WebSearchTool()
    result = await tool.execute(query='   ')

    assert result.success is False
    assert result.error == 'query is required'


@pytest.mark.asyncio
async def test_web_search_falls_back_to_ddg(monkeypatch):
    tool = WebSearchTool()

    async def fail(*args, **kwargs):
        raise RuntimeError('provider unavailable')

    async def ddg_success(*args, **kwargs):
        return [
            {
                'title': 'KODO docs',
                'url': 'https://example.com/kodo',
                'snippet': 'KODO documentation',
            }
        ]

    monkeypatch.setattr(tool, '_search_firecrawl', fail)
    monkeypatch.setattr(tool, '_search_tavily', fail)
    monkeypatch.setattr(tool, '_search_serpapi', fail)
    monkeypatch.setattr(tool, '_search_duckduckgo', ddg_success)

    result = await tool.execute(query='kodo agent')

    assert result.success is True
    assert result.metadata is not None
    assert result.metadata.get('provider') == 'duckduckgo'

    payload = json.loads(result.output)
    assert isinstance(payload, list)
    assert payload[0]['url'] == 'https://example.com/kodo'


@pytest.mark.asyncio
async def test_web_search_returns_config_error_when_all_fail(monkeypatch):
    tool = WebSearchTool()

    async def fail(*args, **kwargs):
        raise RuntimeError('provider unavailable')

    monkeypatch.setattr(tool, '_search_firecrawl', fail)
    monkeypatch.setattr(tool, '_search_tavily', fail)
    monkeypatch.setattr(tool, '_search_serpapi', fail)
    monkeypatch.setattr(tool, '_search_duckduckgo', fail)

    result = await tool.execute(query='kodo')

    assert result.success is False
    assert 'Web search unavailable' in (result.error or '')
