"""
AntiVibe — AI code learning and deep-dive analysis.

Three layers:
  1. Static analysis (deterministic, no AI): symbols, concepts, resources
  2. Git-diff file discovery: list recently changed files
  3. LLM deep-dive: streams a structured explanation using the active provider
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.security import require_api_auth
from providers.openai_compat import openai_compat_chat

router = APIRouter(prefix="/api/antivibe", tags=["antivibe"])
logger = logging.getLogger(__name__)

# ── Load antivibe CLI module from sibling project ─────────────────────────────

_ANTIVIBE_MODULE: Any = None
_ANTIVIBE_PATHS = [
    Path(__file__).resolve().parents[3] / "antivibe" / "scripts" / "antivibe.py",
    Path(__file__).resolve().parents[2] / "antivibe" / "scripts" / "antivibe.py",
    Path.home() / "project_github" / "antivibe" / "scripts" / "antivibe.py",
    Path("C:/project_github/antivibe/scripts/antivibe.py"),
]


def _load_antivibe_module() -> Any | None:
    global _ANTIVIBE_MODULE
    if _ANTIVIBE_MODULE is not None:
        return _ANTIVIBE_MODULE

    for candidate in _ANTIVIBE_PATHS:
        if not candidate.exists():
            continue
        try:
            spec = importlib.util.spec_from_file_location("antivibe_cli", str(candidate))
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            sys.modules["antivibe_cli"] = module
            spec.loader.exec_module(module)
            _ANTIVIBE_MODULE = module
            logger.info("AntiVibe module loaded from %s", candidate)
            return module
        except Exception as exc:
            logger.warning("Failed to load antivibe module from %s: %s", candidate, exc)
    logger.warning("AntiVibe CLI not found — static analysis unavailable")
    return None


# ── System prompt for LLM deep dive ────────────────────────────────────────────

ANTIVIBE_SYSTEM_PROMPT = """\
You are AntiVibe — a code learning specialist. Your mission is to turn AI-generated code into deep learning opportunities.

Structure every response as:

## TL;DR
[One paragraph — what this code does and why it exists]

## Design Overview
[Architecture and design decisions — 2-4 bullet points]

## Code Walkthrough

For each file/section:
### `filename` — [purpose]
[Key functions/classes with "why" reasoning, citing line ranges where relevant]

## Concepts & Patterns

For each concept (design patterns, algorithms, data structures, language features):
**[Concept Name]**
- What: [plain language]
- Why used here: [design rationale]
- Trade-offs: [what you gain and give up]
- When to use: [appropriate contexts]

## Quality Score
- Coverage: [High/Medium/Low] — [reason]
- Depth: [High/Medium/Low] — [reason]
- Traceability: [High/Medium/Low] — citations back to code

## Learning Resources
[3-5 curated links to documentation, tutorials, or articles most relevant]

