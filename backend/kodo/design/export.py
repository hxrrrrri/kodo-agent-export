from __future__ import annotations

import io
import json
import re
import zipfile
from html.parser import HTMLParser
from typing import Any

from .accessibility_auditor import _issue
from .types import CodeHealthResponse, ExportResponse


class _ValidationParser(HTMLParser):
    def error(self, message: str) -> None:  # pragma: no cover - HTMLParser keeps for API compatibility
        raise ValueError(message)


def _strip_tag_by_attribute(html: str, attr_pattern: str) -> tuple[str, int]:
    count = 0
    pattern = re.compile(
        rf"<(?P<tag>[a-zA-Z][\w:-]*)(?=[^>]*{attr_pattern})[^>]*>[\s\S]*?</(?P=tag)>|<(?P<self>[a-zA-Z][\w:-]*)(?=[^>]*{attr_pattern})[^>]*/?>",
        re.IGNORECASE,
    )

    def repl(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return ""

    return pattern.sub(repl, html), count


def clean_export_html(html: str) -> tuple[str, int]:
    cleaned = str(html or "")
    removed_total = 0
    cleaned, removed = _strip_tag_by_attribute(cleaned, r"\bid=[\"'](?:kodo-bridge|__veh|__veo)[\"']")
    removed_total += removed
    cleaned, removed = _strip_tag_by_attribute(cleaned, r"\bdata-kodo-tool=[\"']true[\"']")
    removed_total += removed
    cleaned, removed = _strip_tag_by_attribute(cleaned, r"\bdata-kodo-overlay=[\"']true[\"']")
    removed_total += removed
    cleaned = re.sub(r"<!--\s*kodo-[\s\S]*?-->", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<script[^>]*>\s*window\.parent\.postMessage\(\{type:[\"']KODO_[\s\S]*?</script>", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip(), removed_total


def validate_html(html: str) -> bool:
    if not re.search(r"<!doctype\s+html|<html[\s>]", html, re.IGNORECASE):
        return False
    parser = _ValidationParser()
    try:
        parser.feed(html)
        parser.close()
        return True
    except Exception:
        return False


def scan_code_health(html: str) -> CodeHealthResponse:
    issues = []
    if not re.search(r"<meta[^>]+name=[\"']viewport[\"']", html, re.IGNORECASE):
        issues.append(_issue("error", "meta", "Missing viewport meta tag.", "head", "Add a responsive viewport meta tag."))
    if not re.search(r"<main[\s>]", html, re.IGNORECASE):
        issues.append(_issue("warning", "semantics", "No <main> semantic landmark found.", "body", "Wrap primary content in <main>."))
    if len(re.findall(r"\sstyle=[\"']", html, re.IGNORECASE)) > 18:
        issues.append(_issue("warning", "css", "Heavy inline style usage can make handoff and responsive fixes harder.", fix_hint="Move repeated declarations into CSS classes."))
    if re.search(r"\son[a-z]+\s*=", html, re.IGNORECASE):
        issues.append(_issue("warning", "javascript", "Inline event handlers found.", fix_hint="Prefer addEventListener in the script block."))
    if re.search(r"<font[\s>]|<center[\s>]|<marquee[\s>]", html, re.IGNORECASE):
        issues.append(_issue("error", "deprecated", "Deprecated HTML element found.", fix_hint="Replace deprecated tags with semantic HTML and CSS."))
    if "console.log(" in html:
        issues.append(_issue("info", "javascript", "console.log remains in exported JavaScript.", fix_hint="Remove debug logging before export."))
    if re.search(r"id=[\"'](?:kodo-bridge|__veh|__veo)[\"']|data-kodo-tool=[\"']true", html, re.IGNORECASE):
        issues.append(_issue("error", "contamination", "Kodo tool scaffolding is still present.", fix_hint="Run clean export before delivery."))

    errors = sum(1 for issue in issues if issue.severity == "error")
    warnings = sum(1 for issue in issues if issue.severity == "warning")
    score = max(0, 100 - errors * 18 - warnings * 8 - (len(issues) - errors - warnings) * 2)
    return CodeHealthResponse(score=score, issues=issues)


def build_figma_json(html: str) -> dict[str, Any]:
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else "Kodo Design Export"
    colors = sorted(set(re.findall(r"#[0-9a-fA-F]{6}", html)))[:24]
    sections = re.findall(r"<!--\s*SECTION:\s*([a-zA-Z0-9 _/-]+)\s*-->", html, re.IGNORECASE)
    return {
        "name": title,
        "type": "DOCUMENT",
        "kodoExport": True,
        "tokens": {"colors": colors},
        "children": [
            {
                "type": "FRAME",
                "name": section.strip().title(),
                "layoutMode": "VERTICAL",
                "fills": [],
                "metadata": {"source": "html-section-comment"},
            }
            for section in sections
        ],
        "rawHtml": html,
    }


def build_handoff(html: str) -> dict[str, Any]:
    colors = sorted(set(re.findall(r"#[0-9a-fA-F]{6}", html)))[:32]
    css_vars = dict(re.findall(r"(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)", html))
    sections = [section.strip() for section in re.findall(r"<!--\s*SECTION:\s*([a-zA-Z0-9 _/-]+)\s*-->", html, re.IGNORECASE)]
    return {
        "component_boundaries": sections,
        "design_tokens": {"colors": colors, "cssVariables": css_vars},
        "notes": [
            "Export generated by Kodo Design clean export.",
            "Overlay panels and canvas annotations are intentionally excluded.",
        ],
    }


def export_clean_html(html: str, format_name: str = "html") -> ExportResponse:
    clean, removed = clean_export_html(html)
    health = scan_code_health(clean)
    valid = validate_html(clean)
    return ExportResponse(
        format=format_name,
        html=clean if format_name == "html" else None,
        figma_json=build_figma_json(clean) if format_name == "figma" else None,
        handoff=build_handoff(clean) if format_name == "handoff" else None,
        code_health=health,
        removed_tool_nodes=removed,
        valid_html=valid,
    )


def build_zip_bytes(html: str, filename: str = "index.html") -> bytes:
    clean, _ = clean_export_html(html)
    manifest = {
        "generator": "kodo-design",
        "files": [filename],
        "codeHealth": scan_code_health(clean).model_dump(),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(filename or "index.html", clean)
        archive.writestr("kodo-export-manifest.json", json.dumps(manifest, indent=2))
    return buf.getvalue()
