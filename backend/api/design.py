import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api/design", tags=["design"])

MAX_HTML_CHARS = 1_500_000


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


async def _render_with_playwright(body: RenderRequest) -> tuple[bytes, str]:
    try:
        from playwright.async_api import async_playwright  # type: ignore
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

        async with async_playwright() as p:
            browser = await p.chromium.launch()
            try:
                page = await browser.new_page(viewport={"width": body.width, "height": body.height})
                await page.goto(html_path.as_uri(), wait_until="networkidle")
                if body.wait_ms:
                    await page.wait_for_timeout(body.wait_ms)

                if body.format == "pdf":
                    data = await page.pdf(
                        width=f"{body.width}px",
                        height=f"{body.height}px",
                        print_background=True,
                        prefer_css_page_size=True,
                    )
                    return data, "application/pdf"

                data = await page.screenshot(type="png", full_page=body.full_page)
                return data, "image/png"
            finally:
                await browser.close()


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
        "designSystems": [
            {"id": "neutral-modern", "label": "Neutral Modern", "category": "Starter", "colors": ["#fafafa", "#ffffff", "#111827", "#6b7280", "#2563eb"]},
            {"id": "claude-warm", "label": "Claude Warm Editorial", "category": "AI & LLM", "colors": ["#f5f4ed", "#faf9f5", "#141413", "#5e5d59", "#c96442"]},
            {"id": "linear-minimal", "label": "Linear Minimal", "category": "Developer Tools", "colors": ["#fbfbfc", "#ffffff", "#171717", "#737373", "#5e6ad2"]},
            {"id": "vercel-mono", "label": "Vercel Mono", "category": "Developer Tools", "colors": ["#ffffff", "#fafafa", "#000000", "#666666", "#000000"]},
            {"id": "stripe-gradient", "label": "Stripe Product", "category": "Fintech", "colors": ["#f6f9fc", "#ffffff", "#0a2540", "#425466", "#635bff"]},
            {"id": "apple-glass", "label": "Apple Glass", "category": "Consumer", "colors": ["#f5f5f7", "#ffffff", "#1d1d1f", "#6e6e73", "#0071e3"]},
            {"id": "airbnb-warm", "label": "Airbnb Warm", "category": "Marketplace", "colors": ["#fff8f6", "#ffffff", "#222222", "#717171", "#ff385c"]},
            {"id": "notion-editorial", "label": "Notion Editorial", "category": "Productivity", "colors": ["#fbfbfa", "#ffffff", "#2f3437", "#787774", "#2383e2"]},
            {"id": "supabase-dev", "label": "Supabase Dev", "category": "Backend & Data", "colors": ["#0f1512", "#151f1a", "#f8fafc", "#8b949e", "#3ecf8e"]},
            {"id": "figma-creative", "label": "Figma Creative", "category": "Design Tools", "colors": ["#ffffff", "#f5f5f5", "#1f1f1f", "#6b7280", "#a259ff"]},
            {"id": "github-utility", "label": "GitHub Utility", "category": "Developer Tools", "colors": ["#0d1117", "#161b22", "#f0f6fc", "#8b949e", "#2f81f7"]},
            {"id": "shopify-commerce", "label": "Shopify Commerce", "category": "Commerce", "colors": ["#f3f6ef", "#ffffff", "#1f2d1f", "#60705c", "#008060"]},
            {"id": "magazine-bold", "label": "Magazine Bold", "category": "Editorial", "colors": ["#f8f1e8", "#fffaf2", "#111111", "#6a5b4f", "#d13f22"]},
            {"id": "neo-brutal", "label": "Neo Brutal", "category": "Experimental", "colors": ["#fffdf2", "#ffffff", "#111111", "#333333", "#ff4d00"]},
            {"id": "luxury-premium", "label": "Luxury Premium", "category": "Luxury", "colors": ["#0b0a08", "#17130f", "#f7efe4", "#b7a58d", "#c8a45d"]},
            {"id": "japanese-minimal", "label": "Japanese Minimal", "category": "Editorial", "colors": ["#f7f3ea", "#fffdf8", "#20201d", "#706a60", "#9b2c1f"]},
            {"id": "cyberpunk-neon", "label": "Cyberpunk Neon", "category": "Futuristic", "colors": ["#070812", "#111827", "#e5faff", "#7dd3fc", "#00f5d4"]},
            {"id": "openai-research", "label": "OpenAI Research", "category": "AI & LLM", "colors": ["#f7f7f2", "#ffffff", "#111111", "#6b6962", "#10a37f"]},
            {"id": "anthropic-editorial", "label": "Anthropic Editorial", "category": "AI & LLM", "colors": ["#f3efe7", "#fbfaf7", "#191714", "#6f6860", "#d97757"]},
            {"id": "cursor-agentic", "label": "Cursor Agentic", "category": "Developer Tools", "colors": ["#0c0d10", "#15171c", "#f4f4f5", "#9ca3af", "#7c3aed"]},
            {"id": "raycast-command", "label": "Raycast Command", "category": "Productivity", "colors": ["#111113", "#1c1c21", "#f5f5f7", "#a1a1aa", "#ff6363"]},
            {"id": "webflow-creator", "label": "Webflow Creator", "category": "Design Tools", "colors": ["#0b0d18", "#111827", "#f8fafc", "#94a3b8", "#4353ff"]},
            {"id": "canva-playful", "label": "Canva Playful", "category": "Design Tools", "colors": ["#f8fbff", "#ffffff", "#1f2937", "#64748b", "#00c4cc"]},
            {"id": "miro-workshop", "label": "Miro Workshop", "category": "Collaboration", "colors": ["#fff8d8", "#ffffff", "#1f2937", "#6b7280", "#ffd02f"]},
            {"id": "framer-motion", "label": "Framer Motion", "category": "Design Tools", "colors": ["#050506", "#111116", "#f6f7fb", "#9ca3af", "#0099ff"]},
            {"id": "spotify-audio", "label": "Spotify Audio", "category": "Media", "colors": ["#0b0b0b", "#181818", "#ffffff", "#b3b3b3", "#1db954"]},
            {"id": "pinterest-discovery", "label": "Pinterest Discovery", "category": "Social & Media", "colors": ["#ffffff", "#f7f7f7", "#111111", "#767676", "#e60023"]},
            {"id": "nike-performance", "label": "Nike Performance", "category": "Consumer", "colors": ["#f5f5f5", "#ffffff", "#111111", "#666666", "#fa5400"]},
            {"id": "tesla-product", "label": "Tesla Product", "category": "Automotive", "colors": ["#f4f4f4", "#ffffff", "#171a20", "#5c5e62", "#e82127"]},
            {"id": "bmw-premium", "label": "BMW Premium", "category": "Automotive", "colors": ["#f6f7f8", "#ffffff", "#101820", "#6b7280", "#1c69d4"]},
            {"id": "nvidia-ai", "label": "NVIDIA AI", "category": "Enterprise AI", "colors": ["#0b0f0a", "#111a10", "#f7fee7", "#9ca3af", "#76b900"]},
            {"id": "ibm-carbon", "label": "IBM Carbon", "category": "Enterprise", "colors": ["#f4f4f4", "#ffffff", "#161616", "#6f6f6f", "#0f62fe"]},
            {"id": "material-google", "label": "Google Material", "category": "Platform", "colors": ["#f8fafd", "#ffffff", "#1f1f1f", "#5f6368", "#1a73e8"]},
            {"id": "microsoft-fluent", "label": "Microsoft Fluent", "category": "Platform", "colors": ["#f5f5f5", "#ffffff", "#1b1a19", "#605e5c", "#0078d4"]},
            {"id": "atlassian-team", "label": "Atlassian Team", "category": "Collaboration", "colors": ["#f7f8f9", "#ffffff", "#172b4d", "#626f86", "#0c66e4"]},
            {"id": "mailchimp-friendly", "label": "Mailchimp Friendly", "category": "Marketing", "colors": ["#ffe01b", "#fff8dc", "#241c15", "#6b5d4d", "#007c89"]},
            {"id": "dropbox-work", "label": "Dropbox Work", "category": "Productivity", "colors": ["#f7f5f2", "#ffffff", "#1e1919", "#736c64", "#0061ff"]},
            {"id": "wise-fintech", "label": "Wise Fintech", "category": "Fintech", "colors": ["#f5f6ef", "#ffffff", "#163300", "#51624a", "#9fe870"]},
            {"id": "revolut-finance", "label": "Revolut Finance", "category": "Fintech", "colors": ["#f7f7fb", "#ffffff", "#101828", "#667085", "#191cff"]},
            {"id": "coinbase-crypto", "label": "Coinbase Crypto", "category": "Fintech", "colors": ["#f7f8fa", "#ffffff", "#0a0b0d", "#5b616e", "#0052ff"]},
            {"id": "duolingo-playful", "label": "Duolingo Playful", "category": "Education", "colors": ["#f7fff0", "#ffffff", "#1f2937", "#6b7280", "#58cc02"]},
            {"id": "theverge-editorial", "label": "The Verge Editorial", "category": "Editorial", "colors": ["#0b0b0f", "#17171f", "#ffffff", "#a1a1aa", "#e2127a"]},
            {"id": "wired-magazine", "label": "WIRED Magazine", "category": "Editorial", "colors": ["#f5f2ec", "#ffffff", "#111111", "#555555", "#e31b23"]},
            {"id": "runwayml-cinematic", "label": "Runway Cinematic", "category": "Media AI", "colors": ["#050505", "#111111", "#f5f5f5", "#8a8a8a", "#d7ff5f"]},
            {"id": "huggingface-community", "label": "Hugging Face Community", "category": "AI & LLM", "colors": ["#fff8e7", "#ffffff", "#1f2937", "#6b7280", "#ffcc4d"]},
            {"id": "posthog-analytics", "label": "PostHog Analytics", "category": "Analytics", "colors": ["#fff7ed", "#ffffff", "#1c1917", "#78716c", "#f97316"]},
            {"id": "sentry-ops", "label": "Sentry Ops", "category": "Developer Tools", "colors": ["#120f1f", "#1d1830", "#f8fafc", "#a8a3b8", "#6f42c1"]},
            {"id": "mintlify-docs", "label": "Mintlify Docs", "category": "Developer Docs", "colors": ["#f8fafc", "#ffffff", "#0f172a", "#64748b", "#16a34a"]},
            {"id": "resend-email", "label": "Resend Email", "category": "Developer Tools", "colors": ["#fafafa", "#ffffff", "#111111", "#737373", "#000000"]},
            {"id": "shadcn-system", "label": "shadcn System", "category": "Component Systems", "colors": ["#fafafa", "#ffffff", "#09090b", "#71717a", "#18181b"]},
            {"id": "xiaohongshu-social", "label": "Xiaohongshu Social", "category": "Social & Commerce", "colors": ["#ffffff", "#f5f5f5", "#303034", "#8a8a8f", "#ff2442"]},
        ],
    }
