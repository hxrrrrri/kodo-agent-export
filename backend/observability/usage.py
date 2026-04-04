import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from privacy import telemetry_disabled

KODO_DIR = Path.home() / ".kodo"
USAGE_DIR = KODO_DIR / "usage"
USAGE_FILE = USAGE_DIR / "events.jsonl"

DEFAULT_CLAUDE_INPUT_PER_M = float(os.getenv("COST_CLAUDE_INPUT_PER_M", "3.0"))
DEFAULT_CLAUDE_OUTPUT_PER_M = float(os.getenv("COST_CLAUDE_OUTPUT_PER_M", "15.0"))
DEFAULT_OPENAI_INPUT_PER_M = float(os.getenv("COST_OPENAI_INPUT_PER_M", "2.5"))
DEFAULT_OPENAI_OUTPUT_PER_M = float(os.getenv("COST_OPENAI_OUTPUT_PER_M", "10.0"))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(ts: str) -> datetime | None:
    try:
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def _provider_env_suffix(provider: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in provider.strip().upper())


def _resolve_rates(provider: str, model: str) -> tuple[float, float]:
    provider_l = (provider or "").strip().lower()
    model_l = (model or "").strip().lower()

    # Allow model aliases with prefixes like openai/gpt-4o.
    model_short = model_l.split("/", 1)[-1] if "/" in model_l else model_l

    input_rate = DEFAULT_OPENAI_INPUT_PER_M
    output_rate = DEFAULT_OPENAI_OUTPUT_PER_M

    if provider_l in {"anthropic"} or model_short.startswith("claude"):
        if "haiku" in model_short:
            input_rate, output_rate = 0.25, 1.25
        else:
            input_rate, output_rate = 3.00, 15.00
    elif provider_l in {"openai", "codex", "github-models"} or model_short.startswith(("gpt", "o1", "o3", "o4")):
        if "gpt-4o-mini" in model_short:
            input_rate, output_rate = 0.15, 0.60
        elif "o4-mini" in model_short:
            input_rate, output_rate = 1.10, 4.40
        else:
            input_rate, output_rate = 2.50, 10.00
    elif provider_l == "gemini" or model_short.startswith("gemini"):
        if "2.0-flash" in model_short:
            input_rate, output_rate = 0.10, 0.40
        else:
            input_rate, output_rate = 1.25, 10.00
    elif provider_l == "deepseek" or model_short.startswith("deepseek"):
        input_rate, output_rate = 0.07, 0.28
    elif provider_l == "groq":
        input_rate, output_rate = 0.04, 0.04
    elif provider_l in {"ollama", "atomic-chat", "atomic_chat"}:
        input_rate, output_rate = 0.0, 0.0

    # Backward compatible overrides.
    if provider_l == "anthropic":
        input_rate = float(os.getenv("COST_CLAUDE_INPUT_PER_M", str(input_rate)) or input_rate)
        output_rate = float(os.getenv("COST_CLAUDE_OUTPUT_PER_M", str(output_rate)) or output_rate)
    if provider_l == "openai":
        input_rate = float(os.getenv("COST_OPENAI_INPUT_PER_M", str(input_rate)) or input_rate)
        output_rate = float(os.getenv("COST_OPENAI_OUTPUT_PER_M", str(output_rate)) or output_rate)

    suffix = _provider_env_suffix(provider_l or "default")
    input_rate = float(os.getenv(f"COST_INPUT_PER_M_{suffix}", str(input_rate)) or input_rate)
    output_rate = float(os.getenv(f"COST_OUTPUT_PER_M_{suffix}", str(output_rate)) or output_rate)
    return input_rate, output_rate


