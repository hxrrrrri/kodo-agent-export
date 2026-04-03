# KODO Agent

```text
 _  __   ____    ____    ____
| |/ /  / __ \  / __ \  / __ \
|   /  | |  | || |  | || |  | |
|   \  | |  | || |  | || |  | |
| |\ \ | |__| || |__| || |__| |
|_| \_\ \____/  \____/  \____/
```

KODO is a self-hosted autonomous coding agent with a FastAPI backend, tool-capable execution loop, profile-driven provider system, smart multi-provider routing, persistent memory, and a production-grade web UI for real-time streaming and operator control.

## Feature Comparison

| Area | KŌDO v3 | OpenClaude | Claude Code |
|---|---|---|---|
| Interface | Web UI + REST API | Terminal CLI | Terminal CLI |
| Provider count | 9 (incl. DeepSeek, Groq, OpenRouter) | 7 | Anthropic only |
| Smart routing strategies | 4 (latency/cost/balanced/quality) | 3 | None |
| Prompt caching (Anthropic) | Yes - cache_control + savings tracked | No | Partial |
| Context truncation | Yes (configurable) | No | Implicit |
| Checkpoint & rollback | Yes (unique) | No | No |
| Git tools (read-only) | Yes (whitelisted) | No | No |
| Web search providers | 4 (Firecrawl/Tavily/SerpAPI/DDG) | 1 (Firecrawl) | No |
| Persistent REPL (Python + Node) | Yes | No | No |
| Diff preview for file edits | Yes (UI) | No | No |
| Context usage bar | Yes (UI) | No | No |
| Cache savings display | Yes (UI) | No | No |
| Image upload in chat | Yes (base64, 4MB) | URL only | No |
| Usage cost dashboard | Yes (by-model chart) | No | No |
| Streaming tool output | Yes (bash live lines) | No | Partial |
| Auto session titles | Yes | No | No |
| VS Code extension | Yes (5 commands + theme sync) | Yes (2 commands) | Yes |
| Slash commands | 17 commands | ~8 commands | ~15 commands |
| Fuzzy slash suggestions | Yes (Levenshtein) | No | No |
| Session checkpoints | Yes | No | No |
| Security (path guard + rate limit) | Yes | No | Partial |
| Audit logs | Yes (JSONL) | No | No |
| Docker Compose | Yes | No | No |
| Test suite | 13 files | Minimal | Unknown |

## Architecture

```text
Browser UI (React + Zustand)
          |
          | SSE / REST
          v
FastAPI API Layer
  - /api/chat
  - /api/providers
  - /api/doctor
  - /api/profiles
          |
          v
SessionRunner + AgentLoop
  - Mode prompts
  - Permission gating
  - Tool orchestration
  - Smart router (optional)
          |
          v
Tools + Providers
  - File / shell / repl / web / tasks / agents / mcp / skills / memory
  - OpenAI / Anthropic / Gemini / DeepSeek / Groq / OpenRouter / Ollama / Atomic Chat
          |
          v
Persistence (~/.kodo)
  - MEMORY.md
  - sessions/
  - profiles.json
  - active-profile.json
  - audit/events.jsonl
  - usage/events.jsonl
  - reports/doctor.json
```

## Quick Start (5 Minutes)

1. Clone and install backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

2. Add provider credentials in backend/.env.

3. Install frontend:

```bash
cd ../frontend
npm install
```

4. Start backend:

```bash
cd ../backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

5. Start frontend:

```bash
cd ../frontend
npm run dev
```

Open http://localhost:5173.

## Provider Setup

### Anthropic
- Set `ANTHROPIC_API_KEY`.
- Use `MODEL=claude-sonnet-4-6` (or another Claude model).

### OpenAI
- Set `OPENAI_API_KEY`.
- Use `MODEL=gpt-4o` (or `gpt-4o-mini`, `o4-mini`).

### Gemini
- Set `GEMINI_API_KEY`.
- Optional: `GEMINI_MODEL=gemini-2.0-flash`.

### DeepSeek
- Set `DEEPSEEK_API_KEY`.
- Optional: `DEEPSEEK_BASE_URL=https://api.deepseek.com/v1`.

### Groq
- Set `GROQ_API_KEY`.
- Optional: `GROQ_BASE_URL=https://api.groq.com/openai/v1`.

