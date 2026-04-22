from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

import api.chat as chat_api
from main import app


client = TestClient(app)


def test_infer_default_project_dir_prefers_parent_project_root(monkeypatch, tmp_path):
    repo_root = tmp_path / "repo"
    backend_dir = repo_root / "backend"
    backend_dir.mkdir(parents=True, exist_ok=True)
    (repo_root / "README.md").write_text("test", encoding="utf-8")

    monkeypatch.delenv("KODO_DEFAULT_PROJECT_DIR", raising=False)
    monkeypatch.delenv("PROJECT_DIR", raising=False)
    monkeypatch.setattr(chat_api.os, "getcwd", lambda: str(backend_dir))

    inferred = chat_api._infer_default_project_dir()
    expected = chat_api.enforce_allowed_path(str(repo_root))

    assert inferred == expected


def test_send_uses_stored_session_project_dir_when_request_omits_it(monkeypatch, tmp_path):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    project_dir = tmp_path / "project"
    project_dir.mkdir(parents=True, exist_ok=True)
    expected_project_dir = chat_api.enforce_allowed_path(str(project_dir))

    captured: dict[str, str] = {}

    async def fake_mark_session_activity(session_id: str):
        return {"last_active_at": "now"}

    async def fake_load_session_payload(session_id: str):
        return {
            "session_id": session_id,
            "metadata": {"mode": "execute", "project_dir": str(project_dir)},
            "messages": [],
        }

    async def fake_update_session_metadata(session_id: str, updates: dict, *, create_if_missing: bool = True):
        captured["updated_project_dir"] = str(updates.get("project_dir", ""))
        return {"mode": "execute", "project_dir": updates.get("project_dir")}

    async def fake_publish_session_event(session_id: str, event: dict):
        return None

    async def fake_stream(
        self,
        *,
        session_id: str,
        messages: list[dict],
        project_dir: str | None,
        mode: str,
        approval_callback=None,
        model_override: str | None = None,
        artifact_mode: bool = False,
    ):
        captured["runner_project_dir"] = str(project_dir or "")
        captured["artifact_mode"] = bool(artifact_mode)
        yield {"type": "text", "content": "ok"}
        yield {"type": "done", "usage": {"input_tokens": 1, "output_tokens": 1, "model": "test-model"}}

    monkeypatch.setattr(chat_api.memory_manager, "mark_session_activity", fake_mark_session_activity)
    monkeypatch.setattr(chat_api.memory_manager, "load_session_payload", fake_load_session_payload)
    monkeypatch.setattr(chat_api.memory_manager, "update_session_metadata", fake_update_session_metadata)
    monkeypatch.setattr(chat_api, "publish_session_event", fake_publish_session_event)
    monkeypatch.setattr(chat_api.SessionRunner, "stream", fake_stream)

    response = client.post(
        "/api/chat/send",
        json={
            "session_id": "session-project-fallback-1",
            "message": "find bugs in this directory",
        },
    )

    assert response.status_code == 200
    assert captured.get("runner_project_dir") == expected_project_dir
    assert captured.get("updated_project_dir") == expected_project_dir
    assert '"type": "done"' in response.text


def test_send_routes_structured_slash_command(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    monkeypatch.setattr(chat_api, "_infer_default_project_dir", lambda: None)

    captured: dict[str, str] = {}

    async def fake_mark_session_activity(session_id: str):
        return {"last_active_at": "now"}

    async def fake_load_session_payload(session_id: str):
        return {
            "session_id": session_id,
            "metadata": {"mode": "execute"},
            "messages": [],
        }

    async def fake_save_session(session_id: str, messages: list[dict], metadata: dict):
        captured["saved_session_id"] = session_id
        captured["saved_mode"] = str(metadata.get("mode", ""))
        return None

    async def fake_publish_session_event(session_id: str, event: dict):
        return None

    async def fake_execute_command(
        message: str,
        session_id: str,
        project_dir: str | None = None,
        api_key_overrides: dict[str, str] | None = None,
    ):
        captured["command_message"] = message
        captured["has_overrides"] = "yes" if isinstance(api_key_overrides, dict) else "no"
        return SimpleNamespace(name="krawlx", text="KrawlX command ok", run_prompt=None)

    monkeypatch.setattr(chat_api.memory_manager, "mark_session_activity", fake_mark_session_activity)
    monkeypatch.setattr(chat_api.memory_manager, "load_session_payload", fake_load_session_payload)
    monkeypatch.setattr(chat_api.memory_manager, "save_session", fake_save_session)
    monkeypatch.setattr(chat_api, "publish_session_event", fake_publish_session_event)
    monkeypatch.setattr(chat_api, "execute_command", fake_execute_command)

    response = client.post(
        "/api/chat/send",
        json={
            "session_id": "session-structured-command-1",
            "content": [{"type": "text", "text": "/krawlx https://example.com"}],
        },
    )

    assert response.status_code == 200
    assert captured.get("command_message") == "/krawlx https://example.com"
    assert captured.get("has_overrides") == "yes"
    assert captured.get("saved_session_id") == "session-structured-command-1"
    assert '"type": "text"' in response.text
    assert '"type": "done"' in response.text


def test_commands_endpoint_lists_krawlx(monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    response = client.get("/api/chat/commands")

    assert response.status_code == 200
    payload = response.json()
    command_names = {item.get("name") for item in payload.get("commands", [])}
    assert "/krawlx <url>" in command_names
    assert "/crawlx <url>" in command_names
