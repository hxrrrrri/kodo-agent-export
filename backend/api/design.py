import asyncio
import tempfile
import re
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api/design", tags=["design"])

MAX_HTML_CHARS = 1_500_000

_DESIGN_SYSTEMS_DIR = Path(__file__).parent.parent / "skills" / "bundled" / "design-systems"
_DESIGN_SYSTEM_DOC_MAX_CHARS = 24_000

# Maps preset IDs to MD filenames (without .md extension).
# Preset IDs that aren't listed here use the preset ID directly as the filename.
_PRESET_ID_TO_DOC: dict[str, str] = {
    "claude-warm": "claude",
    "mistral-ai": "mistral-ai",
    "elevenlabs-audio": "elevenlabs",
    "ollama-local": "ollama",
    "together-ai": "together-ai",
    "opencode-ai": "opencode-ai",
    "minimax-ai": "minimax",
    "cohere-enterprise": "cohere",
    "xai-mono": "x-ai",
    "linear-minimal": "linear-app",
    "vercel-mono": "vercel",
    "cursor-agentic": "cursor",
    "supabase-dev": "supabase",
    "raycast-command": "raycast",
    "warp-terminal": "warp",
    "expo-platform": "expo",
    "hashicorp-infra": "hashicorp",
    "sentry-ops": "sentry",
    "mintlify-docs": "mintlify",
    "resend-email": "resend",
    "replicate-ml": "replicate",
    "composio-dev": "composio",
    "posthog-analytics": "posthog",
    "stripe-gradient": "stripe",
    "coinbase-crypto": "coinbase",
    "revolut-finance": "revolut",
    "wise-fintech": "wise",
    "binance-crypto": "binance",
    "mastercard-brand": "mastercard",
    "kraken-exchange": "kraken",
    "apple-glass": "apple",
    "airbnb-warm": "airbnb",
    "spotify-audio": "spotify",
    "nike-performance": "nike",
    "starbucks-brand": "starbucks",
    "meta-store": "meta",
    "tesla-product": "tesla",
    "bmw-premium": "bmw",
    "bmw-m-sport": "bmw-m",
    "ferrari-red": "ferrari",
    "lamborghini-hex": "lamborghini",
    "bugatti-mono": "bugatti",
    "renault-aurora": "renault",
    "spacex-stark": "spacex",
    "figma-creative": "figma",
    "framer-motion": "framer",
    "webflow-creator": "webflow",
    "miro-workshop": "miro",
    "airtable-db": "airtable",
    "clay-agency": "clay",
    "theverge-editorial": "theverge",
    "wired-magazine": "wired",
    "ibm-carbon": "ibm",
    "intercom-friendly": "intercom",
    "superhuman-email": "superhuman",
    "nvidia-ai": "nvidia",
    "playstation-dark": "playstation",
    "mongodb-db": "mongodb",
    "sanity-cms": "sanity",
    "lovable-builder": "lovable",
    "clickhouse-db": "clickhouse",
    "vodafone-brand": "vodafone",
    "notion-editorial": "notion",
    "cal-scheduling": "cal",
    "zapier-orange": "zapier",
    "runwayml-cinematic": "runwayml",
    "shopify-commerce": "shopify",
    "pinterest-discovery": "pinterest",
    "duolingo-playful": "duolingo",
}


