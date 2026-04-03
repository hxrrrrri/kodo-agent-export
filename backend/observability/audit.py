import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from privacy import telemetry_disabled
from observability.request_context import get_request_id

KODO_DIR = Path.home() / ".kodo"
AUDIT_DIR = KODO_DIR / "audit"
AUDIT_FILE = AUDIT_DIR / "events.jsonl"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_audit_event(event_type: str, **fields: Any) -> None:
    if telemetry_disabled():
        return

    try:
        AUDIT_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "ts": _utc_now(),
            "event": event_type,
            "request_id": get_request_id(),
            **fields,
        }
        with AUDIT_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=True) + "\n")
    except Exception:
        # Never crash request handling because audit persistence failed.
        return
