from __future__ import annotations

import asyncio

import pytest

import agent.session_runner as session_runner_mod
from agent.session_runner import SessionRunner


class FakeAgentLoop:
    def __init__(self, session_id: str, project_dir=None, mode=None, model_override=None, artifact_mode=False, disable_tools=False):
        self.provider = 'openai'
        self.model = model_override or 'gpt-4o'
        self.artifact_mode = artifact_mode
        self.disable_tools = disable_tools

    async def run(self, user_message, history, approval_callback=None):
        yield {
            'type': 'tool_start',
            'tool': 'bash',
            'tool_use_id': 'tool-1',
            'input': {'command': 'echo hello'},
            'approved': True,
        }
        yield {'type': 'tool_output', 'tool_use_id': 'tool-1', 'line': 'hello'}
        yield {
            'type': 'tool_result',
            'tool': 'bash',
            'tool_use_id': 'tool-1',
            'output': 'hello',
            'success': True,
            'metadata': {'exit_code': 0},
        }
        yield {'type': 'text', 'content': 'hello '}
        yield {'type': 'text', 'content': 'world'}
        yield {'type': 'done', 'usage': {'input_tokens': 10, 'output_tokens': 8, 'model': self.model}}


class CancelledAgentLoop:
    def __init__(self, session_id: str, project_dir=None, mode=None, model_override=None, artifact_mode=False, disable_tools=False):
        self.provider = 'openai'
        self.model = 'gpt-4o'
        self.artifact_mode = artifact_mode
        self.disable_tools = disable_tools

    async def run(self, user_message, history, approval_callback=None):
        raise asyncio.CancelledError()
        yield  # pragma: no cover


class EmptyDoneAgentLoop:
    def __init__(self, session_id: str, project_dir=None, mode=None, model_override=None, artifact_mode=False, disable_tools=False):
        self.provider = 'openai'
        self.model = model_override or 'gpt-empty'
        self.artifact_mode = artifact_mode
        self.disable_tools = disable_tools

    async def run(self, user_message, history, approval_callback=None):
        yield {'type': 'done', 'usage': {'input_tokens': 10, 'output_tokens': 0, 'model': self.model}}


@pytest.mark.asyncio
async def test_session_runner_stream_and_save(monkeypatch):
    monkeypatch.setattr(session_runner_mod, 'AgentLoop', FakeAgentLoop)

    saved: dict[str, object] = {}

    async def fake_save_session(session_id, messages, metadata=None):
        saved['session_id'] = session_id
        saved['messages'] = messages
        saved['metadata'] = metadata

    monkeypatch.setattr(session_runner_mod.memory_manager, 'save_session', fake_save_session)

    runner = SessionRunner()
    events = []
    async for event in runner.stream(
        session_id='s1',
        messages=[{'role': 'user', 'content': 'hi'}],
        project_dir=None,
        mode='execute',
    ):
        events.append(event)

    assert any(event['type'] == 'done' for event in events)
    assert saved['session_id'] == 's1'
    saved_messages = saved['messages']
    assert isinstance(saved_messages, list)
    assert saved_messages[-1]['role'] == 'assistant'
    assert saved_messages[-1]['content'] == 'hello world'
    assert saved_messages[-1]['usage'] == {'input_tokens': 10, 'output_tokens': 8, 'model': 'gpt-4o'}
    assert saved_messages[-1]['tool_calls'][0]['tool'] == 'bash'
    assert saved_messages[-1]['tool_calls'][0]['output'] == 'hello'
    assert saved_messages[-1]['tool_calls'][0]['stream_lines'] == ['hello']
    saved_metadata = saved['metadata']
    assert isinstance(saved_metadata, dict)
    assert saved_metadata.get('mode') == 'execute'
    assert 'model_override' not in saved_metadata


