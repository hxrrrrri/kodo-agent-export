from __future__ import annotations

import asyncio
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from observability.audit import log_audit_event

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

KODO_DIR = Path.home() / ".kodo"


class PackMetadata(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    author: str = Field(default="", max_length=80)


async def _read_json_file(path: Path, default: Any) -> Any:
    def read_sync() -> Any:
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default

    return await asyncio.to_thread(read_sync)


async def _write_json_file(path: Path, payload: Any) -> None:
    def write_sync() -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
        tmp.replace(path)

    await asyncio.to_thread(write_sync)


@router.post("/export")
async def export_pack(body: PackMetadata, request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "export_pack")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        metadata = {
            "name": body.name,
            "description": body.description,
            "author": body.author,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "version": "1",
        }
        archive.writestr("pack.json", json.dumps(metadata, indent=2, ensure_ascii=True))

        skills_dir = KODO_DIR / "skills"
        if skills_dir.exists():
            for skill_file in skills_dir.glob("*.md"):
                archive.write(skill_file, f"skills/{skill_file.name}")

        prompts_file = KODO_DIR / "prompts.json"
        if prompts_file.exists():
            archive.write(prompts_file, "prompts.json")

        cron_file = KODO_DIR / "cron.json"
        if cron_file.exists():
            cron_payload = await _read_json_file(cron_file, [])
            if isinstance(cron_payload, list):
                for row in cron_payload:
                    if isinstance(row, dict):
                        row.pop("last_run", None)
                        row.pop("last_task_id", None)
                archive.writestr("cron.json", json.dumps(cron_payload, indent=2, ensure_ascii=True))

    buffer.seek(0)
    safe_name = "".join(ch for ch in body.name if ch.isalnum() or ch in "-_") or "kodo-pack"
    log_audit_event("pack_exported", name=body.name)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={safe_name}.kodopack"},
    )


@router.post("/import")
async def import_pack(request: Request, file: UploadFile = File(...)):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "import_pack")

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Pack file too large (max 10MB).")

    imported = {"skills": 0, "prompts": 0, "cron_jobs": 0, "errors": []}
    meta_name = "unknown"

    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = archive.namelist()
            if "pack.json" not in names:
                raise HTTPException(status_code=422, detail="Invalid pack: missing pack.json")

            metadata = json.loads(archive.read("pack.json"))
            meta_name = str((metadata or {}).get("name") or "unknown")

            skills_dir = KODO_DIR / "skills"
            skills_dir.mkdir(parents=True, exist_ok=True)
            for name in names:
                if not name.startswith("skills/") or not name.endswith(".md"):
                    continue
                skill_name = Path(name).stem
                destination = skills_dir / f"{skill_name}.md"
                if destination.exists():
                    destination = skills_dir / f"{skill_name}_imported.md"
                payload = archive.read(name)
                await asyncio.to_thread(destination.write_bytes, payload)
                imported["skills"] += 1

            if "prompts.json" in names:
                new_prompts = json.loads(archive.read("prompts.json"))
                prompts_file = KODO_DIR / "prompts.json"
                existing_prompts = await _read_json_file(prompts_file, [])
                if not isinstance(existing_prompts, list):
                    existing_prompts = []
                existing_names = {str(item.get("name")) for item in existing_prompts if isinstance(item, dict)}

                if isinstance(new_prompts, list):
                    for prompt in new_prompts:
                        if not isinstance(prompt, dict):
                            continue
                        original_name = str(prompt.get("name") or "").strip()
                        if not original_name:
                            continue
                        if original_name in existing_names:
                            prompt["name"] = f"{original_name}_imported"
                        existing_prompts.append(prompt)
                    imported["prompts"] = len(new_prompts)
                    await _write_json_file(prompts_file, existing_prompts)

            if "cron.json" in names:
                new_jobs = json.loads(archive.read("cron.json"))
                cron_file = KODO_DIR / "cron.json"
                existing_jobs = await _read_json_file(cron_file, [])
                if not isinstance(existing_jobs, list):
                    existing_jobs = []
                existing_job_names = {str(item.get("name")) for item in existing_jobs if isinstance(item, dict)}

                if isinstance(new_jobs, list):
                    for job in new_jobs:
                        if not isinstance(job, dict):
                            continue
                        original_name = str(job.get("name") or "").strip()
                        if not original_name:
                            continue
                        if original_name in existing_job_names:
                            job["name"] = f"{original_name}_imported"
                        existing_jobs.append(job)
                    imported["cron_jobs"] = len(new_jobs)
                    await _write_json_file(cron_file, existing_jobs)

    except HTTPException:
        raise
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=422, detail="Invalid zip file.") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc

    log_audit_event("pack_imported", meta_name=meta_name, **imported)
    return {"imported": imported, "pack_name": meta_name}
