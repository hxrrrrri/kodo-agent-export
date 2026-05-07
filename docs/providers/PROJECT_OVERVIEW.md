# Kodo Agent — Project Overview

> **Read this file first** before doing any work in this codebase. It is the single source of truth for architecture, skills, tools, features, and conventions. All AI providers (CLIs, APIs, local models) should consult this document — and the matching provider-specific doc — before reading individual project files.

---

## What Kodo Is

Kodo is an autonomous software-engineering agent platform. It orchestrates multiple LLM providers (Anthropic, OpenAI/Codex, Google Gemini, Ollama, NVIDIA, GitHub Models, OpenRouter, GitHub Copilot, plus local CLIs) behind one API and one chat UI, with shared:

- **Tool layer** — file ops, shell, git, web, browser, MCP, agents, skills, memory, design
- **Skill library** — 160+ markdown methodologies (design, code review, planning, etc.)
- **Artifact runtime** — live HTML / React / SVG / Mermaid / Markdown rendering in chat
- **Design Studio** — dedicated frontend-design surface with the Kodo Design supremacy prompt
- **Memory** — per-session and per-project context persistence
- **MCP** — Model Context Protocol server registry

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  frontend/   React + TS + Vite                              │
│  ├─ ChatWindow / DesignStudio / ArtifactGallery              │
│  ├─ ProviderPanel (model dropdown, profiles, switching)      │
│  └─ EditorPanel (code editor, file tree)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│  backend/   FastAPI + Python 3.10+                          │
│  ├─ api/             routers (chat, design, providers, ...) │
│  ├─ agent/           AgentLoop, SessionRunner, CLI runners  │
│  ├─ providers/       smart_router, gemini, groq, deepseek   │
│  ├─ tools/           40+ tool implementations               │
│  ├─ skills/          bundled methodologies (markdown)       │
│  ├─ artifacts/       artifact protocol + persistence        │
│  ├─ kodo/design/     Kodo Design Studio engine              │
│  ├─ kodo/capsule/    session capsule capture / replay       │
│  ├─ memory/          per-session/project context store      │
│  └─ mcp/             MCP server registry + stdio client     │
└─────────────────────────────────────────────────────────────┘
```

---

## Critical Files (Where to Make Changes)

| Area | File | Purpose |
|------|------|---------|
| Provider routing | `backend/agent/loop.py` | `AgentLoop` — orchestrates provider calls, tool loop, system prompt assembly |
| CLI dispatch | `backend/agent/cli_runner.py` | Discovers + invokes Claude / Codex / Gemini / Copilot CLIs, parses streaming events |
| Session lifecycle | `backend/agent/session_runner.py` | Streams session events, persists transcript, auto-titles |
| System prompt | `backend/agent/prompt_builder.py` | `build_system_prompt`, `build_cli_skill_injection`, `build_design_skill_injection`, `build_kodo_design_block` |
| Artifacts | `backend/artifacts/protocol_prompt.py` | Artifact fence protocol injected into every chat response |
| Kodo Design | `backend/kodo/design/generator.py` | `KODO_DESIGN_GENERATION_SYSTEM` — supremacy edition design prompt |
| Tools registry | `backend/tools/__init__.py` | `ALL_TOOLS` list, `TOOL_MAP` dict |
| Skills registry | `backend/skills/registry.py` | Skill discovery (project / custom / bundled), `skill_registry.list_skills()` / `get_skill(name)` |
| Skill settings | `backend/skills/settings.py` | Per-skill enable / auto_inject preferences |
| Smart router | `backend/providers/smart_router.py` | Latency / cost / balanced / quality routing across providers |
| Provider API | `backend/api/providers.py` | `/api/providers/*` — switch, ping, models, ollama setup, nvidia setup |
| Gateway status | `backend/api/gateway.py` | `/api/gateway/status` — which provider is active |
| Design API | `backend/api/design.py` | `/api/design/render` (Playwright PNG/PDF), `/api/design/options` |
| Design router | `backend/kodo/design/web/design_router.py` | `/api/design/intelligence/*`, `/api/design/history/*`, `/api/design/tweaks/*` |
| Chat router | `backend/api/chat.py` | `/api/chat/send` — main chat endpoint |
| Frontend chat | `frontend/src/components/ChatWindow.tsx` | Main chat UI |
| Frontend design | `frontend/src/components/DesignStudio.tsx` | Design window — uses Kodo Design system |

---

## Skills System

**Location**: `backend/skills/bundled/*.md` (~160 skills)

**Categories**:
- **Engineering**: smart-planner, task-planning, incident-response, production-hardening, code-review, bughunter, advisor-review, deep-reasoning, git-forensics, checkpoint-recovery, extension-development
- **Design — quality gates**: craft-anti-ai-slop, craft-color, craft-typography, design-brief, design-markdown-craft, open-design, huashu-design, tweaks
- **Design — surfaces**: saas-landing, dashboard, blog-post, docs-page, email-marketing, finance-report, html-ppt, kanban-board, invoice, digital-eguide, mobile-app, pricing-page, web-prototype, wireframe-sketch, social-carousel, image-poster, motion-frames, hyperframes, magazine-poster, 3d-web-design
- **Design systems** (`design-systems/*.md`, ~110): apple, anthropic-editorial, claude, figma, framer, stripe, spotify, tesla, nothing-os-stark, glassmorphism, cyberpunk-neon, ...
- **Caveman**: caveman, caveman-help, caveman-commit, caveman-review, caveman-compress (terse-output mode)

**How skills are loaded**:
1. **Auto-inject** — `skills/settings.py` controls which skills auto-inject into every system prompt. Default: `smart-planner`. Configurable via Skills Library panel.
2. **Smart selection** (CLI requests) — `prompt_builder.build_cli_skill_injection` picks top-relevant skills by keyword match against the user's request.
3. **Design mode** (design window) — `prompt_builder.build_design_skill_injection` force-includes design quality skills + surface-specific skills + relevant matches.

**Adding a skill**: drop a `.md` file in `backend/skills/bundled/` with frontmatter `--- name: my-skill\ndescription: ...\n ---`. It's discovered automatically.

---

## Tools System

**Location**: `backend/tools/*.py` (registered in `backend/tools/__init__.py`)

**Categories**:
- **Filesystem**: file_read, file_write, file_edit, glob_tool, grep
- **Shell**: bash, powershell, repl
- **VCS**: git_tool
- **Web**: web_fetch, krawlx (deep crawl), web_search
- **Browser**: browser_harness, browser_actions (BROWSER_ACTION_TOOLS — click/type/screenshot)
- **Tasks**: task_create, task_list, task_get, task_stop
- **Agents**: agent_spawn, agent_list, agent_get, agent_stop
- **MCP**: mcp_server_add, mcp_server_list, mcp_server_remove, mcp_tool_call
- **Skills**: skill_list, skill_get
- **Memory**: memory_write
- **Code Review Graph (CRG)**: crg_build_graph, crg_detect_changes, crg_get_impact_radius, crg_query_graph, crg_semantic_search, crg_get_architecture, crg_list_flows, crg_refactor, crg_get_review_context
- **Misc**: image_gen (DALL·E 3), screenshot, database_query, send_email, caveman

**Adding a tool**: subclass `BaseTool` (in `tools/base.py`), implement `name`, `description`, `input_schema`, `execute()`. Add to `ALL_TOOLS` in `tools/__init__.py`.

---

## Provider System

**API providers** (need keys):
- **anthropic** — `ANTHROPIC_API_KEY`, default `claude-sonnet-4-6`
- **openai** — `OPENAI_API_KEY`, default `gpt-4o`
- **gemini** — `GEMINI_API_KEY` or `GOOGLE_API_KEY`, default `gemini-2.0-flash`
- **deepseek** — `DEEPSEEK_API_KEY`
- **groq** — `GROQ_API_KEY`
- **openrouter** — `OPENROUTER_API_KEY`
- **github-models** — `GITHUB_MODELS_TOKEN`
- **codex** — `CODEX_API_KEY` (OpenAI-compatible)
- **nvidia** — `NVIDIA_API_KEY` (NIM endpoints)

**Local providers**:
- **ollama** — `OLLAMA_BASE_URL` (default `http://localhost:11434`), models discovered live
- **atomic-chat** — OpenAI-compatible local endpoint

**CLI providers** (no keys; rely on installed CLIs):
- **claude-cli** — `claude` binary (Anthropic Claude Code CLI)
- **codex-cli** — `codex` binary (OpenAI Codex CLI, ChatGPT VS Code extension)
- **gemini-cli** — `gemini` binary (Google Gemini CLI)
- **copilot-cli** — `gh copilot` or `copilot` binary

**Routing modes**:
- **fixed** — `PRIMARY_PROVIDER` env decides
- **smart** — `SmartRouter` picks per-request by `latency` / `cost` / `balanced` / `quality`

**Provider profiles** — `backend/profiles/manager.py`. Saved profiles bundle provider + model + base_url + api_key + goal. Active profile takes precedence over env when no env override is set.

---

## Artifact Protocol

**Location**: `backend/artifacts/protocol_prompt.py` (`ARTIFACT_PROTOCOL_PROMPT`)

**Fence format** (must close with bare ` ``` `):
```
\`\`\`artifact type=<type> id=<id> title="<title>" version=1
<code>
\`\`\`
```

Types: `html`, `react`, `svg`, `mermaid`, `markdown`, `code`, `dot`, `html-multi`, `react-multi`.

**Frontend renderers**: `frontend/src/components/artifacts/*Runtime.tsx`. Sandboxed via `SandboxIframe.tsx`.

**Storage**: `backend/artifacts/store.py` (`POST /api/artifacts/{session_id}` upserts versioned artifacts).

---

## Kodo Design System (Supremacy Edition)

**Location**: `backend/kodo/design/generator.py` (`KODO_DESIGN_GENERATION_SYSTEM`)

Activated when:
- User is in the Design Studio surface, OR
- `artifact_mode=True` AND request matches design intent (auto-detected by `is_design_window_request` in `prompt_builder.py`)

Provides:
- Mandatory HTML5 boilerplate (Google Fonts preconnect, Lucide icons, semantic structure)
- Full CSS custom property system (color, typography clamp scale, spacing, radius, shadows, transitions)
- Curated font pairs (Editorial, Modern Tech, Startup, Professional, Creative, Developer, Magazine, Minimal, High Fashion, Bold Impact)
- Production component patterns: button system (5 variants), card / glass card, sticky nav, mobile hamburger, forms
- Real Unsplash image patterns
- Section playbooks per surface (saas-landing, dashboard, portfolio, ecommerce, blog)
- Scroll animation pattern (IntersectionObserver)
- Quality enforcement — never/always lists

**Skill bundle** automatically injected with the design system: `craft-anti-ai-slop`, `craft-color`, `craft-typography`, `design-brief`, `design-markdown-craft`, `open-design`, `huashu-design`, `tweaks`, plus surface-specific skills (`saas-landing`, `dashboard`, etc.) detected from request keywords.

---

## Memory System

**Location**: `backend/memory/manager.py`

- **Session memory** — full chat transcript, metadata (title, mode, model_override, caveman_mode)
- **Project memory** — `~/.kodo/memory/` (per-project context Kodo loads into every prompt)

`memory_manager.load_memory(project_dir)` is called by `build_system_prompt`.

---

## MCP (Model Context Protocol)

**Location**: `backend/mcp/`
- `registry.py` — server config persisted to `~/.kodo/mcp/servers.json`
- `stdio_client.py` — invokes MCP servers over stdio
- Tools: `mcp_server_add`, `mcp_server_list`, `mcp_server_remove`, `mcp_tool_call`

Project MCP servers: `.kodo/mcp.json` (currently empty by default).

---

## Conventions

### Backend (Python)
- **Strict types** — modern Python type hints (`str | None`, `list[T]`)
- **Async-first** — FastAPI + `asyncio`
- **Tools** — subclass `BaseTool`, return `ToolResult(success, output, error?, metadata?)`
- **Streaming** — async generators yielding event dicts (`{type: "text"|"tool_start"|"tool_result"|"usage"|"done"|"error", ...}`)
- **Path safety** — use `tools/path_guard.py` (`project_dir_context`, `get_active_project_dir`)
- **Permissions** — `agent/permissions.py` (`get_permission_checker().check(tool, **input)`)

### Frontend (React)
- **TypeScript strict** — no `any` unless interfacing with raw API JSON
- **Stores** — Zustand (`store/chatStore.ts`)
- **Styling** — CSS variables (`var(--text)`, `var(--bg)`, `var(--accent)`) — not Tailwind
- **API headers** — always pass through `buildApiHeaders()` (handles auth + request IDs)

### Naming
- Files: `snake_case.py`, `PascalCase.tsx`
- Skills: `kebab-case` filename → `name: kebab-case` in frontmatter

---

## Provider-Specific Notes

When working as a particular provider, ALSO read your matching doc:
- **Claude CLI** → `docs/providers/cli/claude-cli.md`
- **Codex CLI** → `docs/providers/cli/codex-cli.md`
- **Gemini CLI** → `docs/providers/cli/gemini-cli.md`
- **Copilot CLI** → `docs/providers/cli/copilot-cli.md`
- **Anthropic API** → `docs/providers/api/anthropic-api.md`
- **OpenAI / Codex API** → `docs/providers/api/openai-api.md`
- **Gemini API** → `docs/providers/api/gemini-api.md`
- **Ollama** → `docs/providers/local/ollama.md`
- **Gemma** → `docs/providers/local/gemma.md`

---

## How to Work in This Codebase (Surgical Edits Only)

1. **Read PROJECT_OVERVIEW.md (this file) + your provider doc** — never the whole repo.
2. **Find the right file from the table above** — don't grep the entire project.
3. **Make minimal, surgical edits** — a bug fix doesn't need a refactor.
4. **Match existing conventions** — type hints, async patterns, CSS variables, skill frontmatter.
5. **Don't add backwards-compat shims** — the codebase moves forward.
6. **Verify** — run the relevant subset of `backend/tests/` or smoke-test the touched endpoint.

---

## Key Environment Variables

| Var | Purpose | Default |
|-----|---------|---------|
| `PRIMARY_PROVIDER` | Active provider when `ROUTER_MODE=fixed` | `anthropic` |
| `MODEL` | Active model | `claude-sonnet-4-6` |
| `ROUTER_MODE` | `fixed` or `smart` | `fixed` |
| `ROUTER_STRATEGY` | `latency`/`cost`/`balanced`/`quality` (smart mode) | `balanced` |
| `MAX_TOKENS` | Per-call token cap | `8192` |
| `MAX_CONTEXT_MESSAGES` | History truncation | `50` |
| `KODO_ENABLE_PROMPT_CACHE` | Anthropic prompt-cache | `0` |
| `KODO_NO_TELEMETRY` | Disable telemetry | unset |
| `KODO_*_CLI_PATH` | Override CLI exe locations | unset |
| `OLLAMA_BASE_URL` | Ollama endpoint | `http://localhost:11434` |
| `API_AUTH_TOKEN` | Optional API auth | unset |
| `PERMISSION_MODE` | Tool permission gate | `ask` |

---

## Quick Reference Commands

```bash
# Backend dev server
cd backend && python main.py

# Frontend dev server
cd frontend && npm run dev

# Backend tests
cd backend && pytest tests/

# Run a CLI provider directly (smoke test)
PRIMARY_PROVIDER=claude-cli python -m agent.cli_runner

# List installed CLIs and their statuses
curl http://localhost:8000/api/providers/cli-status

# List models per CLI
curl http://localhost:8000/api/providers/cli-models
```

---

**Last updated**: 2026-05-07. Keep this file current — it's the contract every provider relies on.
