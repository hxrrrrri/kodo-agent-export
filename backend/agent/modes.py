from dataclasses import dataclass

DEFAULT_MODE = "execute"


@dataclass(frozen=True)
class AgentMode:
    key: str
    title: str
    summary: str
    prompt: str


_MODE_ORDER = ["execute", "plan", "debug", "review"]
_MODE_ALIASES = {
    "default": "execute",
    "builder": "execute",
    "planner": "plan",
    "audit": "review",
}

_MODES: dict[str, AgentMode] = {
    "execute": AgentMode(
        key="execute",
        title="Execute",
        summary="Balanced autonomous execution with proactive tool use.",
        prompt=(
            "Mode instructions (execute):\n"
            "- Default behavior: move quickly and execute tasks end-to-end.\n"
            "- Use tools proactively when they reduce uncertainty.\n"
            "- Keep explanations concise and action-focused."
        ),
    ),
    "plan": AgentMode(
        key="plan",
        title="Plan",
        summary="Prioritize planning clarity before heavy execution.",
        prompt=(
            "Mode instructions (plan):\n"
            "- Start with a short numbered plan before major tool use.\n"
            "- Group work into milestones and report progress after each milestone.\n"
            "- Prefer low-risk read/inspect actions before write actions."
        ),
    ),
    "debug": AgentMode(
        key="debug",
        title="Debug",
        summary="Hypothesis-driven debugging and validation loops.",
        prompt=(
            "Mode instructions (debug):\n"
            "- Use a hypothesis -> verify -> fix -> re-verify cycle.\n"
            "- Prioritize reproducing failures and validating fixes with concrete checks.\n"
            "- Minimize unrelated edits while stabilizing behavior."
        ),
    ),
    "review": AgentMode(
        key="review",
        title="Review",
        summary="Risk-focused code review and regression analysis.",
        prompt=(
            "Mode instructions (review):\n"
            "- Prioritize findings: bugs, security issues, regressions, and missing tests.\n"
            "- Prefer evidence from code and behavior over speculative commentary.\n"
            "- Recommend minimal, high-confidence fixes."
        ),
    ),
}


def normalize_mode(value: str | None) -> str:
    if value is None:
        return DEFAULT_MODE

    key = value.strip().lower()
    if not key:
        return DEFAULT_MODE

    if key in _MODE_ALIASES:
        key = _MODE_ALIASES[key]

    if key in _MODES:
        return key

    supported = ", ".join(_MODE_ORDER)
    raise ValueError(f"Unknown mode '{value}'. Supported modes: {supported}")


def get_mode(mode: str | None) -> AgentMode:
    key = normalize_mode(mode)
    return _MODES[key]


def list_modes() -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for key in _MODE_ORDER:
        mode = _MODES[key]
        items.append({
            "key": mode.key,
            "title": mode.title,
            "summary": mode.summary,
            "is_default": mode.key == DEFAULT_MODE,
        })
    return items
