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


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            text = text[end + 3:].lstrip()
    return text.strip()


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
) -> str:
    sections: list[str] = [BASE_SYSTEM_PROMPT]

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
