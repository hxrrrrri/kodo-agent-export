from __future__ import annotations

import pytest

import profiles.manager as profile_mod
from profiles.manager import ProfileManager, ProviderProfile


@pytest.mark.asyncio
async def test_save_and_list_profiles(tmp_path, monkeypatch):
    monkeypatch.setattr(profile_mod, 'feature_enabled', lambda _: True)

    manager = ProfileManager()
    manager.profiles_file = tmp_path / 'profiles.json'
    manager.active_profile_file = tmp_path / 'active.json'

    profile = ProviderProfile(
        provider='openai',
        model='gpt-4o',
        base_url=None,
        api_key=None,
        goal='balanced',
        created_at='2026-01-01T00:00:00Z',
        name='dev-openai',
    )
    await manager.save_profile(profile)

    rows = await manager.list_profiles()
    assert len(rows) == 1
    assert rows[0].name == 'dev-openai'


@pytest.mark.asyncio
async def test_activate_and_get_active_profile(tmp_path, monkeypatch):
    monkeypatch.setattr(profile_mod, 'feature_enabled', lambda _: True)

    manager = ProfileManager()
    manager.profiles_file = tmp_path / 'profiles.json'
    manager.active_profile_file = tmp_path / 'active.json'

    profile = ProviderProfile(
        provider='openai',
        model='gpt-4o-mini',
        base_url=None,
        api_key=None,
        goal='latency',
        created_at='2026-01-01T00:00:00Z',
        name='fast-openai',
    )
    await manager.save_profile(profile)
    await manager.activate_profile('fast-openai')

    active = await manager.get_active_profile()
    assert active is not None
    assert active.name == 'fast-openai'


@pytest.mark.asyncio
async def test_auto_select_profile_prefers_local(tmp_path, monkeypatch):
    monkeypatch.setattr(profile_mod, 'feature_enabled', lambda _: True)

    async def fake_discover_local_providers():
        return {'ollama': True, 'atomic_chat': False}

    async def fake_list_available_models(provider: str):
        return ['qwen2.5-coder:7b']

    monkeypatch.setattr(profile_mod, 'discover_local_providers', fake_discover_local_providers)
    monkeypatch.setattr(profile_mod, 'list_available_models', fake_list_available_models)
    monkeypatch.setattr(profile_mod, 'recommend_model', lambda available, goal: available[0])

    manager = ProfileManager()
    manager.profiles_file = tmp_path / 'profiles.json'
    manager.active_profile_file = tmp_path / 'active.json'

    selected = await manager.auto_select_profile('coding')
    assert selected.provider == 'ollama'
    assert selected.model == 'qwen2.5-coder:7b'
