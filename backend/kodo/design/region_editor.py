from __future__ import annotations

import re


class RegionEditError(ValueError):
    pass


def _normalize_fragment(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def patch_region_html(
    html: str,
    replacement_html: str,
    *,
    selected_outer_html: str | None = None,
    start_marker: str | None = None,
    end_marker: str | None = None,
    selector: str | None = None,
) -> str:
    source = str(html or "")
    replacement = str(replacement_html or "").strip()
    if not source or not replacement:
        raise RegionEditError("HTML and replacement_html are required")

    if selected_outer_html:
        exact = str(selected_outer_html)
        if exact in source:
            return source.replace(exact, replacement, 1)
        normalized_target = _normalize_fragment(exact)
        for match in re.finditer(r"<([a-zA-Z][\w:-]*)(?:\s[^>]*)?>[\s\S]*?</\1>", source):
            if _normalize_fragment(match.group(0)) == normalized_target:
                return source[: match.start()] + replacement + source[match.end() :]

    if start_marker and end_marker:
        start = source.find(start_marker)
        end = source.find(end_marker, start + len(start_marker)) if start >= 0 else -1
        if start >= 0 and end >= 0:
            end += len(end_marker)
            return source[:start] + replacement + source[end:]

    if selector:
        selector = selector.strip()
        if selector.startswith("#"):
            ident = re.escape(selector[1:])
            pattern = re.compile(rf"<(?P<tag>[a-zA-Z][\w:-]*)(?=[^>]*\bid=[\"']{ident}[\"'])[^>]*>[\s\S]*?</(?P=tag)>", re.IGNORECASE)
        elif selector.startswith("."):
            klass = re.escape(selector[1:])
            pattern = re.compile(rf"<(?P<tag>[a-zA-Z][\w:-]*)(?=[^>]*\bclass=[\"'][^\"']*\b{klass}\b)[^>]*>[\s\S]*?</(?P=tag)>", re.IGNORECASE)
        else:
            tag = re.escape(selector.lower())
            pattern = re.compile(rf"<{tag}(?:\s[^>]*)?>[\s\S]*?</{tag}>", re.IGNORECASE)
        match = pattern.search(source)
        if match:
            return source[: match.start()] + replacement + source[match.end() :]

    raise RegionEditError("Could not locate selected region in HTML")
