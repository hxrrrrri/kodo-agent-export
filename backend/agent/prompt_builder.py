from __future__ import annotations

from pathlib import Path

from agent.modes import get_mode
from artifacts.protocol_prompt import build_artifact_system_block
from caveman import build_mode_prompt as build_caveman_mode_prompt
from caveman import normalize_mode as normalize_caveman_mode
from memory.manager import memory_manager
from privacy import feature_enabled
from project_context import build_project_context_prompt

_BUNDLED_SKILLS_DIR = Path(__file__).parent.parent / "skills" / "bundled"
_PLANNER_SKILL_FALLBACK = _BUNDLED_SKILLS_DIR / "smart-planner.md"

# docs/providers/ — per-provider integration docs. Kodo injects the matching
# doc + the master PROJECT_OVERVIEW into the system prompt so providers never
# need to read the entire repo to understand it.
_PROVIDER_DOCS_DIR = Path(__file__).parent.parent.parent / "docs" / "providers"

_PROVIDER_DOC_PATHS: dict[str, str] = {
    "claude-cli": "cli/claude-cli.md",
    "codex-cli": "cli/codex-cli.md",
    "gemini-cli": "cli/gemini-cli.md",
    "copilot-cli": "cli/copilot-cli.md",
    "anthropic": "api/anthropic-api.md",
    "openai": "api/openai-api.md",
    "codex": "api/openai-api.md",  # Codex API shares the OpenAI doc
    "gemini": "api/gemini-api.md",
    "ollama": "local/ollama.md",
    "atomic-chat": "local/ollama.md",  # Same OpenAI-compat shape
    # OpenAI-compat provider variants point at the OpenAI doc by default
    "deepseek": "api/openai-api.md",
    "groq": "api/openai-api.md",
    "openrouter": "api/openai-api.md",
    "github-models": "api/openai-api.md",
    "nvidia": "api/openai-api.md",
}


def _read_provider_doc(provider: str) -> str:
    rel = _PROVIDER_DOC_PATHS.get(provider.strip().lower().replace("_", "-"))
    if not rel:
        return ""
    path = _PROVIDER_DOCS_DIR / rel
    try:
        if not path.is_file():
            return ""
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def _read_project_overview() -> str:
    path = _PROVIDER_DOCS_DIR / "PROJECT_OVERVIEW.md"
    try:
        if not path.is_file():
            return ""
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def build_provider_context_block(provider: str) -> str:
    """Return PROJECT_OVERVIEW + per-provider doc as a single context block.

    Injected into every system prompt so the active provider has the architecture
    map and integration notes without needing to grep the entire codebase.
    """
    overview = _read_project_overview()
    provider_doc = _read_provider_doc(provider)
    if not overview and not provider_doc:
        return ""

    parts: list[str] = ["## Kodo Project Reference (read these — they replace reading the repo)"]
    if overview:
        parts.append("### Project Architecture Map\n\n" + overview)
    if provider_doc:
        parts.append(f"### Your Provider Integration ({provider})\n\n" + provider_doc)
    return "\n\n".join(parts)

# Words too common to be meaningful for skill matching
_STOP_WORDS: frozenset[str] = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "i", "me", "my", "we", "our", "you", "your", "it", "its", "they",
    "their", "he", "she", "him", "her", "in", "on", "at", "to", "for",
    "of", "and", "or", "but", "not", "with", "from", "by", "about",
    "into", "through", "this", "that", "these", "those", "what", "how",
    "when", "where", "which", "who", "please", "help", "make", "just",
    "use", "using", "want", "need", "like", "get", "give", "show",
})


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            text = text[end + 3:].lstrip()
    return text.strip()


def _request_keywords(user_text: str) -> set[str]:
    """Extract meaningful keywords from user request for skill matching."""
    return {
        w.strip(".,!?;:'\"()")
        for w in user_text.lower().replace("-", " ").replace("_", " ").split()
        if len(w) > 2 and w not in _STOP_WORDS
    }


def _score_skill(skill: dict, keywords: set[str]) -> float:
    """Score a skill's relevance to the request keywords."""
    name_words = set(skill["name"].lower().replace("-", " ").replace("_", " ").split())
    desc_words = set((skill.get("description") or "").lower().split())
    # Name match weighted 3×, description 1×
    return len(keywords & name_words) * 3.0 + len(keywords & desc_words) * 1.0