### Ollama (local)
- Start Ollama locally.
- Set `OLLAMA_BASE_URL=http://localhost:11434`.

### Atomic Chat (local)
- Start Atomic Chat locally.
- Set `ATOMIC_CHAT_BASE_URL=http://127.0.0.1:1337`.

### OpenRouter
- Set `OPENROUTER_API_KEY`.
- Optional: `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`.

### GitHub Models
- Set `GITHUB_MODELS_TOKEN`.
- Optional base/model via profile or smart routing defaults.

## Smart Router Guide

Enable smart routing:

```env
ROUTER_MODE=smart
ROUTER_STRATEGY=balanced
ROUTER_FALLBACK=true
```

Strategies:
- `latency`: optimize for response speed.
- `cost`: optimize for lower per-token cost.
- `balanced`: mixed latency/cost.
- `quality`: prioritize lower error rate.

Live controls:
- `GET /api/providers/status`
- `POST /api/providers/router-strategy`
- `/router`
- `/router strategy <name>`

## Memory System Guide

Tiered memory:
- Global: `~/.kodo/MEMORY.md`
- Project: `./PROJECT.md`
- Session inline: `memory_write` tool appends notes without leaving chat

Commands:
- `/memory <text>`
- `/memory show`

## Slash Command Reference

- `/help`
- `/cost [days]`
- `/session`
- `/session current`
- `/memory <text>`
- `/memory show`
- `/mode`
- `/mode list`
- `/mode set <name>`
- `/mode reset`
- `/provider`
- `/provider list`
- `/provider set <name>`
- `/doctor`
- `/doctor report`
- `/router`
- `/router strategy <name>`
- `/model`
- `/model set <model>`
- `/privacy`
- `/tasks`
- `/tasks create <prompt>`
- `/tasks get <task_id>`
- `/tasks stop <task_id>`
- `/mcp list`
- `/mcp add <name> <command> [args...]`
- `/mcp remove <name>`
- `/mcp tools <name>`
- `/mcp call <name> <tool> [json_args]`
- `/agents`
- `/agents spawn <goal>`
- `/agents get <agent_id>`
- `/agents stop <agent_id>`
- `/skills`
- `/skills show <name>`

## Permission System

Modes:
- `ask`: interactive approval for dangerous operations.
- `auto`: auto-approve safe operations, gate dangerous ones.
- `yolo`: allow everything except blocked patterns.

Blocked patterns include destructive disk/system operations for Bash and PowerShell.

## Docker Compose

```bash
docker compose up --build
```

Services:
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

## Android / Mobile Install

See [ANDROID_INSTALL.md](ANDROID_INSTALL.md).

## VS Code Extension

Stub extension lives in `vscode-extension/kodo-vscode`.

Command:
- `kodo.open` opens `http://localhost:5173` in a Webview panel titled `KODO Agent`.

## Contributing

1. Create feature branch.
2. Run backend and frontend checks locally.
3. Add/adjust tests for behavior changes.
4. Open PR with clear scope and rollout notes.