## Next Steps
[2-3 actionable suggestions for the developer]
"""


# ── Request models ─────────────────────────────────────────────────────────────

class AntiVibeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200_000)
    filename: str = Field(default="code", max_length=256)
    language: str = Field(default="", max_length=64)
    phase: str = Field(default="", max_length=128)
    stream: bool = Field(default=True)
    include_static: bool = Field(default=True)


class StaticAnalyzeRequest(BaseModel):
    paths: list[str] = Field(default_factory=list, max_length=50)
    code: str = Field(default="", max_length=200_000)
    filename: str = Field(default="", max_length=256)


class GitDiffRequest(BaseModel):
    repo: str = Field(default="", max_length=512)
    since_ref: str = Field(default="HEAD~1", max_length=128)
    limit: int = Field(default=20, ge=1, le=200)


class SaveDeepDiveRequest(BaseModel):
    phase: str = Field(min_length=1, max_length=128)
    content: str = Field(min_length=1, max_length=500_000)
    repo: str = Field(default="", max_length=512)


# ── Provider routing ───────────────────────────────────────────────────────────

def _request_overrides(request: Request | None) -> dict[str, str]:
    if request is None:
        return {}
    raw = getattr(request.state, "api_key_overrides", None)
    return raw if isinstance(raw, dict) else {}


def _key(request: Request | None, env_name: str) -> str:
    overrides = _request_overrides(request)
    val = str(overrides.get(env_name, "")).strip()
    if val:
        return val
    return os.getenv(env_name, "").strip()


async def _resolve_provider(request: Request | None = None) -> tuple[str, str, str, str]:
    """Return (provider, base_url, api_key, model).
    Priority: active profile → PRIMARY_PROVIDER env → first configured key.
    Supports cloud (anthropic, openai, openrouter, groq, deepseek, gemini)
    and local (ollama, atomic-chat) providers.
    Honors frontend X-Kodo-Keys overrides."""
    model_env = os.getenv("MODEL", "").strip()

    # Try active profile first — this is what kodo is actually connected to
    try:
        from profiles.manager import profile_manager
        active = await profile_manager.get_active_profile()
        if active is not None:
            p_name = str(active.provider or "").strip().lower()
            p_model = str(active.model or "").strip() or model_env
            p_key = str(active.api_key or "").strip() or _key(request, _KEY_ENV.get(p_name, ""))
            p_base = str(active.base_url or "").strip()
            if p_name in _LOCAL_PROVIDERS:
                base = p_base or _local_base(p_name)
                mdl = p_model or _default_model(p_name)
                return p_name, base, p_key or "local", mdl
            if p_key:
                base = p_base or _cloud_base(p_name)
                mdl = p_model or _default_model(p_name)
                return p_name, base, p_key, mdl
    except Exception:
        pass

    primary = os.getenv("PRIMARY_PROVIDER", "").strip().lower()
    candidates = [primary, "anthropic", "openai", "openrouter", "groq", "deepseek", "gemini", "ollama", "atomic-chat"]
    seen: set[str] = set()

    for name in candidates:
        if not name or name in seen:
            continue
        seen.add(name)

        if name in _LOCAL_PROVIDERS:
            base = _local_base(name)
            # Check if local service is reachable by seeing if base URL is configured
            base_env = os.getenv("OLLAMA_BASE_URL" if name == "ollama" else "ATOMIC_CHAT_BASE_URL", "").strip()
            if primary == name or base_env:
                mdl = model_env or _default_model(name)
                return name, base, "local", mdl
            continue

        api_key = _key(request, _KEY_ENV.get(name, ""))
        if api_key:
            base = _cloud_base(name)
            mdl = model_env or _default_model(name)
            return name, base, api_key, mdl

    raise HTTPException(
        status_code=503,
        detail=(
            "No AI provider configured for AntiVibe. "
            "In Kodo: open Providers, add an API key or configure Ollama, then switch to that provider. "
            "Alternatively set ANTHROPIC_API_KEY/OPENAI_API_KEY in the backend .env file."
        ),
    )


_LOCAL_PROVIDERS = {"ollama", "atomic-chat"}

_KEY_ENV: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "github-models": "GITHUB_MODELS_TOKEN",
    "codex": "CODEX_API_KEY",
}


def _cloud_base(name: str) -> str:
    defaults = {
        "anthropic": "https://api.anthropic.com",
        "openai": "https://api.openai.com/v1",
        "openrouter": "https://openrouter.ai/api/v1",
        "groq": "https://api.groq.com/openai/v1",
        "deepseek": "https://api.deepseek.com/v1",
        "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
        "github-models": "https://models.github.ai/inference",
        "codex": "https://api.openai.com/v1",
    }
    return defaults.get(name, "")


def _local_base(name: str) -> str:
    if name == "ollama":
        raw = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        return raw.rstrip("/v1").rstrip("/") + "/v1"
    if name == "atomic-chat":
        raw = os.getenv("ATOMIC_CHAT_BASE_URL", "http://127.0.0.1:1337").rstrip("/")
        return raw.rstrip("/v1").rstrip("/") + "/v1"
    return ""


def _default_model(name: str) -> str:
    defaults = {
        "anthropic": "claude-sonnet-4-6",
        "openai": "gpt-4o",
        "openrouter": "anthropic/claude-sonnet-4-6",
        "groq": "llama-3.3-70b-versatile",
        "deepseek": "deepseek-chat",
        "gemini": "gemini-2.0-flash",
        "github-models": "gpt-4o",
        "codex": "gpt-4o",
        "ollama": "llama3",
        "atomic-chat": "default",
    }
    return defaults.get(name, "")


# ── LLM streaming per provider ─────────────────────────────────────────────────

async def _stream_anthropic(api_key: str, base_url: str, model: str, system: str, user: str) -> AsyncIterator[str]:
    try:
        from anthropic import AsyncAnthropic
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"anthropic SDK load failed: {exc}") from exc

    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url and base_url != "https://api.anthropic.com":
        kwargs["base_url"] = base_url

    try:
        client = AsyncAnthropic(**kwargs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"anthropic client init failed: {exc}") from exc

    try:
        async with client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            async for chunk in stream.text_stream:
                if chunk:
                    yield chunk
    except Exception as exc:
        # Surface anthropic SDK errors (BadRequest, RateLimit, Auth, etc.)
        msg = f"{type(exc).__name__}: {exc}"
        raise HTTPException(status_code=502, detail=f"Anthropic stream failed — {msg}") from exc
    finally:
        try:
            await client.close()
        except Exception:
            pass


async def _stream_openai_compat(
    api_key: str, base_url: str, model: str, system: str, user: str, *, extra_headers: dict[str, str] | None = None
) -> AsyncIterator[str]:
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    stream = await openai_compat_chat(
        base_url=base_url,
        api_key=api_key,
        model=model,
        messages=messages,
        stream=True,
        max_tokens=4096,
        timeout=120.0,
        extra_headers=extra_headers,
    )
    if not hasattr(stream, "__aiter__"):
        raise HTTPException(status_code=500, detail="Provider returned non-streaming response")
    async for chunk in stream:  # type: ignore[union-attr]
        if chunk:
            yield chunk


async def _llm_stream(provider: str, base_url: str, api_key: str, model: str, system: str, user: str) -> AsyncIterator[str]:
    if provider == "anthropic":
        async for chunk in _stream_anthropic(api_key, base_url, model, system, user):
            yield chunk
        return

    extra_headers: dict[str, str] | None = None
    if provider == "openrouter":
        extra_headers = {"HTTP-Referer": "http://localhost", "X-Title": "kodo-antivibe"}

    async for chunk in _stream_openai_compat(api_key, base_url, model, system, user, extra_headers=extra_headers):
        yield chunk


# ── Static analysis helpers ────────────────────────────────────────────────────

def _language_from_filename(name: str) -> str:
    lower = name.lower()
    if lower.endswith((".ts", ".tsx")):
        return "typescript"
    if lower.endswith((".js", ".jsx", ".mjs")):
        return "javascript"
    if lower.endswith(".py"):
        return "python"
    if lower.endswith(".go"):
        return "go"
    if lower.endswith(".rs"):
        return "rust"
    if lower.endswith(".java"):
        return "java"
    if lower.endswith(".css"):
        return "css"
    if lower.endswith((".html", ".htm")):
        return "html"
    return ""


def _static_analyze_source(code: str, filename: str) -> dict[str, Any]:
    """Run antivibe's symbol/concept extraction on a code string."""
    module = _load_antivibe_module()
    if module is None:
        return {"available": False, "symbols": [], "concepts": [], "resources": []}

    extension = Path(filename).suffix.lower() or ".ts"
    language = module.EXTENSION_LANGUAGE.get(extension, "Unknown")

    try:
        if extension == ".py":
            symbols, imports, exports, key_points = module.parse_python_source(code)
        else:
            symbols, imports, exports, key_points = module.parse_text_source(code, extension)

        concepts = module.detect_concepts(code, language, symbols, filename)
        resources = module.select_resources(concepts, language, limit=8)

        return {
            "available": True,
            "filename": filename,
            "language": language,
            "line_count": len(code.splitlines()),
            "symbols": [{"kind": s.kind, "name": s.name, "line": s.line} for s in symbols[:30]],
            "imports": list(imports[:20]),
            "exports": list(exports[:20]),
            "concepts": list(concepts),
            "key_points": list(key_points),
            "resources": [
                {"title": r.title, "url": r.url, "description": r.description, "score": r.score}
                for r in resources
            ],
        }
    except Exception as exc:
        logger.exception("Static analysis failed")
        return {"available": False, "error": str(exc), "symbols": [], "concepts": [], "resources": []}