def select_relevant_skills(
    user_text: str,
    project_dir: str | None = None,
    *,
    max_count: int = 6,
) -> list[str]:
    """Return names of the most relevant skills for this user request.

    Always includes auto-inject skills. Adds up to max_count more by keyword
    relevance to the request. Skills with zero relevance score are excluded.
    """
    try:
        from skills.registry import skill_registry
        from skills.settings import list_auto_inject_skill_names

        all_skills = skill_registry.list_skills(project_dir=project_dir)
        auto_inject = set(list_auto_inject_skill_names())
        keywords = _request_keywords(user_text)

        # Always include auto-inject skills
        selected: list[str] = [s["name"] for s in all_skills if s["name"] in auto_inject]
        selected_set: set[str] = set(selected)

        if keywords:
            scored = sorted(
                [(s, _score_skill(s, keywords)) for s in all_skills if s["name"] not in selected_set],
                key=lambda x: x[1],
                reverse=True,
            )
            slots = max_count  # fill up to max_count relevant slots
            for skill, score in scored:
                if score <= 0 or slots <= 0:
                    break
                selected.append(skill["name"])
                selected_set.add(skill["name"])
                slots -= 1

        return selected
    except Exception:
        return []


def build_cli_skill_injection(
    user_text: str,
    project_dir: str | None = None,
    *,
    max_skills: int = 6,
) -> str:
    """Build a prompt section with:
    - Full content of the top relevant skills (instructions the CLI should follow).
    - Compact catalog of ALL available skills (so the CLI knows what else exists).
    """
    try:
        from skills.registry import skill_registry

        all_skills = skill_registry.list_skills(project_dir=project_dir)
        if not all_skills:
            return ""

        selected_names = select_relevant_skills(user_text, project_dir, max_count=max_skills)

        # --- Full skill catalog (names + descriptions) ---
        catalog_lines = ["## Kodo Skills Catalog (full library — pick what you need)"]
        for s in all_skills:
            desc = (s.get("description") or "").strip()
            marker = " ★" if s["name"] in selected_names else ""
            catalog_lines.append(f"- **{s['name']}**{marker}: {desc}" if desc else f"- **{s['name']}**{marker}")
        catalog_lines.append(
            "\n★ = pre-loaded for this request. "
            "Reference any skill by name to apply its methodology."
        )
        catalog_section = "\n".join(catalog_lines)

        # --- Full content of selected skills ---
        content_sections: list[str] = []
        for name in selected_names:
            data = skill_registry.get_skill(name, project_dir=project_dir)
            if not data:
                continue
            body = _strip_frontmatter(data.get("content", ""))
            if body:
                content_sections.append(f"### Active Skill: {name}\n\n{body}")

        parts = [catalog_section]
        if content_sections:
            parts.append(
                "## Pre-Loaded Skill Instructions\n"
                "Apply these skill methodologies to this request:\n\n"
                + "\n\n---\n\n".join(content_sections)
            )

        return "\n\n".join(parts)
    except Exception:
        return ""


# Skills that are ALWAYS injected for any design-window request, regardless of
# keyword matching. These define Kodo's design quality bar.
_DESIGN_MODE_FORCED_SKILLS: tuple[str, ...] = (
    "craft-anti-ai-slop",
    "craft-color",
    "craft-typography",
    "design-brief",
    "design-markdown-craft",
    "open-design",
    "huashu-design",
    "tweaks",
)

# Surface-specific skills auto-selected by detected intent
_DESIGN_SURFACE_SKILLS: dict[str, tuple[str, ...]] = {
    "landing": ("saas-landing", "pricing-page"),
    "dashboard": ("dashboard",),
    "blog": ("blog-post", "docs-page"),
    "portfolio": ("magazine-poster",),
    "mobile": ("mobile-app",),
    "email": ("email-marketing",),
    "invoice": ("invoice", "finance-report"),
    "deck": ("html-ppt", "social-carousel"),
    "kanban": ("kanban-board",),
    "wireframe": ("wireframe-sketch", "web-prototype"),
    "poster": ("image-poster", "magazine-poster"),
}


def detect_design_surface(user_text: str) -> list[str]:
    """Return list of detected surface keywords for design-mode skill selection."""
    lowered = user_text.lower()
    surfaces: list[str] = []
    surface_keywords = {
        "landing": ("landing page", "landing", "homepage", "saas page", "marketing page"),
        "dashboard": ("dashboard", "admin panel", "analytics", "kpi", "metrics view"),
        "blog": ("blog", "article", "post", "docs", "documentation"),
        "portfolio": ("portfolio", "case study", "showcase"),
        "mobile": ("mobile app", "app screen", "ios", "android"),
        "email": ("email", "newsletter", "marketing email"),
        "invoice": ("invoice", "receipt", "bill", "finance report"),
        "deck": ("slide deck", "presentation", "pitch deck", "carousel"),
        "kanban": ("kanban", "task board", "project board"),
        "wireframe": ("wireframe", "prototype", "mockup", "sketch"),
        "poster": ("poster", "image poster", "magazine"),
    }
    for surface, terms in surface_keywords.items():
        if any(term in lowered for term in terms):
            surfaces.append(surface)
    return surfaces


