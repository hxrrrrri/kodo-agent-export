from __future__ import annotations

import json
import os
from pathlib import Path


DEFAULT_MODE = "full"
VALID_MODES = (
    "off",
    "lite",
    "full",
    "ultra",
    "wenyan-lite",
    "wenyan-full",
    "wenyan-ultra",
)

MODE_ALIASES = {
    "normal": "off",
    "normal-mode": "off",
    "stop": "off",
    "wenyan": "wenyan-full",
}


def normalize_mode(value: str | None) -> str | None:
    if value is None:
        return None

    key = str(value).strip().lower()
    if not key:
        return None

    key = MODE_ALIASES.get(key, key)
    if key in VALID_MODES:
        return key
    return None


def get_config_path() -> Path:
    xdg = os.getenv("XDG_CONFIG_HOME", "").strip()
    if xdg:
        return Path(xdg).expanduser() / "caveman" / "config.json"

    if os.name == "nt":
        appdata = os.getenv("APPDATA", "").strip()
        if appdata:
            return Path(appdata) / "caveman" / "config.json"
        return Path.home() / "AppData" / "Roaming" / "caveman" / "config.json"

    return Path.home() / ".config" / "caveman" / "config.json"


def get_default_mode() -> str:
    env_mode = normalize_mode(os.getenv("CAVEMAN_DEFAULT_MODE", ""))
    if env_mode is not None:
        return env_mode

    config_path = get_config_path()
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        return DEFAULT_MODE

    if not isinstance(payload, dict):
        return DEFAULT_MODE
    configured = normalize_mode(payload.get("defaultMode"))
    return configured or DEFAULT_MODE


def build_mode_prompt(mode: str) -> str:
    normalized = normalize_mode(mode)
    if normalized is None or normalized == "off":
        return ""

    style_by_mode = {
        "lite": "Concise professional sentences. Remove filler and hedging.",
        "full": "Classic caveman. Drop filler and most articles. Fragments are allowed.",
        "ultra": "Maximum compression. Use abbreviations when meaning stays exact.",
        "wenyan-lite": "Compressed classical style while preserving full technical meaning.",
        "wenyan-full": "Strong classical compression with strict technical fidelity.",
        "wenyan-ultra": "Extreme classical compression. Keep only essential content.",
    }
    mode_style = style_by_mode.get(normalized, style_by_mode["full"])

    return (
        f"Caveman mode active: {normalized}\n"
        "Rules:\n"
        "- Keep technical meaning exact; remove fluff, pleasantries, and hedging.\n"
        "- Keep code blocks, commands, and technical identifiers unchanged.\n"
        "- Use short, direct phrasing.\n"
        f"- Style target: {mode_style}\n"
        "- For irreversible or high-risk actions, provide a clear safety warning first."
    )


def build_help_card() -> str:
    return "\n".join(
        [
            "Caveman quick help",
            "",
            "Modes:",
            "- /caveman lite",
            "- /caveman full",
            "- /caveman ultra",
            "- /caveman wenyan-lite",
            "- /caveman wenyan",
            "- /caveman wenyan-ultra",
            "- /caveman off",
            "",
            "Skills:",
            "- /caveman-help",
            "- /caveman-commit",
            "- /caveman-review",
            "- /caveman:compress <path> [mode]",
            "",
            "Disable with: /caveman off",
        ]
    )


def build_commit_run_prompt(extra_context: str = "") -> str:
    context_block = f"\nContext: {extra_context.strip()}\n" if extra_context.strip() else "\n"
    return (
        "[Caveman Commit]\n"
        "Generate a terse Conventional Commit message.\n"
        "Rules:\n"
        "- Subject format: <type>(<scope>): <imperative summary>\n"
        "- Prefer <=50 chars subject, hard cap 72.\n"
        "- Body only when the why is not obvious.\n"
        "- No fluff, no AI attribution, no trailing period on subject."
        + context_block
    )


def build_review_run_prompt(extra_context: str = "") -> str:
    context_block = f"\nContext: {extra_context.strip()}\n" if extra_context.strip() else "\n"
    return (
        "[Caveman Review]\n"
        "Review current changes with one-line findings.\n"
        "Format: file:L<line>: <severity> <problem>. <fix>.\n"
        "Severity labels: bug, risk, nit, q.\n"
        "Skip praise and obvious restatements."
        + context_block
    )

