from __future__ import annotations

from agent.loop import _build_anthropic_messages, _to_anthropic_content


def test_to_anthropic_content_drops_blank_text_blocks():
    payload = _to_anthropic_content([{"type": "text", "text": "   "}, {"type": "text", "text": ""}])
    assert payload == []


def test_to_anthropic_content_keeps_non_empty_text():
    payload = _to_anthropic_content("hello")
    assert payload == [{"type": "text", "text": "hello"}]


def test_build_anthropic_messages_skips_empty_history_items():
    history = [
        {"role": "assistant", "content": ""},
        {"role": "assistant", "content": [{"type": "text", "text": "   "}]},
        {"role": "user", "content": "can you let me know what model are you?"},
    ]

    messages = _build_anthropic_messages(history)

    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == [{"type": "text", "text": "can you let me know what model are you?"}]
