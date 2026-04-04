# KODO Agent

KODO is a self-hosted autonomous coding agent with a FastAPI backend and a React UI. It includes streaming chat, terminal and REPL execution, checkpointed sessions, prompt/skill management, collaboration sharing, replay, and an optional split editor.

## Highlights

- Multi-provider runtime with smart routing and profile switching.
- Session-centric chat with streaming tool output, checkpoints, and usage telemetry.
- Collaboration mode with share links, observer read-only mode, and live event streaming.
- Session replay modal with step controls, autoplay, JSON export, and replay-driven message highlighting.
- Notebook panel for Python/Node cell execution with per-cell outputs.
- Prompt library CRUD and template rendering with {{variables}}.
- Custom skill builder CRUD with markdown upload/edit.
- Built-in AI code review panel (/api/chat/code-review).
- Optional split-view editor panel (CodeMirror) with open/edit/save + diff preview.
- PWA support (install prompt, manifest, service worker shell caching).
- Notification center with browser/desktop notification support.

## Architecture

- Frontend: React + TypeScript + Vite + Zustand.
- Backend: FastAPI + SSE streaming + session persistence.
- Runtime: SessionRunner + tool orchestration + mode-aware prompting.
- Storage: local ~/.kodo for sessions, usage, audit, prompts, and custom skills.

## Quick Start

1. Backend setup:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

2. Frontend setup:

```bash
cd frontend
npm install
```

3. Run backend:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

4. Run frontend:

```bash
cd frontend
npm run dev
```

Open http://localhost:5173.

## New APIs

- POST /api/chat/code-review
- GET|POST|DELETE /api/prompts
- POST /api/prompts/{name}/render
- GET|POST|DELETE /api/skills/custom
- POST|DELETE /api/collab/sessions/{session_id}/share
- GET /api/collab/sessions/{session_id}/stream
- GET /api/collab/sessions/{session_id}/viewers
- POST /api/tts
- GET /api/chat/sessions/{session_id}/events

## Added Tools

- screenshot: URL screenshot capture with base64 PNG output.
- database_query: read-only SQL (SELECT only), sqlite/postgres/mysql support.
- send_email: SMTP email dispatch.

## Commands

Core slash commands include:

- /help
- /stop
- /cost [days]
- /session, /session current
- /memory <text>, /memory show
- /checkpoint, /checkpoint list, /checkpoint restore <id> --yes
- /mode, /mode set <name>, /mode reset
- /provider, /provider set <name>
- /router, /router strategy <name>
- /model, /model set <model>
- /doctor, /doctor report
- /tasks, /tasks create|get|stop
- /mcp list|add|remove|tools|call
- /agents list|spawn|get|stop
- /skills list|show|run

## Feature Flags (backend/.env)

- KODO_ENABLE_TTS=0
- KODO_ENABLE_COLLAB=0
- COLLAB_TOKEN_TTL_SECONDS=3600
- KODO_ENABLE_SCREENSHOT=0
- KODO_ENABLE_DATABASE=1
- DB_URL=
- KODO_ENABLE_EMAIL=0
- SMTP_HOST= / SMTP_PORT= / SMTP_USER= / SMTP_PASS= / SMTP_FROM=

## Validation

Frontend:

```bash
cd frontend
npm run typecheck
npm run test
npm run build
```

Backend:

```bash
cd backend
pytest -q
python -m mypy .
```

If your environment does not include all optional tooling (for example mypy), install missing dependencies first.
