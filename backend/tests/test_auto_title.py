from __future__ import annotations

import pytest

import agent.session_runner as session_runner_mod


@pytest.mark.asyncio
async def test_generate_smart_title_limits_to_eight_words(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_call_title_model(prompt: str) -> str:
        return "this title has far more than eight words total"

    monkeypatch.setattr(session_runner_mod, "_call_title_model", fake_call_title_model)

    messages = [
        {"role": "user", "content": "Please summarize this long discussion"},
        {"role": "assistant", "content": "Done and delivered."},
    ]

    title = await session_runner_mod._generate_smart_title(messages)
    assert len(title.split()) <= 8


def test_auto_title_feature_flag_can_be_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KODO_ENABLE_AUTO_TITLE", "0")
    assert session_runner_mod._auto_title_enabled() is False


@pytest.mark.asyncio
async def test_generate_smart_title_falls_back_on_model_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail_call_title_model(prompt: str) -> str:
        raise RuntimeError("provider down")

    monkeypatch.setattr(session_runner_mod, "_call_title_model", fail_call_title_model)

    messages = [
        {"role": "user", "content": "Implement resilient API retry workflow"},
        {"role": "assistant", "content": "Implemented with circuit breaker."},
    ]

    fallback = session_runner_mod._default_session_title(messages)
    title = await session_runner_mod._generate_smart_title(messages)
    assert title == fallback
