<div align="center">

```
╔══════════════════════════════════════════════╗
║                                              ║
║         { K · O · D · O }   A G E N T      ║
║                                              ║
║       ▲  Autonomous Coding Intelligence  ▲  ║
║                                              ║
╚══════════════════════════════════════════════╝
```

<img src="docs/assets/kodo-hero.png" alt="KODO Agent" width="520"/>

---

**KODO** is a fully self-hosted autonomous coding agent.  
FastAPI backend · React UI · Multi-provider AI · Real-time streaming · Session memory

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
- [Slash Commands](#slash-commands)
- [Built-in Tools](#built-in-tools)
- [Skills System](#skills-system)
- [Collaboration Mode](#collaboration-mode)
- [Prompt Library](#prompt-library)
- [Notebook Panel](#notebook-panel)
- [Session Replay](#session-replay)
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
- **Session memory** — every conversation is persisted locally under `~/.kodo`, with full checkpoint and restore support.
- **Multi-provider smart routing** — switch providers on the fly or let KODO automatically route to the fastest, cheapest, or highest-quality provider.
- **Collaboration** — share a live read-only view of any session via a share link.
- **Replay** — step through any past session like a video with autoplay and JSON export.
- **Prompt & skill library** — build, store, and reuse prompt templates and custom markdown skills.
- **PWA support** — install as a desktop app with offline shell caching.

Everything runs locally. No cloud dependency beyond your chosen AI provider API key.

---

## Feature Highlights

| Category | Features |
|---|---|
| **Chat & Streaming** | SSE streaming with real-time tool output, token-level deltas, auto-generated session titles |
| **Agent Execution** | Autonomous bash/shell/PowerShell execution, file read/write/edit, git tool, glob, grep, REPL |
| **Memory & Sessions** | Persistent sessions under `~/.kodo`, checkpoints, restore, usage telemetry |
| **Multi-Provider** | Anthropic, OpenAI, Gemini, DeepSeek, Groq, OpenRouter, GitHub Models, Ollama, AtomicChat, Codex |
| **Smart Router** | Health-checked auto-routing by latency, cost, quality, or balanced strategy |
| **Agent Modes** | Execute, Plan, Debug, Review — each with distinct prompting behavior |
| **Collaboration** | Share links, observer read-only mode, live SSE viewer stream |
| **Replay** | Step controls, autoplay, JSON export, message highlighting |
| **Prompt Library** | CRUD API + UI, `{{variable}}` template rendering |
| **Custom Skills** | Markdown-based skill builder with upload/edit UI |
| **Code Review** | Built-in AI code review panel (`/api/chat/code-review`) |
| **Notebook** | Python/Node cell execution with per-cell outputs |
| **Split Editor** | CodeMirror editor with open/edit/save + diff preview |
| **Web Search** | Firecrawl, Tavily, SerpAPI, DuckDuckGo fallback |
| **Screenshot** | URL screenshot capture with base64 PNG output (opt-in) |
| **Database** | Read-only SQL via `SELECT` — SQLite, PostgreSQL, MySQL (opt-in) |
| **Email** | SMTP dispatch via `send_email` tool (opt-in) |
| **TTS** | OpenAI text-to-speech (opt-in) |
| **Image Gen** | DALL-E 3 image generation (opt-in) |
| **MCP Servers** | Add/remove/call Model Context Protocol tool servers |
| **Webhooks** | Inbound webhook endpoint with HMAC signature verification |
| **Notifications** | Browser + desktop notification center |
| **PWA** | Install prompt, web manifest, service worker shell caching |
| **Profiles** | Named provider/model/mode configuration bundles |
| **Observability** | Per-request audit log, usage JSONL, request-id tracing |
| **Rate Limiting** | Configurable per-endpoint limits |
| **Auth** | Optional bearer token auth for the API |
| **Doctor** | `/doctor` self-diagnostic tool with environment report |

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
│  │  web_fetch · web_search · repl · screenshot       │  │
│  │  database_query · send_email · image_gen          │  │
│  │  mcp_* · task_* · agent_* · memory_write          │  │
│  └────┬──────────────────────────────────────────────┘  │
│       │                                                  │
│  ┌────▼──────────────────────────────────────────────┐  │
│  │               Smart Router / Providers             │  │
│  │  Anthropic · OpenAI · Gemini · DeepSeek · Groq    │  │
│  │  OpenRouter · GitHub Models · Ollama · Codex      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  Storage: ~/.kodo/{sessions, usage, audit, profiles}    │
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
| `backend/agent/prompt_builder.py` | System prompt assembly with mode + skill injection |
| `backend/agent/coordinator.py` | Multi-agent coordination |
| `backend/agent/permissions.py` | Tool permission checking and approval |
| `backend/agent/modes.py` | Execute / Plan / Debug / Review mode definitions |
| `backend/providers/smart_router.py` | Health-checked multi-provider routing |
| `backend/providers/` | Individual provider adapters (OpenAI-compat, Gemini, etc.) |
| `backend/api/chat.py` | Chat + session REST + SSE endpoints |
| `backend/api/collab.py` | Collaboration share/view/stream endpoints |
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
│   │   ├── collab.py               # /api/collab — share, observe, viewer stream
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
│   │   └── web-research.md
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
│   │   │   └── notifications.ts    # Notification helper
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
│   │   │   └── KodoLogoMark.tsx    # Logo component
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
| `KODO_ENABLE_TTS` | `0` | Text-to-speech (OpenAI) |
| `KODO_ENABLE_COLLAB` | `0` | Session sharing + collaboration |
| `KODO_ENABLE_SCREENSHOT` | `0` | URL screenshot (needs playwright) |
| `KODO_ENABLE_DATABASE` | `1` | Read-only SQL queries (needs `DB_URL`) |
| `KODO_ENABLE_EMAIL` | `0` | SMTP email dispatch |
| `KODO_ENABLE_IMAGE_GEN` | `0` | DALL-E 3 image generation |
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

Skills are markdown instructions the agent can load and execute. KODO ships with 10 built-in skills:

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

### Collaboration

```
POST   /api/collab/sessions/{id}/share          → create share link
DELETE /api/collab/sessions/{id}/share          → revoke share link
GET    /api/collab/sessions/{id}/stream         → observer SSE stream
GET    /api/collab/sessions/{id}/viewers        → viewer count
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
npm run typecheck    # TypeScript type check
npm run test         # Vitest unit tests
npm run build        # Production build
```

### Backend

```bash
cd backend
source .venv/bin/activate   # or .venv\Scripts\activate on Windows

pytest -q               # Run test suite
python -m mypy .        # Type check
```

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

`{ autonomous }` `{ self-hosted }` `{ multi-provider }` `{ streaming }` `{ open }`

</div>