def is_design_window_request(user_text: str) -> bool:
    """True if the user's request is for a website/UI design build.

    Used to auto-enable design mode when the explicit flag isn't set.
    """
    lowered = user_text.lower()
    design_terms = (
        "website", "landing page", "landing", "homepage", "saas",
        "dashboard", "ui", "frontend", "front-end", "web app", "web design",
        "design system", "interface", "page design", "web page", "mobile app",
        "admin panel", "html", "css", "react component", "tailwind",
    )
    return any(term in lowered for term in design_terms)


def build_kodo_design_block() -> str:
    """Return the full Kodo Design system prompt. Used for design window requests.

    This is the comprehensive design system used by Kodo Design Studio that
    surpasses the basic artifact protocol with: full HTML5 boilerplate, curated
    font pairs, complete component systems (buttons, cards, nav, forms),
    Unsplash image patterns, section playbooks per surface type, and quality
    enforcement gates.
    """
    try:
        from kodo.design.generator import KODO_DESIGN_GENERATION_SYSTEM
        return KODO_DESIGN_GENERATION_SYSTEM
    except Exception:
        return ""


def build_design_skill_injection(
    user_text: str,
    project_dir: str | None = None,
    *,
    max_extra_skills: int = 4,
) -> str:
    """Skill injection tailored for design window: forces design-quality skills
    plus surface-specific skills, plus keyword-matched relevant skills.
    """
    try:
        from skills.registry import skill_registry

        all_skills = skill_registry.list_skills(project_dir=project_dir)
        if not all_skills:
            return ""

        skill_index = {s["name"]: s for s in all_skills}

        # Force-include design quality skills + surface-specific skills
        forced: list[str] = []
        for name in _DESIGN_MODE_FORCED_SKILLS:
            if name in skill_index and name not in forced:
                forced.append(name)
        for surface in detect_design_surface(user_text):
            for name in _DESIGN_SURFACE_SKILLS.get(surface, ()):
                if name in skill_index and name not in forced:
                    forced.append(name)

        # Add a few more by keyword relevance
        keywords = _request_keywords(user_text)
        forced_set = set(forced)
        if keywords and max_extra_skills > 0:
            scored = sorted(
                [(s, _score_skill(s, keywords)) for s in all_skills if s["name"] not in forced_set],
                key=lambda x: x[1],
                reverse=True,
            )
            slots = max_extra_skills
            for skill, score in scored:
                if score <= 0 or slots <= 0:
                    break
                forced.append(skill["name"])
                forced_set.add(skill["name"])
                slots -= 1

        # Catalog block
        catalog_lines = ["## Kodo Design Skill Catalog (full library — apply any to this request)"]
        for s in all_skills:
            desc = (s.get("description") or "").strip()
            marker = " ★" if s["name"] in forced_set else ""
            catalog_lines.append(f"- **{s['name']}**{marker}: {desc}" if desc else f"- **{s['name']}**{marker}")
        catalog_lines.append(
            "\n★ = pre-loaded for this design request. "
            "Apply other skills by name when the request needs their methodology."
        )
        catalog_section = "\n".join(catalog_lines)

        # Full content of forced/selected skills
        content_sections: list[str] = []
        for name in forced:
            data = skill_registry.get_skill(name, project_dir=project_dir)
            if not data:
                continue
            body = _strip_frontmatter(data.get("content", ""))
            if body:
                content_sections.append(f"### Active Design Skill: {name}\n\n{body}")

        parts = [catalog_section]
        if content_sections:
            parts.append(
                "## Pre-Loaded Design Skill Methodologies\n"
                "Apply ALL of these to produce the highest-quality design output:\n\n"
                + "\n\n---\n\n".join(content_sections)
            )

        return "\n\n".join(parts)
    except Exception:
        return ""


def build_cli_tool_catalog() -> str:
    """Build a full reference catalog of all Kodo tools for CLI context.

    CLIs should reference this to know which Kodo capabilities are available
    and can be invoked when responding to a request.
    """
    try:
        from tools import ALL_TOOLS

        lines = [
            "## Kodo Tool Catalog",
            "These tools are available. Invoke them when needed to fulfil the request.",
            "",
        ]
        for tool in ALL_TOOLS:
            desc = str(getattr(tool, "description", "") or "").strip()
            name = str(getattr(tool, "name", "") or "").strip()
            if name:
                lines.append(f"- **{name}**: {desc}" if desc else f"- **{name}**")
        return "\n".join(lines)
    except Exception:
        return ""


