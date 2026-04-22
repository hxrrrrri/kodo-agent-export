from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

import aiofiles

from memory.manager import GLOBAL_MEMORY_FILE, KODO_DIR, memory_manager
from privacy import feature_enabled
from providers.atomic_chat_provider import check_atomic_chat_running
from providers.ollama_provider import check_ollama_running
from tools.path_guard import get_allowed_roots, get_blocked_roots

REPORTS_DIR = KODO_DIR / "reports"
DOCTOR_REPORT_FILE = REPORTS_DIR / "doctor.json"

OPENAI_PREFIXES = ("gpt-", "o1", "o3", "o4")
ANTHROPIC_PREFIXES = ("claude",)


@dataclass
class CheckResult:
    name: str
    passed: bool
    message: str
    fix: str | None = None


def _pass(name: str, message: str) -> CheckResult:
    return CheckResult(name=name, passed=True, message=message)


def _fail(name: str, message: str, fix: str | None = None) -> CheckResult:
    return CheckResult(name=name, passed=False, message=message, fix=fix)


def _env_set(name: str) -> bool:
    return bool(os.getenv(name, "").strip())


def _has_provider_key() -> bool:
    keys = [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "DEEPSEEK_API_KEY",
        "GROQ_API_KEY",
        "OPENROUTER_API_KEY",
        "GITHUB_MODELS_TOKEN",
        "CODEX_API_KEY",
    ]
    return any(_env_set(key) for key in keys)


def _model_provider_compat() -> CheckResult:
    model = os.getenv("MODEL", "").strip().lower()
    if not model:
        return _pass("model_compat", "MODEL is not set; runtime defaults will be used.")

    router_mode = os.getenv("ROUTER_MODE", "fixed").strip().lower()
    if router_mode == "smart":
        return _pass("model_compat", "Smart router mode enabled; model compatibility is handled per provider.")

    if model.startswith(ANTHROPIC_PREFIXES) and not _env_set("ANTHROPIC_API_KEY"):
        return _fail(
            "model_compat",
            f"MODEL={model} looks like Anthropic but ANTHROPIC_API_KEY is missing.",
            "Set ANTHROPIC_API_KEY or switch MODEL to an OpenAI-compatible model.",
        )

    if model.startswith(OPENAI_PREFIXES) and not _env_set("OPENAI_API_KEY"):
        return _fail(
            "model_compat",
            f"MODEL={model} looks like OpenAI but OPENAI_API_KEY is missing.",
            "Set OPENAI_API_KEY or switch MODEL to a Claude model.",
        )

    return _pass("model_compat", f"MODEL={model} is compatible with configured provider keys.")


async def _check_memory_readable() -> CheckResult:
    try:
        _ = await memory_manager.load_memory(None)
        if not GLOBAL_MEMORY_FILE.exists():
            return _fail("memory_readable", "Global memory file is missing.", "Create ~/.kodo/MEMORY.md")
        return _pass("memory_readable", f"Memory is readable from {GLOBAL_MEMORY_FILE}")
    except Exception as exc:
        return _fail("memory_readable", f"Failed to read memory files: {exc}", "Check filesystem permissions for ~/.kodo")


async def _check_audit_writable() -> CheckResult:
    try:
        audit_dir = KODO_DIR / "audit"
        audit_dir.mkdir(parents=True, exist_ok=True)
        probe = audit_dir / ".doctor-write-test.tmp"
        async with aiofiles.open(probe, "w", encoding="utf-8") as f:
            await f.write("ok")
        probe.unlink(missing_ok=True)
        return _pass("audit_writable", f"Audit directory is writable: {audit_dir}")
    except Exception as exc:
        return _fail("audit_writable", f"Audit directory is not writable: {exc}", "Ensure ~/.kodo/audit is writable")


async def run_runtime_checks() -> list[CheckResult]:
    if not feature_enabled("DOCTOR"):
        return [_pass("doctor_disabled", "Runtime doctor feature is disabled by KODO_ENABLE_DOCTOR=0")]

    checks: list[CheckResult] = []

    if _has_provider_key():
        checks.append(_pass("provider_keys", "At least one provider API key is configured."))
    else:
        checks.append(
            _fail(
                "provider_keys",
                "No provider API key is configured.",
                "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.",
            )
        )

    checks.append(_model_provider_compat())

    if os.getenv("OLLAMA_BASE_URL", "").strip():
        ollama_ok = await check_ollama_running()
        checks.append(
            _pass("ollama_reachable", "Ollama endpoint is reachable.")
            if ollama_ok
            else _fail("ollama_reachable", "Ollama endpoint is not reachable.", "Start Ollama or fix OLLAMA_BASE_URL.")
        )

    if os.getenv("ATOMIC_CHAT_BASE_URL", "").strip():
        atomic_ok = await check_atomic_chat_running()
        checks.append(
            _pass("atomic_chat_reachable", "Atomic Chat endpoint is reachable.")
            if atomic_ok
            else _fail("atomic_chat_reachable", "Atomic Chat endpoint is not reachable.", "Start Atomic Chat or fix ATOMIC_CHAT_BASE_URL.")
        )

    max_tokens_raw = os.getenv("MAX_TOKENS", "8192").strip()
    try:
        max_tokens = int(max_tokens_raw)
        if 1024 <= max_tokens <= 128000:
            checks.append(_pass("max_tokens", f"MAX_TOKENS={max_tokens} is in a sane range."))
        else:
            checks.append(
                _fail(
                    "max_tokens",
                    f"MAX_TOKENS={max_tokens} is outside recommended range.",
                    "Set MAX_TOKENS between 1024 and 128000.",
                )
            )
    except ValueError:
        checks.append(_fail("max_tokens", f"MAX_TOKENS is invalid: {max_tokens_raw}", "Set MAX_TOKENS to an integer."))

    permission_mode = os.getenv("PERMISSION_MODE", "ask").strip().lower()
    if permission_mode in {"ask", "auto", "yolo"}:
        checks.append(_pass("permission_mode", f"PERMISSION_MODE={permission_mode} is valid."))
    else:
        checks.append(_fail("permission_mode", f"Invalid PERMISSION_MODE={permission_mode}", "Use ask, auto, or yolo."))

    blocked_roots = get_blocked_roots()
    allowed_roots = get_allowed_roots()
    if not blocked_roots:
        checks.append(_fail("path_guard", "No blocked roots configured.", "Review path guard safety settings."))
    else:
        checks.append(_pass("path_guard", f"Path guard has {len(blocked_roots)} blocked roots and {len(allowed_roots)} allowed roots."))

    checks.append(await _check_memory_readable())
    checks.append(await _check_audit_writable())

    return checks


async def run_report() -> dict[str, Any]:
    checks = await run_runtime_checks()
    passed = sum(1 for check in checks if check.passed)
    failed = len(checks) - passed

    payload: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z",
        "summary": {
            "total": len(checks),
            "passed": passed,
            "failed": failed,
            "all_passed": failed == 0,
        },
        "checks": [asdict(check) for check in checks],
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = DOCTOR_REPORT_FILE.with_suffix(".json.tmp")
    async with aiofiles.open(tmp_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(payload, ensure_ascii=True, indent=2))
    tmp_path.replace(DOCTOR_REPORT_FILE)

    payload["report_path"] = str(DOCTOR_REPORT_FILE)
    return payload