_CATEGORY_BY_DOC: dict[str, str] = {
    **{key: "AI & LLM" for key in ("claude", "openai-research", "anthropic-editorial", "huggingface-community", "deepseek-tech", "mistral-ai", "elevenlabs", "ollama", "together-ai", "opencode-ai", "minimax", "cohere", "x-ai", "voltagent")},
    **{key: "Developer Tools" for key in ("linear-app", "vercel", "cursor", "supabase", "github-utility", "raycast", "warp", "expo", "hashicorp", "sentry", "mintlify", "resend", "replicate", "composio", "posthog")},
    **{key: "Fintech" for key in ("stripe", "coinbase", "revolut", "wise", "binance", "mastercard", "kraken", "fintech-dark")},
    **{key: "Consumer" for key in ("apple", "airbnb", "spotify", "nike", "starbucks", "meta", "netflix-streaming", "discord-community", "dropbox-work", "loom-video", "mailchimp-friendly", "xiaohongshu-social", "amazon-commerce", "pinterest", "shopify")},
    **{key: "Automotive" for key in ("tesla", "bmw", "bmw-m", "ferrari", "lamborghini", "bugatti", "porsche-precision", "mercedes-luxury", "renault", "spacex")},
    **{key: "Design Tools" for key in ("figma", "framer", "webflow", "canva-playful", "miro", "airtable", "clay", "shadcn-system", "lovable", "cal", "zapier", "sanity")},
    **{key: "Publishing" for key in ("theverge", "wired", "magazine-bold", "japanese-minimal", "substack-newsletter")},
    **{key: "Enterprise" for key in ("ibm", "intercom", "atlassian-team", "material-google", "microsoft-fluent", "salesforce-crm", "superhuman", "hubspot-marketing", "pagerduty-incident", "datadog-ops", "vodafone", "mongodb", "clickhouse")},
    **{key: "Platform" for key in ("nvidia", "playstation")},
    **{key: "Styles" for key in ("neo-brutal", "neobrutalism", "glassmorphism", "claymorphism", "retro-80s", "cosmic-space", "luxury-premium", "cyberpunk-neon", "warmth-organic")},
}


def _clean_text(value: str) -> str:
    value = value.replace("\ufffd", "")
    value = re.sub(r"[\u2010-\u2015]", "-", value)
    return re.sub(r"\s+", " ", value).strip()


def _label_from_slug(slug: str) -> str:
    special = {
        "x-ai": "xAI",
        "bmw-m": "BMW M",
        "ibm": "IBM",
        "nvidia": "NVIDIA",
        "shadcn-system": "shadcn/ui",
        "theverge": "The Verge",
    }
    if slug in special:
        return special[slug]
    return " ".join(part.upper() if part in {"ai", "ui", "crm", "cms", "db"} else part.capitalize() for part in slug.split("-"))


def _read_frontmatter(text: str) -> tuple[dict[str, object], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    raw = text[3:end]
    body = text[end + 4 :]
    meta: dict[str, object] = {}
    current: str | None = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        if re.match(r"^[A-Za-z0-9_-]+:", line):
            key, val = line.split(":", 1)
            current = key.strip()
            val = val.strip()
            meta[current] = val.strip('"') if val else {}
        elif current and isinstance(meta.get(current), dict):
            match = re.match(r'\s+([A-Za-z0-9_-]+):\s*"?([^"]+)"?\s*$', line)
            if match:
                meta[current][match.group(1).lower()] = match.group(2).strip().strip('"')  # type: ignore[index]
    return meta, body


def _contrast_safe_palette(meta: dict[str, object], text: str) -> list[str]:
    colors = meta.get("colors") if isinstance(meta.get("colors"), dict) else {}
    color_map = {str(k).lower(): str(v).strip().strip('"') for k, v in dict(colors).items()}
    hexes = [match.group(0).lower()[:7] for match in re.finditer(r"#[0-9a-fA-F]{6}", text)]

    def pick(*keys: str) -> str | None:
        for key in keys:
            val = color_map.get(key)
            if val and re.match(r"^#[0-9a-fA-F]{6}", val):
                return val[:7].lower()
        return None

    bg = pick("canvas", "background", "bg") or (hexes[0] if hexes else "#fafafa")
    surface = pick("surface-card", "surface", "surface-soft", "surface-elevated") or (hexes[1] if len(hexes) > 1 else "#ffffff")
    text_color = pick("ink", "text", "text-primary", "body-strong", "body") or "#111111"
    muted = pick("muted", "muted-soft", "body", "text-secondary") or "#6b7280"
    accent = pick("primary", "accent", "brand", "brand-primary", "cta", "blue", "green", "red")
    if accent in {"#ffffff", "#000000", "#111111"}:
        accent = pick("bmw-blue", "m-blue-dark", "electric-blue", "primary-active", "accent-blue") or accent
    if not accent:
        accent = next((h for h in hexes if h not in {bg, surface, text_color, muted}), text_color)

    # A small server-side guard so search/apply swatches do not encode unreadable text.
    def luminance(hex_value: str) -> float:
        rgb = tuple(int(hex_value.lstrip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4))
        vals = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]

    def contrast(a: str, b: str) -> float:
        hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
        return (hi + 0.05) / (lo + 0.05)

    if contrast(text_color, bg) < 4.5:
        text_color = "#ffffff" if contrast("#ffffff", bg) >= contrast("#111111", bg) else "#111111"
    if contrast(text_color, surface) < 4.5:
        surface = "#ffffff" if contrast(text_color, "#ffffff") >= 4.5 else "#1a1a1a"
    if contrast(muted, bg) < 3:
        muted = "#a3a3a3" if luminance(bg) < 0.3 else "#6b7280"
    if "netflix" in text.lower()[:2000]:
        return ["#141414", "#1f1f1f", "#e5e5e5", "#808080", "#e50914"]
    if "uber" in text.lower()[:2000]:
        return ["#ffffff", "#f3f3f3", "#000000", "#4b4b4b", "#000000"]
    return [bg, surface, text_color, muted, accent]


