# KODO Project Instructions

KODO is a self-hosted autonomous coding agent with a FastAPI backend, React frontend, provider adapters, tools, skills, browser automation, artifacts, MCP support, and VS Code integration.

All LLM providers should follow these project instructions when this repository is the active project.

## Operating Rules

- Prefer small, testable changes that match existing backend and frontend patterns.
- Treat backend behavior as provider-neutral unless a provider adapter explicitly requires special handling.
- Keep cloud and local models equally supported: do not rely on provider-specific prompt syntax when a plain markdown instruction works.
- Preserve user work in a dirty tree. Inspect before editing and avoid unrelated rewrites.
- Validate backend changes with focused `pytest` commands and frontend changes with the existing npm checks when feasible.

## Architecture Hints

- Backend API routes live under `backend/api`.
- Agent orchestration and system prompts live under `backend/agent`.
- Tool implementations live under `backend/tools`.
- Provider adapters live under `backend/providers`.
- Built-in skills live under `backend/skills/bundled`; project-local skills live under `.kodo/skills`.
- Frontend application code lives under `frontend/src`.
- Browser and domain automation skills live under `backend/browser`.

## Provider-Neutral Capability Rule

When adding agent behavior, make it visible through KODO's own prompt builder, tools, commands, or markdown skills so Anthropic, OpenAI-compatible providers, Gemini, Groq, DeepSeek, Ollama, and other local models can all use it.