def estimate_cost_usd(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    input_rate, output_rate = _resolve_rates(provider, model)
    base_cost = (input_tokens / 1_000_000) * input_rate + (output_tokens / 1_000_000) * output_rate
    return base_cost


def estimate_cache_cost_usd(provider: str, model: str, input_cache_read_tokens: int, input_cache_write_tokens: int) -> float:
    provider_l = (provider or "").strip().lower()
    model_l = (model or "").strip().lower()
    model_short = model_l.split("/", 1)[-1] if "/" in model_l else model_l

    if provider_l != "anthropic" and not model_short.startswith("claude"):
        return 0.0

    read_rate = float(os.getenv("COST_CLAUDE_CACHE_READ_PER_M", "0.30") or 0.30)
    write_rate = float(os.getenv("COST_CLAUDE_CACHE_WRITE_PER_M", "3.75") or 3.75)
    return (input_cache_read_tokens / 1_000_000) * read_rate + (input_cache_write_tokens / 1_000_000) * write_rate


def record_usage_event(
    *,
    session_id: str | None,
    model: str,
    input_tokens: int,
    output_tokens: int,
    provider: str,
    input_cache_read_tokens: int = 0,
    input_cache_write_tokens: int = 0,
) -> dict[str, Any]:
    event = {
        "ts": _utc_now().isoformat(),
        "session_id": str(session_id or ""),
        "provider": provider,
        "model": model,
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
        "input_cache_read_tokens": int(input_cache_read_tokens),
        "input_cache_write_tokens": int(input_cache_write_tokens),
    }
    base_cost = estimate_cost_usd(provider, model, event["input_tokens"], event["output_tokens"])
    cache_cost = estimate_cache_cost_usd(
        provider,
        model,
        event["input_cache_read_tokens"],
        event["input_cache_write_tokens"],
    )
    event["cost_usd_estimated"] = round(base_cost + cache_cost, 8)
    event["estimated_cost_usd"] = event["cost_usd_estimated"]

    if telemetry_disabled():
        return event

    USAGE_DIR.mkdir(parents=True, exist_ok=True)

    with USAGE_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=True) + "\n")

    return event


def _iter_events() -> list[dict[str, Any]]:
    if telemetry_disabled():
        return []

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
    if telemetry_disabled():
        return {
            "window_days": max(1, min(days, 365)),
            "events_count": 0,
            "totals": {
                "input_tokens": 0,
                "output_tokens": 0,
                "input_cache_read_tokens": 0,
                "input_cache_write_tokens": 0,
                "cost_usd_total": 0.0,
                "estimated_cost_usd": 0.0,
            },
            "by_model": {},
            "events": [],
        }

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
    total_cache_read = 0
    total_cache_write = 0
    total_cost = 0.0
    by_model: dict[str, dict[str, float | int]] = {}

    for e in events:
        model = str(e.get("model", "unknown"))
        inp = int(e.get("input_tokens", 0) or 0)
        outp = int(e.get("output_tokens", 0) or 0)
        cache_read = int(e.get("input_cache_read_tokens", 0) or 0)
        cache_write = int(e.get("input_cache_write_tokens", 0) or 0)
        cost = float(e.get("cost_usd_estimated", e.get("estimated_cost_usd", 0.0)) or 0.0)

        total_input += inp
        total_output += outp
        total_cache_read += cache_read
        total_cache_write += cache_write
        total_cost += cost

        row = by_model.setdefault(
            model,
            {
                "input_tokens": 0,
                "output_tokens": 0,
                "input_cache_read_tokens": 0,
                "input_cache_write_tokens": 0,
                "cost_usd_total": 0.0,
            },
        )
        row["input_tokens"] = int(row["input_tokens"]) + inp
        row["output_tokens"] = int(row["output_tokens"]) + outp
        row["input_cache_read_tokens"] = int(row["input_cache_read_tokens"]) + cache_read
        row["input_cache_write_tokens"] = int(row["input_cache_write_tokens"]) + cache_write
        row["cost_usd_total"] = round(float(row["cost_usd_total"]) + cost, 8)

    return {
        "window_days": window_days,
        "events_count": len(events),
        "totals": {
            "input_tokens": total_input,
            "output_tokens": total_output,
            "input_cache_read_tokens": total_cache_read,
            "input_cache_write_tokens": total_cache_write,
            "cost_usd_total": round(total_cost, 8),
            "estimated_cost_usd": round(total_cost, 8),
        },
        "by_model": {
            model: {
                **row,
                "estimated_cost_usd": row.get("cost_usd_total", 0.0),
            }
            for model, row in by_model.items()
        },
        "events": events[: max(1, min(limit, 500))],
    }
