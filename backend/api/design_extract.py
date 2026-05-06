from __future__ import annotations

import asyncio
import base64
import hashlib
import html as html_lib
import ipaddress
import json
import os
import re
from collections import Counter
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter(prefix="/api/design", tags=["design"])

MAX_HTML_CHARS = 80_000
MAX_CSS_CHARS = 140_000
MAX_LINKED_CSS_FILES = 8
MAX_BROWSER_COLOR_SAMPLES = 900
MAX_BROWSER_COMPONENT_SAMPLES = 90


class ExtractThemeRequest(BaseModel):
    url: str


def _normalize_url(raw_url: str) -> str:
    url = raw_url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid URL")
    host = (parsed.hostname or "").strip().lower()
    if host in {"localhost", "0.0.0.0"} or host.endswith(".local") or host.endswith(".localhost"):
        raise HTTPException(status_code=400, detail="Local URLs are not allowed")
    try:
        address = ipaddress.ip_address(host.strip("[]"))
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
            raise HTTPException(status_code=400, detail="Private IP addresses are not allowed")
    except ValueError:
        pass
    return url


def _hex_from_rgb(match: re.Match[str]) -> str:
    parts = [int(float(match.group(i))) for i in range(1, 4)]
    return "#" + "".join(f"{max(0, min(255, part)):02x}" for part in parts)


def _css_color_to_hex(value: str) -> str | None:
    raw = (value or "").strip().lower()
    if not raw or raw in {"transparent", "currentcolor", "inherit", "initial", "none"}:
        return None
    if raw.startswith("#"):
        color = raw
        if len(color) == 4:
            color = "#" + "".join(ch * 2 for ch in color[1:])
        if len(color) == 9:
            alpha = int(color[7:9], 16)
            if alpha < 16:
                return None
            color = color[:7]
        return color if re.match(r"^#[0-9a-f]{6}$", color) else None
    match = re.match(
        r"rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)",
        raw,
    )
    if not match:
        return None
    alpha = float(match.group(4) or "1")
    if alpha < 0.08:
        return None
    parts = [int(float(match.group(i))) for i in range(1, 4)]
    return "#" + "".join(f"{max(0, min(255, part)):02x}" for part in parts)


def _extract_hex_colors(css_text: str) -> list[str]:
    colors: list[str] = []
    for raw in re.findall(r"#[0-9a-fA-F]{3,8}\b", css_text):
        value = raw.lower()
        if len(value) == 4:
            value = "#" + "".join(ch * 2 for ch in value[1:])
        if len(value) == 9:
            value = value[:7]
        if len(value) == 7:
            colors.append(value)

    rgb_pattern = re.compile(
        r"rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*[0-9.]+)?\s*\)",
        re.IGNORECASE,
    )
    colors.extend(_hex_from_rgb(match) for match in rgb_pattern.finditer(css_text))

    ignore = {"#ffffff00", "#00000000"}
    counts = Counter(color for color in colors if color not in ignore)
    return [color for color, _ in counts.most_common(24)]


def _luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return 0.5
    channels = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]

    def linear(channel: float) -> float:
        return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4

    r, g, b = [linear(channel) for channel in channels]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _pick_palette(colors: list[str]) -> list[str]:
    fallback = ["#ffffff", "#f8fafc", "#111827", "#64748b", "#2563eb"]
    if not colors:
        return fallback

    sorted_by_lum = sorted(colors, key=_luminance)
    dark = sorted_by_lum[0]
    light = sorted_by_lum[-1]
    bg = dark if _luminance(colors[0]) < 0.18 else light
    surface = sorted_by_lum[1] if bg == dark and len(sorted_by_lum) > 2 else (sorted_by_lum[-2] if len(sorted_by_lum) > 2 else fallback[1])
    text = light if bg == dark else dark
    muted = next((c for c in colors if c not in {bg, surface, text} and 0.18 < _luminance(c) < 0.72), fallback[3])
    accent = next((c for c in colors if c not in {bg, surface, text, muted} and abs(_luminance(c) - _luminance(bg)) > 0.18), colors[0])
    return [bg, surface, text, muted, accent]


def _color_role_from_property(prop: str) -> str:
    prop = prop.lower()
    if "background" in prop:
        return "background"
    if prop in {"color", "fill", "stroke"}:
        return "foreground"
    if "border" in prop:
        return "border"
    if "shadow" in prop:
        return "shadow"
    return "color"


def _clean_role(value: str) -> str:
    role = re.sub(r"[^a-z0-9_.-]+", "-", (value or "").lower()).strip("-")
    return role[:48] or "element"


_EMOJI_RE = re.compile(
    "["
    "\U0001f1e6-\U0001f1ff"
    "\U0001f300-\U0001f5ff"
    "\U0001f600-\U0001f64f"
    "\U0001f680-\U0001f6ff"
    "\U0001f700-\U0001f77f"
    "\U0001f780-\U0001f7ff"
    "\U0001f800-\U0001f8ff"
    "\U0001f900-\U0001f9ff"
    "\U0001fa70-\U0001faff"
    "\u2600-\u27bf"
    "]",
    flags=re.UNICODE,
)


def _strip_emoji(value: str) -> str:
    value = _EMOJI_RE.sub("", value or "")
    value = re.sub(r"\ufe0f", "", value)
    return re.sub(r"\s+", " ", value).strip()


def _top_values(values: list[str], limit: int = 8) -> list[str]:
    return [value for value, _ in Counter(v for v in values if v).most_common(limit)]


