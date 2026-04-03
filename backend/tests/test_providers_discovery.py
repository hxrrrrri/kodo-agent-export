from __future__ import annotations

import pytest

import providers.discovery as discovery


@pytest.mark.asyncio
async def test_discover_local_providers_disabled(monkeypatch):
    monkeypatch.setattr(discovery, 'feature_enabled', lambda _: False)
    payload = await discovery.discover_local_providers()
    assert payload == {'ollama': False, 'atomic_chat': False}


@pytest.mark.asyncio
async def test_list_available_models_for_ollama(monkeypatch):
    monkeypatch.setattr(discovery, 'feature_enabled', lambda _: True)
    async def fake_list_ollama_models():
        return ['llama3.1:8b']

    monkeypatch.setattr(discovery, 'list_ollama_models', fake_list_ollama_models)
    models = await discovery.list_available_models('ollama')
    assert models == ['llama3.1:8b']


def test_recommend_model_prefers_coding_families():
    available = ['mistral:7b', 'qwen2.5-coder:7b', 'llama3.1:8b']
    assert discovery.recommend_model(available, 'coding') == 'qwen2.5-coder:7b'


def test_recommend_model_latency_prefers_smallest():
    available = ['llama3.1:70b', 'llama3.1:8b', 'llama3.1:3b']
    assert discovery.recommend_model(available, 'latency') == 'llama3.1:3b'
