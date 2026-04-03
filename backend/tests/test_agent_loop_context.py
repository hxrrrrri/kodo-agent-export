from __future__ import annotations

import agent.loop as loop_mod


def test_truncate_history_keeps_recent(monkeypatch):
    monkeypatch.setattr(loop_mod, 'MAX_CONTEXT_MESSAGES', 3)

    history = [
        {'role': 'user', 'content': f'msg-{idx}'}
        for idx in range(6)
    ]

    truncated = loop_mod._truncate_history(history)
    assert len(truncated) == 3
    assert truncated[0]['content'] == 'msg-3'
    assert truncated[-1]['content'] == 'msg-5'


def test_to_openai_content_supports_image_blocks():
    payload = [
        {'type': 'text', 'text': 'Analyze this image'},
        {
            'type': 'image',
            'source': {
                'type': 'base64',
                'media_type': 'image/png',
                'data': 'abcd1234',
            },
        },
    ]

    converted = loop_mod._to_openai_content(payload)
    assert isinstance(converted, list)
    assert converted[0]['type'] == 'text'
    assert converted[1]['type'] == 'image_url'
    assert converted[1]['image_url']['url'].startswith('data:image/png;base64,')


def test_apply_anthropic_cache_controls_marks_recent_blocks(monkeypatch):
    monkeypatch.setattr(loop_mod, 'ENABLE_PROMPT_CACHE', True)
    monkeypatch.setattr(loop_mod, 'N_CACHE_MESSAGES', 2)

    messages = [
        {'role': 'user', 'content': [{'type': 'text', 'text': 'older'}]},
        {'role': 'assistant', 'content': [{'type': 'text', 'text': 'recent-1'}]},
        {'role': 'user', 'content': [{'type': 'text', 'text': 'recent-2'}]},
    ]

    marked = loop_mod._apply_anthropic_cache_controls(messages)

    assert 'cache_control' not in marked[0]['content'][0]
    assert marked[1]['content'][0]['cache_control'] == {'type': 'ephemeral'}
    assert marked[2]['content'][0]['cache_control'] == {'type': 'ephemeral'}