def _summarize_color_usage(audit: dict[str, object], static_colors: list[str]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    raw_rows = audit.get("colors") if isinstance(audit.get("colors"), list) else []
    by_color: dict[str, dict[str, object]] = {}
    for item in raw_rows:
        if not isinstance(item, dict):
            continue
        color = _css_color_to_hex(str(item.get("value") or ""))
        if not color:
            continue
        row = by_color.setdefault(color, {"value": color, "count": 0, "properties": [], "roles": [], "selectors": []})
        row["count"] = int(row["count"]) + 1
        row["properties"] = [*list(row["properties"]), str(item.get("property") or "")][:80]
        row["roles"] = [*list(row["roles"]), _clean_role(str(item.get("role") or ""))][:80]
        selector = str(item.get("selector") or "").strip()
        if selector:
            row["selectors"] = [*list(row["selectors"]), selector][:24]

    for color in static_colors:
        if color not in by_color:
            by_color[color] = {"value": color, "count": 1, "properties": ["stylesheet"], "roles": ["css"], "selectors": []}

    for row in by_color.values():
        properties = _top_values([str(v) for v in row.get("properties", [])], 4)
        roles = _top_values([str(v) for v in row.get("roles", [])], 5)
        selectors = _top_values([str(v) for v in row.get("selectors", [])], 3)
        rows.append(
            {
                "value": row["value"],
                "count": int(row.get("count") or 0),
                "properties": properties,
                "roles": roles,
                "selectors": selectors,
                "usage": ", ".join([*roles[:3], *properties[:2]]) or "stylesheet",
            }
        )
    rows.sort(key=lambda item: int(item.get("count") or 0), reverse=True)
    return rows[:36]


def _pick_palette_from_usage(color_usage: list[dict[str, object]], fallback_colors: list[str]) -> list[str]:
    if not color_usage:
        return _pick_palette(fallback_colors)

    def candidates(*needles: str) -> list[str]:
        result: list[str] = []
        for item in color_usage:
            hay = " ".join(
                [
                    str(item.get("usage") or ""),
                    " ".join(str(v) for v in item.get("roles", []) if v),
                    " ".join(str(v) for v in item.get("properties", []) if v),
                ]
            ).lower()
            if any(needle in hay for needle in needles):
                value = str(item.get("value") or "")
                if re.match(r"^#[0-9a-f]{6}$", value):
                    result.append(value)
        return result

    all_colors = [str(item.get("value")) for item in color_usage if re.match(r"^#[0-9a-f]{6}$", str(item.get("value")))]
    if not all_colors:
        return _pick_palette(fallback_colors)

    bg_pool = candidates("page", "body", "hero", "section", "background", "container")
    text_pool = candidates("heading", "body-text", "paragraph", "link", "foreground")
    surface_pool = candidates("card", "panel", "surface", "container", "nav", "input")
    accent_pool = candidates("button", "cta", "tab", "badge", "link", "icon", "accent")

    bg = next((c for c in bg_pool if _luminance(c) > 0.82 or _luminance(c) < 0.2), all_colors[0])
    text = next((c for c in text_pool if abs(_luminance(c) - _luminance(bg)) > 0.45), "#ffffff" if _luminance(bg) < 0.35 else "#111111")
    surface = next((c for c in surface_pool if c not in {bg, text}), None)
    if not surface:
        surface = next((c for c in all_colors if c not in {bg, text} and abs(_luminance(c) - _luminance(bg)) < 0.25), fallback_colors[1] if len(fallback_colors) > 1 else "#f8fafc")
    muted = next((c for c in text_pool if c not in {bg, surface, text} and 0.12 < abs(_luminance(c) - _luminance(bg)) < abs(_luminance(text) - _luminance(bg))), None)
    if not muted:
        muted = "#a3a3a3" if _luminance(bg) < 0.35 else "#64748b"
    accent = next((c for c in accent_pool if c not in {bg, surface, text, muted} and abs(_luminance(c) - _luminance(bg)) > 0.18), None)
    if not accent:
        accent = next((c for c in all_colors if c not in {bg, surface, text, muted} and 0.18 < _luminance(c) < 0.82), all_colors[0])
    return [bg, surface, text, muted, accent]


def _extract_fonts(css_text: str, html: str) -> list[str]:
    candidates: list[str] = []
    for match in re.finditer(r"font-family\s*:\s*([^;}{]+)", css_text, re.IGNORECASE):
        family = match.group(1).split(",")[0].strip().strip("\"'")
        if family and not family.startswith("var("):
            candidates.append(family)
    for match in re.finditer(r"font-family\s*:\s*['\"]?([^;'\"}]+)", html, re.IGNORECASE):
        family = match.group(1).split(",")[0].strip().strip("\"'")
        if family and not family.startswith("var("):
            candidates.append(family)
    counts = Counter(candidates)
    return [font for font, _ in counts.most_common(4)]


def _font_from_css_stack(value: str) -> str:
    family = (value or "").split(",")[0].strip().strip("\"'")
    return family or "Inter"


def _summarize_typography(audit: dict[str, object]) -> list[dict[str, object]]:
    raw_rows = audit.get("typography") if isinstance(audit.get("typography"), list) else []
    grouped: dict[tuple[str, str, str, str, str], dict[str, object]] = {}
    for item in raw_rows:
        if not isinstance(item, dict):
            continue
        key = (
            _clean_role(str(item.get("role") or "text")),
            str(item.get("fontFamily") or ""),
            str(item.get("fontSize") or ""),
            str(item.get("fontWeight") or ""),
            str(item.get("lineHeight") or ""),
        )
        row = grouped.setdefault(
            key,
            {
                "role": key[0],
                "fontFamily": key[1],
                "fontSize": key[2],
                "fontWeight": key[3],
                "lineHeight": key[4],
                "letterSpacing": str(item.get("letterSpacing") or "normal"),
                "textTransform": str(item.get("textTransform") or "none"),
                "count": 0,
                "samples": [],
            },
        )
        row["count"] = int(row["count"]) + 1
        text = re.sub(r"\s+", " ", str(item.get("text") or "")).strip()
        if text and len(row["samples"]) < 3:
            row["samples"] = [*list(row["samples"]), text[:72]]
    rows = list(grouped.values())
    rows.sort(key=lambda item: (int(item.get("count") or 0), _font_size_number(str(item.get("fontSize") or ""))), reverse=True)
    return rows[:18]


def _font_size_number(value: str) -> float:
    match = re.search(r"([0-9.]+)", value or "")
    return float(match.group(1)) if match else 0.0


def _summarize_components(audit: dict[str, object]) -> list[dict[str, object]]:
    raw_rows = audit.get("components") if isinstance(audit.get("components"), list) else []
    grouped: dict[str, dict[str, object]] = {}
    for item in raw_rows:
        if not isinstance(item, dict):
            continue
        role = _clean_role(str(item.get("role") or "component"))
        row = grouped.setdefault(
            role,
            {
                "role": role,
                "count": 0,
                "selectors": [],
                "samples": [],
                "backgrounds": [],
                "colors": [],
                "radii": [],
                "borders": [],
                "shadows": [],
                "padding": [],
                "sizes": [],
                "display": [],
                "gap": [],
            },
        )
        row["count"] = int(row["count"]) + 1
        for target, source in [
            ("selectors", "selector"),
            ("samples", "text"),
            ("backgrounds", "backgroundColor"),
            ("colors", "color"),
            ("radii", "borderRadius"),
            ("borders", "border"),
            ("shadows", "boxShadow"),
            ("padding", "padding"),
            ("display", "display"),
            ("gap", "gap"),
        ]:
            value = str(item.get(source) or "").strip()
            if value and value not in {"none", "normal"} and len(row[target]) < 24:
                row[target] = [*list(row[target]), value]
        width = item.get("width")
        height = item.get("height")
        if isinstance(width, (int, float)) and isinstance(height, (int, float)) and len(row["sizes"]) < 24:
            row["sizes"] = [*list(row["sizes"]), f"{int(width)}x{int(height)}"]

    rows: list[dict[str, object]] = []
    for row in grouped.values():
        compact = {"role": row["role"], "count": row["count"]}
        for key in ["selectors", "samples", "backgrounds", "colors", "radii", "borders", "shadows", "padding", "sizes", "display", "gap"]:
            compact[key] = _top_values([str(v) for v in row.get(key, [])], 4)
        rows.append(compact)
    preferred = {"primary-button": 0, "search-button": 1, "button": 2, "link-button": 3, "nav": 4, "hero": 5, "card": 6, "input": 7, "tab-category": 8, "badge": 9, "icon": 10}
    rows.sort(key=lambda item: (preferred.get(str(item.get("role")), 50), -int(item.get("count") or 0)))
    return rows[:22]


def _extract_css_variables(css_text: str) -> dict[str, str]:
    variables: dict[str, str] = {}
    for name, value in re.findall(r"(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)", css_text):
        clean = value.strip()
        if clean and len(variables) < 80:
            variables[name] = clean
    return variables


_BROWSER_AUDIT_SCRIPT = r"""
() => {
  const maxColorSamples = 900;
  const maxComponentSamples = 90;
  const colorProps = [
    'color',
    'backgroundColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'fill',
    'stroke',
    'boxShadow'
  ];
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.02 && rect.width > 1 && rect.height > 1;
  };
  const snippet = (el) => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const selector = (el) => {
    const id = el.id ? `#${String(el.id).slice(0, 36)}` : '';
    const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 3).map((c) => `.${c.slice(0, 32)}`).join('');
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const roleFor = (el) => {
    const tag = el.tagName.toLowerCase();
    const text = snippet(el).toLowerCase();
    const attrs = `${el.id || ''} ${el.className || ''} ${el.getAttribute('role') || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
    if (tag === 'body') return 'page';
    if (tag === 'nav' || attrs.includes('nav')) return 'nav';
    if (tag === 'header' || attrs.includes('hero')) return attrs.includes('hero') ? 'hero' : 'header';
    if (tag === 'footer') return 'footer';
    if (tag === 'button' || attrs.includes('button') || el.getAttribute('role') === 'button') {
      if (attrs.includes('search') || text.includes('search')) return 'search-button';
      if (attrs.includes('primary') || attrs.includes('cta') || text.includes('get started') || text.includes('start')) return 'primary-button';
      return 'button';
    }
    if (tag === 'a') return attrs.includes('button') ? 'link-button' : 'link';
    if (/h[1-6]/.test(tag)) return 'heading';
    if (tag === 'p' || tag === 'span' || tag === 'li') return 'body-text';
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || attrs.includes('input') || attrs.includes('field')) return 'input';
    if (attrs.includes('card') || attrs.includes('tile')) return 'card';
    if (attrs.includes('tab') || attrs.includes('category') || attrs.includes('chip')) return 'tab-category';
    if (attrs.includes('badge') || attrs.includes('pill')) return 'badge';
    if (tag === 'svg' || tag === 'path' || attrs.includes('icon')) return 'icon';
    if (tag === 'section') return 'section';
    if (tag === 'main') return 'main';
    if (tag === 'article') return 'article-card';
    return 'container';
  };
  const basicStyle = (el) => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      selector: selector(el),
      role: roleFor(el),
      text: snippet(el),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      borderRadius: cs.borderRadius,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      boxShadow: cs.boxShadow,
      padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
      display: cs.display,
      gap: cs.gap
    };
  };
  const all = Array.from(document.querySelectorAll('body, body *')).filter(visible);
  const prioritized = all
    .map((el, index) => ({ el, index, area: el.getBoundingClientRect().width * el.getBoundingClientRect().height, role: roleFor(el) }))
    .sort((a, b) => {
      const important = (x) => /button|card|nav|header|hero|heading|input|tab|badge|icon|footer|section|link/.test(x.role) ? 1 : 0;
      return important(b) - important(a) || b.area - a.area || a.index - b.index;
    })
    .slice(0, maxColorSamples)
    .map((row) => row.el);
  const colors = [];
  for (const el of prioritized) {
    const cs = getComputedStyle(el);
    for (const prop of colorProps) {
      const value = cs[prop];
      if (!value || value === 'none' || value === 'transparent') continue;
      colors.push({ value, property: prop, role: roleFor(el), selector: selector(el), text: snippet(el) });
    }
  }
  const typography = [];
  const textEls = all.filter((el) => snippet(el).length >= 2 && /^(h1|h2|h3|h4|h5|h6|p|a|button|span|li|label)$/i.test(el.tagName)).slice(0, 220);
  for (const el of textEls) {
    const base = basicStyle(el);
    typography.push({
      role: base.role,
      selector: base.selector,
      text: base.text,
      fontFamily: base.fontFamily,
      fontSize: base.fontSize,
      fontWeight: base.fontWeight,
      lineHeight: base.lineHeight,
      letterSpacing: base.letterSpacing,
      textTransform: base.textTransform,
      color: base.color
    });
  }
  const componentSelector = [
    'button',
    'a',
    'input',
    'select',
    'textarea',
    'nav',
    'header',
    'footer',
    'main',
    'section',
    'article',
    '[role="button"]',
    '[class*="card" i]',
    '[class*="tile" i]',
    '[class*="panel" i]',
    '[class*="badge" i]',
    '[class*="pill" i]',
    '[class*="tab" i]',
    '[class*="category" i]',
    '[class*="search" i]',
    '[class*="icon" i]',
    'svg',
    'img'
  ].join(',');
  const components = Array.from(document.querySelectorAll(componentSelector)).filter(visible).slice(0, maxComponentSamples).map(basicStyle);
  const sectionSelector = [
    'header',
    'nav',
    'main',
    'section',
    'article',
    'footer',
    '[class*="hero" i]',
    '[class*="feature" i]',
    '[class*="card" i]',
    '[class*="tile" i]',
    '[class*="panel" i]',
    '[class*="product" i]',
    '[class*="pricing" i]',
    '[class*="grid" i]'
  ].join(',');
  const visualSections = Array.from(document.querySelectorAll(sectionSelector))
    .filter(visible)
    .map((el, index) => {
      const base = basicStyle(el);
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const buttons = Array.from(el.querySelectorAll('button,a,[role="button"]')).filter(visible).slice(0, 6).map((child) => {
        const childStyle = basicStyle(child);
        return {
          text: childStyle.text,
          role: childStyle.role,
          fontFamily: childStyle.fontFamily,
          fontSize: childStyle.fontSize,
          fontWeight: childStyle.fontWeight,
          color: childStyle.color,
          backgroundColor: childStyle.backgroundColor,
          borderRadius: childStyle.borderRadius,
          border: childStyle.border,
          padding: childStyle.padding,
          width: childStyle.width,
          height: childStyle.height
        };
      });
      const headings = Array.from(el.querySelectorAll('h1,h2,h3,[class*="title" i],[class*="headline" i]')).filter(visible).slice(0, 4).map((child) => basicStyle(child));
      const media = Array.from(el.querySelectorAll('img,video,picture,canvas,svg')).filter(visible).slice(0, 4).map((child) => {
        const childStyle = basicStyle(child);
        return {
          selector: childStyle.selector,
          role: childStyle.role,
          src: child.currentSrc || child.src || child.getAttribute('src') || '',
          width: childStyle.width,
          height: childStyle.height,
          borderRadius: childStyle.borderRadius,
          objectFit: getComputedStyle(child).objectFit || ''
        };
      });
      return {
        index,
        selector: base.selector,
        role: base.role,
        tag: el.tagName.toLowerCase(),
        text: base.text.slice(0, 220),
        top: Math.round(rect.top + scrollY),
        left: Math.round(rect.left + scrollX),
        width: base.width,
        height: base.height,
        area: Math.round(rect.width * rect.height),
        fontFamily: base.fontFamily,
        fontSize: base.fontSize,
        fontWeight: base.fontWeight,
        lineHeight: base.lineHeight,
        color: base.color,
        backgroundColor: base.backgroundColor,
        backgroundImage: cs.backgroundImage,
        backgroundSize: cs.backgroundSize,
        backgroundPosition: cs.backgroundPosition,
        borderRadius: base.borderRadius,
        border: base.border,
        boxShadow: base.boxShadow,
        padding: base.padding,
        display: base.display,
        gap: base.gap,
        headings,
        buttons,
        media
      };
    })
    .filter((row) => row.area > 24000 || row.role === 'nav' || row.role === 'header' || row.role === 'footer')
    .sort((a, b) => a.top - b.top || b.area - a.area)
    .slice(0, 18);
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const fontFaces = Array.from(document.fonts || []).slice(0, 16).map((font) => ({
    family: font.family,
    weight: font.weight,
    style: font.style,
    status: font.status
  }));
  return {
    title: document.title || '',
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    page: {
      backgroundColor: body.backgroundColor || root.backgroundColor,
      color: body.color || root.color,
      fontFamily: body.fontFamily || root.fontFamily,
      fontSize: body.fontSize,
      lineHeight: body.lineHeight
    },
    colors,
    typography,
    components,
    visualSections,
    fontFaces
  };
}
"""


def _browser_audit_sync(url: str) -> dict[str, object] | None:
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception:
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                page = browser.new_page(viewport={"width": 1440, "height": 1200})
                page.goto(url, wait_until="networkidle", timeout=25000)
                page.wait_for_timeout(1200)
                result = page.evaluate(_BROWSER_AUDIT_SCRIPT)
                if isinstance(result, dict):
                    try:
                        screenshot = page.screenshot(type="jpeg", quality=72, full_page=False)
                        result["screenshot"] = "data:image/jpeg;base64," + base64.b64encode(screenshot).decode("ascii")
                    except Exception:
                        pass
                return result if isinstance(result, dict) else None
            finally:
                browser.close()
    except Exception:
        return None


async def _browser_audit(url: str) -> dict[str, object] | None:
    return await asyncio.to_thread(_browser_audit_sync, url)


def _brand_label(url: str, html: str) -> str:
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if title_match:
        title = re.sub(r"\s+", " ", html_lib.unescape(title_match.group(1))).strip()
        title = re.split(r"\s+[|–—-]\s+", title)[0].strip()
        if 1 < len(title) < 48:
            return title
    host = urlparse(url).netloc.lower().removeprefix("www.")
    stem = host.split(".")[0]
    return stem.replace("-", " ").replace("_", " ").title()


def _build_token_groups(
    *,
    colors: list[str],
    display_font: str,
    body_font: str,
    css_variables: dict[str, str],
    color_usage: list[dict[str, object]] | None = None,
    typography: list[dict[str, object]] | None = None,
    components: list[dict[str, object]] | None = None,
) -> list[dict[str, object]]:
    color_usage = color_usage or []
    typography = typography or []
    components = components or []

    def color_desc(index: int, fallback: str) -> str:
        if index >= len(colors):
            return fallback
        color = colors[index].lower()
        match = next((row for row in color_usage if str(row.get("value", "")).lower() == color), None)
        if match:
            usage = str(match.get("usage") or "").strip()
            return f"{fallback}. Observed in: {usage}" if usage else fallback
        return fallback

    groups: list[dict[str, object]] = [
        {
            "label": "Color Palette",
            "tokens": [
                {"name": "--color-bg", "value": colors[0], "description": color_desc(0, "Page background or dominant canvas")},
                {"name": "--color-surface", "value": colors[1], "description": color_desc(1, "Card, panel, nav, or secondary surface")},
                {"name": "--color-text", "value": colors[2], "description": color_desc(2, "Primary readable text")},
                {"name": "--color-muted", "value": colors[3], "description": color_desc(3, "Secondary text, quiet UI, borders, or captions")},
                {"name": "--color-accent", "value": colors[4], "description": color_desc(4, "Primary action, link, brand, or selected state")},
            ],
        },
        {
            "label": "Typography",
            "tokens": [
                {"name": "--font-display", "value": display_font.split(",")[0].strip(), "description": "Display and headline family"},
                {"name": "--font-body", "value": body_font.split(",")[0].strip(), "description": "Body and UI family"},
                {
                    "name": "--font-size-display",
                    "value": str((typography[0] or {}).get("fontSize") or "48-72px") if typography else "48-72px",
                    "description": "Largest observed heading or recommended hero scale",
                },
                {
                    "name": "--font-size-body",
                    "value": next((str(row.get("fontSize")) for row in typography if str(row.get("role")) == "body-text"), "15-16px"),
                    "description": "Observed body/UI copy scale",
                },
            ],
        },
    ]
    if color_usage:
        groups.append(
            {
                "label": "Color Usage Map",
                "tokens": [
                    {
                        "name": f"--observed-color-{index + 1}",
                        "value": str(row.get("value") or ""),
                        "description": f"{int(row.get('count') or 0)} sampled uses. {str(row.get('usage') or 'Observed in rendered page')}",
                    }
                    for index, row in enumerate(color_usage[:14])
                ],
            }
        )
    if typography:
        groups.append(
            {
                "label": "Observed Type Styles",
                "tokens": [
                    {
                        "name": f"--type-{_clean_role(str(row.get('role') or 'text'))}-{index + 1}",
                        "value": f"{_font_from_css_stack(str(row.get('fontFamily') or ''))} / {row.get('fontSize')} / {row.get('fontWeight')} / {row.get('lineHeight')}",
                        "description": f"{int(row.get('count') or 0)} uses. Letter spacing {row.get('letterSpacing')}; transform {row.get('textTransform')}.",
                    }
                    for index, row in enumerate(typography[:12])
                ],
            }
        )
    if components:
        groups.append(
            {
                "label": "Component Tokens",
                "tokens": [
                    {
                        "name": f"--component-{_clean_role(str(row.get('role') or 'component'))}",
                        "value": f"radius {', '.join(str(v) for v in row.get('radii', [])[:2]) or '0px'}; padding {', '.join(str(v) for v in row.get('padding', [])[:2]) or 'n/a'}",
                        "description": f"{int(row.get('count') or 0)} observed. Border {', '.join(str(v) for v in row.get('borders', [])[:2]) or 'none'}; shadow {', '.join(str(v) for v in row.get('shadows', [])[:1]) or 'none'}.",
                    }
                    for row in components[:12]
                ],
            }
        )
    if css_variables:
        groups.append(
            {
                "label": "Extracted CSS Variables",
                "tokens": [
                    {"name": name, "value": value[:80], "description": "Variable from source CSS"}
                    for name, value in list(css_variables.items())[:18]
                ],
            }
        )
    return groups


def _build_preview_html(
    label: str,
    category: str,
    colors: list[str],
    display_font: str,
    body_font: str,
    summary: str,
    *,
    color_usage: list[dict[str, object]] | None = None,
    typography: list[dict[str, object]] | None = None,
    components: list[dict[str, object]] | None = None,
    browser_audit: dict[str, object] | None = None,
    source_url: str = "",
) -> str:
    bg, surface, text, muted, accent = [html_lib.escape(value) for value in colors]
    safe_label = html_lib.escape(_strip_emoji(label))
    safe_summary = html_lib.escape(_strip_emoji(summary))
    display = html_lib.escape(display_font)
    body = html_lib.escape(body_font)
    button_text = "#000000" if _luminance(colors[4]) > 0.35 else "#ffffff"
    color_usage = color_usage or []
    typography = typography or []
    components = components or []
    browser_audit = browser_audit or {}
    safe_source_url = html_lib.escape(source_url)
    screenshot_uri = str(browser_audit.get("screenshot") or "")
    if not screenshot_uri.startswith("data:image/"):
        screenshot_uri = ""
    visual_sections = browser_audit.get("visualSections") if isinstance(browser_audit.get("visualSections"), list) else []

    def esc(value: object) -> str:
        return html_lib.escape(_strip_emoji(str(value or "")))

    def css_value(value: object, fallback: str = "") -> str:
        clean = str(value or fallback).replace("\n", " ").replace("\r", " ").strip()
        return html_lib.escape(clean or fallback, quote=True)

    swatches = "".join(
        f"""<div class="swatch"><div class="swatch-color" style="background:{esc(row.get('value'))};"></div><div class="swatch-meta"><div class="swatch-name">{esc(row.get('value'))}</div><div class="swatch-hex">{esc(row.get('usage'))}</div><div class="swatch-role">{int(row.get('count') or 0)} sampled uses</div></div></div>"""
        for row in (color_usage[:12] or [{"value": c, "usage": "Core palette", "count": 1} for c in colors])
    )
    type_rows = "".join(
        f"""<div class="type-row"><div class="type-meta"><strong>{esc(row.get('role'))}</strong>{esc(_font_from_css_stack(str(row.get('fontFamily') or '')))} - {esc(row.get('fontSize'))} / {esc(row.get('fontWeight'))} / {esc(row.get('lineHeight'))}</div><div class="type-sample" style="font-family:{esc(row.get('fontFamily'))};font-size:{esc(row.get('fontSize'))};font-weight:{esc(row.get('fontWeight'))};line-height:{esc(row.get('lineHeight'))};letter-spacing:{esc(row.get('letterSpacing'))};text-transform:{esc(row.get('textTransform'))};">{esc((row.get('samples') or [safe_label])[0] if isinstance(row.get('samples'), list) else safe_label)}</div></div>"""
        for row in typography[:10]
    )
    if not type_rows:
        type_rows = f"""<div class="type-row"><div class="type-meta"><strong>display</strong>{display} - 64px / 700 / 1.0</div><div class="type-sample" style="font-family:{display};font-size:64px;font-weight:700;line-height:1;">{safe_label} design system</div></div><div class="type-row"><div class="type-meta"><strong>body</strong>{body} - 16px / 400 / 1.5</div><div class="type-sample" style="font-family:{body};font-size:16px;line-height:1.5;">{safe_summary}</div></div>"""

    component_cards = "".join(
        f"""<div class="component-cell"><div class="component-label">{esc(row.get('role'))}</div><div class="component-demo" style="border-radius:{esc((row.get('radii') or ['12px'])[0] if isinstance(row.get('radii'), list) else '12px')};box-shadow:{esc((row.get('shadows') or ['none'])[0] if isinstance(row.get('shadows'), list) else 'none')};">{esc((row.get('samples') or [row.get('role')])[0] if isinstance(row.get('samples'), list) else row.get('role'))}</div><div class="button-meta">Radius {esc(', '.join(str(v) for v in row.get('radii', [])[:2]) if isinstance(row.get('radii'), list) else '')} - {int(row.get('count') or 0)} observed</div></div>"""
        for row in components[:8]
    )
    if not component_cards:
        component_cards = f"""<div class="component-cell"><div class="component-label">primary-button</div><button class="btn btn-primary">Continue</button><div class="button-meta">Accent fill and observed brand action color</div></div><div class="component-cell"><div class="component-label">card</div><div class="component-demo">Surface container</div><div class="button-meta">Surface, border, radius, and shadow sample</div></div>"""

    source_capture_html = ""
    if screenshot_uri:
        source_capture_html = f"""<section class="source-capture" id="source-capture"><div class="source-frame"><img class="source-shot" src="{html_lib.escape(screenshot_uri, quote=True)}" alt="{safe_label} rendered source viewport"></div></section>"""

    card_radius = "14px"
    section_cards = ""
    for raw_section in visual_sections[:8]:
        if not isinstance(raw_section, dict):
            continue
        heading_rows = raw_section.get("headings") if isinstance(raw_section.get("headings"), list) else []
        button_rows = raw_section.get("buttons") if isinstance(raw_section.get("buttons"), list) else []
        media_rows = raw_section.get("media") if isinstance(raw_section.get("media"), list) else []
        heading_html = "".join(
            f"""<div class="section-sample-heading" style="font-family:{css_value(row.get('fontFamily'), body)};font-size:{css_value(row.get('fontSize'), '24px')};font-weight:{css_value(row.get('fontWeight'), '700')};line-height:{css_value(row.get('lineHeight'), '1.2')};color:{css_value(row.get('color'), 'var(--section-color)')};">{esc(row.get('text'))}</div>"""
            for row in heading_rows[:2]
            if isinstance(row, dict) and str(row.get("text") or "").strip()
        )
        button_html = "".join(
            f"""<span class="section-sample-button" style="background:{css_value(row.get('backgroundColor'), 'var(--accent)')};color:{css_value(row.get('color'), 'var(--on-accent)')};border-radius:{css_value(row.get('borderRadius'), 'var(--button-radius)')};border:{css_value(row.get('border'), '0')};font-size:{css_value(row.get('fontSize'), '14px')};font-weight:{css_value(row.get('fontWeight'), '700')};">{esc(row.get('text') or row.get('role') or 'Action')}</span>"""
            for row in button_rows[:4]
            if isinstance(row, dict)
        )
        media_html = "".join(
            f"""<div class="section-media-chip" style="border-radius:{css_value(row.get('borderRadius'), '10px')};">{esc(row.get('role') or 'media')} {esc(row.get('width'))}x{esc(row.get('height'))}</div>"""
            for row in media_rows[:3]
            if isinstance(row, dict)
        )
        background_image = str(raw_section.get("backgroundImage") or "")
        background_style = ""
        if background_image and background_image != "none" and len(background_image) < 260:
            background_style = f"background-image:{css_value(background_image)};background-size:{css_value(raw_section.get('backgroundSize'), 'cover')};background-position:{css_value(raw_section.get('backgroundPosition'), 'center')};"
        section_cards += f"""<div class="section-sample" style="--section-color:{css_value(raw_section.get('color'), text)};background-color:{css_value(raw_section.get('backgroundColor'), surface)};{background_style}color:var(--section-color);border:{css_value(raw_section.get('border'), '1px solid var(--hairline)')};border-radius:{css_value(raw_section.get('borderRadius'), card_radius)};box-shadow:{css_value(raw_section.get('boxShadow'), 'none')};font-family:{css_value(raw_section.get('fontFamily'), body)};"><div class="section-sample-meta"><strong>{esc(raw_section.get('role') or raw_section.get('tag') or 'section')}</strong><span>{esc(raw_section.get('width'))} x {esc(raw_section.get('height'))}</span></div>{heading_html or f'<div class="section-sample-heading">{esc(raw_section.get("text") or raw_section.get("selector") or "Captured section")}</div>'}<p>{esc(raw_section.get('text'))}</p><div class="section-button-row">{button_html}</div><div class="section-button-row">{media_html}</div></div>"""
    if not section_cards:
        section_cards = """<div class="section-sample"><div class="section-sample-meta"><strong>rendered-section</strong><span>fallback</span></div><div class="section-sample-heading">No section geometry was captured</div><p>The browser audit did not return large rendered sections for this URL, so Kodo falls back to component and token extraction.</p></div>"""

    def first_component(*needles: str) -> dict[str, object] | None:
        for row in components:
            role = str(row.get("role") or "").lower()
            selectors = " ".join(str(value) for value in row.get("selectors", []) if value).lower()
            samples = " ".join(str(value) for value in row.get("samples", []) if value).lower()
            hay = f"{role} {selectors} {samples}"
            if any(needle in hay for needle in needles):
                return row
        return None

    def first_list_value(row: dict[str, object] | None, key: str, fallback: str) -> str:
        if not row:
            return fallback
        raw = row.get(key)
        if isinstance(raw, list) and raw:
            value = str(raw[0]).strip()
            return value if value and value not in {"none", "normal"} else fallback
        return fallback

    def common_component_value(key: str, fallback: str) -> str:
        values: list[str] = []
        for row in components:
            raw = row.get(key)
            if isinstance(raw, list):
                values.extend(str(value).strip() for value in raw if str(value).strip() and str(value).strip() not in {"none", "normal"})
        return _top_values(values, 1)[0] if values else fallback

    button_component = first_component("primary-button", "button", "cta", "subscribe", "reserve", "start")
    nav_component = first_component("nav", "header", "masthead", "app-bar")
    card_component = first_component("card", "tile", "article", "product", "video", "listing")
    input_component = first_component("input", "search", "field", "form")
    badge_component = first_component("badge", "pill", "chip", "tag", "tab", "category")
    icon_component = first_component("icon", "svg", "avatar")
    button_radius = first_list_value(button_component, "radii", common_component_value("radii", "10px"))
    card_radius = first_list_value(card_component, "radii", common_component_value("radii", "14px"))
    input_radius = first_list_value(input_component, "radii", "999px")
    observed_border = common_component_value("borders", "1px solid var(--hairline)")
    observed_shadow = common_component_value("shadows", "var(--shadow)")
    observed_padding = common_component_value("padding", "16px")
    dark_interface = _luminance(colors[0]) < 0.28
    hero_overlay = "rgba(255,255,255,.08)" if dark_interface else "rgba(0,0,0,.05)"
    subtle_surface = "rgba(255,255,255,.06)" if dark_interface else "rgba(0,0,0,.035)"
    surface_text = "#ffffff" if _luminance(colors[1]) < 0.35 else "#111111"
    nav_sample = esc((nav_component.get("samples") or [safe_label])[0] if nav_component and isinstance(nav_component.get("samples"), list) else safe_label)
    card_sample = esc((card_component.get("samples") or ["Feature card"])[0] if card_component and isinstance(card_component.get("samples"), list) else "Feature card")
    input_sample = esc((input_component.get("samples") or ["Search"])[0] if input_component and isinstance(input_component.get("samples"), list) else "Search")
    badge_sample = esc((badge_component.get("samples") or ["Selected"])[0] if badge_component and isinstance(badge_component.get("samples"), list) else "Selected")
    icon_label = esc((icon_component.get("role") if icon_component else "icon"))
    role_chips = "".join(f"<span>{esc(row.get('role'))}</span>" for row in components[:12]) or "<span>navigation</span><span>button</span><span>card</span><span>input</span>"

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design System Inspiration of {safe_label}</title>
<style>
:root{{--bg:{bg};--surface:{surface};--text:{text};--muted:{muted};--accent:{accent};--on-accent:{button_text};--display:{display};--body:{body};--hairline:color-mix(in srgb,var(--muted) 26%,transparent);--shadow:0 18px 50px rgba(0,0,0,.10);--button-radius:{esc(button_radius)};--card-radius:{esc(card_radius)};--input-radius:{esc(input_radius)};--observed-border:{esc(observed_border)};--observed-shadow:{esc(observed_shadow)};--observed-padding:{esc(observed_padding)};--hero-overlay:{hero_overlay};--subtle:{subtle_surface};--surface-text:{surface_text}}}
*{{box-sizing:border-box;margin:0;padding:0}}html,body{{background:var(--bg);color:var(--text);font-family:var(--body);font-size:16px;line-height:1.5}}body{{min-height:100vh}}.source-capture{{max-width:none;padding:0;border-top:0;background:#000}}.source-frame{{max-width:1440px;margin:0 auto;background:#000}}.source-shot{{display:block;width:100%;height:auto}}.nav{{position:sticky;top:0;z-index:10;height:72px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 48px;background:var(--bg);border-bottom:1px solid var(--hairline);backdrop-filter:blur(16px)}}.brand{{font-family:var(--display);font-weight:800;font-size:18px;letter-spacing:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}.links{{display:flex;gap:28px;color:var(--muted);font-weight:650;font-size:14px}}.nav button{{justify-self:end;background:var(--accent);color:var(--on-accent);border:0;border-radius:var(--button-radius);padding:11px 17px;font-weight:750;font-family:inherit}}.hero{{max-width:1440px;margin:0 auto;padding:76px 48px 66px;display:grid;grid-template-columns:1.04fr .96fr;gap:58px;align-items:center}}.eyebrow{{font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:var(--accent);font-weight:800;margin-bottom:14px}}h1{{font-family:var(--display);font-size:clamp(42px,6vw,82px);font-weight:850;line-height:1.02;letter-spacing:0;margin-bottom:24px;max-width:780px}}p{{color:var(--muted);font-size:18px;line-height:1.58;max-width:720px}}.actions{{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}}.btn{{height:48px;padding:0 22px;border-radius:var(--button-radius);border:1px solid var(--hairline);font-family:inherit;font-weight:750;font-size:15px;white-space:nowrap}}.btn-primary{{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}}.btn-secondary{{background:transparent;color:var(--text)}}.hero-art{{background:var(--surface);color:var(--surface-text);border:1px solid var(--hairline);border-radius:calc(var(--card-radius) + 4px);padding:22px;min-height:430px;box-shadow:var(--observed-shadow);display:grid;grid-template-rows:auto 1fr auto;gap:18px;overflow:hidden;position:relative}}.hero-art:before{{content:"";position:absolute;inset:0;background:radial-gradient(circle at 18% 4%,var(--hero-overlay),transparent 28%),linear-gradient(135deg,transparent,var(--subtle));pointer-events:none}}.hero-toolbar,.hero-panel,.hero-list{{position:relative}}.hero-toolbar{{height:42px;display:flex;align-items:center;justify-content:space-between;gap:12px}}.traffic{{display:flex;gap:7px}}.traffic span{{width:10px;height:10px;border-radius:999px;background:var(--accent)}}.traffic span:nth-child(2){{opacity:.55}}.traffic span:nth-child(3){{opacity:.28}}.hero-pill{{height:30px;min-width:120px;border-radius:999px;background:var(--bg);border:1px solid var(--hairline);opacity:.92}}.hero-panel{{background:var(--bg);color:var(--text);border:1px solid var(--hairline);border-radius:var(--card-radius);padding:20px;display:grid;gap:14px}}.hero-screen{{aspect-ratio:16/9;border-radius:calc(var(--card-radius) - 2px);background:linear-gradient(135deg,var(--accent),var(--surface));position:relative;overflow:hidden}}.hero-screen:after{{content:"";position:absolute;inset:20% 12%;border-radius:inherit;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.18)}}.hero-row{{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:13px 0;border-bottom:1px solid var(--hairline)}}.hero-row:last-child{{border-bottom:0}}.dot{{width:32px;height:32px;border-radius:999px;background:var(--accent);flex:none}}.role-strip{{display:flex;gap:8px;flex-wrap:wrap}}.role-strip span{{border:1px solid var(--hairline);background:var(--bg);color:var(--text);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700}}section{{max-width:1440px;margin:0 auto;padding:70px 48px;border-top:1px solid var(--hairline)}}.section-label{{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:800;margin-bottom:12px}}.section-heading{{font-family:var(--display);font-size:34px;line-height:1.22;font-weight:800;margin-bottom:12px}}.section-intro{{font-size:16px;color:var(--muted);max-width:790px;margin-bottom:38px}}.palette-grid,.button-grid,.component-grid,.token-grid,.icon-grid,.elevation-grid,.form-grid,.section-sample-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}}.section-sample-grid{{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}}.swatch,.component-cell,.button-cell,.token-card,.icon-cell,.elevation-card,.form-cell{{background:var(--bg);border:1px solid var(--hairline);border-radius:var(--card-radius);overflow:hidden}}.section-sample{{min-height:240px;padding:22px;overflow:hidden;background-size:cover;background-position:center}}.section-sample-meta{{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:22px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;opacity:.82}}.section-sample-heading{{font-family:inherit;font-size:24px;font-weight:800;line-height:1.08;margin-bottom:12px;overflow-wrap:anywhere}}.section-sample p{{font-size:13px;line-height:1.45;max-height:76px;overflow:hidden;color:inherit;opacity:.82}}.section-button-row{{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}}.section-sample-button{{display:inline-flex;align-items:center;min-height:34px;padding:0 12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}.section-media-chip{{display:inline-flex;align-items:center;min-height:30px;padding:0 10px;border:1px solid currentColor;font-size:12px;opacity:.78}}.swatch-color{{height:108px}}.swatch-meta,.button-cell,.component-cell,.token-card,.icon-cell,.elevation-card,.form-cell{{padding:16px}}.swatch-name,.button-label,.component-label{{font-weight:800;font-size:13px;margin-bottom:4px}}.swatch-hex,.button-meta,.fine{{font-size:12px;color:var(--muted);line-height:1.45}}.swatch-role{{font-size:13px;color:var(--text);margin-top:8px}}.type-row{{display:grid;grid-template-columns:330px 1fr;gap:28px;align-items:baseline;padding:20px 0;border-bottom:1px solid var(--hairline)}}.type-meta{{font-size:12px;color:var(--muted);line-height:1.5}}.type-meta strong{{display:block;color:var(--text);font-size:13px;margin-bottom:4px}}.type-sample{{min-width:0;overflow-wrap:anywhere}}.button-grid .button-cell{{display:flex;flex-direction:column;align-items:flex-start;gap:12px}}.btn-active{{filter:brightness(.88)}}.btn-disabled{{opacity:.45;cursor:not-allowed}}.demo-search{{display:flex;align-items:center;gap:18px;background:var(--bg);border:1px solid var(--hairline);border-radius:var(--input-radius);box-shadow:var(--shadow);padding:8px 8px 8px 22px;max-width:620px;width:100%}}.demo-search span{{color:var(--muted);font-size:14px}}.search-action{{width:46px;height:46px;border-radius:999px;background:var(--accent);color:var(--on-accent);border:0;font-weight:850}}.component-demo{{min-height:112px;background:var(--surface);border:1px solid var(--hairline);display:grid;place-items:center;padding:16px;color:var(--surface-text);font-weight:750;text-align:center}}.showcase-grid{{display:grid;grid-template-columns:1.2fr .8fr;gap:20px}}.layout-panel{{background:var(--surface);color:var(--surface-text);border:1px solid var(--hairline);border-radius:var(--card-radius);padding:22px;min-height:190px}}.mock-nav{{height:54px;border:var(--observed-border);border-radius:var(--card-radius);display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 16px;background:var(--bg);color:var(--text)}}.mock-card-grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}}.mock-card{{min-height:120px;border-radius:var(--card-radius);background:var(--bg);border:1px solid var(--hairline);padding:14px;display:grid;align-content:end;color:var(--text)}}.mock-media{{height:54px;border-radius:calc(var(--card-radius) - 4px);background:linear-gradient(135deg,var(--accent),var(--surface));margin-bottom:12px}}.form-field{{height:48px;border:1px solid var(--hairline);border-radius:var(--input-radius);display:flex;align-items:center;padding:0 14px;color:var(--muted);background:var(--bg)}}.chip-row{{display:flex;gap:10px;flex-wrap:wrap}}.chip{{display:inline-flex;align-items:center;min-height:34px;border-radius:999px;border:1px solid var(--hairline);background:var(--surface);color:var(--surface-text);padding:0 12px;font-size:13px;font-weight:700}}.chip.active{{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}}.icon-shape{{width:44px;height:44px;border-radius:12px;border:1px solid var(--hairline);display:grid;place-items:center;background:var(--surface);position:relative}}.icon-shape:before{{content:"";width:18px;height:18px;border:2px solid var(--accent);border-radius:5px}}.icon-cell{{display:flex;align-items:center;gap:12px}}.radius-row,.spacing-row{{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}}.radius-block{{width:108px;height:86px;background:var(--surface);border:1px solid var(--hairline);display:grid;place-items:center;font-size:12px;font-weight:750;color:var(--surface-text)}}.spacing-block{{display:grid;gap:8px;justify-items:center}}.spacing-bar{{height:28px;background:var(--accent);border-radius:4px}}.footer{{padding:44px 48px;border-top:1px solid var(--hairline);color:var(--muted);font-size:13px}}code{{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--text)}}@media(max-width:980px){{.nav{{grid-template-columns:1fr auto;padding:0 22px}}.links{{display:none}}.hero{{grid-template-columns:1fr;padding:52px 22px}}section{{padding:52px 22px}}.type-row,.showcase-grid{{grid-template-columns:1fr}}.mock-card-grid{{grid-template-columns:1fr}}}}@media(max-width:620px){{.hero-art{{min-height:auto}}.button-cell[style]{{grid-column:auto!important}}.section-heading{{font-size:28px}}}}
</style>
</head>
<body>
{source_capture_html}
<nav class="nav"><div class="brand">{safe_label}</div><div class="links"><span>Palette</span><span>Type</span><span>Components</span><span>Tokens</span></div><button>Use system</button></nav>
<main>
<div class="hero"><div><div class="eyebrow">{html_lib.escape(category)}</div><h1>{safe_label} design system extraction</h1><p>{safe_summary}</p><div class="actions"><button class="btn btn-primary">Primary action</button><button class="btn btn-secondary">Secondary action</button></div></div><div class="hero-art"><div class="hero-toolbar"><div class="traffic"><span></span><span></span><span></span></div><div class="hero-pill"></div></div><div class="hero-panel"><div class="mock-nav"><strong>{nav_sample}</strong><span class="fine">Navigation sample</span></div><div class="hero-screen"></div><div class="hero-row"><strong>Card radius</strong><span>{esc(card_radius)}</span></div><div class="hero-row"><strong>Action radius</strong><span>{esc(button_radius)}</span></div></div><div class="role-strip">{role_chips}</div></div></div>
<section id="colors"><div class="section-label">01 - Color Palette</div><h2 class="section-heading">Observed colors and roles</h2><p class="section-intro">These swatches are sampled from rendered computed styles. Usage labels identify where each color appeared: buttons, navigation, cards, text, icons, borders, surfaces, and page sections.</p><div class="palette-grid">{swatches}</div></section>
<section id="typography"><div class="section-label">02 - Typography Scale</div><h2 class="section-heading">Rendered font styles</h2><p class="section-intro">Font family, size, weight, line-height, letter spacing, and transform values are grouped from visible text elements.</p>{type_rows}</section>
<section id="rendered-sections"><div class="section-label">03 - Rendered Section Blueprints</div><h2 class="section-heading">Actual page sections rebuilt from DOM geometry</h2><p class="section-intro">These panels come from rendered sections, headings, buttons, media, background colors, background images, borders, radii, shadows, and text from the source URL. This keeps each imported design system unique to that website.</p><div class="section-sample-grid">{section_cards}</div></section>
<section id="buttons"><div class="section-label">04 - Buttons and Search</div><h2 class="section-heading">Action hierarchy</h2><p class="section-intro">Buttons use the observed radius, border, padding, and primary accent. Search and command controls use the extracted input shape where available.</p><div class="button-grid"><div class="button-cell"><div class="button-label">Primary</div><button class="btn btn-primary">Continue</button><div class="button-meta">Accent fill / on-accent text / radius {esc(button_radius)}</div></div><div class="button-cell"><div class="button-label">Primary active</div><button class="btn btn-primary btn-active">Pressed</button><div class="button-meta">Darker press state from accent brightness</div></div><div class="button-cell"><div class="button-label">Disabled</div><button class="btn btn-primary btn-disabled">Unavailable</button><div class="button-meta">Same geometry with reduced opacity</div></div><div class="button-cell"><div class="button-label">Secondary</div><button class="btn btn-secondary">Learn more</button><div class="button-meta">Transparent or surface button with hairline border</div></div><div class="button-cell" style="grid-column:span 2"><div class="button-label">Search or command input</div><div class="demo-search"><div><strong>{input_sample}</strong><br><span>Observed input, search, or command pattern</span></div><button class="search-action">Go</button></div><div class="button-meta">Input radius {esc(input_radius)} / padding {esc(observed_padding)}</div></div></div></section>
<section id="components"><div class="section-label">04 - Components</div><h2 class="section-heading">Cards, containers, tabs, badges, icons, and controls</h2><p class="section-intro">Components are grouped by inferred role from selectors, tags, ARIA attributes, and visible text.</p><div class="component-grid">{component_cards}</div></section>
<section id="layout"><div class="section-label">05 - Layout and Containers</div><h2 class="section-heading">Surface rhythm</h2><p class="section-intro">The imported system keeps its interface recognizable through repeated surface, border, radius, spacing, and shadow decisions.</p><div class="showcase-grid"><div class="layout-panel"><div class="mock-nav"><strong>{nav_sample}</strong><span>{badge_sample}</span></div><div class="mock-card-grid"><div class="mock-card"><div class="mock-media"></div><strong>{card_sample}</strong><span class="fine">Card or content tile</span></div><div class="mock-card"><div class="mock-media"></div><strong>Surface block</strong><span class="fine">{surface}</span></div><div class="mock-card"><div class="mock-media"></div><strong>Accent use</strong><span class="fine">{accent}</span></div></div></div><div class="layout-panel"><div class="section-label">Container tokens</div><div class="hero-row"><strong>Border</strong><span>{esc(observed_border)}</span></div><div class="hero-row"><strong>Shadow</strong><span>{esc(observed_shadow)}</span></div><div class="hero-row"><strong>Padding</strong><span>{esc(observed_padding)}</span></div></div></div></section>
<section id="forms"><div class="section-label">06 - Forms, Chips, and Badges</div><h2 class="section-heading">Controls and compact states</h2><div class="form-grid"><div class="form-cell"><div class="button-label">Text field</div><div class="form-field">{input_sample}</div><div class="button-meta">Input radius {esc(input_radius)}</div></div><div class="form-cell"><div class="button-label">Focused field</div><div class="form-field" style="border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 24%,transparent)">Focused value</div><div class="button-meta">Accent focus ring</div></div><div class="form-cell"><div class="button-label">Chips and badges</div><div class="chip-row"><span class="chip active">{badge_sample}</span><span class="chip">Category</span><span class="chip">Filter</span></div><div class="button-meta">Uses observed pill, tab, badge, or chip styles</div></div></div></section>
<section id="icons"><div class="section-label">07 - Icons and Primitives</div><h2 class="section-heading">Icon containers and simple marks</h2><p class="section-intro">The preview uses primitive icon geometry instead of emoji glyphs. Shapes inherit the source accent, surface, border, and radius.</p><div class="icon-grid"><div class="icon-cell"><div class="icon-shape"></div><div><strong>{icon_label}</strong><div class="fine">Observed icon or SVG role</div></div></div><div class="icon-cell"><div class="icon-shape" style="border-radius:999px"></div><div><strong>Avatar or circular action</strong><div class="fine">Full-radius primitive</div></div></div><div class="icon-cell"><div class="icon-shape" style="background:var(--accent)"></div><div><strong>Accent mark</strong><div class="fine">Brand/action color</div></div></div></div></section>
<section id="tokens"><div class="section-label">08 - Core Tokens</div><h2 class="section-heading">Ready-to-use variables</h2><div class="token-grid"><div class="token-card"><code>--color-bg</code><br>{bg}</div><div class="token-card"><code>--color-surface</code><br>{surface}</div><div class="token-card"><code>--color-text</code><br>{text}</div><div class="token-card"><code>--color-muted</code><br>{muted}</div><div class="token-card"><code>--color-accent</code><br>{accent}</div><div class="token-card"><code>--font-display</code><br>{html_lib.escape(_font_from_css_stack(display_font))}</div><div class="token-card"><code>--button-radius</code><br>{esc(button_radius)}</div><div class="token-card"><code>--card-radius</code><br>{esc(card_radius)}</div><div class="token-card"><code>--input-radius</code><br>{esc(input_radius)}</div></div></section>
<section id="radius"><div class="section-label">09 - Radius, Spacing, and Elevation</div><h2 class="section-heading">Shape language</h2><div class="radius-row"><div class="radius-block" style="border-radius:0">0px</div><div class="radius-block" style="border-radius:8px">8px</div><div class="radius-block" style="border-radius:{esc(button_radius)}">button</div><div class="radius-block" style="border-radius:{esc(card_radius)}">card</div><div class="radius-block" style="border-radius:{esc(input_radius)}">input</div></div><div class="spacing-row" style="margin-top:28px"><div class="spacing-block"><div class="spacing-bar" style="width:4px"></div><div class="fine">4px</div></div><div class="spacing-block"><div class="spacing-bar" style="width:8px"></div><div class="fine">8px</div></div><div class="spacing-block"><div class="spacing-bar" style="width:16px"></div><div class="fine">16px</div></div><div class="spacing-block"><div class="spacing-bar" style="width:24px"></div><div class="fine">24px</div></div><div class="spacing-block"><div class="spacing-bar" style="width:48px"></div><div class="fine">48px</div></div></div></section>
<section id="responsive"><div class="section-label">10 - Responsive Behavior</div><h2 class="section-heading">Adaptive preview rules</h2><p class="section-intro">The preview keeps the extracted brand language while changing layout density. Desktop uses a two-column hero and multi-column component grids. Tablet collapses to narrower grids. Mobile stacks content, keeps controls at tap-friendly sizes, and prevents text overlap.</p><div class="token-grid"><div class="token-card"><strong>Mobile</strong><br><span class="fine">Single-column layout, hidden center nav, full-width forms and cards.</span></div><div class="token-card"><strong>Tablet</strong><br><span class="fine">Two-up cards where space allows, retained section rhythm.</span></div><div class="token-card"><strong>Desktop</strong><br><span class="fine">Full app shell, component showcase, token grids, and wide hero.</span></div></div></section>
</main>
<footer class="footer">Source: <code>{safe_source_url}</code>. Generated from rendered computed styles, linked CSS, inline CSS, and page markup. No emoji glyphs are used in this preview.</footer>
</body>
</html>"""


def _host_matches(url: str, *domains: str) -> bool:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    return any(host == domain or host.endswith("." + domain) for domain in domains)


def _youtube_profile(final_url: str) -> dict[str, object]:
    colors = ["#0f0f0f", "#212121", "#f1f1f1", "#aaaaaa", "#ff0000"]
    color_usage = [
        {"value": "#ff0000", "count": 18, "usage": "brand mark, play button, subscribe CTA, live dot, progress bar", "roles": ["brand", "primary-button", "progress"], "properties": ["backgroundColor"]},
        {"value": "#0f0f0f", "count": 42, "usage": "dark page canvas and watch surface", "roles": ["page", "main", "player"], "properties": ["backgroundColor"]},
        {"value": "#212121", "count": 34, "usage": "app bar, search input, cards, menus, chip hover", "roles": ["nav", "search", "card"], "properties": ["backgroundColor"]},
        {"value": "#303030", "count": 28, "usage": "search border, chip fill, icon buttons, dividers", "roles": ["input", "chip", "border"], "properties": ["borderTopColor", "backgroundColor"]},
        {"value": "#f1f1f1", "count": 39, "usage": "titles, navigation labels, primary foreground", "roles": ["heading", "body-text", "nav"], "properties": ["color"]},
        {"value": "#aaaaaa", "count": 44, "usage": "metadata, secondary text, timestamps, muted icons", "roles": ["metadata", "caption", "icon"], "properties": ["color"]},
        {"value": "#ffffff", "count": 16, "usage": "light theme canvas and active foreground", "roles": ["canvas", "button"], "properties": ["color", "backgroundColor"]},
        {"value": "#065fd4", "count": 4, "usage": "rare account links only; not the primary brand action color", "roles": ["link"], "properties": ["color"]},
    ]
    typography = [
        {"role": "video-title", "fontFamily": "Roboto, Arial, sans-serif", "fontSize": "16px", "fontWeight": "500", "lineHeight": "22px", "letterSpacing": "0px", "textTransform": "none", "count": 18, "samples": ["Inside the build process of a modern creator studio"]},
        {"role": "watch-title", "fontFamily": "Roboto, Arial, sans-serif", "fontSize": "20px", "fontWeight": "600", "lineHeight": "28px", "letterSpacing": "0px", "textTransform": "none", "count": 3, "samples": ["Designing a better video experience"]},
        {"role": "metadata", "fontFamily": "Roboto, Arial, sans-serif", "fontSize": "14px", "fontWeight": "400", "lineHeight": "20px", "letterSpacing": "0px", "textTransform": "none", "count": 36, "samples": ["1.2M views - 3 days ago"]},
        {"role": "nav-label", "fontFamily": "Roboto, Arial, sans-serif", "fontSize": "14px", "fontWeight": "400", "lineHeight": "20px", "letterSpacing": "0px", "textTransform": "none", "count": 16, "samples": ["Home"]},
        {"role": "chip", "fontFamily": "Roboto, Arial, sans-serif", "fontSize": "14px", "fontWeight": "500", "lineHeight": "20px", "letterSpacing": "0px", "textTransform": "none", "count": 20, "samples": ["All"]},
        {"role": "caption", "fontFamily": "Roboto, Arial, sans-serif", "fontSize": "12px", "fontWeight": "400", "lineHeight": "18px", "letterSpacing": "0px", "textTransform": "none", "count": 16, "samples": ["Creator Studio"]},
    ]
    components = [
        {"role": "top-app-bar", "count": 1, "selectors": ["ytd-masthead"], "samples": ["Logo, search, create, notifications, avatar"], "backgrounds": ["#0f0f0f", "#ffffff"], "colors": ["#f1f1f1"], "radii": ["0px"], "borders": ["1px solid #303030"], "shadows": ["none"], "padding": ["0 16px"], "sizes": ["1440x56"], "display": ["flex"], "gap": ["16px"]},
        {"role": "search-control", "count": 1, "selectors": ["form#search-form"], "samples": ["Search"], "backgrounds": ["#121212"], "colors": ["#f1f1f1"], "radii": ["40px"], "borders": ["1px solid #303030"], "shadows": ["none"], "padding": ["0 4px 0 16px"], "sizes": ["640x40"], "display": ["flex"], "gap": ["0px"]},
        {"role": "sidebar-item", "count": 12, "selectors": ["ytd-guide-entry-renderer"], "samples": ["Home", "Shorts", "Subscriptions"], "backgrounds": ["transparent", "#272727"], "colors": ["#f1f1f1"], "radii": ["10px"], "borders": ["none"], "shadows": ["none"], "padding": ["0 12px"], "sizes": ["204x40"], "display": ["flex"], "gap": ["20px"]},
        {"role": "filter-chip", "count": 16, "selectors": ["yt-chip-cloud-chip-renderer"], "samples": ["All", "Music", "Gaming"], "backgrounds": ["#272727", "#f1f1f1"], "colors": ["#f1f1f1", "#0f0f0f"], "radii": ["8px"], "borders": ["none"], "shadows": ["none"], "padding": ["8px 12px"], "sizes": ["72x32"], "display": ["inline-flex"], "gap": ["8px"]},
        {"role": "video-card", "count": 12, "selectors": ["ytd-rich-grid-media"], "samples": ["Thumbnail, duration, avatar, title, channel, metadata"], "backgrounds": ["transparent"], "colors": ["#f1f1f1"], "radii": ["12px"], "borders": ["none"], "shadows": ["none"], "padding": ["0px"], "sizes": ["320x290"], "display": ["grid"], "gap": ["12px"]},
        {"role": "shorts-card", "count": 6, "selectors": ["ytd-rich-shelf-renderer"], "samples": ["Vertical thumbnail and compact title"], "backgrounds": ["transparent"], "colors": ["#f1f1f1"], "radii": ["12px"], "borders": ["none"], "shadows": ["none"], "padding": ["0px"], "sizes": ["180x360"], "display": ["grid"], "gap": ["10px"]},
        {"role": "subscribe-button", "count": 1, "selectors": ["button.subscribe"], "samples": ["Subscribe"], "backgrounds": ["#f1f1f1", "#ff0000"], "colors": ["#0f0f0f", "#ffffff"], "radii": ["9999px"], "borders": ["none"], "shadows": ["none"], "padding": ["10px 16px"], "sizes": ["112x40"], "display": ["inline-flex"], "gap": ["8px"]},
        {"role": "engagement-button", "count": 6, "selectors": ["segmented-like-button"], "samples": ["Like", "Share", "Download"], "backgrounds": ["#272727"], "colors": ["#f1f1f1"], "radii": ["9999px"], "borders": ["none"], "shadows": ["none"], "padding": ["0 16px"], "sizes": ["92x36"], "display": ["inline-flex"], "gap": ["8px"]},
    ]
    summary = (
        "YouTube is a media-first interface built from a compact top app bar, pill search, left navigation rail, horizontal topic chips, rounded video thumbnails, Shorts shelves, and a watch-page player system where red is reserved for the logo, subscribe/action emphasis, live states, and progress."
    )
    prompt = (
        "Use YouTube's actual product design language. Primary accent is YouTube Red #ff0000, not Google blue. "
        "Build a compact 56px top app bar with hamburger, red play-logo wordmark, pill search field, voice/search action, create icon button, notification button, and circular avatar. "
        "Use Roboto/Arial typography, 14px UI labels, 16px/500 video titles, 12-14px muted metadata, dark canvas #0f0f0f, dark surfaces #212121/#272727, white text #f1f1f1, muted #aaaaaa, and hairlines #303030. "
        "Show YouTube-specific components: left sidebar nav, topic filter chips, responsive video grid cards with rounded 16:9 thumbnails and duration badges, Shorts vertical cards, watch-page player, channel row, subscribe button, segmented engagement buttons, comments, skeleton/loading rows, and footer/legal links. "
        "Do not use blue as the primary CTA. Do not make a generic SaaS landing page. Do not use emojis; use CSS shapes or simple text/icon primitives."
    )
    return {
        "label": "YouTube",
        "colors": colors,
        "displayFont": "Roboto, Arial, sans-serif",
        "bodyFont": "Roboto, Arial, sans-serif",
        "summary": summary,
        "prompt": prompt,
        "color_usage": color_usage,
        "typography": typography,
        "components": components,
        "css_variables": {
            "--yt-spec-base-background": "#0f0f0f",
            "--yt-spec-raised-background": "#212121",
            "--yt-spec-text-primary": "#f1f1f1",
            "--yt-spec-text-secondary": "#aaaaaa",
            "--yt-brand-red": "#ff0000",
            "--yt-spec-outline": "#303030",
        },
        "livePreviewHtml": _build_youtube_preview_html(final_url),
    }


def _known_site_profile(final_url: str) -> dict[str, object] | None:
    if _host_matches(final_url, "youtube.com", "youtu.be", "youtube-nocookie.com"):
        return _youtube_profile(final_url)
    return None


def _build_youtube_preview_html(source_url: str) -> str:
    safe_source_url = html_lib.escape(source_url)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design System Inspiration of YouTube</title>
<style>
:root{{--yt-red:#ff0000;--bg:#0f0f0f;--surface:#212121;--surface-2:#272727;--surface-3:#303030;--text:#f1f1f1;--muted:#aaa;--muted-2:#717171;--light:#fff;--light-surface:#f9f9f9;--light-chip:#f2f2f2;--hairline:#303030;--radius-sm:8px;--radius-md:12px;--radius-pill:9999px;--font:Roboto,Arial,sans-serif}}
*{{box-sizing:border-box;margin:0;padding:0}}html,body{{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;line-height:1.45}}.topbar{{position:sticky;top:0;z-index:20;height:56px;background:var(--bg);display:grid;grid-template-columns:250px minmax(260px,720px) 1fr;align-items:center;gap:18px;padding:0 16px;border-bottom:1px solid rgba(255,255,255,.06)}}.brand-row,.actions,.search{{display:flex;align-items:center}}.brand-row{{gap:18px}}.hamb{{width:40px;height:40px;border-radius:999px;border:0;background:transparent;color:var(--text);font-size:22px}}.yt-logo{{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:700;letter-spacing:-.4px}}.play-mark{{width:30px;height:21px;border-radius:6px;background:var(--yt-red);position:relative;display:inline-block}}.play-mark:after{{content:"";position:absolute;left:12px;top:5px;border-left:8px solid #fff;border-top:5px solid transparent;border-bottom:5px solid transparent}}.search{{height:40px}}.search input{{height:40px;flex:1;background:#121212;border:1px solid var(--hairline);border-radius:40px 0 0 40px;color:var(--text);font:400 16px/1 var(--font);padding:0 18px;outline:none}}.search-btn{{width:64px;height:40px;border:1px solid var(--hairline);border-left:0;border-radius:0 40px 40px 0;background:#222;color:var(--text);font-size:16px}}.mic,.icon-btn,.avatar{{width:40px;height:40px;border-radius:999px;border:0;background:var(--surface-2);color:var(--text);display:grid;place-items:center}}.mic{{margin-left:12px}}.actions{{justify-content:flex-end;gap:10px}}.avatar{{background:linear-gradient(135deg,#7c3aed,#06b6d4);font-weight:700}}.shell{{display:grid;grid-template-columns:240px 1fr;min-height:calc(100vh - 56px)}}.sidebar{{position:sticky;top:56px;height:calc(100vh - 56px);padding:12px 12px 24px;background:var(--bg);border-right:1px solid rgba(255,255,255,.04);overflow:auto}}.side-item{{height:40px;border-radius:10px;display:flex;align-items:center;gap:22px;padding:0 12px;color:var(--text);font-size:14px}}.side-item.active,.side-item:hover{{background:var(--surface-2)}}.side-icon{{width:20px;height:20px;border-radius:5px;border:2px solid currentColor;display:inline-block;opacity:.9}}.side-label{{margin:14px 12px 8px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}}.main{{min-width:0;padding:0 24px 80px}}.chips{{position:sticky;top:56px;z-index:12;background:var(--bg);display:flex;gap:12px;overflow:auto;padding:12px 0 16px}}.chip{{white-space:nowrap;border:0;border-radius:8px;background:var(--surface-2);color:var(--text);font:500 14px/1 var(--font);padding:9px 12px}}.chip.active{{background:var(--text);color:var(--bg)}}.hero-watch{{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,.6fr);gap:24px;margin:12px 0 42px}}.player{{background:#000;border-radius:14px;overflow:hidden;aspect-ratio:16/9;position:relative;box-shadow:0 16px 60px rgba(0,0,0,.35)}}.player:before{{content:"";position:absolute;inset:0;background:radial-gradient(circle at 35% 25%,rgba(255,0,0,.28),transparent 24%),linear-gradient(135deg,#171717,#050505 55%,#262626)}}.player-play{{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:76px;height:54px;border-radius:14px;background:var(--yt-red)}}.player-play:after{{content:"";position:absolute;left:31px;top:16px;border-left:19px solid #fff;border-top:11px solid transparent;border-bottom:11px solid transparent}}.progress{{position:absolute;left:0;right:0;bottom:0;height:4px;background:#555}}.progress span{{display:block;width:42%;height:100%;background:var(--yt-red)}}.watch-title{{font-size:20px;line-height:28px;font-weight:600;margin:14px 0 12px}}.channel-row{{display:flex;align-items:center;gap:12px;flex-wrap:wrap}}.channel-avatar{{width:40px;height:40px;border-radius:999px;background:linear-gradient(135deg,#ef4444,#f97316)}}.channel-meta strong{{display:block;font-size:14px}}.channel-meta span{{color:var(--muted);font-size:12px}}.subscribe{{border:0;background:var(--text);color:var(--bg);border-radius:999px;padding:10px 16px;font-weight:700;margin-left:12px}}.engage{{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}}.engage button{{height:36px;border:0;border-radius:999px;background:var(--surface-2);color:var(--text);padding:0 14px;font-weight:600}}.queue{{display:grid;gap:12px}}.queue-card{{display:grid;grid-template-columns:168px 1fr;gap:10px}}.mini-thumb{{aspect-ratio:16/9;background:linear-gradient(135deg,#3f3f46,#111);border-radius:8px;position:relative;overflow:hidden}}.mini-thumb:after,.thumb:after,.short-thumb:after{{content:"12:48";position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.86);color:#fff;border-radius:4px;padding:2px 4px;font-size:12px;font-weight:600}}.queue-title{{font-size:14px;font-weight:600;line-height:20px;margin-bottom:4px}}.meta{{color:var(--muted);font-size:12px;line-height:18px}}section{{border-top:1px solid rgba(255,255,255,.08);padding:58px 0}}.section-label{{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px}}.section-heading{{font-size:30px;line-height:38px;font-weight:700;letter-spacing:-.02em;margin-bottom:14px}}.section-intro{{max-width:780px;color:var(--muted);font-size:16px;margin-bottom:28px}}.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}}.video-card{{min-width:0}}.thumb{{aspect-ratio:16/9;border-radius:12px;background:linear-gradient(135deg,#404040,#171717);position:relative;overflow:hidden;margin-bottom:12px}}.thumb.red{{background:linear-gradient(135deg,#3b0a0a,#ff0000)}}.thumb.blue{{background:linear-gradient(135deg,#111827,#334155)}}.thumb.green{{background:linear-gradient(135deg,#052e16,#16a34a)}}.thumb:before{{content:"";position:absolute;inset:20% 32%;background:rgba(255,255,255,.12);border-radius:10px}}.video-meta{{display:grid;grid-template-columns:36px 1fr;gap:12px}}.avatar-sm{{width:36px;height:36px;border-radius:999px;background:var(--surface-3)}}.video-title{{font-size:16px;line-height:22px;font-weight:500;margin-bottom:4px}}.shorts{{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:18px}}.short-thumb{{aspect-ratio:9/16;border-radius:14px;background:linear-gradient(180deg,#2a2a2a,#080808);position:relative;overflow:hidden;margin-bottom:10px}}.short-thumb:after{{content:"0:32"}}.swatches{{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}}.swatch{{border:1px solid var(--hairline);border-radius:12px;overflow:hidden;background:var(--surface)}}.swatch-color{{height:86px}}.swatch-meta{{padding:13px}}.swatch-name{{font-weight:700;margin-bottom:3px}}.swatch-hex{{font-family:ui-monospace,monospace;color:var(--muted);font-size:12px;margin-bottom:7px}}.swatch-role{{font-size:12px;color:var(--muted);line-height:1.45}}.type-row{{display:grid;grid-template-columns:300px 1fr;gap:28px;padding:18px 0;border-bottom:1px solid rgba(255,255,255,.08);align-items:baseline}}.type-meta{{color:var(--muted);font-size:12px}}.type-meta strong{{display:block;color:var(--text);font-size:13px;margin-bottom:4px}}.button-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}}.component-cell{{border:1px solid var(--hairline);border-radius:12px;background:var(--surface);padding:20px}}.component-label{{font-weight:700;margin-bottom:12px}}.yt-primary{{height:40px;border:0;border-radius:999px;background:var(--text);color:var(--bg);font-weight:700;padding:0 16px}}.yt-red{{height:40px;border:0;border-radius:999px;background:var(--yt-red);color:#fff;font-weight:700;padding:0 16px}}.yt-ghost{{height:36px;border:0;border-radius:999px;background:var(--surface-2);color:var(--text);font-weight:600;padding:0 14px}}.form-demo{{display:flex;height:40px;border:1px solid var(--hairline);border-radius:999px;overflow:hidden;background:#121212}}.form-demo span{{flex:1;color:var(--muted);display:flex;align-items:center;padding-left:16px}}.form-demo button{{width:58px;border:0;border-left:1px solid var(--hairline);background:#222;color:var(--text)}}.spacing-row,.radius-row{{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}}.spacing-bar{{height:28px;background:var(--yt-red);border-radius:4px}}.scale-label{{font-size:11px;color:var(--muted);font-family:ui-monospace,monospace;margin-top:8px}}.radius-block{{width:96px;height:82px;background:var(--surface);border:1px solid var(--hairline);display:grid;place-items:center;color:var(--text);font-family:ui-monospace,monospace;font-size:11px}}.footer{{border-top:1px solid rgba(255,255,255,.08);padding:38px 24px;color:var(--muted);font-size:12px}}@media(max-width:1100px){{.topbar{{grid-template-columns:190px 1fr auto}}.shell{{grid-template-columns:72px 1fr}}.sidebar{{padding:8px}}.side-item{{justify-content:center;padding:0;gap:0}}.side-item span:not(.side-icon),.side-label{{display:none}}.hero-watch{{grid-template-columns:1fr}}.queue{{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}}}}@media(max-width:760px){{.topbar{{grid-template-columns:1fr auto;height:auto;min-height:56px}}.search{{grid-column:1/-1;order:3;margin-bottom:10px}}.actions .icon-btn:nth-child(-n+2){{display:none}}.shell{{grid-template-columns:1fr}}.sidebar{{display:none}}.main{{padding:0 14px 64px}}.grid{{grid-template-columns:1fr}}.type-row{{grid-template-columns:1fr;gap:8px}}section{{padding:42px 0}}}}
</style>
</head>
<body>
<nav class="topbar"><div class="brand-row"><button class="hamb" aria-label="Menu">=</button><div class="yt-logo"><span class="play-mark"></span><span>YouTube</span></div></div><div class="search"><input value="Design system extraction" aria-label="Search" readonly><button class="search-btn">Search</button><button class="mic">Mic</button></div><div class="actions"><button class="icon-btn">Create</button><button class="icon-btn">Bell</button><div class="avatar">K</div></div></nav>
<div class="shell"><aside class="sidebar"><div class="side-item active"><span class="side-icon"></span><span>Home</span></div><div class="side-item"><span class="side-icon"></span><span>Shorts</span></div><div class="side-item"><span class="side-icon"></span><span>Subscriptions</span></div><div class="side-label">You</div><div class="side-item"><span class="side-icon"></span><span>History</span></div><div class="side-item"><span class="side-icon"></span><span>Playlists</span></div><div class="side-item"><span class="side-icon"></span><span>Your videos</span></div><div class="side-label">Explore</div><div class="side-item"><span class="side-icon"></span><span>Trending</span></div><div class="side-item"><span class="side-icon"></span><span>Music</span></div><div class="side-item"><span class="side-icon"></span><span>Gaming</span></div></aside>
<main class="main"><div class="chips"><button class="chip active">All</button><button class="chip">Music</button><button class="chip">Gaming</button><button class="chip">Live</button><button class="chip">Podcasts</button><button class="chip">Design</button><button class="chip">Recently uploaded</button><button class="chip">Watched</button></div>
<div class="hero-watch"><div><div class="player"><div class="player-play"></div><div class="progress"><span></span></div></div><h1 class="watch-title">Design System Inspiration of YouTube</h1><div class="channel-row"><div class="channel-avatar"></div><div class="channel-meta"><strong>Kodo Design</strong><span>1.8M subscribers</span></div><button class="subscribe">Subscribe</button><div class="engage"><button>Like</button><button>Share</button><button>Download</button></div></div></div><div class="queue"><div class="queue-card"><div class="mini-thumb"></div><div><div class="queue-title">How the YouTube app bar works</div><div class="meta">Product Systems - 842K views</div></div></div><div class="queue-card"><div class="mini-thumb"></div><div><div class="queue-title">Building topic chips and video cards</div><div class="meta">Interface Notes - 112K views</div></div></div><div class="queue-card"><div class="mini-thumb"></div><div><div class="queue-title">Shorts shelf layout in CSS</div><div class="meta">Frontend Studio - 2 days ago</div></div></div></div></div>
<section><div class="section-label">01 - Color Palette</div><h2 class="section-heading">Red, black, white, and muted metadata grey</h2><p class="section-intro">YouTube Red is the brand/action accent. Google blue is only a rare account-link color and must not become the primary token.</p><div class="swatches"><div class="swatch"><div class="swatch-color" style="background:#ff0000"></div><div class="swatch-meta"><div class="swatch-name">yt-red</div><div class="swatch-hex">#ff0000</div><div class="swatch-role">Logo, subscribe emphasis, progress bar, live state.</div></div></div><div class="swatch"><div class="swatch-color" style="background:#0f0f0f"></div><div class="swatch-meta"><div class="swatch-name">dark-canvas</div><div class="swatch-hex">#0f0f0f</div><div class="swatch-role">Page background and watch surface.</div></div></div><div class="swatch"><div class="swatch-color" style="background:#212121"></div><div class="swatch-meta"><div class="swatch-name">raised-surface</div><div class="swatch-hex">#212121</div><div class="swatch-role">Search button, menus, panels, side surfaces.</div></div></div><div class="swatch"><div class="swatch-color" style="background:#303030"></div><div class="swatch-meta"><div class="swatch-name">outline</div><div class="swatch-hex">#303030</div><div class="swatch-role">Search border, dividers, chip boundaries.</div></div></div><div class="swatch"><div class="swatch-color" style="background:#f1f1f1"></div><div class="swatch-meta"><div class="swatch-name">text-primary</div><div class="swatch-hex">#f1f1f1</div><div class="swatch-role">Video titles and active foreground.</div></div></div><div class="swatch"><div class="swatch-color" style="background:#aaaaaa"></div><div class="swatch-meta"><div class="swatch-name">text-secondary</div><div class="swatch-hex">#aaaaaa</div><div class="swatch-role">Channel names, view counts, timestamps.</div></div></div></div></section>
<section><div class="section-label">02 - Typography</div><h2 class="section-heading">Roboto interface scale</h2><div class="type-row"><div class="type-meta"><strong>watch-title</strong>20px / 600 / 28px</div><div style="font-size:20px;font-weight:600;line-height:28px">Designing a better video experience</div></div><div class="type-row"><div class="type-meta"><strong>video-title</strong>16px / 500 / 22px</div><div style="font-size:16px;font-weight:500;line-height:22px">Inside the build process of a modern creator studio</div></div><div class="type-row"><div class="type-meta"><strong>metadata</strong>14px / 400 / 20px</div><div style="font-size:14px;color:var(--muted)">1.2M views - 3 days ago</div></div><div class="type-row"><div class="type-meta"><strong>caption</strong>12px / 400 / 18px</div><div style="font-size:12px;color:var(--muted)">Creator Studio</div></div></section>
<section><div class="section-label">03 - Video Grid Cards</div><h2 class="section-heading">Rounded thumbnails, avatar column, metadata stack</h2><div class="grid"><div class="video-card"><div class="thumb red"></div><div class="video-meta"><div class="avatar-sm"></div><div><div class="video-title">The visual language of YouTube</div><div class="meta">Kodo Design<br>241K views - 6 hours ago</div></div></div></div><div class="video-card"><div class="thumb blue"></div><div class="video-meta"><div class="avatar-sm"></div><div><div class="video-title">Search, chips, sidebars, and watch pages</div><div class="meta">Interface Notes<br>98K views - yesterday</div></div></div></div><div class="video-card"><div class="thumb green"></div><div class="video-meta"><div class="avatar-sm"></div><div><div class="video-title">How creators structure channel pages</div><div class="meta">Product Systems<br>1M views - 1 week ago</div></div></div></div></div></section>
<section><div class="section-label">04 - Shorts Shelf</div><h2 class="section-heading">Vertical cards with compact metadata</h2><div class="shorts"><div><div class="short-thumb"></div><div class="video-title">Short-form layout tokens</div><div class="meta">3.1M views</div></div><div><div class="short-thumb" style="background:linear-gradient(180deg,#7f1d1d,#111)"></div><div class="video-title">Red progress moments</div><div class="meta">890K views</div></div><div><div class="short-thumb" style="background:linear-gradient(180deg,#1f2937,#030712)"></div><div class="video-title">Creator card rhythm</div><div class="meta">421K views</div></div><div><div class="short-thumb" style="background:linear-gradient(180deg,#3f3f46,#0f0f0f)"></div><div class="video-title">Mobile-first shelf</div><div class="meta">2.4M views</div></div></div></section>
<section><div class="section-label">05 - Controls</div><h2 class="section-heading">Pill controls, segmented actions, and search</h2><div class="button-grid"><div class="component-cell"><div class="component-label">Subscribe</div><button class="yt-primary">Subscribe</button></div><div class="component-cell"><div class="component-label">Red action</div><button class="yt-red">Go live</button></div><div class="component-cell"><div class="component-label">Engagement</div><button class="yt-ghost">Like</button></div><div class="component-cell"><div class="component-label">Search field</div><div class="form-demo"><span>Search</span><button>Go</button></div></div></div></section>
<section><div class="section-label">06 - Spacing and Radius</div><h2 class="section-heading">Compact density with soft media corners</h2><div class="spacing-row"><div><div class="spacing-bar" style="width:4px"></div><div class="scale-label">4px</div></div><div><div class="spacing-bar" style="width:8px"></div><div class="scale-label">8px</div></div><div><div class="spacing-bar" style="width:12px"></div><div class="scale-label">12px</div></div><div><div class="spacing-bar" style="width:16px"></div><div class="scale-label">16px</div></div><div><div class="spacing-bar" style="width:24px"></div><div class="scale-label">24px</div></div></div><div class="radius-row" style="margin-top:28px"><div class="radius-block" style="border-radius:0">0 nav</div><div class="radius-block" style="border-radius:8px">8 chips</div><div class="radius-block" style="border-radius:12px">12 thumbs</div><div class="radius-block" style="border-radius:999px">pill</div></div></section>
</main></div><footer class="footer">Source: <code>{safe_source_url}</code>. YouTube profile generated from known product structure plus extracted page data. No blue primary token and no emoji glyphs.</footer>
</body>
</html>"""


async def _fetch_css(client: httpx.AsyncClient, base_url: str, html: str) -> tuple[str, int]:
    style_blocks = re.findall(r"<style[^>]*>(.*?)</style>", html, re.DOTALL | re.IGNORECASE)
    css_chunks = list(style_blocks)
    hrefs = re.findall(r"<link[^>]+rel=[\"'][^\"']*stylesheet[^\"']*[\"'][^>]*>", html, re.IGNORECASE)
    fetched = 0
    for tag in hrefs[:MAX_LINKED_CSS_FILES]:
        match = re.search(r"href=[\"']([^\"']+)[\"']", tag, re.IGNORECASE)
        if not match:
            continue
        css_url = urljoin(base_url, html_lib.unescape(match.group(1)))
        try:
            resp = await client.get(css_url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code < 400 and "text/css" in resp.headers.get("content-type", "text/css").lower():
                css_chunks.append(resp.text[:40_000])
                fetched += 1
        except Exception:
            continue
        if sum(len(chunk) for chunk in css_chunks) >= MAX_CSS_CHARS:
            break
    return "\n".join(css_chunks)[:MAX_CSS_CHARS], fetched


async def _ai_refine(
    url: str,
    html: str,
    css_text: str,
    palette: list[str],
    label: str,
    audit: dict[str, object],
    color_usage: list[dict[str, object]],
    typography: list[dict[str, object]],
    components: list[dict[str, object]],
) -> dict[str, object] | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from anthropic import AsyncAnthropic
    except Exception:
        return None

    audit_excerpt = json.dumps(
        {
            "page": audit.get("page") if isinstance(audit, dict) else {},
            "colorUsage": color_usage[:18],
            "typography": typography[:12],
            "components": components[:14],
        },
        ensure_ascii=True,
    )[:22000]
    prompt = f"""Analyze this website's extracted rendered design data and return ONLY valid JSON.
URL: {url}
Detected label: {label}
Detected palette: {palette}

Rendered audit excerpt:
{audit_excerpt}

CSS excerpt:
{css_text[:12000]}

HTML excerpt:
{html[:5000]}

Return exactly:
{{
  "label": "Brand Name",
  "colors": ["#bg", "#surface", "#text", "#muted", "#accent"],
  "displayFont": "Font Name, fallback, sans-serif",
  "bodyFont": "Font Name, fallback, sans-serif",
  "summary": "One detailed sentence describing the design aesthetic and the core interface rhythm.",
  "prompt": "Detailed Kodo design-system instructions. Include color roles with usage, typography sizes and weights, button styles, nav/search patterns, cards, containers, borders, radius, shadows, icons, forms, spacing, and rules to avoid generic output. Explicitly say not to use emojis."
}}"""

    try:
        client_ai = AsyncAnthropic(api_key=api_key)
        response = await client_ai.messages.create(
            model=os.getenv("KODO_DESIGN_EXTRACT_MODEL", "claude-3-5-haiku-latest"),
            max_tokens=2400,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


@router.post("/extract-theme")
async def extract_theme(body: ExtractThemeRequest):
    url = _normalize_url(body.url)
    browser_audit: dict[str, object] = {}
    known_profile = _known_site_profile(url)
    fetch_failed = False

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            page_html = resp.text[:MAX_HTML_CHARS]
            final_url = str(resp.url)
            css_text, linked_css_count = await _fetch_css(client, final_url, page_html)
    except HTTPException:
        raise
    except Exception as exc:
        if not known_profile:
            raise HTTPException(status_code=400, detail=f"Could not fetch URL: {exc}") from exc
        fetch_failed = True
        page_html = ""
        css_text = ""
        final_url = url
        linked_css_count = 0

    domain = urlparse(final_url).netloc.lstrip("www.")
    label = _brand_label(final_url, page_html)
    browser_result = None if fetch_failed else await _browser_audit(final_url)
    if isinstance(browser_result, dict):
        browser_audit = browser_result
        if str(browser_audit.get("title") or "").strip():
            label = _brand_label(final_url, f"<title>{html_lib.escape(str(browser_audit.get('title') or ''))}</title>" + page_html)
    css_variables = _extract_css_variables(css_text)
    extracted_colors = _extract_hex_colors(css_text + "\n" + page_html)
    color_usage = _summarize_color_usage(browser_audit, extracted_colors)
    colors = _pick_palette_from_usage(color_usage, extracted_colors)
    typography = _summarize_typography(browser_audit)
    components = _summarize_components(browser_audit)
    fonts = _extract_fonts(css_text, page_html)
    page_info = browser_audit.get("page") if isinstance(browser_audit.get("page"), dict) else {}
    if isinstance(page_info, dict) and page_info.get("fontFamily"):
        fonts = [str(page_info.get("fontFamily")), *fonts]
    font_faces = browser_audit.get("fontFaces") if isinstance(browser_audit.get("fontFaces"), list) else []
    for face in font_faces:
        if isinstance(face, dict) and face.get("family"):
            fonts.append(str(face.get("family")))
    if typography:
        fonts = [str(row.get("fontFamily") or "") for row in typography if row.get("fontFamily")] + fonts
    fonts = [font for font, _ in Counter(_font_from_css_stack(font) for font in fonts if font).most_common(6)]
    display_font = f"{fonts[0]}, system-ui, sans-serif" if fonts else "Inter, system-ui, sans-serif"
    body_font = f"{fonts[1]}, system-ui, sans-serif" if len(fonts) > 1 else display_font
    visible_roles = ", ".join(_top_values([str(row.get("role") or "") for row in components], 8))
    color_phrase = "; ".join(f"{row.get('value')} in {row.get('usage')}" for row in color_usage[:5])
    summary = (
        f"{label} uses a {('dark' if _luminance(colors[0]) < 0.18 else 'light')} interface with {colors[4]} as its primary accent, "
        f"{display_font.split(',')[0].strip()} typography, and observed component roles including {visible_roles or 'navigation, buttons, cards, and containers'}."
    )
    prompt = (
        f"Use {label}'s extracted design system from {final_url}. "
        f"Core palette: background {colors[0]}, surface {colors[1]}, text {colors[2]}, muted {colors[3]}, accent {colors[4]}. "
        f"Observed color usage: {color_phrase}. "
        f"Typography: display {display_font}; body {body_font}; preserve observed font sizes, weights, line heights, and letter spacing from the token groups. "
        "Recreate the source's navigation, search or command controls, button hierarchy, cards, containers, badges, icons, inputs, borders, border radius, shadows, spacing density, and section rhythm. "
        "When generating a live preview, include a detailed design-system showcase with palette, typography scale, buttons, cards, forms, containers, tokens, and usage notes. "
        "Do not use emojis. Use real text labels or simple icon primitives instead."
    )

    known_profile = _known_site_profile(final_url) or known_profile
    profile_preview_html = ""
    extraction_mode = "browser-computed-styles" if browser_audit else "static-css"
    if known_profile:
        label = _strip_emoji(str(known_profile.get("label") or label))
        profile_colors = known_profile.get("colors")
        if isinstance(profile_colors, list) and len(profile_colors) >= 5:
            colors = [str(value) for value in profile_colors[:5]]
        display_font = str(known_profile.get("displayFont") or display_font)
        body_font = str(known_profile.get("bodyFont") or body_font)
        summary = _strip_emoji(str(known_profile.get("summary") or summary))
        prompt = _strip_emoji(str(known_profile.get("prompt") or prompt))
        profile_color_usage = known_profile.get("color_usage")
        if isinstance(profile_color_usage, list) and profile_color_usage:
            color_usage = [row for row in profile_color_usage if isinstance(row, dict)]
        profile_typography = known_profile.get("typography")
        if isinstance(profile_typography, list) and profile_typography:
            typography = [row for row in profile_typography if isinstance(row, dict)]
        profile_components = known_profile.get("components")
        if isinstance(profile_components, list) and profile_components:
            components = [row for row in profile_components if isinstance(row, dict)]
        profile_variables = known_profile.get("css_variables")
        if isinstance(profile_variables, dict):
            css_variables = {**css_variables, **{str(key): str(value) for key, value in profile_variables.items()}}
        profile_preview = known_profile.get("livePreviewHtml")
        if isinstance(profile_preview, str) and profile_preview.strip():
            profile_preview_html = profile_preview
        extraction_mode = "known-site-profile+browser-computed-styles" if browser_audit else "known-site-profile"
    else:
        refined = await _ai_refine(final_url, page_html, css_text, colors, label, browser_audit, color_usage, typography, components)
        if refined:
            label = _strip_emoji(str(refined.get("label") or label))
            refined_colors = refined.get("colors")
            if isinstance(refined_colors, list) and len(refined_colors) >= 5:
                colors = [str(value) for value in refined_colors[:5]]
            display_font = str(refined.get("displayFont") or display_font)
            body_font = str(refined.get("bodyFont") or body_font)
            summary = _strip_emoji(str(refined.get("summary") or summary))
            prompt = _strip_emoji(str(refined.get("prompt") or prompt))
            if "emoji" not in prompt.lower():
                prompt += " Do not use emojis."
        else:
            label = _strip_emoji(label)
            summary = _strip_emoji(summary)
            prompt = _strip_emoji(prompt)

    token_groups = _build_token_groups(
        colors=colors,
        display_font=display_font,
        body_font=body_font,
        css_variables=css_variables,
        color_usage=color_usage,
        typography=typography,
        components=components,
    )
    live_preview_html = profile_preview_html or _build_preview_html(
        label,
        "My Design Systems",
        colors,
        display_font,
        body_font,
        summary,
        color_usage=color_usage,
        typography=typography,
        components=components,
        browser_audit=browser_audit,
        source_url=final_url,
    )
    stable_id = hashlib.sha1(final_url.encode("utf-8")).hexdigest()[:12]

    return {
        "id": f"user-{stable_id}",
        "label": label,
        "category": "My Design Systems",
        "colors": colors[:5],
        "displayFont": display_font,
        "bodyFont": body_font,
        "summary": summary,
        "prompt": prompt,
        "logoUrl": f"https://www.google.com/s2/favicons?domain={domain}&sz=64",
        "sourceUrl": final_url,
        "livePreviewHtml": live_preview_html,
        "tokenGroups": token_groups,
        "extractedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "extraction": {
            "generator": "kodo-design-extract",
            "mode": extraction_mode,
            "profile": label.lower(),
            "cssVarCount": len(css_variables),
            "sourceCssFiles": linked_css_count,
            "sourceStyleBlocks": len(re.findall(r"<style[^>]*>", page_html, re.IGNORECASE)),
            "colorCount": len(color_usage),
            "typographyCount": len(typography),
            "componentCount": len(components),
        },
    }
