import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

KODO_DIR = Path.home() / ".kodo"
USAGE_DIR = KODO_DIR / "usage"
USAGE_FILE = USAGE_DIR / "events.jsonl"

DEFAULT_CLAUDE_INPUT_PER_M = float(os.getenv("COST_CLAUDE_INPUT_PER_M", "3.0"))
DEFAULT_CLAUDE_OUTPUT_PER_M = float(os.getenv("COST_CLAUDE_OUTPUT_PER_M", "15.0"))
DEFAULT_OPENAI_INPUT_PER_M = float(os.getenv("COST_OPENAI_INPUT_PER_M", "5.0"))
DEFAULT_OPENAI_OUTPUT_PER_M = float(os.getenv("COST_OPENAI_OUTPUT_PER_M", "15.0"))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(ts: str) -> datetime | None:
    try:
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def _resolve_rates(model: str) -> tuple[float, float]:
    lowered = (model or "").lower()
    if lowered.startswith("claude"):
        return DEFAULT_CLAUDE_INPUT_PER_M, DEFAULT_CLAUDE_OUTPUT_PER_M
    return DEFAULT_OPENAI_INPUT_PER_M, DEFAULT_OPENAI_OUTPUT_PER_M


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    input_rate, output_rate = _resolve_rates(model)
    return (input_tokens / 1_000_000) * input_rate + (output_tokens / 1_000_000) * output_rate


def record_usage_event(
    *,
    session_id: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    provider: str,
) -> dict[str, Any]:
    USAGE_DIR.mkdir(parents=True, exist_ok=True)
    event = {
        "ts": _utc_now().isoformat(),
        "session_id": session_id,
        "provider": provider,
        "model": model,
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
    }
    event["estimated_cost_usd"] = round(
        estimate_cost_usd(model, event["input_tokens"], event["output_tokens"]),
        8,
    )

    with USAGE_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=True) + "\n")

    return event


def _iter_events() -> list[dict[str, Any]]:
    if not USAGE_FILE.exists():
        return []

    items: list[dict[str, Any]] = []
    with USAGE_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                continue
            items.append(raw)
    return items


def summarize_usage(days: int = 7, limit: int = 200) -> dict[str, Any]:
    window_days = max(1, min(days, 365))
    cutoff = _utc_now() - timedelta(days=window_days)

    events = []
    for item in _iter_events():
        ts = _parse_ts(str(item.get("ts", "")))
        if ts is None or ts < cutoff:
            continue
        events.append(item)

    events.sort(key=lambda e: e.get("ts", ""), reverse=True)

    total_input = 0
    total_output = 0
    total_cost = 0.0
    by_model: dict[str, dict[str, float | int]] = {}

    for e in events:
        model = str(e.get("model", "unknown"))
        inp = int(e.get("input_tokens", 0) or 0)
        outp = int(e.get("output_tokens", 0) or 0)
        cost = float(e.get("estimated_cost_usd", 0.0) or 0.0)

        total_input += inp
        total_output += outp
        total_cost += cost

        row = by_model.setdefault(model, {"input_tokens": 0, "output_tokens": 0, "estimated_cost_usd": 0.0})
        row["input_tokens"] = int(row["input_tokens"]) + inp
        row["output_tokens"] = int(row["output_tokens"]) + outp
        row["estimated_cost_usd"] = round(float(row["estimated_cost_usd"]) + cost, 8)

    return {
        "window_days": window_days,
        "events_count": len(events),
        "totals": {
            "input_tokens": total_input,
            "output_tokens": total_output,
            "estimated_cost_usd": round(total_cost, 8),
        },
        "by_model": by_model,
        "events": events[: max(1, min(limit, 500))],
    }
