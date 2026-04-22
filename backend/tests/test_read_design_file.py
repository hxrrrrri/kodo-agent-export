from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_read_design_file_requires_auth_when_token_set(tmp_path, monkeypatch):
    target = tmp_path / "index.html"
    target.write_text("<html>hi</html>", encoding="utf-8")

    monkeypatch.setenv("API_AUTH_TOKEN", "secret-token")

    response = client.get(f"/api/chat/read-design-file?path={target}")
    assert response.status_code == 401

    response = client.get(
        f"/api/chat/read-design-file?path={target}",
        headers={"Authorization": "Bearer secret-token"},
    )
    assert response.status_code == 200
    assert response.json()["content"] == "<html>hi</html>"


def test_read_design_file_blocks_system_paths(tmp_path, monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)

    response = client.get("/api/chat/read-design-file?path=/etc/passwd")
    assert response.status_code in {403, 404}


def test_read_design_file_open_when_no_token(tmp_path, monkeypatch):
    monkeypatch.delenv("API_AUTH_TOKEN", raising=False)
    target = tmp_path / "style.css"
    target.write_text("body{}", encoding="utf-8")

    response = client.get(f"/api/chat/read-design-file?path={target}")
    assert response.status_code == 200
    assert response.json()["filename"] == "style.css"
