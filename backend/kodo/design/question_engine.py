from __future__ import annotations

import re

from .types import ClarifyingQuestion, ProjectType


_PROJECT_KEYWORDS: list[tuple[ProjectType, list[str]]] = [
    (ProjectType.DASHBOARD, ["dashboard", "analytics", "metrics", "kpi", "admin analytics"]),
    (ProjectType.PORTFOLIO, ["portfolio", "case study", "work samples", "personal site"]),
    (ProjectType.ECOMMERCE, ["ecommerce", "e-commerce", "shop", "store", "product page", "checkout"]),
    (ProjectType.SAAS_APP, ["saas", "web app", "product app", "b2b", "software"]),
    (ProjectType.ADMIN_PANEL, ["admin", "crm", "backoffice", "internal tool", "control panel"]),
    (ProjectType.BLOG, ["blog", "publication", "magazine", "newsletter", "article"]),
    (ProjectType.DOCUMENTATION, ["docs", "documentation", "developer portal", "api reference", "knowledge base"]),
    (ProjectType.GAME, ["game", "playable", "arcade", "puzzle", "level", "score"]),
    (ProjectType.LANDING_PAGE, ["landing", "website", "homepage", "marketing page", "launch page"]),
]


_QUESTION_SETS: dict[ProjectType, list[tuple[str, list[str], str]]] = {
    ProjectType.LANDING_PAGE: [
        ("What's the primary goal?", ["Get signups", "Drive purchases", "Build brand", "Collect leads"], "single"),
        ("Who's the target audience?", ["Technical users", "Business professionals", "Consumers", "Developers"], "single"),
        ("What's the hero section mood?", ["Bold and energetic", "Clean and minimal", "Warm and friendly", "Professional and trustworthy"], "single"),
        ("What sections do you need?", ["Hero", "Features", "Pricing", "Testimonials", "FAQ", "CTA", "Footer"], "multi"),
        ("Any color direction?", ["Light", "Dark", "Warm", "Cool", "Brand-specific"], "single"),
        ("Reference sites or inspiration?", ["Paste URLs", "Use existing brand", "No references", "Surprise me"], "text"),
    ],
    ProjectType.DASHBOARD: [
        ("What data is being displayed?", ["Analytics", "Financial", "Operations", "User metrics", "Custom"], "single"),
        ("Who uses this dashboard?", ["Internal team", "Executives", "External clients", "Mixed"], "single"),
        ("Preferred chart types?", ["Line", "Bar", "Pie", "KPI cards", "Tables", "Maps"], "multi"),
        ("Dark or light mode?", ["Always dark", "Always light", "Toggle supported"], "single"),
        ("Real-time updates needed?", ["Static demo", "Simulated live", "Actual live data"], "single"),
        ("What is the main decision it supports?", ["Growth", "Risk", "Ops triage", "Revenue", "Product usage"], "single"),
    ],
    ProjectType.PORTFOLIO: [
        ("What field?", ["Design", "Development", "Photography", "Writing", "Architecture", "Other"], "single"),
        ("Tone?", ["Minimal and clean", "Bold and creative", "Professional and corporate", "Artistic"], "single"),
        ("Sections needed?", ["About", "Work", "Skills", "Process", "Contact", "Blog"], "multi"),
        ("Should work samples be prominent?", ["Large grid", "Case studies", "List format"], "single"),
        ("What should visitors do next?", ["Hire me", "View work", "Book a call", "Download resume"], "single"),
        ("Any signature visual motif?", ["Typography", "Photography", "Motion", "Color blocking", "None"], "single"),
    ],
    ProjectType.ECOMMERCE: [
        ("What are you selling?", ["Physical products", "Digital products", "Subscriptions", "Marketplace items"], "single"),
        ("Primary shopping flow?", ["Browse catalog", "Single product", "Bundle builder", "Flash sale"], "single"),
        ("What should build trust?", ["Reviews", "Guarantee", "Shipping info", "Press logos"], "multi"),
        ("Product imagery style?", ["Editorial", "Studio cutouts", "Lifestyle", "Technical close-ups"], "single"),
        ("Checkout emphasis?", ["Fast checkout", "Upsells", "Account creation", "Guest checkout"], "single"),
        ("Price positioning?", ["Budget", "Premium", "Luxury", "Discount-driven"], "single"),
    ],
    ProjectType.SAAS_APP: [
        ("What product category?", ["AI tool", "Developer platform", "CRM", "Fintech", "Collaboration"], "single"),
        ("Who signs up?", ["Founders", "Developers", "Ops teams", "Sales teams", "Enterprise buyers"], "single"),
        ("What proof matters most?", ["Product demo", "Metrics", "Security", "Integrations", "Testimonials"], "single"),
        ("Primary CTA?", ["Start free", "Book demo", "Join waitlist", "Contact sales"], "single"),
        ("Show app UI in the hero?", ["Large screenshot", "Interactive mock", "Abstract product system", "No"], "single"),
        ("Tone?", ["Quiet enterprise", "Sharp developer", "Friendly startup", "Premium platform"], "single"),
    ],
    ProjectType.ADMIN_PANEL: [
        ("What workflow does it manage?", ["Users", "Orders", "Support", "Content", "Infrastructure"], "single"),
        ("Preferred navigation?", ["Sidebar", "Top tabs", "Command palette", "Split navigation"], "single"),
        ("Density level?", ["Compact", "Balanced", "Spacious"], "single"),
        ("Key table actions?", ["Filter", "Bulk edit", "Export", "Inline edit", "Approve/reject"], "multi"),
        ("Status model?", ["Simple states", "Workflow stages", "SLA/risk", "Custom"], "single"),
        ("Access roles?", ["Admin only", "Team roles", "Client view", "Auditor view"], "single"),
    ],
    ProjectType.BLOG: [
        ("What content type?", ["Personal essays", "Company updates", "Technical articles", "Magazine features"], "single"),
        ("Reading experience?", ["Minimal", "Editorial", "Dense index", "Visual magazine"], "single"),
        ("Homepage priority?", ["Latest articles", "Featured story", "Categories", "Newsletter signup"], "single"),
        ("Navigation structure?", ["Simple nav", "Category nav", "Search-first", "Issue/archive"], "single"),
        ("Monetization or CTA?", ["Newsletter", "Membership", "Product CTA", "None"], "single"),
        ("Article style?", ["Longform", "Tutorial", "News", "Opinion"], "single"),
    ],
    ProjectType.DOCUMENTATION: [
        ("Who is reading the docs?", ["Developers", "Admins", "End users", "Mixed"], "single"),
        ("Docs structure?", ["Guides", "API reference", "Tutorials", "Concepts", "Changelog"], "multi"),
        ("Navigation pattern?", ["Left sidebar", "Search-first", "Tabbed SDKs", "Version switcher"], "single"),
        ("Code examples needed?", ["JavaScript", "Python", "cURL", "Multiple languages"], "multi"),
        ("Product maturity?", ["New beta", "Stable platform", "Enterprise", "Open source"], "single"),
        ("Support path?", ["Discord", "GitHub", "Contact support", "Community forum"], "single"),
    ],
    ProjectType.GAME: [
        ("What genre?", ["Puzzle", "Arcade", "Strategy", "Platformer", "Idle"], "single"),
        ("Input method?", ["Keyboard", "Mouse", "Touch", "Gamepad-like buttons"], "multi"),
        ("Visual style?", ["Retro", "Neon", "Minimal", "Cartoon", "Cinematic"], "single"),
        ("Core loop?", ["Score chase", "Levels", "Survival", "Collection", "Story beats"], "single"),
        ("Difficulty curve?", ["Casual", "Medium", "Hard", "Adaptive"], "single"),
        ("Audio cues?", ["None", "Simple beeps", "Ambient", "Action feedback"], "single"),
    ],
}