def _design_system_options() -> list[dict[str, object]]:
    presets: list[dict[str, object]] = []
    priority = ["claude", "netflix-streaming", "bmw-m", "openai-research", "anthropic-editorial", "linear-app", "vercel", "stripe", "apple", "airbnb"]
    rank = {slug: index for index, slug in enumerate(priority)}
    for doc_path in sorted(_DESIGN_SYSTEMS_DIR.glob("*.md")):
        slug = doc_path.stem
        text = doc_path.read_text(encoding="utf-8", errors="replace")
        meta, body = _read_frontmatter(text)
        label = _clean_text(str(meta.get("name") or "")) or _label_from_slug(slug)
        description = _clean_text(str(meta.get("description") or ""))
        if not description:
            paragraphs = [_clean_text(part) for part in re.split(r"\n\s*\n", body) if _clean_text(part) and not _clean_text(part).startswith("#")]
            description = paragraphs[0] if paragraphs else f"{label} design system from bundled Kodo documentation."
        presets.append(
            {
                "id": slug,
                "label": label,
                "category": _CATEGORY_BY_DOC.get(slug, "Design Systems"),
                "colors": _contrast_safe_palette(meta, text),
                "summary": description[:220] + ("..." if len(description) > 220 else ""),
            }
        )
    presets.sort(key=lambda item: (rank.get(str(item["id"]), 999), str(item["category"]), str(item["label"]).lower()))
    return presets


class RenderRequest(BaseModel):
    html: str = Field(min_length=1, max_length=MAX_HTML_CHARS)
    format: Literal["png", "pdf"] = "png"
    width: int = Field(default=1440, ge=320, le=3840)
    height: int = Field(default=1000, ge=320, le=4000)
    wait_ms: int = Field(default=700, ge=0, le=10000)
    full_page: bool = True


class ExportManifestRequest(BaseModel):
    html_file: str = "index.html"
    duration_seconds: int = Field(default=20, ge=1, le=600)
    width: int = Field(default=1920, ge=320, le=3840)
    height: int = Field(default=1080, ge=320, le=2160)


def _render_with_playwright_sync(body: RenderRequest) -> tuple[bytes, str]:
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Playwright is required for design rendering. Install it with "
                "`pip install playwright` and run `playwright install chromium`."
            ),
        ) from exc

    with tempfile.TemporaryDirectory(prefix="kodo-design-render-") as tmp:
        html_path = Path(tmp) / "artifact.html"
        html_path.write_text(body.html, encoding="utf-8")

        with sync_playwright() as p:
            try:
                browser = p.chromium.launch()
            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Chromium is required for design rendering. Run "
                        "`python -m playwright install chromium` in the backend environment."
                    ),
                ) from exc
            try:
                page = browser.new_page(viewport={"width": body.width, "height": body.height})
                page.goto(html_path.as_uri(), wait_until="networkidle")
                if body.wait_ms:
                    page.wait_for_timeout(body.wait_ms)

                if body.format == "pdf":
                    data = page.pdf(
                        width=f"{body.width}px",
                        height=f"{body.height}px",
                        print_background=True,
                        prefer_css_page_size=True,
                    )
                    return data, "application/pdf"

                data = page.screenshot(type="png", full_page=body.full_page)
                return data, "image/png"
            finally:
                browser.close()


async def _render_with_playwright(body: RenderRequest) -> tuple[bytes, str]:
    return await asyncio.to_thread(_render_with_playwright_sync, body)


@router.post("/render")
async def render_design(body: RenderRequest):
    data, media_type = await _render_with_playwright(body)
    suffix = "pdf" if body.format == "pdf" else "png"
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="kodo-design.{suffix}"'},
    )