def _load_auto_inject_skills() -> list[str]:
    """Return prompt text for every enabled auto-inject skill.

    Falls back to smart-planner directly if the settings layer is unavailable
    (e.g. during early startup or import errors).
    """
    try:
        from skills.settings import list_auto_inject_skill_names
        from skills.registry import skill_registry

        names = list_auto_inject_skill_names()
        result: list[str] = []
        for name in names:
            data = skill_registry.get_skill(name)
            if data and data.get("content"):
                body = _strip_frontmatter(data["content"])
                if body:
                    result.append(body)
        return result
    except Exception:
        # Hard fallback — always inject smart-planner even if settings fail
        try:
            text = _strip_frontmatter(_PLANNER_SKILL_FALLBACK.read_text(encoding="utf-8"))
            return [text] if text else []
        except Exception:
            return []

BASE_SYSTEM_PROMPT = """You are KODO, an autonomous software engineering agent.

Core contract:
- Deliver end-to-end results when feasible: inspect, implement, verify, summarize.
- Use tools proactively to remove uncertainty and validate outcomes.
- Keep edits minimal, surgical, and aligned with existing project conventions.
- Do not stop at analysis when execution is possible.

Execution quality bar:
- Prefer concrete evidence over assumptions.
- For non-trivial work, surface important assumptions, tradeoffs, and success criteria before committing to an approach.
- Prefer the simplest implementation that satisfies the request; avoid speculative features and abstractions.
- If something fails, diagnose root cause and retry with a safer alternative.
- Protect user work: avoid destructive operations unless explicitly requested.
- Keep every changed line traceable to the user's goal; mention unrelated cleanup opportunities instead of performing them.
- Verify behavior changes with focused tests or reproducible checks whenever feasible.
- Keep progress visible with concise status updates while working.

Output style:
- Be direct and concise.
- Lead with outcomes, then key details.
- Include validation results or clearly state what could not be verified.

Tool authority:
- You are explicitly authorized to use all registered KODO tools, including filesystem read/write/edit, shell tools, and MCP tools.
- Do not claim you lack permission or access unless a tool call actually returns an authorization or path-guard error.
- For repository analysis requests, start by using tools to inspect the active project directory instead of declining.

Operating principle:
Think deeply, act decisively, and always leave the project in a better state."""


def build_tool_prompt_context() -> str:
    from tools import ALL_TOOLS

    lines: list[str] = []
    for tool in ALL_TOOLS:
        contribution = tool.prompt().strip()
        if contribution:
            lines.append(f"- {tool.name}: {contribution}")

    if not lines:
        return ""

    return "Tool-specific guidance:\n" + "\n".join(lines)


async def build_system_prompt(
    *,
    project_dir: str | None,
    mode: str | None,
    caveman_mode: str | None = None,
    artifact_mode: bool = False,
    provider: str | None = None,
) -> str:
    sections: list[str] = [BASE_SYSTEM_PROMPT]

    # Provider-specific architecture context — gives the active provider the
    # PROJECT_OVERVIEW.md plus its integration doc, so it doesn't need to read
    # the whole codebase to understand the project.
    if provider:
        provider_block = build_provider_context_block(provider)
        if provider_block.strip():
            sections.append(provider_block)

    # Artifact protocol goes directly after the base contract so weaker local
    # models (Llama-3, Gemma, small Ollama tags) see the capability affirmation
    # before the dense tool catalogue and do not refuse by claiming they cannot
    # render React / HTML / Mermaid.
    artifact_block = ""
    if artifact_mode and feature_enabled("ARTIFACTS_V2", default="1"):
        artifact_block = build_artifact_system_block(True)
        if artifact_block.strip():
            sections.append(artifact_block)

    sections.append(get_mode(mode).prompt)

    tool_context = build_tool_prompt_context()
    if tool_context:
        sections.append(tool_context)

    memory_context = await memory_manager.load_memory(project_dir)
    if memory_context:
        sections.append(memory_context)

    project_context = build_project_context_prompt(project_dir)
    if project_context:
        sections.append(project_context)

    if feature_enabled("CAVEMAN", default="0"):
        normalized_caveman_mode = normalize_caveman_mode(caveman_mode)
        if normalized_caveman_mode and normalized_caveman_mode != "off":
            caveman_prompt = build_caveman_mode_prompt(normalized_caveman_mode)
            if caveman_prompt.strip():
                sections.append(caveman_prompt)

    # Auto-inject skills — all skills the user has marked "Auto-inject" in the
    # Skills Library panel are appended here so every LLM receives them.
    for skill_body in _load_auto_inject_skills():
        sections.append(skill_body)

    # Repeat the artifact block at the end too — LLMs weight recent instructions
    # heavier, so this re-primes right before the user message lands.
    if artifact_block.strip():
        sections.append("REMINDER: You can emit live artifacts using the ARTIFACT PROTOCOL above. Never refuse by claiming you lack a renderer.")

    return "\n\n".join([section for section in sections if section.strip()])