def detect_project_type(prompt: str) -> ProjectType:
    text = re.sub(r"\s+", " ", prompt.lower()).strip()
    best = (0, ProjectType.LANDING_PAGE)
    for project_type, keywords in _PROJECT_KEYWORDS:
        score = sum(1 for keyword in keywords if keyword in text)
        if score > best[0]:
            best = (score, project_type)
    return best[1]


def _already_answered(prompt: str, question: str, options: list[str]) -> bool:
    text = prompt.lower()
    option_hits = sum(1 for option in options if option.lower() in text)
    if option_hits:
        return True
    q = question.lower()
    if "dark or light" in q and ("dark" in text or "light" in text):
        return True
    if "target audience" in q and any(word in text for word in ["developers", "consumers", "executives", "founders"]):
        return True
    return False


def build_question_flow(prompt: str, project_type: ProjectType | None = None, limit: int = 5) -> list[ClarifyingQuestion]:
    resolved_type = project_type or detect_project_type(prompt)
    rows = _QUESTION_SETS[resolved_type]
    selected = [
        (question, options, qtype)
        for question, options, qtype in rows
        if not _already_answered(prompt, question, options)
    ]
    if len(selected) < limit:
        selected.extend(row for row in rows if row not in selected)
    cards: list[ClarifyingQuestion] = []
    for index, (question, options, qtype) in enumerate(selected[:limit], start=1):
        cards.append(
            ClarifyingQuestion(
                id=f"{resolved_type.value}-q{index}",
                question=question,
                options=options,
                type=qtype,  # type: ignore[arg-type]
                allow_free_text=True,
            )
        )
    return cards
