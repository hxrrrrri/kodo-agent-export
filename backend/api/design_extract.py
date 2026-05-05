from __future__ import annotations

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


def _extract_css_variables(css_text: str) -> dict[str, str]:
    variables: dict[str, str] = {}
    for name, value in re.findall(r"(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)", css_text):
        clean = value.strip()
        if clean and len(variables) < 80:
            variables[name] = clean
    return variables


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
) -> list[dict[str, object]]:
    groups: list[dict[str, object]] = [
        {
            "label": "Color Palette",
            "tokens": [
                {"name": "--color-bg", "value": colors[0], "description": "Extracted page background"},
                {"name": "--color-surface", "value": colors[1], "description": "Card or panel surface"},
                {"name": "--color-text", "value": colors[2], "description": "Primary readable text"},
                {"name": "--color-muted", "value": colors[3], "description": "Secondary text"},
                {"name": "--color-accent", "value": colors[4], "description": "Brand action color"},
            ],
        },
        {
            "label": "Typography",
            "tokens": [
                {"name": "--font-display", "value": display_font.split(",")[0].strip(), "description": "Display and headline family"},
                {"name": "--font-body", "value": body_font.split(",")[0].strip(), "description": "Body and UI family"},
                {"name": "--font-size-display", "value": "48-72px", "description": "Recommended hero scale"},
                {"name": "--font-size-body", "value": "15-16px", "description": "Recommended body text"},
            ],
        },
    ]
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


def _build_preview_html(label: str, category: str, colors: list[str], display_font: str, body_font: str, summary: str) -> str:
    bg, surface, text, muted, accent = [html_lib.escape(value) for value in colors]
    safe_label = html_lib.escape(label)
    short_name = safe_label.split(" ")[0]
    safe_summary = html_lib.escape(summary)
    display = html_lib.escape(display_font)
    body = html_lib.escape(body_font)
    button_text = "#000000" if _luminance(colors[4]) > 0.35 else "#ffffff"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{{box-sizing:border-box}}body{{margin:0;background:{bg};color:{text};font-family:{body};min-height:100vh}}
.nav{{height:64px;display:flex;align-items:center;gap:28px;padding:0 42px;border-bottom:1px solid color-mix(in srgb,{muted} 24%,transparent);background:{bg}}}
.mark{{width:34px;height:34px;border-radius:10px;background:{accent};display:grid;place-items:center;color:{button_text};font-weight:900;font-family:{display}}}
.brand{{font:800 17px/1 {display};letter-spacing:-.02em}}.links{{display:flex;gap:22px;margin-left:12px;color:{muted};font-size:14px}}.cta{{margin-left:auto;background:{accent};color:{button_text};border:0;border-radius:10px;padding:10px 16px;font-weight:800}}
.hero{{padding:72px 42px 64px;max-width:920px}}.eyebrow{{color:{accent};font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:900;margin-bottom:18px}}
h1{{font:900 clamp(42px,7vw,82px)/.95 {display};letter-spacing:-.05em;margin:0 0 22px}}p{{color:{muted};font-size:18px;line-height:1.6;max-width:620px;margin:0 0 34px}}
.actions{{display:flex;gap:12px;flex-wrap:wrap}}.primary{{background:{accent};color:{button_text};border:0;border-radius:12px;padding:15px 22px;font-weight:900}}.secondary{{background:transparent;color:{text};border:1px solid color-mix(in srgb,{muted} 38%,transparent);border-radius:12px;padding:14px 20px;font-weight:700}}
.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:0 42px 56px}}.card{{background:{surface};border:1px solid color-mix(in srgb,{muted} 24%,transparent);border-radius:14px;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,.08)}}.k{{color:{accent};font-weight:900;margin-bottom:9px}}.v{{font-weight:800;margin-bottom:7px}}.d{{color:{muted};font-size:14px;line-height:1.55}}
@media(max-width:760px){{.links{{display:none}}.grid{{grid-template-columns:1fr}}.nav,.hero,.grid{{padding-left:22px;padding-right:22px}}}}
</style>
</head>
<body>
<div class="nav"><div class="mark">{short_name[:1]}</div><div class="brand">{safe_label}</div><div class="links"><span>Product</span><span>Showcase</span><span>Tokens</span></div><button class="cta">Get started</button></div>
<main><section class="hero"><div class="eyebrow">{html_lib.escape(category)}</div><h1>{safe_label} design language, extracted into Kodo.</h1><p>{safe_summary}</p><div class="actions"><button class="primary">Use this system</button><button class="secondary">View tokens</button></div></section>
<section class="grid"><div class="card"><div class="k">01</div><div class="v">Palette</div><div class="d">Background, surface, text, muted, and accent roles are ready for Kodo prompts.</div></div><div class="card"><div class="k">02</div><div class="v">Typography</div><div class="d">Display and body families were inferred from the source CSS and markup.</div></div><div class="card"><div class="k">03</div><div class="v">Tokens</div><div class="d">CSS variables and extracted values are preserved for the modal token browser.</div></div></section></main>
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


