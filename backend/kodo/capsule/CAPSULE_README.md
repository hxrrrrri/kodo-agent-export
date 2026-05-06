# Kodo Capsule

Kodo Capsule is a local-first context management subsystem for KODO. It stores reusable conversation capsules in SQLite, tracks real token usage, exposes FastAPI routes, adds `/cap` slash commands, and provides a capsule control in the chat composer.

## Project Map

| File | Purpose | LLM Client Used | History Storage | Notes |
|------|---------|-----------------|-----------------|-------|
| `backend/main.py` | FastAPI app and router registration | None directly | None | Registers `chat_router` and now `capsule_router`. |
| `backend/api/chat.py` | Chat/session HTTP API and SSE streaming | Delegates to `SessionRunner` | `memory_manager.save_session()` | `/api/chat/send` builds session messages and persists output. |
| `backend/agent/session_runner.py` | Runs one agent response and saves history | Delegates to `AgentLoop` | `~/.kodo/sessions/*.json` | Captures `usage_payload` and appends assistant messages. |
| `backend/agent/loop.py` | Provider routing and tool loop | `AsyncAnthropic`, `AsyncOpenAI`, Gemini REST wrapper | Receives history list | Handles Anthropic, OpenAI-compatible, Gemini, smart router, and local providers. |
| `backend/agent/coordinator.py` | Multi-agent task metadata | None directly | `~/.kodo/agents/agents.json` | Spawns background tasks and tracks sub-agent records. |
| `backend/memory/manager.py` | Persistent memory and sessions | None | JSON files in `~/.kodo` | The canonical conversation history layer. |
| `frontend/src/hooks/useChat.ts` | Frontend chat state and SSE client | None | Zustand store plus backend sessions | Sends to `/api/chat/send`. |
| `frontend/src/components/ChatWindow.tsx` | Main chat UI/composer | None | Frontend store | Hosts Capsule icon, panel, WebSocket usage monitor. |

## Integration Points

- Message sending: `backend/api/chat.py::send_message()` calls `SessionRunner.stream()`, which calls `AgentLoop.run()`.
- Provider calls: `AgentLoop._run_anthropic()`, `_run_openai()`, `_run_gemini()`, and `_run_smart()`.
- History reads/writes: `memory_manager.load_session_payload()` and `memory_manager.save_session()`.
- Web UI transport: React calls `/api/chat/send` and reads server-sent events; Capsule usage uses `/api/capsule/usage/ws`.
- CLI entry: Slash commands route through `backend/commands/router.py::execute_command()`.

## Storage

Capsule data is stored in `~/.kodo/capsule/capsules.db` using SQLite WAL mode. Tables:

- `capsules`
- `capsule_versions`
- `token_events`
- `sessions`

## API

- `GET /api/capsule/capsules`
- `POST /api/capsule/capture`
- `POST /api/capsule/inject`
- `POST /api/capsule/compress`
- `GET /api/capsule/usage/{session_id}`
- `WS /api/capsule/usage/ws?session_id=...`
- `POST /api/capsule/bridge`
- `POST /api/capsule/template`
- `POST /api/capsule/persona`
- `POST /api/capsule/merge`
- `POST /api/capsule/rollback`
- `POST /api/capsule/export`

## Slash Commands

- `/capsule`
- `/cap save [tag]`
- `/cap inject <id>`
- `/cap list`
- `/cap compress`
- `/cap usage`
- `/cap bridge <id> [provider]`
- `/cap template [name]`
- `/cap persona <name>`
- `/cap merge <id1> <id2>`
- `/cap export [path]`
- `/cap rollback <id> [version]`

