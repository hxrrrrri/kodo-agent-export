# KŌDO — Personal Autonomous AI Agent

> A fully autonomous coding agent built on Claude's architecture principles. Execute bash, read/write files, search code, fetch the web, and chain multi-step tasks — all from a sleek web UI.

![KŌDO Agent](https://img.shields.io/badge/KŌDO-Autonomous_Agent-ff4d21?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?style=for-the-badge&logo=fastapi)

---

## What KŌDO Can Do

- **Execute bash commands** with permission gating
- **Read, write, and edit files** with diff preview
- **Search codebases** with grep and glob patterns
- **Fetch web pages** and extract content
- **Multi-step autonomous task loops** (tool-call → execute → feed result → repeat)
- **Persistent memory** via `MEMORY.md` files
- **Full conversation history** with session management
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
 Response      [BashTool, FileReadTool, FileEditTool,
    ↓           FileWriteTool, GrepTool, GlobTool, WebFetchTool]
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
│   │   ├── permissions.py   # Permission system
│   │   └── context.py       # Context & token management
│   ├── tools/
│   │   ├── base.py          # Tool base class
│   │   ├── bash.py          # BashTool
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
MODEL=claude-sonnet-4-6
MAX_TOKENS=8192
PERMISSION_MODE=ask       # ask | auto | yolo
ALLOWED_DIRS=~,/tmp       # comma-separated safe directories
```

---

## Built With

- **Claude API** (Anthropic) — The brain
- **FastAPI** — Backend framework
- **Server-Sent Events** — Real-time streaming
- **React 18** — Frontend
- **Zustand** — State management
- **Vite** — Frontend build tool