## Environment Variable Reference

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key | empty |
| `ANTHROPIC_API_KEY` | Anthropic API key | empty |
| `GEMINI_API_KEY` | Gemini API key | empty |
| `GOOGLE_API_KEY` | Gemini alternate key | empty |
| `DEEPSEEK_API_KEY` | DeepSeek API key | empty |
| `GROQ_API_KEY` | Groq API key | empty |
| `OPENROUTER_API_KEY` | OpenRouter API key | empty |
| `GITHUB_MODELS_TOKEN` | GitHub Models token | empty |
| `CODEX_API_KEY` | Codex-compatible token | empty |
| `MODEL` | Fixed-mode model | provider default |
| `PRIMARY_PROVIDER` | Fixed-mode provider preference | `anthropic` |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL | `https://api.openai.com/v1` |
| `ANTHROPIC_BASE_URL` | Anthropic base URL override | empty |
| `DEEPSEEK_BASE_URL` | DeepSeek base URL | `https://api.deepseek.com/v1` |
| `GROQ_BASE_URL` | Groq base URL | `https://api.groq.com/openai/v1` |
| `OPENROUTER_BASE_URL` | OpenRouter base URL | `https://openrouter.ai/api/v1` |
| `GITHUB_MODELS_BASE_URL` | GitHub Models base URL | `https://models.github.ai/inference` |
| `CODEX_BASE_URL` | Codex base URL | `https://api.openai.com/v1` |
| `GEMINI_MODEL` | Gemini model override | `gemini-2.0-flash` |
| `OPENAI_FALLBACK_MODEL` | OpenAI fallback model | `gpt-4o` |
| `ANTHROPIC_FALLBACK_MODEL` | Anthropic fallback model | `claude-sonnet-4-6` |
| `ROUTER_MODE` | Routing mode (`fixed` / `smart`) | `fixed` |
| `ROUTER_STRATEGY` | Smart strategy | `balanced` |
| `ROUTER_FALLBACK` | Enable provider fallback | `true` |
| `ROUTER_HEALTH_INTERVAL_SECONDS` | Smart health ping interval | `60` |
| `BIG_MODEL` | Smart-router large-model hint | provider default |
| `SMALL_MODEL` | Smart-router small-model hint | provider default |
| `OLLAMA_BASE_URL` | Ollama base URL | `http://localhost:11434` |
| `ATOMIC_CHAT_BASE_URL` | Atomic Chat base URL | `http://127.0.0.1:1337` |
| `MAX_TOKENS` | Model max output tokens | `8192` |
| `PERMISSION_MODE` | ask/auto/yolo | `ask` |
| `PERMISSION_REQUEST_TIMEOUT_SECONDS` | Approval wait timeout | `120` |
| `STRICT_PATH_ALLOWLIST` | Enforce `ALLOWED_DIRS` strictly | `0` |
| `ALLOWED_DIRS` | Allowed roots (strict mode) | empty |
| `BLOCKED_DIRS` | Additional blocked roots | empty |
| `ALLOW_SYSTEM_DIRS` | Allow system roots | `0` |
| `MAX_FILE_SIZE_KB` | File read/write guard limit | `500` |
| `API_AUTH_TOKEN` | Bearer auth for API routes | empty |
| `ALLOWED_ORIGINS` | CORS origins | localhost defaults |
| `BRIDGE_SECRET` | Bridge token signing secret | auto/local |
| `BRIDGE_TOKEN_TTL_SECONDS` | Bridge token TTL | `3600` |
| `RATE_LIMIT_SEND_PER_MINUTE` | Send endpoint limiter | `30` |
| `RATE_LIMIT_SESSION_PER_MINUTE` | Session endpoint limiter | `20` |
| `RATE_LIMIT_MEMORY_PER_MINUTE` | Memory/metadata limiter | `10` |
| `RATE_LIMIT_COMMANDS_PER_MINUTE` | Commands limiter | `120` |
| `REPL_SESSION_TIMEOUT_SECONDS` | Idle REPL session timeout | `300` |
| `KODO_NO_TELEMETRY` | Disable local usage/audit writes | `0` |
| `COST_CLAUDE_INPUT_PER_M` | Legacy Claude input cost override | `3.0` |
| `COST_CLAUDE_OUTPUT_PER_M` | Legacy Claude output cost override | `15.0` |
| `COST_OPENAI_INPUT_PER_M` | Legacy OpenAI input cost override | `2.5` |
| `COST_OPENAI_OUTPUT_PER_M` | Legacy OpenAI output cost override | `10.0` |
| `COST_INPUT_PER_M_<PROVIDER>` | Provider input cost override | empty |
| `COST_OUTPUT_PER_M_<PROVIDER>` | Provider output cost override | empty |
| `KODO_ENABLE_SMART_ROUTER` | Enable smart routing features | `1` |
| `KODO_ENABLE_PROVIDER_DISCOVERY` | Enable provider discovery features | `1` |
| `KODO_ENABLE_DOCTOR` | Enable doctor endpoints/checks | `1` |
| `KODO_ENABLE_PROFILES` | Enable profile manager | `1` |
| `KODO_ENABLE_SESSION_RUNNER` | Enable session runner integration | `1` |
| `KODO_ENABLE_COMMAND_EXPANSION` | Enable extended slash commands | `1` |
| `KODO_ENABLE_REPL_PERSISTENCE` | Enable persistent REPL enhancements | `1` |
| `KODO_ENABLE_MEMORY_WRITE` | Enable memory_write tool | `1` |

For full grouped templates and comments, see `backend/.env.example`.
