from __future__ import annotations

import io
import os
import zipfile

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def _zip_blob(entries: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def test_upload_zip_extracts_files(tmp_path):
    payload = _zip_blob({"src/main.py": "print('ok')\n"})

    response = client.post(
        "/api/chat/upload-zip",
        files={"file": ("bundle.zip", payload, "application/zip")},
        data={"project_dir": str(tmp_path)},
    )

    assert response.status_code == 200
    body = response.json()
    assert os.path.normcase(body["project_dir"]) == os.path.normcase(str(tmp_path.resolve()))
    assert len(body.get("extracted", [])) == 1

    extracted_file = tmp_path / "src" / "main.py"
    assert extracted_file.exists()
    assert extracted_file.read_text(encoding="utf-8") == "print('ok')\n"


def test_upload_zip_blocks_zip_slip(tmp_path):
    payload = _zip_blob({"../escape.txt": "blocked"})

    response = client.post(
        "/api/chat/upload-zip",
        files={"file": ("bundle.zip", payload, "application/zip")},
        data={"project_dir": str(tmp_path)},
    )

    assert response.status_code == 400
    assert "Unsafe zip entry path" in response.json().get("detail", "")


def test_upload_zip_rejects_non_zip_extension(tmp_path):
    payload = _zip_blob({"src/main.py": "print('ok')\n"})

    response = client.post(
        "/api/chat/upload-zip",
        files={"file": ("bundle.txt", payload, "application/octet-stream")},
        data={"project_dir": str(tmp_path)},
    )

    assert response.status_code == 400
    assert "Only .zip archives are supported" in response.json().get("detail", "")