def _build_user_prompt(req: AntiVibeRequest, static_data: dict[str, Any] | None) -> str:
    lang = req.language.strip() or _language_from_filename(req.filename) or "unknown"
    phase_note = f" (phase: {req.phase})" if req.phase else ""
    parts = [
        f"Analyze this {lang} code{phase_note}. File: `{req.filename}`",
        "",
        f"```{lang}",
        req.code,
        "```",
    ]

    if static_data and static_data.get("available"):
        parts.append("")
        parts.append("## Pre-computed Static Analysis (use these as anchors for citations):")
        if static_data.get("symbols"):
            parts.append("**Symbols detected:**")
            for s in static_data["symbols"][:15]:
                parts.append(f"  - {s['kind']} `{s['name']}` at line {s['line']}")
        if static_data.get("concepts"):
            parts.append(f"**Concepts detected:** {', '.join(static_data['concepts'])}")
        if static_data.get("imports"):
            parts.append(f"**Imports:** {', '.join(static_data['imports'][:10])}")
        if static_data.get("resources"):
            parts.append("**Suggested resources (prefer these in output):**")
            for r in static_data["resources"][:5]:
                parts.append(f"  - [{r['title']}]({r['url']}) — {r['description']}")

    parts.append("")
    parts.append("Provide a complete AntiVibe deep-dive analysis following the structured format.")
    return "\n".join(parts)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def antivibe_analyze(body: AntiVibeRequest, request: Request):
    require_api_auth(request)

    static_data: dict[str, Any] | None = None
    if body.include_static:
        try:
            static_data = _static_analyze_source(body.code, body.filename or "code")
        except Exception:
            static_data = None

    # Resolve provider first; if no provider, return SSE error stream so frontend shows clear message
    try:
        provider, base_url, api_key, model = await _resolve_provider(request)
    except HTTPException as exc:
        if not body.stream:
            raise
        msg = exc.detail

        async def err_gen() -> AsyncIterator[str]:
            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"

        return StreamingResponse(
            err_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    user_prompt = _build_user_prompt(body, static_data)

    if not body.stream:
        # Non-streaming: collect full response
        chunks: list[str] = []
        try:
            async for piece in _llm_stream(provider, base_url, api_key, model, ANTIVIBE_SYSTEM_PROMPT, user_prompt):
                chunks.append(piece)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("AntiVibe analysis failed")
            raise HTTPException(status_code=502, detail=str(exc))
        return {
            "analysis": "".join(chunks),
            "model": model,
            "provider": provider,
            "static": static_data,
        }

    async def gen() -> AsyncIterator[str]:
        try:
            yield f"data: {json.dumps({'type': 'start', 'model': model, 'provider': provider})}\n\n"
            if static_data and static_data.get("available"):
                yield f"data: {json.dumps({'type': 'static', 'data': static_data})}\n\n"
            async for chunk in _llm_stream(provider, base_url, api_key, model, ANTIVIBE_SYSTEM_PROMPT, user_prompt):
                yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': exc.detail})}\n\n"
        except Exception as exc:
            logger.exception("AntiVibe stream error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/static-analyze")
async def antivibe_static_analyze(body: StaticAnalyzeRequest, request: Request):
    """Run antivibe's deterministic analysis with no LLM call. Fast."""
    require_api_auth(request)

    if not body.code and not body.paths:
        raise HTTPException(status_code=400, detail="Provide `code` or `paths`")

    if body.code:
        return _static_analyze_source(body.code, body.filename or "snippet")

    # paths: read each file and analyze
    results = []
    for path_str in body.paths[:50]:
        try:
            path = Path(path_str).expanduser().resolve()
            if not path.exists() or not path.is_file():
                results.append({"path": path_str, "error": "File not found"})
                continue
            if path.stat().st_size > 2_000_000:
                results.append({"path": path_str, "error": "File too large"})
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            data = _static_analyze_source(text, path.name)
            data["path"] = str(path)
            results.append(data)
        except Exception as exc:
            results.append({"path": path_str, "error": str(exc)})
    return {"results": results}


@router.post("/git-diff")
async def antivibe_git_diff(body: GitDiffRequest, request: Request):
    """List recently changed files in a git repo (diff-aware discovery)."""
    require_api_auth(request)

    repo_path = Path(body.repo).expanduser() if body.repo else Path.cwd()
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Repo path does not exist: {repo_path}")

    try:
        # diff vs the reference
        result = subprocess.run(
            ["git", "-C", str(repo_path), "diff", "--name-only", body.since_ref],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            # Fallback: list recently modified files by mtime
            candidates = []
            for f in repo_path.rglob("*"):
                if f.is_file() and f.suffix.lower() in {".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"}:
                    if not any(part in {"node_modules", "venv", ".venv", "dist", "build", "__pycache__"} for part in f.parts):
                        try:
                            candidates.append((f, f.stat().st_mtime))
                        except OSError:
                            pass
            candidates.sort(key=lambda x: -x[1])
            files = [str(f[0]) for f in candidates[: body.limit]]
            return {"files": files, "source": "mtime-fallback", "repo": str(repo_path)}

        files = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        # Also include untracked files
        untracked = subprocess.run(
            ["git", "-C", str(repo_path), "ls-files", "--others", "--exclude-standard"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if untracked.returncode == 0:
            files.extend([line.strip() for line in untracked.stdout.splitlines() if line.strip()])

        files = list(dict.fromkeys(files))[: body.limit]
        absolute = [str((repo_path / f).resolve()) for f in files if (repo_path / f).exists()]
        return {"files": absolute, "source": "git-diff", "repo": str(repo_path), "since": body.since_ref}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="git command timed out")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="git not found in PATH")


@router.post("/save-deep-dive")
async def antivibe_save_deep_dive(body: SaveDeepDiveRequest, request: Request):
    """Save deep-dive markdown to <repo>/deep-dive/<phase>-<timestamp>.md."""
    require_api_auth(request)

    repo_path = Path(body.repo).expanduser() if body.repo else Path.cwd()
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Repo path does not exist: {repo_path}")

    deep_dive_dir = repo_path / "deep-dive"
    deep_dive_dir.mkdir(parents=True, exist_ok=True)

    safe_phase = re.sub(r"[^a-z0-9\-_]+", "-", body.phase.lower()).strip("-") or "deep-dive"
    timestamp = dt.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    filename = f"{safe_phase}-{timestamp}.md"
    out_path = deep_dive_dir / filename

    try:
        out_path.write_text(body.content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write file: {exc}") from exc

    return {"path": str(out_path), "filename": filename, "bytes": len(body.content.encode("utf-8"))}


class FullScanRequest(BaseModel):
    repo: str = Field(default="", max_length=512)
    since_ref: str = Field(default="HEAD~5", max_length=128)
    max_files: int = Field(default=15, ge=1)
    phase: str = Field(default="full-scan", max_length=128)
    auto_save: bool = Field(default=True)
    include_unchanged: bool = Field(default=False)


def _discover_project_files(repo_path: Path, since_ref: str, max_files: int, include_unchanged: bool) -> tuple[list[Path], str]:
    """Return (files, source). Tries git diff, falls back to mtime."""
    SUPPORTED = {".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"}
    SKIP_PARTS = {"node_modules", "venv", ".venv", "dist", "build", "__pycache__", ".git", ".next", "target"}

    files: list[Path] = []
    source = "git-diff"

    if not include_unchanged:
        try:
            result = subprocess.run(
                ["git", "-C", str(repo_path), "diff", "--name-only", since_ref],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    p = (repo_path / line).resolve()
                    if p.exists() and p.is_file() and p.suffix.lower() in SUPPORTED:
                        files.append(p)
            untracked = subprocess.run(
                ["git", "-C", str(repo_path), "ls-files", "--others", "--exclude-standard"],
                capture_output=True, text=True, timeout=10,
            )
            if untracked.returncode == 0:
                for line in untracked.stdout.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    p = (repo_path / line).resolve()
                    if p.exists() and p.is_file() and p.suffix.lower() in SUPPORTED:
                        files.append(p)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    if not files or include_unchanged:
        # mtime fallback — top recently modified
        candidates: list[tuple[Path, float]] = []
        for f in repo_path.rglob("*"):
            if not f.is_file() or f.suffix.lower() not in SUPPORTED:
                continue
            if any(part in SKIP_PARTS for part in f.parts):
                continue
            try:
                candidates.append((f, f.stat().st_mtime))
            except OSError:
                continue
        candidates.sort(key=lambda x: -x[1])
        files = [c[0] for c in candidates]
        source = "mtime-fallback"

    # Deduplicate keeping order
    seen: set[Path] = set()
    deduped: list[Path] = []
    for f in files:
        if f not in seen:
            seen.add(f)
            deduped.append(f)
    return deduped[:max_files], source


@router.post("/full-scan")
async def antivibe_full_scan(body: FullScanRequest, request: Request):
    """One-click: discover → static analyze → AI deep-dive → save. SSE stream."""
    require_api_auth(request)

    repo_path = Path(body.repo).expanduser() if body.repo else Path.cwd()
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Repo path does not exist: {repo_path}")

    provider, base_url, api_key, model = await _resolve_provider(request)

    async def gen() -> AsyncIterator[str]:
        try:
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'discover', 'message': 'Discovering files...'})}\n\n"

            files, source = _discover_project_files(repo_path, body.since_ref, body.max_files, body.include_unchanged)
            yield f"data: {json.dumps({'type': 'discovered', 'count': len(files), 'source': source, 'files': [str(f) for f in files]})}\n\n"

            if not files:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No files discovered. Try include_unchanged=true or different since_ref.'})}\n\n"
                return

            # Static analysis loop
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'static', 'message': f'Analyzing {len(files)} files...'})}\n\n"
            analyses: list[dict[str, Any]] = []
            for idx, f in enumerate(files):
                try:
                    if f.stat().st_size > 2_000_000:
                        continue
                    text = f.read_text(encoding="utf-8", errors="replace")
                    data = _static_analyze_source(text, f.name)
                    if data.get("available"):
                        data["path"] = str(f)
                        data["rel_path"] = str(f.relative_to(repo_path)) if f.is_relative_to(repo_path) else f.name
                        analyses.append(data)
                        yield f"data: {json.dumps({'type': 'file_done', 'index': idx + 1, 'total': len(files), 'path': data['rel_path'], 'symbols': len(data.get('symbols', [])), 'concepts': data.get('concepts', [])})}\n\n"
                except Exception as exc:
                    yield f"data: {json.dumps({'type': 'file_error', 'path': str(f), 'message': str(exc)})}\n\n"

            # Aggregate
            all_concepts = sorted({c for a in analyses for c in a.get("concepts", [])})
            all_symbols = [{**s, "file": a.get("rel_path", "")} for a in analyses for s in a.get("symbols", [])]
            total_lines = sum(a.get("line_count", 0) for a in analyses)

            # Aggregate resources via antivibe module
            module = _load_antivibe_module()
            aggregated_resources: list[dict[str, Any]] = []
            if module and analyses:
                dominant_lang = analyses[0].get("language", "Unknown")
                try:
                    resources = module.select_resources(all_concepts, dominant_lang, limit=10)
                    aggregated_resources = [
                        {"title": r.title, "url": r.url, "description": r.description, "score": r.score}
                        for r in resources
                    ]
                except Exception:
                    pass

            aggregate = {
                "files_analyzed": len(analyses),
                "total_lines": total_lines,
                "all_concepts": all_concepts,
                "symbol_count": len(all_symbols),
                "top_symbols": all_symbols[:30],
                "resources": aggregated_resources,
            }
            yield f"data: {json.dumps({'type': 'static_done', 'aggregate': aggregate})}\n\n"

            # Build LLM prompt from aggregate
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'ai', 'message': 'Generating deep-dive...'})}\n\n"

            prompt_lines = [
                f"Generate a comprehensive deep-dive analysis of this project's recent changes.",
                f"Files analyzed: {len(analyses)} ({total_lines} lines total)",
                f"Concepts detected: {', '.join(all_concepts) or 'none'}",
                "",
                "## File-by-file static summary:",
            ]
            for a in analyses[:body.max_files]:
                prompt_lines.append(f"\n### {a.get('rel_path', a.get('filename', '?'))} ({a.get('language', '?')}, {a.get('line_count', 0)} lines)")
                if a.get("concepts"):
                    prompt_lines.append(f"- Concepts: {', '.join(a['concepts'])}")
                if a.get("symbols"):
                    syms = ", ".join(f"{s['kind']} {s['name']}@L{s['line']}" for s in a["symbols"][:10])
                    prompt_lines.append(f"- Symbols: {syms}")
                if a.get("imports"):
                    prompt_lines.append(f"- Imports: {', '.join(a['imports'][:8])}")
                if a.get("key_points"):
                    for kp in a["key_points"][:3]:
                        prompt_lines.append(f"- {kp}")

            if aggregated_resources:
                prompt_lines.append("\n## Curated learning resources to reference:")
                for r in aggregated_resources[:5]:
                    prompt_lines.append(f"- [{r['title']}]({r['url']}) — {r['description']}")

            prompt_lines.append("\nProduce a highly detailed, professional AntiVibe deep-dive covering ALL files holistically. Focus on:")
            prompt_lines.append("1. **In-depth Architecture**: Explain the overall system design and architecture clearly.")
            prompt_lines.append("2. **Data Workflow**: Detail how data flows between components and layers (database, api, frontend).")
            prompt_lines.append("3. **Wireframes**: Diagram or describe how these components map to user interfaces and wireframes.")
            prompt_lines.append("4. **Technology Choices**: Deeply analyze why these specific technologies/patterns are used, why alternatives weren't chosen, and why this is the best fit.")
            prompt_lines.append("5. **Study Materials**: Provide links and recommendations for the best official docs, highly-rated YouTube video concepts, and further reading for these specific frameworks/patterns.")
            user_prompt = "\n".join(prompt_lines)

            collected_text: list[str] = []
            async for chunk in _llm_stream(provider, base_url, api_key, model, ANTIVIBE_SYSTEM_PROMPT, user_prompt):
                collected_text.append(chunk)
                yield f"data: {json.dumps({'type': 'ai_text', 'content': chunk})}\n\n"

            full_analysis = "".join(collected_text)

            # Auto-save
            saved_path: str | None = None
            if body.auto_save and full_analysis.strip():
                yield f"data: {json.dumps({'type': 'phase', 'phase': 'save', 'message': 'Saving deep-dive...'})}\n\n"
                deep_dive_dir = repo_path / "deep-dive"
                deep_dive_dir.mkdir(parents=True, exist_ok=True)
                safe_phase = re.sub(r"[^a-z0-9\-_]+", "-", body.phase.lower()).strip("-") or "full-scan"
                timestamp = dt.datetime.now().strftime("%Y-%m-%d-%H%M%S")
                out_path = deep_dive_dir / f"{safe_phase}-{timestamp}.md"

                header = [
                    f"# Deep Dive: {body.phase}",
                    "",
                    f"_Generated by Kodo · AntiVibe Full Scan · {dt.datetime.now().isoformat()}_",
                    f"_Provider: {provider} · Model: {model}_",
                    f"_Files analyzed: {len(analyses)} · Total lines: {total_lines}_",
                    f"_Concepts: {', '.join(all_concepts) or 'none'}_",
                    "",
                    "## Files Analyzed",
                    "",
                ]
                for a in analyses:
                    header.append(f"- `{a.get('rel_path', a.get('filename', '?'))}` ({a.get('language', '?')}, {a.get('line_count', 0)} lines)")
                header.append("")
                header.append("---")
                header.append("")

                try:
                    out_path.write_text("\n".join(header) + full_analysis, encoding="utf-8")
                    saved_path = str(out_path)
                    yield f"data: {json.dumps({'type': 'saved', 'path': saved_path, 'filename': out_path.name})}\n\n"
                except OSError as exc:
                    yield f"data: {json.dumps({'type': 'save_error', 'message': str(exc)})}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'files_analyzed': len(analyses), 'concepts': all_concepts, 'saved': saved_path})}\n\n"

        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': exc.detail})}\n\n"
        except Exception as exc:
            logger.exception("Full scan failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/status")
