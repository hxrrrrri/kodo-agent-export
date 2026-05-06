from __future__ import annotations

import re
from html.parser import HTMLParser
from itertools import count

from .types import AuditIssue, AuditResponse


_ISSUE_IDS = count(1)


class _AuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, dict[str, str]]] = []
        self.headings: list[int] = []
        self.has_main = False
        self.has_viewport = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key.lower(): value or "" for key, value in attrs}
        tag_l = tag.lower()
        self.tags.append((tag_l, attr_map))
        if tag_l == "main":
            self.has_main = True
        if tag_l == "meta" and attr_map.get("name", "").lower() == "viewport":
            self.has_viewport = True
        if re.fullmatch(r"h[1-6]", tag_l):
            self.headings.append(int(tag_l[1]))


def _issue(severity: str, category: str, message: str, selector: str | None = None, fix_hint: str | None = None) -> AuditIssue:
    return AuditIssue(
        id=f"a11y-{next(_ISSUE_IDS)}",
        severity=severity,  # type: ignore[arg-type]
        category=category,
        message=message,
        selector=selector,
        fix_hint=fix_hint,
    )


def _selector(tag: str, attrs: dict[str, str]) -> str:
    if attrs.get("id"):
        return f"{tag}#{attrs['id']}"
    if attrs.get("class"):
        first = attrs["class"].split()[0]
        if first:
            return f"{tag}.{first}"
    return tag


def _relative_luminance(hex_color: str) -> float:
    raw = hex_color.lstrip("#")
    if len(raw) != 6:
        return 0.5
    channels = [int(raw[i : i + 2], 16) / 255 for i in (0, 2, 4)]

    def linear(channel: float) -> float:
        return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4

    r, g, b = [linear(channel) for channel in channels]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(a: str, b: str) -> float:
    hi, lo = sorted((_relative_luminance(a), _relative_luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _audit_contrast(html: str) -> list[AuditIssue]:
    issues: list[AuditIssue] = []
    var_map = dict(re.findall(r"(--[a-zA-Z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{6})", html))
    pairs = [
        ("--color-text", "--color-background"),
        ("--text", "--background"),
        ("--foreground", "--background"),
        ("--color-muted", "--color-background"),
    ]
    for fg_name, bg_name in pairs:
        fg = var_map.get(fg_name)
        bg = var_map.get(bg_name)
        if fg and bg and _contrast(fg, bg) < 4.5:
            issues.append(
                _issue(
                    "error",
                    "contrast",
                    f"{fg_name} on {bg_name} is below WCAG AA contrast.",
                    fix_hint="Increase foreground contrast or darken/lighten the background token.",
                )
            )
    return issues


def audit_accessibility(html: str) -> AuditResponse:
    parser = _AuditParser()
    parser.feed(html)
    issues: list[AuditIssue] = []

    if not parser.has_viewport:
        issues.append(_issue("error", "responsive", "Missing viewport meta tag.", "head", "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">."))
    if not parser.has_main:
        issues.append(_issue("warning", "semantics", "No <main> landmark found.", "body", "Wrap primary page content in <main>."))

    image_index = 0
    for tag, attrs in parser.tags:
        selector = _selector(tag, attrs)
        if tag == "img":
            image_index += 1
            if not attrs.get("alt", "").strip():
                issues.append(_issue("error", "alt-text", "Image is missing alt text.", selector, "Add concise alt text or alt=\"\" for decorative images."))
        if tag in {"button", "a"}:
            aria = attrs.get("aria-label", "").strip()
            title = attrs.get("title", "").strip()
            if tag == "a" and not attrs.get("href"):
                issues.append(_issue("warning", "semantics", "Anchor without href cannot be reached like a normal link.", selector, "Use a button for actions or provide href."))
            if attrs.get("role") == "button" and tag != "button":
                issues.append(_issue("info", "semantics", "Custom button role should handle keyboard activation.", selector, "Prefer <button> or add Enter/Space keyboard handling."))
            if not aria and not title and re.search(r">\s*(?:<svg|<i|<span[^>]*>\s*</span>)", html, re.IGNORECASE):
                issues.append(_issue("warning", "labels", "Interactive icon control may lack an accessible label.", selector, "Add aria-label or visible text."))
        style = attrs.get("style", "")
        width_match = re.search(r"width\s*:\s*(\d+)px", style)
        height_match = re.search(r"height\s*:\s*(\d+)px", style)
        if tag in {"button", "a", "input", "select"} and width_match and height_match:
            if int(width_match.group(1)) < 44 or int(height_match.group(1)) < 44:
                issues.append(_issue("warning", "touch-target", "Touch target is smaller than 44x44px.", selector, "Increase hit area with padding or min-width/min-height."))

    last = 0
    for level in parser.headings:
        if last and level > last + 1:
            issues.append(_issue("warning", "headings", f"Heading jumps from h{last} to h{level}.", fix_hint="Use sequential heading levels for screen reader navigation."))
        last = level

    issues.extend(_audit_contrast(html))
    errors = sum(1 for issue in issues if issue.severity == "error")
    warnings = sum(1 for issue in issues if issue.severity == "warning")
    score = max(0, 100 - errors * 14 - warnings * 6 - (len(issues) - errors - warnings) * 2)
    summary = "No accessibility issues detected by static checks." if not issues else f"{len(issues)} accessibility issue(s): {errors} error(s), {warnings} warning(s)."
    return AuditResponse(score=score, issue_count=len(issues), issues=issues, summary=summary)
