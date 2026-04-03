from __future__ import annotations

import pytest

from providers.smart_router import Provider, SmartRouter


def _local_provider(name: str, latency: float, cost: float) -> Provider:
    return Provider(
        name=name,
        ping_url='http://localhost/ping',
        api_key_env='',
        cost_per_1k_tokens=cost,
        big_model='big-model',
        small_model='small-model',
        healthy=True,
        latency_ms=latency,
        avg_latency_ms=latency,
        base_url='http://localhost/v1',
    )


def test_provider_quality_score_penalizes_errors():
    provider = _local_provider('ollama', latency=200, cost=0.0)
    provider.request_count = 10
    provider.error_count = 3
    quality_score = provider.score('quality')
    latency_score = provider.score('latency')
    assert quality_score > 0
    assert quality_score > latency_score


@pytest.mark.asyncio
async def test_router_selects_low_latency_provider():
    fast = _local_provider('ollama', latency=80, cost=0.1)
    slow = _local_provider('atomic-chat', latency=500, cost=0.0)

    router = SmartRouter(providers=[slow, fast], strategy='latency', fallback_enabled=True)
    router._initialized = True

    route = await router.route(messages=[{'role': 'user', 'content': 'hello'}], model='')
    assert route['provider'] == 'ollama'


@pytest.mark.asyncio
async def test_router_fallback_executor_uses_second_provider():
    first = _local_provider('ollama', latency=80, cost=0.1)
    second = _local_provider('atomic-chat', latency=120, cost=0.0)

    router = SmartRouter(providers=[first, second], strategy='latency', fallback_enabled=True)
    router._initialized = True

    attempts: list[str] = []

    async def executor(provider: Provider, model: str) -> str:
        attempts.append(provider.name)
        if provider.name == 'ollama':
            raise RuntimeError('first provider failed')
        return f"ok:{provider.name}:{model}"

    result = await router.route(messages=[{'role': 'user', 'content': 'hello'}], model='test-model', executor=executor)
    assert result.startswith('ok:atomic-chat:')
    assert attempts == ['ollama', 'atomic-chat']
