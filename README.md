# KŌDO — Personal Autonomous AI Agent

> A fully autonomous coding agent built on Claude's architecture principles. Execute bash, read/write files, search code, fetch the web, and chain multi-step tasks — all from a sleek web UI.

![KŌDO Agent](https://img.shields.io/badge/KŌDO-Autonomous_Agent-ff4d21?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?style=for-the-badge&logo=fastapi)

---

## What KŌDO Can Do

- **Execute bash commands** with permission gating
- **Execute PowerShell commands** for Windows-native workflows
- **Read, write, and edit files** with diff preview
- **Run REPL snippets** in python/node sessions for iterative checks
- **Search codebases** with grep and glob patterns
- **Fetch web pages** and extract content
- **Multi-step autonomous task loops** (tool-call → execute → feed result → repeat)
- **Persistent memory** via `MEMORY.md` files
- **Full conversation history** with session management
- **Slash commands**: `/help`, `/cost`, `/session`, `/memory`
- **Background tasks**: create/list/get/stop async runs (`/tasks ...`)
- **Multi-agent coordination**: spawn/list/get/stop sub-agents (`/agents ...`)
- **MCP registry management**: add/list/remove MCP server entries (`/mcp ...`)
- **Live MCP tool execution**: discover and call MCP tools over stdio (`/mcp tools`, `/mcp call`)
- **Bridge API sessions** for IDE and external clients (`/api/bridge/...`)
- **Bundled skills registry** for reusable workflows (`/skills ...`)
- **Interactive permission approvals** with remember-per-session decisions
- **Modular prompt architecture** with per-tool guidance contributions
- **Session execution modes** (`execute`, `plan`, `debug`, `review`) with mode-aware prompting
- **Request IDs + structured audit logs** in `~/.kodo/audit/events.jsonl`
- **Usage + estimated cost tracking** in `~/.kodo/usage/events.jsonl`
- **Beautiful web UI** with real-time streaming

---

## Architecture

```
User Prompt
    ↓
FastAPI Backend
    ↓
Agent Loop (QueryEngine)
    ↓
Claude API ←→ Tool Execution Loop
    ↓              ↓
 Response      [BashTool, PowerShellTool, ReplTool, FileReadTool,
     ↓           FileEditTool, FileWriteTool, GrepTool, GlobTool, WebFetchTool]
React Frontend (SSE streaming)
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Anthropic API key

### 1. Clone & Setup
```bash
git clone https://github.com/yourusername/kodo-agent.git
cd kodo-agent
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create your .env file
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```

### 4. Run (Two terminals)

**Terminal 1 — Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** and start chatting.

### 5. Run with Docker Compose (optional)

```bash
docker compose up --build
```

This starts:
- Backend on `http://localhost:8000`
- Frontend on `http://localhost:5173`

---

## Memory System

KŌDO uses a file-based memory system inspired by Claude Code's `CLAUDE.md`:

- `~/.kodo/MEMORY.md` — Your global preferences and facts
- `./PROJECT.md` — Project-specific context (auto-loaded if present)
- `~/.kodo/sessions/` — Conversation history

Edit `~/.kodo/MEMORY.md` to tell KŌDO about yourself:
```markdown
# My Preferences
- I prefer TypeScript over JavaScript
- Always use async/await, never callbacks
- My projects are in ~/projects/
```

---

## Permission System

KŌDO gates dangerous operations:

| Mode | Behavior |
|------|----------|
| `ask` | Prompts before destructive operations (default) |
| `auto` | Auto-approves safe commands |
| `yolo` | No prompts (use carefully) |

Dangerous patterns (always blocked): `rm -rf /`, `sudo rm`, `> /dev/sda`

When `PERMISSION_MODE=ask`, dangerous tool calls create an interactive approval challenge.
The frontend shows a modal where you can approve/deny once, or remember the decision for the current session.

---

## Slash Commands

Use these directly in chat input:

- `/help` — list available commands
- `/cost [days]` — show token and estimated cost summary
- `/session` — list recent sessions
- `/session current` — show current session id
- `/memory <text>` — append a note to global memory
- `/memory show` — show loaded memory context
- `/mode` — show current session mode
- `/mode list` — list available execution modes
- `/mode set <name>` — set session execution mode
- `/mode reset` — reset mode to default (`execute`)
- `/tasks` — list recent tasks
- `/tasks create <prompt>` — run a background task
- `/tasks get <task_id>` — show task status
- `/tasks stop <task_id>` — stop running task
- `/agents` — list spawned sub-agents
- `/agents spawn <goal>` — spawn a sub-agent
- `/agents get <agent_id>` — show sub-agent details
- `/agents stop <agent_id>` — stop a sub-agent
- `/skills` — list bundled skills
- `/skills show <name>` — show skill content
- `/mcp list` — list MCP server entries
- `/mcp add <name> <command> [args...]` — add MCP server entry
- `/mcp remove <name>` — remove MCP server entry
- `/mcp tools <name>` — list configured MCP tools for a server
- `/mcp call <name> <tool> [json_args]` — execute an MCP tool with optional JSON args

---

## File Structure

```
kodo-agent/
├── backend/
│   ├── main.py              # FastAPI app entrypoint
│   ├── requirements.txt
│   ├── .env.example
│   ├── agent/
│   │   ├── loop.py          # Core agent tool-call loop
│   │   ├── modes.py         # Session execution mode definitions
│   │   ├── prompt_builder.py# Mode/tool/memory system prompt composition
│   │   ├── permissions.py   # Permission system
│   │   └── context.py       # Context & token management
│   ├── tools/
│   │   ├── base.py          # Tool base class
│   │   ├── bash.py          # BashTool
│   │   ├── powershell.py    # PowerShellTool
│   │   ├── repl.py          # ReplTool
│   │   ├── file_read.py     # FileReadTool
│   │   ├── file_write.py    # FileWriteTool
│   │   ├── file_edit.py     # FileEditTool
│   │   ├── grep.py          # GrepTool
│   │   ├── glob_tool.py     # GlobTool
│   │   └── web_fetch.py     # WebFetchTool
│   ├── memory/
│   │   ├── manager.py       # Memory file management
│   │   └── session.py       # Session storage
│   └── api/
│       ├── chat.py          # Chat endpoints + SSE streaming
│       └── sessions.py      # Session management endpoints
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── components/
        │   ├── ChatWindow.tsx
        │   ├── MessageBubble.tsx
        │   ├── ToolCallCard.tsx
        │   ├── PermissionPrompt.tsx
        │   ├── StreamingText.tsx
        │   └── Sidebar.tsx
        ├── hooks/
        │   ├── useChat.ts
        │   └── useSessions.ts
        └── store/
            └── chatStore.ts
```

---

## Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...                # optional fallback provider
PRIMARY_PROVIDER=anthropic                # anthropic | openai
MODEL=claude-sonnet-4-6
# OPENAI_FALLBACK_MODEL=gpt-4o
# ANTHROPIC_FALLBACK_MODEL=claude-sonnet-4-6

# Optional API protection for all /api/chat routes
# API_AUTH_TOKEN=replace_with_a_long_random_token

# Optional bridge token secret and TTL for /api/bridge
# BRIDGE_SECRET=replace_with_a_long_random_token
# BRIDGE_TOKEN_TTL_SECONDS=3600

# If BRIDGE_SECRET is omitted, KODO generates a persistent local secret at ~/.kodo/bridge/secret.key.

# Optional CORS override
# ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

MAX_TOKENS=8192
PERMISSION_MODE=ask       # ask | auto | yolo
# PERMISSION_REQUEST_TIMEOUT_SECONDS=120
# Directory safety defaults:
# - user-selected directories are allowed
# - system/harmful folders are blocked
# To enforce a strict allowlist, enable this and set ALLOWED_DIRS.
# STRICT_PATH_ALLOWLIST=1
# ALLOWED_DIRS=~,.
# Optional extra blocked roots
# BLOCKED_DIRS=
MAX_FILE_SIZE_KB=500

# Per-IP limits
RATE_LIMIT_SEND_PER_MINUTE=30
RATE_LIMIT_SESSION_PER_MINUTE=20
RATE_LIMIT_MEMORY_PER_MINUTE=10

# Optional pricing overrides (USD per 1M tokens)
# COST_CLAUDE_INPUT_PER_M=3.0
# COST_CLAUDE_OUTPUT_PER_M=15.0
# COST_OPENAI_INPUT_PER_M=5.0
# COST_OPENAI_OUTPUT_PER_M=15.0
```

Frontend token support (optional) in `frontend/.env.local`:

```env
VITE_API_AUTH_TOKEN=replace_with_same_backend_token
```

Usage API:

- `GET /api/chat/usage?days=7&limit=100` (protected by optional bearer auth)
- `GET /api/chat/commands` (list slash commands)
- `GET /api/chat/modes` (list supported execution modes)
- `GET /api/chat/sessions/{session_id}/mode` (read session mode)
- `POST /api/chat/sessions/{session_id}/mode` (set session mode)
- `GET /api/chat/permissions/pending?session_id=<id>` (list pending permission challenges)
- `POST /api/chat/permissions/{challenge_id}/decision` (submit approve/deny decision)
- `GET /api/chat/sessions/{session_id}/export` (export session payload)
- `POST /api/chat/sessions/import` (import session payload)
- `POST /api/chat/tasks` (create task)
- `GET /api/chat/tasks` (list tasks)
- `GET /api/chat/tasks/{task_id}` (get task)
- `POST /api/chat/tasks/{task_id}/stop` (stop task)
- `POST /api/chat/agents` (spawn sub-agent)
- `GET /api/chat/agents` (list sub-agents)
- `GET /api/chat/agents/{agent_id}` (get sub-agent)
- `POST /api/chat/agents/{agent_id}/stop` (stop sub-agent)
- `GET /api/chat/skills` (list bundled skills)
- `GET /api/chat/skills/{name}` (get skill)
- `GET /api/chat/mcp/servers` (list MCP servers)
- `POST /api/chat/mcp/servers` (add/update MCP server)
- `DELETE /api/chat/mcp/servers/{name}` (remove MCP server)
- `GET /api/chat/mcp/servers/{name}/tools` (list configured/discovered tools)
- `POST /api/chat/mcp/servers/{name}/tools/{tool_name}/call` (execute MCP tool)

Bridge API:

- `POST /api/bridge/session` (create bridge session + token)
- `GET /api/bridge/sessions` (list bridge sessions)
- `GET /api/bridge/session/{bridge_session_id}` (session info with bearer token)
- `POST /api/bridge/message` (bridge-authenticated message relay)

Audit + request IDs:

- Every HTTP response includes `X-Request-ID`
- Security and chat events are persisted as JSON lines in `~/.kodo/audit/events.jsonl`

---

## Built With

- **Claude API** (Anthropic) — The brain
- **OpenAI API** — Provider fallback support
- **FastAPI** — Backend framework
- **Server-Sent Events** — Real-time streaming
- **React 18** — Frontend
- **Zustand** — State management
- **Vite** — Frontend build tool
