from __future__ import annotations

import re
from typing import Any

_TEMPLATE_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")


def _lookup_payload(payload: Any, dotted_path: str) -> Any:
    current: Any = payload
    for token in dotted_path.split('.'):
        if isinstance(current, dict):
            if token not in current:
                return None
            current = current[token]
            continue

        if isinstance(current, list) and token.isdigit():
            index = int(token)
            if index < 0 or index >= len(current):
                return None
            current = current[index]
            continue

        return None

    return current


def render_template(template: str, payload: dict[str, Any]) -> str:
    def _replace(match: re.Match[str]) -> str:
        key_path = match.group(1)
        value = _lookup_payload(payload, key_path)
        if value is None:
            return match.group(0)
        if isinstance(value, (dict, list)):
            return str(value)
        return str(value)

    return _TEMPLATE_PATTERN.sub(_replace, template)
