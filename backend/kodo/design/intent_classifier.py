from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

from .question_engine import detect_project_type
from .types import CanvasTool, DesignIntent, GenerationStrategy, ProjectType


@dataclass(frozen=True)
class IntentClassification:
    intent: DesignIntent
    project_type: ProjectType
    confidence: float
    strategy: GenerationStrategy
    requires_questions: bool
    auto_tools: list[CanvasTool]


_INTENT_PATTERNS: list[tuple[DesignIntent, list[str]]] = [
    (DesignIntent.EXPORT_REQUEST, ["export", "download", "zip", "figma", "pptx", "handoff", "share link"]),
    (DesignIntent.ACCESSIBILITY_AUDIT, ["accessibility", "a11y", "contrast", "wcag", "screen reader", "keyboard"]),
    (DesignIntent.RESPONSIVE_CHECK, ["responsive", "mobile", "tablet", "breakpoint", "small screen"]),
    (DesignIntent.COMPARISON_REQUEST, ["3 direction", "three direction", "variants", "options", "compare", "different directions"]),
    (DesignIntent.DEBUG_REQUEST, ["broken", "bug", "not working", "fix error", "console error", "looks wrong"]),
    (DesignIntent.FULL_REDESIGN, ["redesign", "start over", "rebuild from scratch", "new direction", "entirely different"]),
    (DesignIntent.REGION_EDIT, ["hero section", "pricing section", "footer", "navbar", "selected", "region", "this area"]),
    (DesignIntent.ADD_COMPONENT, ["add", "insert", "include", "new section", "testimonials", "pricing", "faq"]),
    (DesignIntent.REMOVE_COMPONENT, ["remove", "delete", "drop", "take out", "get rid"]),
    (DesignIntent.CONTENT_CHANGE, ["copy", "headline", "text", "wording", "title", "caption"]),
    (DesignIntent.LAYOUT_CHANGE, ["layout", "move", "reposition", "above the fold", "grid", "columns"]),
    (DesignIntent.STYLE_CHANGE, ["make it", "style", "theme", "color", "font", "minimal", "bold", "dark", "light"]),
    (DesignIntent.TWEAK_EXISTING, ["change", "tweak", "adjust", "increase", "decrease", "smaller", "larger"]),
    (DesignIntent.CREATE_NEW, ["build", "create", "make", "design", "generate", "website", "app", "page"]),
]


def _score_pattern(text: str, needles: list[str]) -> int:
    return sum(1 for needle in needles if needle in text)


def _has_current_work(text: str, has_current_html: bool) -> bool:
    return has_current_html or any(word in text for word in ["current", "existing", "this design", "this page", "the page"])


def _strategy_for(intent: DesignIntent, has_current_html: bool) -> GenerationStrategy:
    if intent == DesignIntent.CREATE_NEW:
        return GenerationStrategy.FULL_GENERATION
    if intent == DesignIntent.FULL_REDESIGN:
        return GenerationStrategy.FULL_REGENERATION
    if intent == DesignIntent.EXPORT_REQUEST:
        return GenerationStrategy.EXPORT_ONLY
    if intent in {DesignIntent.ACCESSIBILITY_AUDIT, DesignIntent.RESPONSIVE_CHECK, DesignIntent.DEBUG_REQUEST}:
        return GenerationStrategy.AUDIT_ONLY if intent == DesignIntent.ACCESSIBILITY_AUDIT else GenerationStrategy.SURGICAL_PATCH
    if intent == DesignIntent.COMPARISON_REQUEST:
        return GenerationStrategy.COMPARISON
    if has_current_html:
        return GenerationStrategy.SURGICAL_PATCH
    return GenerationStrategy.FULL_GENERATION


def _tools_for(intent: DesignIntent) -> list[CanvasTool]:
    if intent == DesignIntent.REGION_EDIT:
        return [CanvasTool.REGION, CanvasTool.SELECT, CanvasTool.CHAT]
    if intent == DesignIntent.STYLE_CHANGE or intent == DesignIntent.TWEAK_EXISTING:
        return [CanvasTool.TWEAKS, CanvasTool.SELECT, CanvasTool.CHAT]
    if intent == DesignIntent.EXPORT_REQUEST:
        return [CanvasTool.EXPORT]
    if intent == DesignIntent.COMPARISON_REQUEST:
        return [CanvasTool.HISTORY, CanvasTool.CHAT]
    if intent == DesignIntent.ACCESSIBILITY_AUDIT:
        return [CanvasTool.SELECT, CanvasTool.CHAT]
    return [CanvasTool.CHAT]


async def _classify_with_fast_llm(prompt: str, project_type: ProjectType) -> DesignIntent | None:
    """Optional fast-model classifier. Disabled unless explicitly requested."""
    if os.getenv("KODO_DESIGN_USE_FAST_LLM", "").strip() not in {"1", "true", "yes"}:
        return None
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=os.getenv("KODO_DESIGN_FAST_MODEL", "claude-3-5-haiku-latest"),
            max_tokens=80,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Classify this design request into one enum value only. "
                        f"Project type: {project_type.value}. "
                        f"Allowed: {[intent.value for intent in DesignIntent]}. "
                        f"Request: {prompt}"
                    ),
                }
            ],
        )
        raw = response.content[0].text.strip().lower()
        parsed = json.loads(raw).get("intent") if raw.startswith("{") else raw
        return DesignIntent(parsed)
    except Exception:
        return None


async def classify_design_request(prompt: str, has_current_html: bool = False) -> IntentClassification:
    text = re.sub(r"\s+", " ", prompt.lower()).strip()
    project_type = detect_project_type(prompt)
    llm_intent = await _classify_with_fast_llm(prompt, project_type)
    if llm_intent:
        intent = llm_intent
        confidence = 0.86
    else:
        ranked = sorted(
            ((_score_pattern(text, needles), intent) for intent, needles in _INTENT_PATTERNS),
            key=lambda row: row[0],
            reverse=True,
        )
        score, intent = ranked[0]
        if score <= 0:
            intent = DesignIntent.TWEAK_EXISTING if _has_current_work(text, has_current_html) else DesignIntent.CREATE_NEW
            confidence = 0.48
        else:
            confidence = min(0.94, 0.52 + score * 0.12)
        if intent == DesignIntent.CREATE_NEW and _has_current_work(text, has_current_html):
            intent = DesignIntent.TWEAK_EXISTING
            confidence = max(confidence, 0.62)

    strategy = _strategy_for(intent, has_current_html)
    requires_questions = intent in {DesignIntent.CREATE_NEW, DesignIntent.FULL_REDESIGN}
    return IntentClassification(
        intent=intent,
        project_type=project_type,
        confidence=confidence,
        strategy=strategy,
        requires_questions=requires_questions,
        auto_tools=_tools_for(intent),
    )
