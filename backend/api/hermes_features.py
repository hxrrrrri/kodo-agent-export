"""
Hermes-inspired features for Kodo:

1. /api/hermes/search — LLM-powered session search with natural language queries
2. /api/hermes/create-skill — Auto-create a reusable skill from a completed conversation
3. /api/hermes/profile — Read/update persistent user profile that evolves over time

These implement the most valuable features from the Hermes agent framework
(self-improving skills, FTS session search, user profiling) adapted for Kodo's
FastAPI + local-file architecture.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from memory.manager import memory_manager, KODO_DIR

router = APIRouter(prefix="/api/hermes", tags=["hermes"])
logger = logging.getLogger(__name__)

USER_PROFILE_PATH = KODO_DIR / "user_profile.json"
SESSIONS_DIR = KODO_DIR / "sessions"

# ── Helper: call LLM inline for summarization ──────────────────────────────────

async def _llm_call(prompt: str, system: str = "", max_tokens: int = 512) -> str:
    """Fire a single non-streaming LLM call using the active provider."""
    primary = os.getenv("PRIMARY_PROVIDER", "anthropic").strip().lower()
    model_env = os.getenv("MODEL", "").strip()

    PROVIDER_MAP = {
        "anthropic": ("https://api.anthropic.com", "ANTHROPIC_API_KEY", "claude-haiku-4-5-20251001"),
        "openai": ("https://api.openai.com/v1", "OPENAI_API_KEY", "gpt-4o-mini"),
        "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "anthropic/claude-haiku-4-5-20251001"),
        "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY", "llama-3.3-70b-versatile"),
        "deepseek": ("https://api.deepseek.com/v1", "DEEPSEEK_API_KEY", "deepseek-chat"),
        "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY", "gemini-2.0-flash"),
        "ollama": (os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/") + "/v1", "", model_env or "llama3"),
    }

    candidates = [primary] + [p for p in PROVIDER_MAP if p != primary]
    for provider in candidates:
        cfg = PROVIDER_MAP.get(provider)
        if not cfg:
            continue
        base_url, env_key, default_model = cfg
        api_key = (os.getenv(env_key, "").strip() if env_key else "") or "local"
        if not api_key and provider not in ("ollama",):
            continue
        model = model_env or default_model

        try:
            if provider == "anthropic":
                from anthropic import AsyncAnthropic
                client = AsyncAnthropic(api_key=api_key)
                resp = await client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    system=system or "You are a helpful assistant.",
                    messages=[{"role": "user", "content": prompt}],
                )
                await client.close()
                return resp.content[0].text if resp.content else ""
            else:
                from providers.openai_compat import openai_compat_chat
                extra = {"HTTP-Referer": "http://localhost", "X-Title": "kodo-hermes"} if provider == "openrouter" else None
                result = await openai_compat_chat(
                    base_url=base_url, api_key=api_key, model=model,
                    messages=[
                        *(([{"role": "system", "content": system}]) if system else []),
                        {"role": "user", "content": prompt},
                    ],
                    stream=False, max_tokens=max_tokens, timeout=30.0,
                    extra_headers=extra,
                )
                if isinstance(result, dict):
                    for block in result.get("content", []):
                        if isinstance(block, dict) and block.get("type") == "text":
                            return block.get("text", "")
        except Exception as exc:
            logger.warning("_llm_call failed with %s: %s", provider, exc)
            continue

    return ""


# ── 1. Session Search ──────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)
    use_llm_ranking: bool = Field(default=True)


def _keyword_score(text: str, query: str) -> float:
    """Simple keyword overlap score for fast pre-filtering."""
    if not text or not query:
        return 0.0
    words = set(re.findall(r'\w+', query.lower()))
    haystack = text.lower()
    matches = sum(1 for w in words if w in haystack)
    return matches / max(len(words), 1)


@router.post("/search")
async def session_search(body: SearchRequest, request: Request):
    """Search past sessions using keyword scoring + optional LLM re-ranking.
    Returns sessions ranked by relevance with LLM-generated summaries."""
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "hermes_search")

    sessions = await memory_manager.list_sessions()
    if not sessions:
        return {"results": [], "query": body.query}

    # Score all sessions by keyword overlap on title + message text
    scored: list[tuple[float, dict[str, Any]]] = []
    for sess in sessions:
        sid = sess["session_id"]
        title = str(sess.get("title", ""))
        try:
            session_file = SESSIONS_DIR / f"{sid}.json"
            if not session_file.exists():
                continue
            raw = session_file.read_text(encoding="utf-8", errors="replace")
            data = json.loads(raw)
            # Build searchable text from messages
            messages = data.get("messages", [])
            text_parts = [title]
            for msg in messages[:20]:  # First 20 messages per session
                content = msg.get("content", "")
                if isinstance(content, str):
                    text_parts.append(content[:400])
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text_parts.append(str(block.get("text", ""))[:200])
            full_text = " ".join(text_parts)
            score = _keyword_score(full_text, body.query)
            if score > 0:
                scored.append((score, {**sess, "_text_snippet": full_text[:600]}))
        except Exception:
            continue

    # Sort by score, take top candidates for LLM re-ranking
    scored.sort(key=lambda x: -x[0])
    top_candidates = scored[:min(20, len(scored))]

    if not top_candidates:
        return {"results": [], "query": body.query}

    results: list[dict[str, Any]] = []

    if body.use_llm_ranking and top_candidates:
        # Ask LLM to rank and summarize the top candidates
        candidates_text = "\n\n".join(
            f"[{i+1}] Session: {c['title']} ({c['session_id'][:8]})\nSnippet: {c['_text_snippet'][:300]}"
            for i, (_, c) in enumerate(top_candidates)
        )
        llm_prompt = (
            f'User is searching for: "{body.query}"\n\n'
            f"Here are {len(top_candidates)} sessions. For each relevant one, respond with:\n"
            f"RESULT: <number> | RELEVANCE: <High/Medium/Low> | SUMMARY: <one sentence why it matches>\n\n"
            f"{candidates_text}\n\n"
            f"Only include sessions with Medium or High relevance. List most relevant first."
        )
        try:
            llm_output = await _llm_call(llm_prompt, system="You are a search assistant. Be concise.", max_tokens=600)
            # Parse LLM output
            for line in llm_output.splitlines():
                m = re.match(r"RESULT:\s*(\d+)\s*\|\s*RELEVANCE:\s*(\w+)\s*\|\s*SUMMARY:\s*(.+)", line.strip(), re.IGNORECASE)
                if m:
                    idx = int(m.group(1)) - 1
                    relevance = m.group(2).strip()
                    summary = m.group(3).strip()
                    if 0 <= idx < len(top_candidates):
                        _, candidate = top_candidates[idx]
                        results.append({
                            "session_id": candidate["session_id"],
                            "title": candidate["title"],
                            "updated_at": candidate.get("updated_at", ""),
                            "message_count": candidate.get("message_count", 0),
                            "relevance": relevance,
                            "summary": summary,
                        })
        except Exception as exc:
            logger.warning("LLM ranking failed: %s", exc)

    # Fallback: return top keyword matches without LLM summaries
    if not results:
        results = [
            {
                "session_id": c["session_id"],
                "title": c["title"],
                "updated_at": c.get("updated_at", ""),
                "message_count": c.get("message_count", 0),
                "relevance": "Medium",
                "summary": f"Keyword match (score={score:.2f})",
            }
            for score, c in top_candidates[:body.limit]
        ]

    return {"results": results[:body.limit], "query": body.query, "total_searched": len(sessions)}


# ── 2. Auto-Skill Creation ─────────────────────────────────────────────────────

class CreateSkillRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    skill_name: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    description: str = Field(default="", max_length=300)
    auto_generate: bool = Field(default=True)


@router.post("/create-skill")
async def create_skill_from_session(body: CreateSkillRequest, request: Request):
    """Extract a reusable skill from a completed session.
    Uses LLM to distill the session into a concise, reusable prompt."""
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "hermes_create_skill")

    session_file = SESSIONS_DIR / f"{body.session_id}.json"
    if not session_file.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        data = json.loads(session_file.read_text(encoding="utf-8", errors="replace"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load session: {exc}") from exc

    messages = data.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="Session has no messages to extract from")

    skill_content: str
    if body.auto_generate:
        # Build conversation summary for LLM
        conv_text = []
        for msg in messages[:30]:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if isinstance(content, str) and content.strip():
                conv_text.append(f"{role.upper()}: {content[:500]}")
        conversation = "\n\n".join(conv_text)

        llm_prompt = (
            f"Extract a reusable SKILL from this conversation.\n\n"
            f"Conversation:\n{conversation}\n\n"
            f"Create a concise skill prompt that captures the key workflow, "
            f"instructions, and patterns demonstrated. The skill should be "
            f"actionable and reusable for similar tasks in the future. "
            f"Description hint: {body.description or 'general purpose'}\n\n"
            f"Format:\n"
            f"---\n"
            f"name: {body.skill_name}\n"
            f"description: <one line>\n"
            f"---\n\n"
            f"<skill prompt content here — instructions, patterns, examples>"
        )
        skill_content = await _llm_call(llm_prompt, max_tokens=800)
        if not skill_content.strip():
            raise HTTPException(status_code=502, detail="LLM returned empty skill content")
    else:
        skill_content = f"---\nname: {body.skill_name}\ndescription: {body.description}\n---\n\nSkill extracted from session {body.session_id}."

    # Save skill to ~/.kodo/skills/
    skills_dir = KODO_DIR / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)
    skill_file = skills_dir / f"{body.skill_name}.md"
    skill_file.write_text(skill_content, encoding="utf-8")

    return {
        "skill_name": body.skill_name,
        "path": str(skill_file),
        "content": skill_content,
        "source_session": body.session_id,
    }


# ── 3. User Profiling ──────────────────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    traits: dict[str, str] = Field(default_factory=dict)
    preferences: dict[str, str] = Field(default_factory=dict)
    note: str = Field(default="", max_length=500)


def _load_profile() -> dict[str, Any]:
    if USER_PROFILE_PATH.exists():
        try:
            return json.loads(USER_PROFILE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "traits": {},
        "preferences": {},
        "expertise": {},
        "interaction_count": 0,
        "notes": [],
        "last_updated": "",
    }


def _save_profile(profile: dict[str, Any]) -> None:
    import datetime
    profile["last_updated"] = datetime.datetime.now().isoformat()
    USER_PROFILE_PATH.write_text(json.dumps(profile, indent=2), encoding="utf-8")


@router.get("/profile")
async def get_user_profile(request: Request):
    """Return the persistent user profile."""
    require_api_auth(request)
    return _load_profile()


@router.post("/profile")
async def update_user_profile(body: ProfileUpdateRequest, request: Request):
    """Merge new traits/preferences into the user profile."""
    require_api_auth(request)
    profile = _load_profile()
    profile["traits"].update(body.traits)
    profile["preferences"].update(body.preferences)
    if body.note:
        profile["notes"] = (profile.get("notes") or [])[-19:] + [body.note]
    profile["interaction_count"] = int(profile.get("interaction_count", 0)) + 1
    _save_profile(profile)
    return profile


@router.post("/profile/infer")
async def infer_profile_from_session(
    body: dict[str, str],
    request: Request,
):
    """Analyze a session and infer user traits/preferences to update profile."""
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "hermes_profile_infer")

    session_id = body.get("session_id", "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    session_file = SESSIONS_DIR / f"{session_id}.json"
    if not session_file.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    data = json.loads(session_file.read_text(encoding="utf-8", errors="replace"))
    messages = data.get("messages", [])

    conv_text = []
    for msg in messages[:20]:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if isinstance(content, str) and content.strip():
            conv_text.append(f"{role.upper()}: {content[:300]}")

    if not conv_text:
        return {"updated": False, "reason": "No messages to analyze"}

    current_profile = _load_profile()
    llm_prompt = (
        f"Analyze this conversation and infer facts about the user.\n\n"
        f"Conversation:\n{chr(10).join(conv_text)}\n\n"
        f"Current known traits: {json.dumps(current_profile.get('traits', {}))}\n\n"
        f"Respond ONLY with a JSON object (no extra text):\n"
        f'{{"traits": {{"key": "value"}}, "preferences": {{"key": "value"}}, "note": "one insight"}}\n'
        f"Examples of traits: skill_level=expert, domain=frontend, language=python\n"
        f"Examples of preferences: code_style=functional, verbosity=concise, frameworks=React"
    )

    try:
        raw = await _llm_call(llm_prompt, max_tokens=300)
        # Extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            inferred = json.loads(json_match.group())
            current_profile["traits"].update(inferred.get("traits", {}))
            current_profile["preferences"].update(inferred.get("preferences", {}))
            if inferred.get("note"):
                current_profile["notes"] = (current_profile.get("notes") or [])[-19:] + [inferred["note"]]
            current_profile["interaction_count"] = int(current_profile.get("interaction_count", 0)) + 1
            _save_profile(current_profile)
            return {"updated": True, "profile": current_profile, "inferred": inferred}
    except Exception as exc:
        logger.warning("Profile inference failed: %s", exc)

    return {"updated": False, "reason": "LLM inference returned unusable output"}
