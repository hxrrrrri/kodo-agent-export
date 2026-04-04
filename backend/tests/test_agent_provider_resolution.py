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
