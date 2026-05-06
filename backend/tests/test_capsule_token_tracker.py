from __future__ import annotations

import importlib

import pytest

from kodo.capsule.storage import CapsuleStore
from kodo.capsule.token_tracker import AnthropicTokenAdapter, OpenAITokenAdapter, TokenTracker, context_window_for_model

token_tracker_module = importlib.import_module("kodo.capsule.token_tracker")


def test_token_adapters_extract_provider_usage() -> None:
    anthropic = AnthropicTokenAdapter().extract_from_response(
        {"usage": {"input_tokens": 100, "output_tokens": 25}},
        {"anthropic-ratelimit-input-tokens-limit": "1000", "anthropic-ratelimit-input-tokens-remaining": "750"},
    )
    assert anthropic.input_tokens == 100
    assert anthropic.output_tokens == 25
    assert anthropic.rate_limit_tokens_total == 1000

    openai = OpenAITokenAdapter().extract_from_response(
        {"usage": {"prompt_tokens": 80, "completion_tokens": 20, "total_tokens": 100}},
        {"x-ratelimit-limit-tokens": "200", "x-ratelimit-remaining-tokens": "50"},
    )
    assert openai.input_tokens == 80
    assert openai.output_tokens == 20
    assert openai.rate_limit_tokens_remaining == 50


@pytest.mark.asyncio
async def test_token_tracker_broadcasts_and_accumulates(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(token_tracker_module, "capsule_store", CapsuleStore(tmp_path / "tokens.db"))
    tracker = TokenTracker()
    queue = tracker.subscribe()

    state = await tracker.record_response(
        provider="openai",
        response_body={"model": "gpt-4o", "input_tokens": 64_000, "output_tokens": 32_000},
        response_headers={},
        session_id="session-1",
    )

    assert state.total_input == 64_000
    assert state.total_output == 32_000
    assert state.context_window == context_window_for_model("gpt-4o", "openai")
    assert state.capsule_alert_level == "warning"

    event = queue.get_nowait()
    assert event.session_id == "session-1"
    assert event.context_pct == state.context_pct