async def antivibe_status(request: Request):
    """Report availability of antivibe CLI module and providers."""
    require_api_auth(request)
    module = _load_antivibe_module()
    module_ok = module is not None

    configured_providers = []
    for name, env in [
        ("anthropic", "ANTHROPIC_API_KEY"),
        ("openai", "OPENAI_API_KEY"),
        ("openrouter", "OPENROUTER_API_KEY"),
        ("groq", "GROQ_API_KEY"),
        ("deepseek", "DEEPSEEK_API_KEY"),
        ("gemini", "GEMINI_API_KEY"),
    ]:
        if _key(request, env):
            configured_providers.append(name)

    # Check local providers (Ollama, atomic-chat)
    primary = os.getenv("PRIMARY_PROVIDER", "").strip().lower()
    ollama_base = os.getenv("OLLAMA_BASE_URL", "").strip()
    if primary == "ollama" or ollama_base:
        if "ollama" not in configured_providers:
            configured_providers.append("ollama")
    atomic_base = os.getenv("ATOMIC_CHAT_BASE_URL", "").strip()
    if primary == "atomic-chat" or atomic_base:
        if "atomic-chat" not in configured_providers:
            configured_providers.append("atomic-chat")

    # Check active profile — whatever Kodo is currently connected to
    active_provider_name: str | None = None
    try:
        from profiles.manager import profile_manager
        active = await profile_manager.get_active_profile()
        if active is not None:
            p_name = str(active.provider or "").strip().lower()
            if p_name:
                active_provider_name = p_name
                if p_name not in configured_providers:
                    configured_providers.append(p_name)
    except Exception:
        pass

    return {
        "cli_module_loaded": module_ok,
        "configured_providers": configured_providers,
        "primary_provider": active_provider_name or primary or None,
    }

