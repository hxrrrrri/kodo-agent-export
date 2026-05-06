from __future__ import annotations

import agent.loop as loop_mod


def test_resolve_provider_config_honors_primary_ollama(monkeypatch):
    monkeypatch.setenv("PRIMARY_PROVIDER", "ollama")
    monkeypatch.setenv("MODEL", "gemma4:e2b")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")

    config = loop_mod._resolve_provider_config()

    assert config.provider == "ollama"
    assert config.model == "gemma4:e2b"
    assert config.base_url == "http://127.0.0.1:11434/v1"


def test_resolve_provider_config_uses_openrouter_when_selected(monkeypatch):
    monkeypatch.setenv("PRIMARY_PROVIDER", "openrouter")
    monkeypatch.setenv("MODEL", "google/gemma-3-4b-it")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")

    config = loop_mod._resolve_provider_config()

    assert config.provider == "openrouter"
    assert config.model == "google/gemma-3-4b-it"
    assert config.api_key == "sk-or-test"


def test_resolve_provider_config_resets_stale_model_for_codex_cli(monkeypatch):
    monkeypatch.setenv("PRIMARY_PROVIDER", "codex-cli")
    monkeypatch.setenv("MODEL", "gpt-4o")

    monkeypatch.setattr(loop_mod, "feature_enabled", lambda name, default="0": False)

    from agent import cli_runner

    monkeypatch.setattr(cli_runner, "cli_available", lambda provider: provider == "codex-cli")
    monkeypatch.setattr(loop_mod, "cli_available", lambda provider: provider == "codex-cli", raising=False)

    config = loop_mod._resolve_provider_config()

    assert config.provider == "codex-cli"
    assert config.model == "default"


def test_cli_system_prompt_includes_artifact_protocol_for_visual_requests(monkeypatch):
    agent = loop_mod.AgentLoop.__new__(loop_mod.AgentLoop)
    agent.mode = "execute"
    agent.artifact_mode = False
    agent.provider = "gemini-cli"

    monkeypatch.setattr(loop_mod, "feature_enabled", lambda name, default="0": True)

    prompt = agent._build_cli_system_prompt("build an artifact that animates Newton's third law")

    assert "ARTIFACT PROTOCOL" in prompt
    assert "emit the finished Kodo artifact fence directly" in prompt
    assert "do not answer with a greeting" in prompt
    assert "prefer `type=html` artifacts" in prompt
    assert "Do not emit React/JSX unless the user explicitly asks" in prompt
    assert "inline `<style>`" in prompt
    assert "plain JavaScript inside `<script>`" in prompt
    assert "Always close the fence with a bare ``` on its own line." in prompt


def test_cli_system_prompt_reinforces_latest_user_request():
    agent = loop_mod.AgentLoop.__new__(loop_mod.AgentLoop)
    agent.mode = "execute"
    agent.artifact_mode = False

    prompt = agent._build_cli_system_prompt("hi")

    assert "Answer the latest user request directly" in prompt
    assert "latest user request is authoritative" in prompt
    assert "ARTIFACT PROTOCOL" not in prompt
