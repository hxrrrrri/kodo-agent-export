from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

import api.chat as chat_api
import api.prompts as prompts_api
import api.skills_admin as skills_admin_api
from main import app


client = TestClient(app)


def test_prompt_crud_and_render(tmp_path, monkeypatch):
    prompts_root = tmp_path / '.kodo'
    prompts_file = prompts_root / 'prompts.json'
    monkeypatch.setattr(prompts_api, 'KODO_DIR', prompts_root)
    monkeypatch.setattr(prompts_api, 'PROMPTS_FILE', prompts_file)

    save_response = client.post(
      '/api/prompts',
      json={'name': 'greeting', 'content': 'Hello {{name}} from {{project}}'},
    )
    assert save_response.status_code == 200
    assert save_response.json().get('saved') is True

    list_response = client.get('/api/prompts')
    assert list_response.status_code == 200
    rows = list_response.json().get('prompts', [])
    assert len(rows) == 1
    assert rows[0]['name'] == 'greeting'

    render_response = client.post(
      '/api/prompts/greeting/render',
      json={'variables': {'name': 'KODO', 'project': 'v5'}},
    )
    assert render_response.status_code == 200
    assert render_response.json().get('rendered') == 'Hello KODO from v5'

    delete_response = client.delete('/api/prompts/greeting')
    assert delete_response.status_code == 200

    list_after_delete = client.get('/api/prompts')
    assert list_after_delete.status_code == 200
    assert list_after_delete.json().get('prompts') == []


def test_custom_skill_crud(tmp_path, monkeypatch):
    skills_root = tmp_path / '.kodo' / 'skills'
    monkeypatch.setattr(skills_admin_api, 'CUSTOM_SKILLS_DIR', skills_root)

    create_response = client.post(
      '/api/skills/custom',
      json={'name': 'triage-skill', 'content': '# Triage\n\nRun incident triage steps.'},
    )
    assert create_response.status_code == 200
    assert create_response.json().get('saved') is True

    list_response = client.get('/api/skills/custom')
    assert list_response.status_code == 200
    skills = list_response.json().get('skills', [])
    assert len(skills) == 1
    assert skills[0]['name'] == 'triage-skill'

    delete_response = client.delete('/api/skills/custom/triage-skill')
    assert delete_response.status_code == 200

    list_after_delete = client.get('/api/skills/custom')
    assert list_after_delete.status_code == 200
    assert list_after_delete.json().get('skills') == []


def test_code_review_endpoint_returns_review(monkeypatch, tmp_path):
    class DummyResult:
        error = None
        provider = 'test-provider'
        model = 'test-model'

    async def fake_run(self, session_id: str, messages: list[dict], project_dir: str | None, mode: str, stream_callback):
        assert mode == 'review'
        assert isinstance(messages, list)
        assert project_dir is None or Path(project_dir).exists()
        await stream_callback({'type': 'text', 'content': 'High: Missing null check in parser.'})
        await stream_callback({'type': 'done', 'usage': {'input_tokens': 10, 'output_tokens': 20}})
        return DummyResult()

    monkeypatch.setattr(chat_api.SessionRunner, 'run', fake_run)

    response = client.post(
      '/api/chat/code-review',
      json={
        'branch': 'feature/review-target',
        'base_branch': 'main',
        'project_dir': str(tmp_path),
      },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload.get('error') is None
    assert payload.get('provider') == 'test-provider'
    assert 'Missing null check' in payload.get('review', '')