@router.post("/export-manifest")
async def export_manifest(body: ExportManifestRequest):
    html = body.html_file
    duration = body.duration_seconds
    width = body.width
    height = body.height
    return {
        "html_file": html,
        "outputs": {
            "png": {
                "endpoint": "/api/design/render",
                "body": {"format": "png", "width": width, "height": height, "full_page": True},
            },
            "pdf": {
                "endpoint": "/api/design/render",
                "body": {"format": "pdf", "width": width, "height": height},
            },
            "mp4": {
                "requires": ["node", "playwright", "ffmpeg"],
                "command": f"node scripts/render-video.js {html} --duration={duration} --width={width} --height={height}",
            },
            "gif": {
                "requires": ["ffmpeg"],
                "command": "scripts/convert-formats.sh <generated.mp4>",
            },
            "pptx": {
                "requires": ["node", "pptxgenjs", "playwright", "sharp"],
                "command": f"node scripts/export_deck_pptx.mjs {html}",
            },
        },
        "notes": [
            "PNG and PDF can be rendered through Kodo when Playwright is installed.",
            "MP4, GIF, and PPTX use the Huashu-compatible local toolchain and expect the generated HTML file to exist on disk.",
        ],
    }


@router.get("/modes")
async def design_modes():
    return {
        "modes": [
            {"id": "web", "label": "Web Design"},
            {"id": "app", "label": "App Prototype"},
            {"id": "deck", "label": "Slide Deck"},
            {"id": "motion", "label": "Motion"},
            {"id": "infographic", "label": "Infographic"},
            {"id": "critique", "label": "Critique"},
        ]
    }


@router.get("/options")
async def design_options():
    return {
        "fidelity": [
            {"id": "wireframe", "label": "Wireframe"},
            {"id": "high-fidelity", "label": "High fidelity"},
            {"id": "production", "label": "Production polish"},
        ],
        "directions": [
            {"id": "auto", "label": "Auto"},
            {"id": "editorial-monocle", "label": "Editorial Monocle", "colors": ["#f7f1e7", "#ffffff", "#211f1a", "#b4532d"]},
            {"id": "modern-minimal", "label": "Modern Minimal", "colors": ["#ffffff", "#f8fafc", "#111827", "#4f46e5"]},
            {"id": "warm-soft", "label": "Warm Soft", "colors": ["#fbf4ea", "#fffaf3", "#271f1b", "#c75f3f"]},
            {"id": "tech-utility", "label": "Tech Utility", "colors": ["#f8fafc", "#ffffff", "#111827", "#16a34a"]},
            {"id": "brutalist-experimental", "label": "Brutalist Experimental", "colors": ["#fffdf2", "#ffffff", "#111111", "#ff3b00"]},
        ],
        "surfaces": [
            "auto",
            "saas-landing",
            "dashboard",
            "pricing",
            "docs",
            "blog",
            "commerce",
            "portfolio",
            "mobile-onboarding",
            "email",
            "social-carousel",
            "poster",
            "admin-tool",
        ],
        "deviceFrames": [
            "auto",
            "none",
            "iphone-15-pro",
            "android-pixel",
            "ipad-pro",
            "macbook",
            "browser-chrome",
        ],
        "designSystems": _design_system_options(),

    }


@router.get("/system-doc/{preset_id}")
async def design_system_doc(preset_id: str):
    """Return the design system markdown documentation for a preset ID.

    Used by the design studio to inject rich design-system context into generation prompts.
    Returns a substantial excerpt from the document.
    """
    # Sanitize to prevent path traversal
    safe_id = preset_id.strip().lower()
    if not safe_id or any(ch in safe_id for ch in ("/", "\\", "..", "\x00")):
        raise HTTPException(status_code=400, detail="Invalid preset ID")

    doc_slug = _PRESET_ID_TO_DOC.get(safe_id, safe_id)
    doc_path = _DESIGN_SYSTEMS_DIR / f"{doc_slug}.md"

    if not doc_path.exists() or not doc_path.is_file():
        raise HTTPException(status_code=404, detail=f"No design system doc found for '{preset_id}'")

    content = doc_path.read_text(encoding="utf-8")
    # Include enough source material for model families that need explicit tokens,
    # component rules, and readability guidance from the selected system.
    return {"preset_id": preset_id, "doc_slug": doc_slug, "content": content[:_DESIGN_SYSTEM_DOC_MAX_CHARS]}
