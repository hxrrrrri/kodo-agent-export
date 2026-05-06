<div align="center">

```

=     =   ======   ======    ======
=    =   =      =  =     =  =      =
=   =    =      =  =      = =      =
=  =     =      =  =      = =      =
===      =      =  =      = =      =
=  =     =      =  =      = =      =
=   =    =      =  =      = =      =
=    =   =      =  =     =  =      =
=     =   ======   ======    ======

```

<img src="docs/assets/kodo-hero.png" alt="KODO Agent" width="520"/>

---

**KODO** is a fully self-hosted autonomous coding agent.  
FastAPI backend · React UI · Multi-provider AI · Real-time streaming · Session memory · Live artifacts · Multi-model conference · Advanced UI customization

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Table of Contents

- [What is KODO?](#what-is-kodo)
- [Feature Highlights](#feature-highlights)
- [Architecture](#architecture)
- [File Structure](#file-structure)
- [Quick Start](#quick-start)
- [Docker Setup](#docker-setup)
- [Configuration & Feature Flags](#configuration--feature-flags)
- [AI Providers](#ai-providers)
- [Smart Router](#smart-router)
- [Agent Modes](#agent-modes)
- [Artifacts v2](#artifacts-v2)
- [Design Studio](#design-studio)
- [Multi-Model Conference](#multi-model-conference)
- [Theme Studio](#theme-studio)
- [Power User Features](#power-user-features)
- [Slash Commands](#slash-commands)
- [Built-in Tools](#built-in-tools)
- [Skills System](#skills-system)
- [Collaboration Mode](#collaboration-mode)
- [Prompt Library](#prompt-library)
- [Notebook Panel](#notebook-panel)
- [Session Replay](#session-replay)
- [Cron & Scheduling](#cron--scheduling)
- [Marketplace Packs](#marketplace-packs)
- [KrawlX Web Crawler](#krawlx-web-crawler)
- [API Reference](#api-reference)
- [Permission System](#permission-system)
- [Observability](#observability)
- [VSCode Extension](#vscode-extension)
- [Validation & Testing](#validation--testing)
- [Android / Mobile](#android--mobile)

---

## What is KODO?

KODO is a **self-hosted AI coding agent** you run on your own machine or server. It gives you a full chat interface powered by any major AI provider — Anthropic Claude, OpenAI GPT, Gemini, DeepSeek, Groq, Ollama, and more — with a rich set of agent capabilities:

- **Autonomous tool execution** — the agent reads files, runs bash/shell commands, searches the web, queries databases, and edits code end-to-end.
- **Live artifacts** — Claude.ai-style artifact side panel with sandboxed React/HTML/SVG/Mermaid/Graphviz/Markdown preview, multi-file bundles, versioning with diff view, ZIP download, public share links, and fullscreen mode. Provider-neutral: works with any configured provider.
- **Multi-model conference** — send the same prompt to 2-6 different AI models simultaneously, watch them respond in parallel columns, and get a synthesized best-of-all answer.
- **Session memory** — every conversation is persisted locally under `~/.kodo`, with full checkpoint, fork/branch, and restore support.
- **Multi-provider smart routing** — switch providers on the fly or let KODO automatically route to the fastest, cheapest, or highest-quality provider.
- **Theme Studio** — full real-time UI customizer with canvas HSL color picker, gradient builder, custom CSS injection, and named theme persistence.
- **Collaboration** — share a live read-only view of any session or individual artifact via a share link.
- **Replay** — step through any past session like a video with autoplay and JSON export.
- **Design Studio** — visual web editor with drag-drop, live theme extraction, clipboard paste, and iframe harness for building pages without writing code.
- **Prompt & skill library** — build, store, and reuse prompt templates (with `{{variable}}` fill-in UI) and custom markdown skills.
- **Cron scheduler** — fire agent runs on simple intervals (`every_15_minutes`, `daily_09:00`, etc.).
- **Marketplace packs** — export/import skills, prompts, and cron jobs as zip bundles.
- **PWA support** — install as a desktop app with offline shell caching.

Everything runs locally. No cloud dependency beyond your chosen AI provider API key.

---

## Feature Highlights

| Category | Features |
|---|---|
| **Chat & Streaming** | SSE streaming with real-time tool output, token-level deltas, auto-generated session titles, draft auto-save, prompt history (up/down), clipboard paste |
| **Agent Execution** | Autonomous bash/shell/PowerShell execution, file read/write/edit, git tool, glob, grep, REPL, inline code runner |
| **Memory & Sessions** | Persistent sessions under `~/.kodo`, checkpoints, restore, session branching (fork), conversation export (Markdown + HTML snapshot) |
| **Multi-Provider** | Anthropic, OpenAI, Gemini, DeepSeek, Groq, OpenRouter, GitHub Models, Ollama, AtomicChat, Codex |
| **Smart Router** | Health-checked auto-routing by latency, cost, quality, or balanced strategy |
| **Multi-Model Conference** | Debate the same prompt across 2-6 models simultaneously; synthesizer produces a composite best answer |
| **Agent Modes** | Execute, Plan, Debug, Review, Coordinator, BugHunter, UltraPlan — each with distinct prompting behavior |
| **Artifacts v2** | Live preview (HTML / React+JSX / SVG / Mermaid / Markdown / Graphviz), multi-file bundles, versioning + diff, ZIP download, public share links, fullscreen mode, provider-neutral text protocol |
| **Artifact Gallery** | Browse all artifacts across all sessions in a searchable, filterable grid |
| **Design Studio** | Visual web editor with drag-drop, theme extraction, iframe harness, DOM tree view, undo/redo, clipboard paste |
| **Theme Studio** | Full CSS variable editor, canvas-based HSL color picker, gradient builder (linear/radial, unlimited stops), typography controls, custom CSS injection, named theme save/load/export |
| **Session Insights** | Real-time analytics — message counts, token usage, cost, top tools, conversation topics, most-referenced files |
| **Smart Suggestions** | Context-aware follow-up chips after each response — test/fix/optimize/summarize based on content |
| **Collaboration** | Share links, observer read-only mode, live SSE viewer stream, shared artifact pages |
| **Replay** | Step controls, autoplay, JSON export, message highlighting |
| **Prompt Library** | CRUD API + UI, `{{variable}}` template rendering with fill-in modal |
| **Custom Skills** | Markdown-based skill builder with upload/edit UI |
| **Code Review** | Built-in AI code review panel (`/api/chat/code-review`) |
| **Notebook** | Python/Node cell execution with per-cell outputs |
| **Split Editor** | CodeMirror editor with open/edit/save + diff preview |
| **Web Search** | Firecrawl, Tavily, SerpAPI, DuckDuckGo fallback |
| **KrawlX** | Structured website crawler with callback webhook delivery |
| **Screenshot** | URL screenshot capture with base64 PNG output (opt-in) |
| **Database** | Read-only SQL via `SELECT` — SQLite, PostgreSQL, MySQL (opt-in) |
| **Email** | SMTP dispatch via `send_email` tool (opt-in) |
| **TTS** | OpenAI text-to-speech with browser speech fallback (opt-in) |
| **Image Gen** | DALL-E 3 image generation (opt-in) |
| **Cron** | Agent runs on simple interval expressions, stored under `~/.kodo/cron.json` |
| **Marketplace** | Export/import skills + prompts + cron as `.kodopack` zip bundles |
| **MCP Servers** | Add/remove/call Model Context Protocol tool servers |
| **Webhooks** | Inbound webhook endpoint with HMAC signature verification |
| **Notifications** | Browser + desktop notification center |
| **PWA** | Install prompt, web manifest, service worker shell caching |
| **Profiles** | Named provider/model/mode configuration bundles |
| **Observability** | Per-request audit log, usage JSONL, request-id tracing |
| **Rate Limiting** | Configurable per-endpoint limits |
| **Auth** | Optional bearer token auth for the API |
| **Doctor** | `/doctor` self-diagnostic tool with environment report |
| **Status Bar** | VS Code-style bottom bar with live mode, model, context %, cost, shortcuts |
| **Focus Mode** | Cmd+Shift+F full-screen distraction-free writing mode |
| **Response Depth** | Per-send depth selector: Concise / Balanced / Thorough / Expert |
| **Project Brief** | Persistent context notes injected silently into every message |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      React Frontend                      │
│  ChatWindow · Sidebar · TerminalPanel · NotebookPanel   │
│  ReplayPanel · SkillBuilderPanel · PromptLibraryPanel   │
│  CollabBar · EditorPanel · CodeReviewPanel · AgentGraph │
│              Zustand Store · Vite · TypeScript           │
└────────────────────────┬────────────────────────────────┘
                         │  HTTP + SSE (EventSource)
┌────────────────────────▼────────────────────────────────┐
│                    FastAPI Backend                        │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  /chat   │  │ /collab  │  │/prompts  │  │/skills │ │
│  │   API    │  │   API    │  │   API    │  │  API   │ │
│  └────┬─────┘  └──────────┘  └──────────┘  └────────┘ │
│       │                                                  │
│  ┌────▼──────────────────────────────────────────────┐  │
│  │              SessionRunner + AgentLoop             │  │
│  │   PromptBuilder · PermissionHub · Coordinator     │  │
│  └────┬──────────────────────────────────────────────┘  │
│       │                                                  │
│  ┌────▼──────────────────────────────────────────────┐  │
│  │                  Tool Orchestration                │  │
│  │  bash · file_read/write/edit · git · glob · grep  │  │
│  │  web_fetch · web_search · krawlx · repl · screenshot│  │
│  │  database_query · send_email · image_gen · caveman│  │
│  │  mcp_* · task_* · agent_* · memory_write          │  │
│  └────┬──────────────────────────────────────────────┘  │
│       │                                                  │
│  ┌────▼──────────────────────────────────────────────┐  │
│  │               Smart Router / Providers             │  │
│  │  Anthropic · OpenAI · Gemini · DeepSeek · Groq    │  │
│  │  OpenRouter · GitHub Models · Ollama · Codex      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  Storage: ~/.kodo/{sessions, usage, audit, profiles,   │
│                    artifacts, cron, bridge, skills}     │
└─────────────────────────────────────────────────────────┘
         │
┌────────▼────────┐
│  VSCode Extension│  (optional sidecar bridge)
└─────────────────┘
```

### Key Backend Modules

| Module | Purpose |
|---|---|
| `backend/agent/session_runner.py` | Core agent loop, streaming, tool dispatch |
| `backend/agent/loop.py` | Autonomous execution loop with tool call handling |
| `backend/agent/prompt_builder.py` | System prompt assembly with mode + artifact + skill injection |
| `backend/agent/coordinator.py` | Multi-agent coordination |
| `backend/agent/permissions.py` | Tool permission checking and approval |
| `backend/agent/modes.py` | Execute / Plan / Debug / Review mode definitions |
| `backend/artifacts/` | Artifact v2 protocol prompt + session-scoped store |
| `backend/providers/smart_router.py` | Health-checked multi-provider routing |
| `backend/providers/` | Individual provider adapters (OpenAI-compat, Gemini, etc.) |
| `backend/api/chat.py` | Chat + session REST + SSE endpoints |
| `backend/api/artifacts.py` | Artifact upsert/list/get + public share endpoint |
| `backend/api/collab.py` | Collaboration share/view/stream endpoints |
| `backend/api/cron.py` | Cron scheduler endpoints + background fire loop |
| `backend/api/marketplace.py` | Pack export/import endpoints |
| `backend/api/krawlx.py` | Structured web crawler with signed callback delivery |
| `backend/api/prompts.py` | Prompt library CRUD |
| `backend/api/skills_admin.py` | Custom skill CRUD |
| `backend/tools/` | All 30+ agent tools |
| `backend/mcp/` | MCP server registry and stdio client |
| `backend/observability/` | Audit log, usage log, request context |
| `backend/profiles/` | Named configuration profiles |
| `backend/commands/router.py` | Slash command parsing and dispatch |
| `backend/memory/manager.py` | Agent memory read/write |
| `backend/tasks/manager.py` | Background task lifecycle |
| `backend/bridge/` | VSCode bridge auth + manager |

---

## File Structure

```
kodo-agent-export/
│
├── backend/                        # FastAPI Python backend
│   ├── main.py                     # App entry point, CORS, middleware, routers
│   ├── requirements.txt            # Python dependencies
│   ├── .env.example                # All environment variables documented
│   ├── doctor.py                   # Environment self-diagnostic
│   ├── privacy.py                  # Telemetry opt-out + httpx client builder
│   ├── conftest.py                 # Pytest fixtures
│   ├── mypy.ini                    # Type-checker config
│   │
│   ├── agent/                      # Core agent engine
│   │   ├── session_runner.py       # Session lifecycle + streaming
│   │   ├── loop.py                 # Autonomous tool execution loop
│   │   ├── prompt_builder.py       # System prompt construction
│   │   ├── coordinator.py          # Multi-agent coordination
│   │   ├── modes.py                # Agent modes (execute/plan/debug/review)
│   │   └── permissions.py          # Tool permission gate
│   │
│   ├── api/                        # REST + SSE route handlers
│   │   ├── chat.py                 # /api/chat — send, sessions, stream, code-review
│   │   ├── artifacts.py            # /api/artifacts — upsert, list, get, share
│   │   ├── collab.py               # /api/collab — share, observe, viewer stream
│   │   ├── cron.py                 # /api/cron — scheduled agent jobs
│   │   ├── marketplace.py          # /api/marketplace — pack export/import
│   │   ├── krawlx.py               # /api/krawlx — structured crawler
│   │   ├── prompts.py              # /api/prompts — CRUD + render
│   │   ├── skills_admin.py         # /api/skills/custom — CRUD
│   │   ├── providers.py            # /api/providers — list, switch
│   │   ├── profiles.py             # /api/profiles — list, activate
│   │   ├── doctor.py               # /api/doctor — diagnostics
│   │   ├── tts.py                  # /api/tts — text-to-speech
│   │   ├── webhooks.py             # /api/webhooks — inbound hooks
│   │   ├── bridge.py               # /api/bridge — VSCode bridge
│   │   ├── permission_hub.py       # /api/permissions — approval UI support
│   │   └── security.py             # Auth token middleware
│   │
│   ├── artifacts/                  # Artifact v2 module
│   │   ├── protocol_prompt.py      # Provider-neutral system prompt block
│   │   └── store.py                # Session-scoped LRU artifact store
│   │
│   ├── tools/                      # Agent tool implementations
│   │   ├── bash.py                 # Shell command execution
│   │   ├── powershell.py           # PowerShell execution (Windows)
│   │   ├── repl.py                 # Python/Node REPL
│   │   ├── file_read.py            # File reading
│   │   ├── file_write.py           # File writing
│   │   ├── file_edit.py            # Targeted file editing
│   │   ├── git_tool.py             # Git operations
│   │   ├── glob_tool.py            # File pattern matching
│   │   ├── grep.py                 # Content search
│   │   ├── web_fetch.py            # URL fetch
│   │   ├── web_search.py           # Web search (multi-provider)
│   │   ├── screenshot.py           # URL screenshot → base64 PNG
│   │   ├── database_query.py       # Read-only SQL queries
│   │   ├── send_email.py           # SMTP email dispatch
│   │   ├── image_gen.py            # DALL-E 3 image generation
│   │   ├── memory_write.py         # Agent memory persistence
│   │   ├── mcp_*.py                # MCP server tools (list/add/remove/call)
│   │   ├── task_*.py               # Background task tools (create/get/stop)
│   │   ├── agent_*.py              # Sub-agent tools (spawn/list/get/stop)
│   │   ├── skill_*.py              # Skill tools (list/get/run)
│   │   ├── path_guard.py           # Path allowlist/blocklist enforcement
│   │   └── base.py                 # Tool base class
│   │
│   ├── providers/                  # AI provider adapters
│   │   ├── smart_router.py         # Health-checked multi-provider router
│   │   ├── openai_compat.py        # OpenAI-compatible adapter (covers most)
│   │   ├── gemini_provider.py      # Google Gemini native adapter
│   │   ├── deepseek_provider.py    # DeepSeek adapter
│   │   ├── groq_provider.py        # Groq adapter
│   │   ├── ollama_provider.py      # Local Ollama adapter
│   │   ├── atomic_chat_provider.py # AtomicChat local adapter
│   │   └── discovery.py            # Provider auto-discovery
│   │
│   ├── skills/bundled/             # Built-in agent skills (markdown)
│   │   ├── code-review.md
│   │   ├── task-planning.md
│   │   ├── git-forensics.md
│   │   ├── incident-response.md
│   │   ├── testing-validation.md
│   │   ├── checkpoint-recovery.md
│   │   ├── extension-development.md
│   │   ├── production-hardening.md
│   │   ├── ui-polish.md
│   │   ├── web-research.md
│   │   ├── caveman.md
│   │   ├── caveman-help.md
│   │   ├── caveman-commit.md
│   │   ├── caveman-review.md
│   │   └── caveman-compress.md
│   │
│   ├── commands/router.py          # Slash command routing
│   ├── mcp/                        # MCP server registry + stdio client
│   ├── memory/manager.py           # Memory read/write
│   ├── tasks/manager.py            # Background task management
│   ├── profiles/manager.py         # Profile configuration management
│   ├── bridge/                     # VSCode bridge auth + connection manager
│   ├── observability/              # Audit log, usage log, request-id context
│   ├── tests/                      # Backend test suite
│   └── Dockerfile
│
├── frontend/                       # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx                 # Root component + routing
│   │   ├── main.tsx                # Vite entry point
│   │   ├── store/
│   │   │   └── chatStore.ts        # Zustand global state
│   │   ├── hooks/
│   │   │   ├── useChat.ts          # Chat send/stream hook
│   │   │   └── useCollabSession.ts # Collaboration session hook
│   │   ├── lib/
│   │   │   ├── api.ts              # Typed API client
│   │   │   ├── notifications.ts    # Notification helper
│   │   │   └── artifacts/          # Parser, types, ZIP download
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx      # Main chat interface
│   │   │   ├── MessageBubble.tsx   # Individual message rendering
│   │   │   ├── ToolCallCard.tsx    # Tool call display
│   │   │   ├── Sidebar.tsx         # Session list + navigation
│   │   │   ├── TerminalPanel.tsx   # Embedded terminal output
│   │   │   ├── NotebookPanel.tsx   # Python/Node notebook
│   │   │   ├── ReplayPanel.tsx     # Session replay controls
│   │   │   ├── CodeReviewPanel.tsx # AI code review panel
│   │   │   ├── EditorPanel.tsx     # CodeMirror split editor
│   │   │   ├── CollabBar.tsx       # Collaboration share/observe bar
│   │   │   ├── PromptLibraryPanel.tsx # Prompt template management
│   │   │   ├── SkillBuilderPanel.tsx  # Custom skill editor
│   │   │   ├── ProviderPanel.tsx   # Provider/model switcher
│   │   │   ├── NotificationCenter.tsx # Notification inbox
│   │   │   ├── AgentGraph.tsx      # Agent execution graph view
│   │   │   ├── DesignStudio.tsx    # Visual web editor
│   │   │   ├── VisualWebEditorArtifact.tsx # Iframe-based DOM editor
│   │   │   ├── ArtifactSidePanel.tsx  # Legacy v1 artifact panel
│   │   │   ├── artifacts/          # Artifact v2 runtimes (html, react, svg, mermaid, markdown, dot, code), diff view, file tree, version switcher, side panel
│   │   │   └── KodoLogoMark.tsx    # Logo component
│   │   ├── pages/
│   │   │   └── SharedArtifactPage.tsx # Public read-only artifact view
│   │   └── styles/                 # Global CSS
│   └── package.json
│
├── vscode-extension/
│   └── kodo-vscode/                # VSCode extension (TypeScript)
│       ├── src/                    # Extension source
│       ├── package.json
│       └── README.md
│
├── docs/
│   └── assets/
│       └── kodo-hero.png           # Hero image
│
├── .github/                        # CI/CD workflows
├── docker-compose.yml              # Full stack Docker Compose
├── setup.sh                        # Linux/macOS quick setup script
├── setup.ps1                       # Windows PowerShell quick setup
├── ANDROID_INSTALL.md              # Android / Termux install guide
└── README.md
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- At least one AI provider API key (Anthropic, OpenAI, etc.)

### 1 — Clone

```bash
git clone https://github.com/hxrrrrri/kodo-agent-export.git
cd kodo-agent-export
```

### 2 — Backend

```bash
cd backend
python -m venv .venv

# Linux / macOS
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and set at least one provider key:

```env
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...
```

Start the backend:

```bash
uvicorn main:app --reload --port 8000
```

### 3 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### One-line setup (Linux/macOS)

```bash
chmod +x setup.sh && ./setup.sh
```

### One-line setup (Windows PowerShell)

```powershell
.\setup.ps1
```

---

## Docker Setup

Run the full stack with Docker Compose:

```bash
cp backend/.env.example backend/.env
# edit backend/.env — set your API key

docker-compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Health Check | http://localhost:8000/health |

---

## Configuration & Feature Flags

All configuration lives in `backend/.env`. Copy `backend/.env.example` to `backend/.env` to get started.

### Core Settings

```env
# Provider & Model
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
PRIMARY_PROVIDER=anthropic
MODEL=claude-sonnet-4-6

# Agent Behaviour
MAX_TOKENS=8192
MAX_CONTEXT_MESSAGES=50
PERMISSION_MODE=ask           # ask | auto | yolo

# Security
API_AUTH_TOKEN=               # optional bearer token
ALLOWED_ORIGINS=http://localhost:5173
```

### Feature Flags

| Flag | Default | Description |
|---|---|---|
| `KODO_ENABLE_ARTIFACTS_V2` | `1` | Provider-neutral artifact protocol + live preview |
| `KODO_ENABLE_SMART_ROUTER` | `1` | Multi-provider health-checked routing |
| `KODO_ENABLE_PROVIDER_DISCOVERY` | `1` | Auto-detect configured providers |
| `KODO_ENABLE_PROFILES` | `1` | Named provider/model/mode profiles |
| `KODO_ENABLE_SESSION_RUNNER` | `1` | Persistent session management |
| `KODO_ENABLE_MEMORY_WRITE` | `1` | Agent memory persistence |
| `KODO_ENABLE_REPL_PERSISTENCE` | `1` | Stateful REPL sessions |
| `KODO_ENABLE_STREAMING_TOOLS` | `1` | Stream bash output lines in real time |
| `KODO_ENABLE_AUTO_TITLE` | `1` | Auto-generate session titles |
| `KODO_ENABLE_PROMPT_CACHE` | `1` | Anthropic prompt caching |
| `KODO_ENABLE_COMMAND_EXPANSION` | `1` | Slash command processing |
| `KODO_ENABLE_WEBHOOKS` | `1` | Inbound webhook endpoint |
| `KODO_ENABLE_DOCTOR` | `1` | `/doctor` diagnostic endpoint |
| `KODO_ENABLE_CRON` | `1` | Background cron loop + API |
| `KODO_ENABLE_KRAWLX` | `1` | KrawlX structured web crawler |
| `KODO_ENABLE_TTS` | `0` | Text-to-speech (OpenAI) |
| `KODO_ENABLE_COLLAB` | `0` | Session sharing + shared artifact pages |
| `KODO_ENABLE_SCREENSHOT` | `0` | URL screenshot (needs playwright) |
| `KODO_ENABLE_DATABASE` | `1` | Read-only SQL queries (needs `DB_URL`) |
| `KODO_ENABLE_EMAIL` | `0` | SMTP email dispatch |
| `KODO_ENABLE_IMAGE_GEN` | `0` | DALL-E 3 image generation |
| `KODO_ENABLE_CAVEMAN` | `0` | Caveman mode, caveman commands, and caveman compression tool |
| `KODO_NO_TELEMETRY` | `0` | Disable local audit/usage event writes |

### Rate Limits

```env
RATE_LIMIT_SEND_PER_MINUTE=30
RATE_LIMIT_SESSION_PER_MINUTE=20
RATE_LIMIT_MEMORY_PER_MINUTE=10
RATE_LIMIT_COMMANDS_PER_MINUTE=120
```

---

## AI Providers

KODO supports all major AI providers. Set the relevant API key in `.env`.

| Provider | Key Variable | Default Model |
|---|---|---|
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` |
| **Google Gemini** | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| **DeepSeek** | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| **OpenRouter** | `OPENROUTER_API_KEY` | (model of your choice) |
| **GitHub Models** | `GITHUB_MODELS_TOKEN` | `gpt-4o` |
| **Ollama** | *(no key)* | `llama3` |
| **AtomicChat** | *(no key)* | local |
| **Codex** | `CODEX_API_KEY` | `code-davinci-002` |

Local headless CLI providers are also supported: `claude-cli`, `codex-cli`, `gemini-cli`, and `copilot-cli`.
If discovery on PATH fails, set one of:
`KODO_CLAUDE_CLI_PATH`, `KODO_CODEX_CLI_PATH`, `KODO_GEMINI_CLI_PATH`, `KODO_COPILOT_CLI_PATH`.

Switch provider mid-session with `/provider set <name>` or via the Provider panel in the UI.

---

## Smart Router

The smart router (`ROUTER_MODE=smart`) health-checks all configured providers and automatically routes requests to the best one.

```env
ROUTER_MODE=fixed             # fixed | smart
ROUTER_STRATEGY=balanced      # latency | cost | quality | balanced
ROUTER_FALLBACK=true          # fallback to next healthy provider on error
ROUTER_HEALTH_INTERVAL_SECONDS=60
```

Routing strategies:

| Strategy | Description |
|---|---|
| `latency` | Route to the provider with the lowest measured response latency |
| `cost` | Route to the cheapest provider per token |
| `quality` | Route to the highest-capability provider |
| `balanced` | Weighted blend of latency, cost, and quality scores |

---

## Agent Modes

Switch the agent's behaviour with `/mode set <name>`:

| Mode | Key | Behaviour |
|---|---|---|
| **Execute** | `execute` | Default — moves fast, proactive tool use, concise explanations |
| **Plan** | `plan` | Outlines a numbered plan before major actions, milestone reporting |
| **Debug** | `debug` | Hypothesis → verify → fix → re-verify cycle |
| **Review** | `review` | Risk-focused code review: bugs, security, regressions, missing tests |

---

## Artifacts v2

KODO ships a Claude.ai-style artifacts system that works with **every** configured provider — no Anthropic tool-use, no OpenAI function-calling, no JSON mode. Models emit artifacts as plain fenced code blocks with a structured info string, so Llama via Ollama, Gemma, Gemini, and DeepSeek all produce artifacts identically.

### Supported types

| Type | Preview |
|---|---|
| `html` | Sandboxed srcdoc iframe |
| `html-multi` | Multi-file bundle stitched via blob URLs |
| `react` | React 18 + esm.sh importmap (or Babel standalone fallback) |
| `react-multi` | Multi-file React bundle |
| `svg` | Inline render inside iframe |
| `mermaid` | mermaid@10 CDN render |
| `markdown` | GitHub-flavoured markdown |
| `dot` | Graphviz via `@viz-js/viz` WASM |
| `code` | Syntax-highlighted code only (no preview) |

### Protocol

Toggle **Artifact mode** in the composer bar, then the model emits:

```text
​```artifact type=react id=todo-app title="Todo App" version=1
export default function App() {
  const [items, setItems] = React.useState([])
  return <div><h1>Todos: {items.length}</h1></div>
}
​```
```

To update an artifact, re-emit with the same `id=` and `version=N+1` containing the full new content. The side panel shows a version switcher with inline diff.

Multi-file bundles share an `id` across consecutive fences with `bundle=true`:

```text
​```artifact type=html-multi id=landing title="Landing" version=1 bundle=true filename=index.html entrypoint=true
<!DOCTYPE html>...
​```
​```artifact type=html-multi id=landing title="Landing" version=1 bundle=true filename=styles.css
body { ... }
​```
```

### Features

- Code / Preview / Split view with desktop / tablet / mobile device frames
- File tree for multi-file bundles with entrypoint marker
- Version switcher with line-level diff view
- Per-artifact download and multi-file ZIP download
- Share link — creates a collab-token-gated public URL at `/shared-artifact/<session>/<artifact>?token=...&version=...`
- Opt-in sandbox relaxations (`allow-forms`, `allow-popups`) per artifact
- Progressive streaming — partial artifact content is suppressed until the closing fence, no broken mid-stream renders

### Hardening

- Every artifact runs inside `<iframe sandbox="allow-scripts" srcdoc=...>` — **no** `allow-same-origin`, so artifact JS cannot read the parent app's cookies or localStorage
- Host never interpolates artifact content into parent DOM
- 2 MB size cap at upsert and render
- Artifact IDs with `/`, `\`, `..`, or null bytes are rejected at the API boundary
- Every iframe `postMessage` handler checks `e.source === iframeRef.current?.contentWindow`
- Storage LRU-capped at 50 versions per artifact, 100 artifacts per session, stored at `~/.kodo/artifacts/<session_id>.json`

See [`backend/docs/artifacts_v2.md`](backend/docs/artifacts_v2.md) for the design and [`backend/docs/artifacts_manual_test.md`](backend/docs/artifacts_manual_test.md) for the per-provider manual test checklist.

---

## Design Studio

A visual web editor built on top of the artifact iframe harness. Open it with `/open design studio` or the sidebar button.

- Drag-drop layout primitives onto a live iframe canvas
- Click any element to edit inline: text, padding, margin, colours, font, display, flex direction, gap, box-shadow
- Theme extraction pulls colour palette / typography from any URL and applies it to the current design
- DOM tree sidebar for navigating and selecting elements
- Full undo / redo history
- Export as HTML artifact when done

---

## Multi-Model Conference

Send the same prompt to 2-6 different AI models simultaneously and watch them answer in parallel — then get a synthesized best-of-all-worlds answer.

Open via the **lightning bolt icon** in the sidebar.

### How it works

1. Select 2-6 providers (OpenAI, Groq, Gemini, DeepSeek, Ollama, OpenRouter, etc.)
2. Type your question and click **DEBATE**
3. Each model's response streams in its own column simultaneously
4. When all models finish, a synthesizer reads all responses and produces a single comprehensive answer that incorporates the best insights from each

### API

```http
POST /api/conference/debate
Content-Type: application/json

{
  "prompt": "What are the trade-offs of microservices vs monolith?",
  "participants": [
    {"provider": "openai", "name": "GPT-4o"},
    {"provider": "groq", "name": "Llama 3"},
    {"provider": "deepseek", "name": "DeepSeek"}
  ],
  "synthesize": true,
  "max_tokens": 2048
}
```

**SSE event types:** `participant_start`, `participant_text`, `participant_done`, `synthesis_start`, `synthesis_text`, `conference_done`, `conference_error`

```http
GET /api/conference/providers
```
Lists all configured providers available for conference mode.

---

## Theme Studio

A full-featured UI customizer that applies CSS custom property overrides in real time. Open via the palette icon in the sidebar rail.

### Features

- **Canvas Color Picker** — HSL square + hue strip + hex input + RGB sliders + quick swatches
- **Variable Groups** — edit Backgrounds (4 layers), Text (3 levels), Accent/Brand (3 vars), Semantic colors (success/warning/error/info), Borders
- **Gradient Builder** — Builder / Presets / Manual CSS modes; Builder supports unlimited color stops, position sliders, linear angle or radial origin controls
- **Layout Tab** — border radius presets (0–24px) + monospace font selector
- **CSS Injection** — free-form custom CSS textarea, applied live and persisted across sessions
- **Named Themes** — save, load, delete, export as JSON, import from JSON
- **Reset** — one click restores the active theme defaults

All changes apply instantly via `document.documentElement.style.setProperty()` and persist to `localStorage`.

---

## Power User Features

### Focus Mode (`Cmd+Shift+F`)
Full-screen takeover of the chat — hides sidebar, covers everything. Press again or use the status bar button to exit.

### Response Depth Selector
Pill in the composer bar: **C** Concise / **B** Balanced / **T** Thorough / **E** Expert. Transparently prepends a style instruction to every prompt.

### Project Brief
Collapsible panel above the message list. Write persistent context (tech stack, constraints, team rules). Content is silently prepended to every message as `[Project context — always keep in mind: ...]`.

### Prompt History
Up/Down arrows in the empty composer browse past sent prompts — terminal-style. Pressing Down at the first entry restores your unsaved draft.

### Draft Auto-Save
Every keystroke in the composer is saved to `localStorage[kodo-draft-{sessionId}]`. Restored automatically on refresh or session switch.

### Clipboard Paste
Press Ctrl+V anywhere in the composer (or DesignStudio input) to attach screenshots from the Snipping Tool, copied images, or any clipboard files.

### Tab Smart Autocomplete
Press Tab when a prompt matches a common starter (`fix the`, `write a func`, `explain`, `create a react`, etc.) to expand to a full template.

### Inline Code Runner
Click **RUN** on any `bash`, `python`, `js`, or `ts` code block in chat — opens the terminal and executes immediately.

### Session Branching
Click **FORK** on any assistant message to create a new parallel session starting from that point. Try different approaches non-destructively.

### Status Bar
VS Code-style 24px bar at the bottom showing live: mode, model, context window %, cost, RUNNING indicator, and keyboard hint row.

### Conversation Export
- Left-click **EXPORT** in the header: download as Markdown
- Right-click **EXPORT**: download as self-contained HTML snapshot (beautiful dark-themed, shareable, no dependencies)

### Artifact Gallery
Browse all artifacts from all sessions in a filterable grid. Filter by type (HTML/React/SVG/Mermaid/etc.), search by title. Click any card to open it.

### Session Insights
Real-time analytics panel in the sidebar: message counts, token usage, cache hits, estimated cost, top tools used, conversation topics (auto-detected), most-referenced files (extracted from content + tool calls).

---

## Slash Commands

Type any command directly in the chat input:

### Session & Cost
| Command | Description |
|---|---|
| `/help` | Show available commands |
| `/stop` | Stop the current agent run |
| `/cost [days]` | Show token usage and cost summary |
| `/session` | List all sessions |
| `/session current` | Show current session details |

### Memory & Checkpoints
| Command | Description |
|---|---|
| `/memory <text>` | Write a memory entry |
| `/memory show` | Display all stored memories |
| `/checkpoint` | Create a checkpoint of the current session |
| `/checkpoint list` | List available checkpoints |
| `/checkpoint restore <id> --yes` | Restore a previous checkpoint |

### Provider & Model
| Command | Description |
|---|---|
| `/provider` | Show current provider |
| `/provider set <name>` | Switch to a different provider |
| `/model` | Show current model |
| `/model set <model>` | Switch model |
| `/router` | Show router status |
| `/router strategy <name>` | Change routing strategy |
| `/mode` | Show current agent mode |
| `/mode set <name>` | Switch agent mode |
| `/mode reset` | Reset to default mode |

### Tools & Agents
| Command | Description |
|---|---|
| `/tasks` | List background tasks |
| `/tasks create <desc>` | Create a background task |
| `/tasks get <id>` | Get task status |
| `/tasks stop <id>` | Stop a task |
| `/agents list` | List spawned sub-agents |
| `/agents spawn <prompt>` | Spawn a sub-agent |
| `/agents get <id>` | Get sub-agent status |
| `/agents stop <id>` | Stop a sub-agent |
| `/mcp list` | List registered MCP servers |
| `/mcp add <url>` | Register an MCP server |
| `/mcp remove <name>` | Remove an MCP server |
| `/mcp tools <server>` | List tools from an MCP server |
| `/mcp call <server> <tool>` | Call an MCP tool |

### Skills & Diagnostics
| Command | Description |
|---|---|
| `/skills list` | List available skills |
| `/skills show <name>` | Show a skill's content |
| `/skills run <name>` | Run a skill |
| `/doctor` | Run environment diagnostics |
| `/doctor report` | Export full diagnostic report |

### Caveman
| Command | Description |
|---|---|
| `/caveman [lite|full|ultra|wenyan-lite|wenyan|wenyan-ultra|off]` | Enable/disable caveman response mode for this session |
| `/caveman-help` | Show caveman quick reference |
| `/caveman-commit` | Generate terse conventional commit output |
| `/caveman-review` | Generate one-line review findings |
| `/caveman:compress <path> [mode]` | Compress markdown/text files with caveman rules |

---

## Built-in Tools

The agent has access to 30+ tools it can call autonomously:

### File System
| Tool | Description |
|---|---|
| `file_read` | Read any file with optional line range |
| `file_write` | Write/overwrite a file |
| `file_edit` | Targeted string replacement in a file |
| `glob_tool` | Find files by glob pattern |
| `grep` | Search file contents with regex |

### Execution
| Tool | Description |
|---|---|
| `bash` | Run shell commands (Linux/macOS) |
| `powershell` | Run PowerShell commands (Windows) |
| `repl` | Stateful Python or Node.js REPL session |
| `git_tool` | Git operations (log, diff, status, etc.) |

### Web & Data
| Tool | Description |
|---|---|
| `web_fetch` | Fetch and parse a URL |
| `web_search` | Search the web (Firecrawl/Tavily/SerpAPI/DDG) |
| `caveman` | Caveman help/status and markdown compression/validation |
| `screenshot` | Capture a URL as base64 PNG |
| `database_query` | Execute read-only SQL (SELECT only) |

### Communication
| Tool | Description |
|---|---|
| `send_email` | Send email via SMTP |
| `image_gen` | Generate an image via DALL-E 3 |

### Agent Infrastructure
| Tool | Description |
|---|---|
| `memory_write` | Persist a memory entry |
| `task_create/get/stop` | Background task management |
| `agent_spawn/list/get/stop` | Sub-agent management |
| `skill_list/get/run` | Skill management and execution |
| `mcp_server_add/remove/list` | MCP server registry |
| `mcp_tool_call` | Call a tool from an MCP server |

---

## Skills System

Skills are markdown instructions the agent can load and execute. KODO ships with 15 built-in skills:

| Skill | Purpose |
|---|---|
| `code-review` | Bug, security, and regression analysis |
| `task-planning` | Break down complex tasks into milestones |
| `git-forensics` | Deep git history analysis |
| `incident-response` | Structured incident triage |
| `testing-validation` | Test coverage and validation strategy |
| `checkpoint-recovery` | Session recovery workflows |
| `extension-development` | VSCode extension dev guidance |
| `production-hardening` | Security and reliability hardening |
| `ui-polish` | UI/UX review and improvement |
| `web-research` | Structured web research workflows |
| `caveman` | Terse caveman response style guidance |
| `caveman-help` | Caveman quick reference |
| `caveman-commit` | Terse Conventional Commit guidance |
| `caveman-review` | One-line review guidance |
| `caveman-compress` | Markdown/text compression workflow |

### Custom Skills

Create your own skills via the **Skill Builder** panel in the UI or the API:

```bash
# Create a custom skill
curl -X POST http://localhost:8000/api/skills/custom \
  -H "Content-Type: application/json" \
  -d '{"name": "my-skill", "content": "# My Skill\n\nDo X, then Y."}'

# List custom skills
curl http://localhost:8000/api/skills/custom

# Delete a custom skill
curl -X DELETE http://localhost:8000/api/skills/custom/my-skill
```

---

## Collaboration Mode

Enable in `.env`:

```env
KODO_ENABLE_COLLAB=1
KODO_PUBLIC_APP_URL=http://localhost:5173
COLLAB_TOKEN_TTL_SECONDS=3600
```

Usage:

1. Open any session in KODO
2. Click **Share** in the Collab bar to generate a share link
3. Send the link to a collaborator — they get a **read-only live view** of the session
4. The session owner sees an active viewer count in real time

### Collab API

```bash
# Create share link
POST /api/collab/sessions/{session_id}/share

# Remove share link
DELETE /api/collab/sessions/{session_id}/share

# Observer SSE stream
GET /api/collab/sessions/{session_id}/stream?token=<share_token>

# Viewer count
GET /api/collab/sessions/{session_id}/viewers
```

---

## Prompt Library

Store and reuse prompt templates with `{{variable}}` interpolation.

```bash
# Create a prompt
curl -X POST http://localhost:8000/api/prompts \
  -H "Content-Type: application/json" \
  -d '{"name": "review-pr", "template": "Review PR #{{number}} in {{repo}}."}'

# List all prompts
curl http://localhost:8000/api/prompts

# Render a prompt with variables
curl -X POST http://localhost:8000/api/prompts/review-pr/render \
  -H "Content-Type: application/json" \
  -d '{"variables": {"number": "42", "repo": "kodo"}}'

# Delete a prompt
curl -X DELETE http://localhost:8000/api/prompts/review-pr
```

---

## Notebook Panel

The **Notebook** panel lets you run Python or Node.js code cells inline, with per-cell outputs and persistent REPL state across cells. Enable streaming tool output for real-time line-by-line execution results.

```env
KODO_ENABLE_REPL_PERSISTENCE=1
REPL_SESSION_TIMEOUT_SECONDS=300
```

---

## Session Replay

Any past session can be replayed step-by-step:

1. Open **Replay** panel from the sidebar
2. Use **Previous / Next** to step through agent actions
3. Toggle **Autoplay** for continuous playback
4. Export the full session as **JSON**
5. Each step highlights the corresponding message in the chat view

---

## Cron & Scheduling

Fire agent prompts on an interval. Jobs are persisted to `~/.kodo/cron.json` and run on a background loop started at app boot.

Supported cron expressions:

| Expression | Meaning |
|---|---|
| `every_N_minutes` | Every N minutes (min 1) |
| `every_N_hours` | Every N hours (min 1) |
| `daily_HH:MM` | Every day at HH:MM local time |
| `weekly_<day>_HH:MM` | Weekly on `monday`..`sunday` at HH:MM |

```bash
# Create a job
curl -X POST http://localhost:8000/api/cron \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODO_TOKEN" \
  -d '{
    "name": "morning-standup",
    "cron_expr": "daily_09:00",
    "prompt": "Review yesterdays commits and draft a standup note.",
    "project_dir": "/home/me/project",
    "enabled": true
  }'

# List jobs + recent runs
curl http://localhost:8000/api/cron
curl http://localhost:8000/api/cron/runs
```

All cron endpoints require `API_AUTH_TOKEN` when the token is set. `project_dir` is validated against the path guard before storage.

---

## Marketplace Packs

Export a portable bundle of custom skills, prompts, and cron jobs as a `.kodopack` (zip). Useful for sharing a KODO setup across machines or teams.

```bash
# Export
curl -X POST http://localhost:8000/api/marketplace/export \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODO_TOKEN" \
  -d '{"name": "my-setup", "description": "Personal Kodo pack"}' \
  -o my-setup.kodopack

# Import (max 10 MB)
curl -X POST http://localhost:8000/api/marketplace/import \
  -H "Authorization: Bearer $KODO_TOKEN" \
  -F "file=@my-setup.kodopack"
```

Packs are zip archives with `pack.json` metadata plus `skills/*.md`, `prompts.json`, and `cron.json`. On import, name collisions append `_imported`.

---

## KrawlX Web Crawler

Structured multi-page crawler with robots.txt support, optional same-origin limit, include/exclude pattern matching, and signed callback delivery for long crawls.

```bash
curl -X POST http://localhost:8000/api/krawlx/crawl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KODO_TOKEN" \
  -d '{
    "url": "https://example.com/docs",
    "max_pages": 40,
    "max_depth": 2,
    "same_origin": true,
    "obey_robots": true,
    "include_patterns": ["/docs/*"],
    "exclude_patterns": ["/docs/archive/*"],
    "callback_url": "https://your-server/hook",
    "callback_secret": "shared-secret"
  }'
```

Set `FIRECRAWL_API_KEY` in `.env` to enable Firecrawl-backed crawling; falls back to the built-in httpx scraper otherwise.

---

## API Reference

### Health

```
GET  /                    → {"status": "KODO Agent running"}
GET  /health              → full health + provider status
GET  /health/live         → liveness probe
GET  /health/ready        → readiness probe (checks for API key)
```

### Chat

```
POST   /api/chat/send                           → send a message (SSE stream)
GET    /api/chat/sessions                       → list all sessions
GET    /api/chat/sessions/{id}                  → get session
DELETE /api/chat/sessions/{id}                  → delete session
GET    /api/chat/sessions/{id}/events           → replay events SSE
POST   /api/chat/code-review                    → AI code review
```

### Prompts

```
GET    /api/prompts                             → list prompts
POST   /api/prompts                             → create prompt
DELETE /api/prompts/{name}                      → delete prompt
POST   /api/prompts/{name}/render               → render with variables
```

### Skills

```
GET    /api/skills/custom                       → list custom skills
POST   /api/skills/custom                       → create custom skill
DELETE /api/skills/custom/{name}                → delete custom skill
```

### Artifacts

```
POST   /api/artifacts/{session_id}                     → upsert artifact (authed)
GET    /api/artifacts/{session_id}                     → list session artifacts
GET    /api/artifacts/{session_id}/{artifact_id}       → get latest or ?version=N
GET    /api/artifacts/{session_id}/{artifact_id}/versions → all versions
GET    /api/artifacts/shared/{session_id}/{artifact_id}?token=...&version=N → public (collab token)
```

### Collaboration

```
POST   /api/collab/sessions/{id}/share          → create share link
DELETE /api/collab/sessions/{id}/share          → revoke share link
GET    /api/collab/sessions/{id}/stream         → observer SSE stream
GET    /api/collab/sessions/{id}/viewers        → viewer count
```

### Cron

```
GET    /api/cron                                → list jobs
POST   /api/cron                                → upsert job
DELETE /api/cron/{name}                         → delete job
GET    /api/cron/runs                           → recent firings
```

### Marketplace

```
POST   /api/marketplace/export                  → export a .kodopack zip
POST   /api/marketplace/import                  → import a .kodopack zip (multipart)
```

### KrawlX

```
POST   /api/krawlx/crawl                        → crawl with optional signed callback
```

### Providers & Profiles

```
GET    /api/providers                           → list providers + status
POST   /api/providers/switch                    → switch active provider
GET    /api/profiles                            → list profiles
POST   /api/profiles/{name}/activate            → activate a profile
```

### Other

```
POST   /api/tts                                 → text-to-speech
GET    /api/doctor                              → diagnostic report
POST   /api/webhooks/{name}                     → inbound webhook
```

---

## Permission System

Control what the agent is allowed to do without asking:

```env
PERMISSION_MODE=ask     # ask  → prompt for approval on every tool use
                        # auto → auto-approve read + safe operations
                        # yolo → allow everything except hard-blocked patterns
```

### Path Guard

Restrict which directories the agent can access:

```env
STRICT_PATH_ALLOWLIST=0
ALLOWED_DIRS=~,.
BLOCKED_DIRS=
ALLOW_SYSTEM_DIRS=0
MAX_FILE_SIZE_KB=500
```

---

## Observability

KODO writes structured event logs locally:

| File | Contents |
|---|---|
| `~/.kodo/audit/events.jsonl` | Every API request + tool call with request-id |
| `~/.kodo/usage/events.jsonl` | Per-message token usage and cost |
| `~/.kodo/sessions/` | Full session JSON (messages, metadata, checkpoints) |

Every request gets a `X-Request-ID` header (auto-generated or pass your own via `x-request-id`).

Disable local telemetry:

```env
KODO_NO_TELEMETRY=1
```

---

## VSCode Extension

The optional VSCode extension connects to the KODO backend as a sidecar, letting you use KODO from within your editor.

```bash
cd vscode-extension/kodo-vscode
npm install
# Open in VSCode and press F5 to run in Extension Development Host
```

Configure the bridge in `.env`:

```env
BRIDGE_SECRET=your-secret
BRIDGE_TOKEN_TTL_SECONDS=3600
```

---

## Validation & Testing

### Frontend

```bash
cd frontend
npx tsc --noEmit     # TypeScript type check (clean)
npx vitest run       # Vitest unit tests (51 passing)
npm run build        # Production build
```

### Backend

```bash
cd backend
source .venv/bin/activate   # or .venv\Scripts\activate on Windows

python -m pytest -q     # Run test suite (172 passing)
python -m ruff check .  # Lint (clean)
python -m mypy .        # Type check
```

### Security posture

The codebase was hardened in the current release (see commit history):

- Iframe sandbox reduced to `allow-scripts` only across every artifact runtime (legacy + v2)
- `postMessage` handlers check `e.source`
- Path-guard enforced on every user-supplied path (chat, webhooks, cron, bridge, skills, design-file read)
- Cron and skills_admin endpoints require auth + input validation
- Bridge tokens use HMAC-SHA256 with constant-time comparison
- Share tokens are `secrets.token_urlsafe(24)` with configurable TTL

---

## Android / Mobile

KODO can run on Android via [Termux](https://termux.dev). See the full guide:

[ANDROID_INSTALL.md](ANDROID_INSTALL.md)

---

## Cost Tracking

KODO tracks per-provider token costs. Override defaults in `.env`:

```env
# Per 1M tokens (USD)
COST_CLAUDE_INPUT_PER_M=3.0
COST_CLAUDE_OUTPUT_PER_M=15.0
COST_OPENAI_INPUT_PER_M=2.5
COST_OPENAI_OUTPUT_PER_M=10.0
```

Use `/cost` or `/cost 7` (last 7 days) in the chat to see usage summaries.

---

## Contributing

1. Fork the repo and create a feature branch
2. Run the test suite before submitting: `pytest -q` + `npm run test`
3. Open a pull request with a clear description of the change

---

<div align="center">

**KODO Agent** — Built for developers who want their AI to actually do the work.

`{ autonomous }` `{ self-hosted }` `{ multi-provider }` `{ multi-model-conference }` `{ streaming }` `{ fully-customizable }` `{ open }`

</div>
