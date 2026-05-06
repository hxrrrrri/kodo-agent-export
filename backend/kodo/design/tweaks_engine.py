from __future__ import annotations

import re

from .types import TweakOperation


_STYLE_ID = "design-tweaks-style"


def _css_for_operation(operation: TweakOperation) -> str:
    name = operation.name.strip().lower()
    value = operation.value.strip()
    if not value:
        return ""
    if name in {"font-scale", "type-scale"}:
        return f":root{{--kodo-type-scale:{value};}} body{{font-size:calc(16px * var(--kodo-type-scale, 1));}}"
    if name in {"radius", "border-radius"}:
        return f":root{{--kodo-radius:{value};}} button,.card,.panel,[class*='card'],[class*='panel']{{border-radius:var(--kodo-radius) !important;}}"
    if name in {"accent", "accent-color", "primary"}:
        return f":root{{--color-primary:{value};--color-accent:{value};accent-color:{value};}} a,button,.text-primary{{--tw-text-opacity:1;color:var(--color-primary);}}"
    if name in {"section-spacing", "spacing"}:
        return f"section{{padding-top:{value} !important;padding-bottom:{value} !important;}}"
    if name in {"background", "bg"}:
        return f"body{{background:{value} !important;}}"
    safe_name = re.sub(r"[^a-z0-9_-]", "-", name)
    return f":root{{--kodo-{safe_name}:{value};}}"


def apply_tweaks(html: str, operations: list[TweakOperation]) -> str:
    css = "\n".join(filter(None, (_css_for_operation(operation) for operation in operations)))
    if not css:
        return html
    style = f'<style id="{_STYLE_ID}">\n/* User-approved visual tweaks; not tool UI. */\n{css}\n</style>'
    if re.search(rf"<style[^>]*id=[\"']{_STYLE_ID}[\"'][^>]*>[\s\S]*?</style>", html, re.IGNORECASE):
        return re.sub(rf"<style[^>]*id=[\"']{_STYLE_ID}[\"'][^>]*>[\s\S]*?</style>", style, html, flags=re.IGNORECASE)
    if re.search(r"</head>", html, re.IGNORECASE):
        return re.sub(r"</head>", style + "\n</head>", html, count=1, flags=re.IGNORECASE)
    return style + "\n" + html