async def _ai_refine(url: str, html: str, css_text: str, palette: list[str], label: str) -> dict[str, object] | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from anthropic import AsyncAnthropic
    except Exception:
        return None

    prompt = f"""Analyze this website's extracted CSS and return ONLY valid JSON.
URL: {url}
Detected label: {label}
Detected palette: {palette}

CSS excerpt:
{css_text[:18000]}

HTML excerpt:
{html[:6000]}

Return exactly:
{{
  "label": "Brand Name",
  "colors": ["#bg", "#surface", "#text", "#muted", "#accent"],
  "displayFont": "Font Name, fallback, sans-serif",
  "bodyFont": "Font Name, fallback, sans-serif",
  "summary": "One sentence describing the design aesthetic.",
  "prompt": "2-3 sentences of Kodo design instructions based on this source."
}}"""

    try:
        client_ai = AsyncAnthropic(api_key=api_key)
        response = await client_ai.messages.create(
            model=os.getenv("KODO_DESIGN_EXTRACT_MODEL", "claude-3-5-haiku-latest"),
            max_tokens=1024,
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
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {exc}") from exc

    domain = urlparse(final_url).netloc.lstrip("www.")
    label = _brand_label(final_url, page_html)
    css_variables = _extract_css_variables(css_text)
    extracted_colors = _extract_hex_colors(css_text + "\n" + page_html)
    colors = _pick_palette(extracted_colors)
    fonts = _extract_fonts(css_text, page_html)
    display_font = f"{fonts[0]}, system-ui, sans-serif" if fonts else "Inter, system-ui, sans-serif"
    body_font = f"{fonts[1]}, system-ui, sans-serif" if len(fonts) > 1 else display_font
    summary = f"{label} uses a {('dark' if _luminance(colors[0]) < 0.18 else 'light')} interface with {colors[4]} as its primary accent."
    prompt = (
        f"Use {label}'s extracted palette, typography, and interface rhythm. "
        "Build with the same background, surface, text, muted, and accent roles; keep cards, CTAs, and navigation visually consistent with the source."
    )

    refined = await _ai_refine(final_url, page_html, css_text, colors, label)
    if refined:
        label = str(refined.get("label") or label)
        refined_colors = refined.get("colors")
        if isinstance(refined_colors, list) and len(refined_colors) >= 5:
            colors = [str(value) for value in refined_colors[:5]]
        display_font = str(refined.get("displayFont") or display_font)
        body_font = str(refined.get("bodyFont") or body_font)
        summary = str(refined.get("summary") or summary)
        prompt = str(refined.get("prompt") or prompt)

    token_groups = _build_token_groups(
        colors=colors,
        display_font=display_font,
        body_font=body_font,
        css_variables=css_variables,
    )
    live_preview_html = _build_preview_html(label, "My Design Systems", colors, display_font, body_font, summary)
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
            "cssVarCount": len(css_variables),
            "sourceCssFiles": linked_css_count,
            "sourceStyleBlocks": len(re.findall(r"<style[^>]*>", page_html, re.IGNORECASE)),
        },
    }
