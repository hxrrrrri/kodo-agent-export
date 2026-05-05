"""Persistent per-skill enable / auto-inject preferences."""
from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_SETTINGS_PATH = Path.home() / ".kodo" / "skill_settings.json"

# Skills auto-injected into every system prompt by default.
# Users can change this through the Skills Library panel.
_DEFAULT_AUTO_INJECT: frozenset[str] = frozenset({"smart-planner"})


def _load() -> dict[str, dict[str, bool]]:
    try:
        if _SETTINGS_PATH.exists():
            raw = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return raw
    except Exception as exc:
        logger.warning("skill_settings: load failed: %s", exc)
    return {}


def _save(data: dict[str, dict[str, bool]]) -> None:
    try:
        _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SETTINGS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("skill_settings: save failed: %s", exc)


def get_skill_setting(name: str) -> dict[str, bool]:
    """Return resolved enabled/auto_inject flags for one skill."""
    data = _load()
    row = data.get(name, {})
    return {
        "enabled": bool(row.get("enabled", True)),
        "auto_inject": bool(row.get("auto_inject", name in _DEFAULT_AUTO_INJECT)),
    }


def set_skill_setting(
    name: str,
    *,
    enabled: bool | None = None,
    auto_inject: bool | None = None,
) -> None:
    data = _load()
    if name not in data:
        data[name] = {}
    if enabled is not None:
        data[name]["enabled"] = enabled
    if auto_inject is not None:
        data[name]["auto_inject"] = auto_inject
    _save(data)


def list_auto_inject_skill_names() -> list[str]:
    """Return names of every skill that is enabled AND auto_inject=True."""
    from skills.registry import skill_registry  # lazy to avoid circular

    data = _load()
    result: list[str] = []
    for skill in skill_registry.list_skills():
        name = skill["name"]
        row = data.get(name, {})
        enabled = bool(row.get("enabled", True))
        auto_inject = bool(row.get("auto_inject", name in _DEFAULT_AUTO_INJECT))
        if enabled and auto_inject:
            result.append(name)
    return result