@pytest.mark.asyncio
async def test_session_runner_persists_explicit_model_override(monkeypatch):
    monkeypatch.setattr(session_runner_mod, 'AgentLoop', FakeAgentLoop)

    saved: dict[str, object] = {}

    async def fake_save_session(session_id, messages, metadata=None):
        saved['session_id'] = session_id
        saved['messages'] = messages
        saved['metadata'] = metadata

    monkeypatch.setattr(session_runner_mod.memory_manager, 'save_session', fake_save_session)

    runner = SessionRunner()
    events = []
    async for event in runner.stream(
        session_id='s1b',
        messages=[{'role': 'user', 'content': 'hi'}],
        project_dir=None,
        mode='execute',
        model_override='gpt-4o-mini',
    ):
        events.append(event)

    assert any(event['type'] == 'done' for event in events)
    saved_metadata = saved['metadata']
    assert isinstance(saved_metadata, dict)
    assert saved_metadata.get('model_override') == 'gpt-4o-mini'


@pytest.mark.asyncio
async def test_session_runner_passes_disable_tools_to_agent(monkeypatch):
    captured: dict[str, object] = {}

    class CapturingAgentLoop(FakeAgentLoop):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            captured['disable_tools'] = self.disable_tools

    monkeypatch.setattr(session_runner_mod, 'AgentLoop', CapturingAgentLoop)

    async def fake_save_session(session_id, messages, metadata=None):
        return None

    monkeypatch.setattr(session_runner_mod.memory_manager, 'save_session', fake_save_session)

    runner = SessionRunner()
    async for _event in runner.stream(
        session_id='s1c',
        messages=[{'role': 'user', 'content': 'hi'}],
        project_dir=None,
        mode='execute',
        disable_tools=True,
    ):
        pass

    assert captured.get('disable_tools') is True


@pytest.mark.asyncio
async def test_session_runner_run_callback(monkeypatch):
    monkeypatch.setattr(session_runner_mod, 'AgentLoop', FakeAgentLoop)

    async def fake_save_session(session_id, messages, metadata=None):
        return None

    monkeypatch.setattr(session_runner_mod.memory_manager, 'save_session', fake_save_session)

    seen = []

    async def callback(event):
        seen.append(event['type'])

    runner = SessionRunner()
    result = await runner.run(
        session_id='s2',
        messages=[{'role': 'user', 'content': 'go'}],
        project_dir=None,
        mode='execute',
        stream_callback=callback,
    )

    assert result.error is None
    assert 'done' in seen


@pytest.mark.asyncio
async def test_session_runner_handles_cancellation(monkeypatch):
    monkeypatch.setattr(session_runner_mod, 'AgentLoop', CancelledAgentLoop)

    async def fake_save_session(session_id, messages, metadata=None):
        return None

    monkeypatch.setattr(session_runner_mod.memory_manager, 'save_session', fake_save_session)

    runner = SessionRunner()
    events = []
    async for event in runner.stream(
        session_id='s3',
        messages=[{'role': 'user', 'content': 'stop'}],
        project_dir=None,
        mode='execute',
    ):
        events.append(event)

    assert any(event['type'] == 'error' for event in events)


@pytest.mark.asyncio
async def test_session_runner_reports_empty_provider_completion(monkeypatch):
    monkeypatch.setattr(session_runner_mod, 'AgentLoop', EmptyDoneAgentLoop)

    async def fake_save_session(session_id, messages, metadata=None):
        return None

    monkeypatch.setattr(session_runner_mod.memory_manager, 'save_session', fake_save_session)

    runner = SessionRunner()
    events = []
    async for event in runner.stream(
        session_id='s4',
        messages=[{'role': 'user', 'content': 'build a site'}],
        project_dir=None,
        mode='execute',
    ):
        events.append(event)

    errors = [event for event in events if event.get('type') == 'error']
    assert errors
    assert 'returned no text content' in str(errors[-1].get('message', ''))
    assert 'gpt-empty' in str(errors[-1].get('message', ''))
    assert getattr(runner, '_last_result').error == errors[-1]['message']
