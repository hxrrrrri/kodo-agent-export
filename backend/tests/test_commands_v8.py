from __future__ import annotations

import pytest

import commands.router as commands_router


@pytest.mark.asyncio
async def test_teleport_sets_mode(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_update_session_metadata(session_id: str, updates: dict[str, object], create_if_missing: bool = True):
        captured["session_id"] = session_id
        captured["updates"] = updates
        captured["create_if_missing"] = create_if_missing
        return updates

    monkeypatch.setattr(commands_router.memory_manager, "update_session_metadata", fake_update_session_metadata)

    result = await commands_router.execute_command("/teleport coord", session_id="s-v8", project_dir=None)

    assert result.name == "teleport"
    assert "coordinator" in result.text.lower()
    updates = captured.get("updates")
    assert isinstance(updates, dict)
    assert updates.get("mode") == "coordinator"


@pytest.mark.asyncio
async def test_dream_command_returns_run_prompt():
    result = await commands_router.execute_command("/dream local ollama ux", session_id="s-v8", project_dir=None)

    assert result.name == "dream"
    assert result.run_prompt is not None
    assert "local ollama ux" in result.run_prompt.lower()


@pytest.mark.asyncio
async def test_bughunter_command_returns_run_prompt():
    result = await commands_router.execute_command("/bughunter save button disabled", session_id="s-v8", project_dir=None)

    assert result.name == "bughunter"
    assert result.run_prompt is not None
    assert "save button disabled" in result.run_prompt.lower()


@pytest.mark.asyncio
async def test_krawlx_command_disabled(monkeypatch):
    monkeypatch.setattr(
        commands_router,
        "feature_enabled",
        lambda feature, default="1": False if feature == "KRAWLX" else True,
    )

    result = await commands_router.execute_command("/krawlx https://example.com", session_id="s-v8", project_dir=None)

    assert result.name == "krawlx"
    assert "disabled" in result.text.lower()


@pytest.mark.asyncio
async def test_crawlx_alias_parses_options_and_calls_krawlx_tool(monkeypatch):
    monkeypatch.setattr(
        commands_router,
        "feature_enabled",
        lambda feature, default="1": True,
    )

    captured: dict[str, object] = {}

    async def fake_run_tool_command(tool_name: str, **kwargs):
        captured["tool_name"] = tool_name
        captured["kwargs"] = kwargs
        return commands_router.CommandExecutionResult(
            name="krawlx_crawl",
            text=(
                '{"stats":{"pages_fetched":2,"visited_urls":2,"blocked_urls":0,"errors":0},'
                '"pages":[{"url":"https://example.com/"},{"url":"https://example.com/docs"}]}'
            ),
        )

    monkeypatch.setattr(commands_router, "_run_tool_command", fake_run_tool_command)

    result = await commands_router.execute_command(
        "/crawlx https://example.com --max-pages 12 --max-depth 3 --timeout 8 --same-origin false --obey-robots false --include docs,blog --exclude logout",
        session_id="s-v8",
        project_dir=None,
    )

    assert result.name == "krawlx"
    assert "pages fetched: 2" in result.text.lower()

    assert captured["tool_name"] == "krawlx_crawl"
    kwargs = captured["kwargs"]
    assert isinstance(kwargs, dict)
    assert kwargs.get("url") == "https://example.com"
    assert kwargs.get("max_pages") == 12
    assert kwargs.get("max_depth") == 3
    assert kwargs.get("timeout_seconds") == 8.0
    assert kwargs.get("same_origin") is False
    assert kwargs.get("obey_robots") is False
    assert kwargs.get("include_patterns") == ["docs", "blog"]
    assert kwargs.get("exclude_patterns") == ["logout"]
