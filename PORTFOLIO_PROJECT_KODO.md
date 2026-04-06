# KODO Agent - Portfolio Project Brief

## Project Snapshot
- Project Name: KODO Agent
- Repository: https://github.com/hxrrrrri/kodo-agent-export
- GitHub Profile: https://github.com/hxrrrrri
- Type: Full-stack, self-hosted autonomous coding agent platform
- Current Version: 1.0.0 (backend app version)
- License: MIT

## One-Line Summary
KODO Agent is a self-hosted AI coding assistant platform that combines a FastAPI backend, React frontend, real-time streaming, autonomous tool execution, multi-provider LLM routing, collaboration features, and session replay into a single developer-focused system.

## Problem It Solves
Developers often need an AI coding assistant that can do more than chat: execute tools, inspect codebases, keep session memory, and remain under their control. KODO solves this by running locally/self-hosted while supporting modern provider flexibility and rich agent workflows.

## Core Features
- Autonomous tool execution for coding workflows (file read/write/edit, shell/PowerShell, grep/glob, git, web fetch/search, REPL, DB query, image generation, email, screenshots, memory write).
- Real-time streaming chat and tool output via SSE.
- Multi-provider AI support (Anthropic, OpenAI, Gemini, DeepSeek, Groq, OpenRouter, GitHub Models, Ollama, AtomicChat, Codex-style compatibility).
- Smart Router for provider failover and strategy-based selection (latency/cost/quality/balanced).
- Agent operating modes: Execute, Plan, Debug, Review.
- Prompt Library with variable templating.
- Custom Skill system with bundled skills and admin APIs.
- Collaboration mode with share links and observer streams.
- Session replay with step navigation and export.
- Notification center, TTS, and optional image generation.
- VS Code extension sidecar integration.
- Dockerized local deployment support.
- Android/Termux installation path.

## Architecture Overview
- Frontend: React + TypeScript + Vite + Zustand + CodeMirror + Vitest.
- Backend: FastAPI + async Python + SSE + provider adapters + observability.
- Storage & telemetry: local files under ~/.kodo (sessions, usage, audit logs).
- Optional modules: collaboration, webhooks, MCP server integration, cron scheduler, profiles system.

## Stack and Tooling
### Frontend
- React 18
- TypeScript 5
- Vite 5
- Zustand state management
- CodeMirror editors
- Vitest + Testing Library

### Backend
- Python 3.11+
- FastAPI
- Uvicorn
- Pydantic v2
- httpx
- SSE Starlette
- python-dotenv

### Quality and Maintenance
- Pytest (backend)
- Mypy + Ruff checks in contributor workflow
- Vitest + type checks (frontend)

## Measurable Project Scale (from current workspace)
- Backend test files: 40
- Backend tool modules: 33
- Backend API modules: 16
- Frontend component files: 19
- Provider modules: 9

## Standout Engineering Decisions
- Strong feature-flag model (KODO_ENABLE_*) to control optional capabilities.
- Provider abstraction and smart routing for resiliency and cost/performance strategy.
- Permission model with ask/auto/yolo controls plus path guard restrictions.
- Built-in observability: request IDs, audit logs, and usage events.
- Modular backend domain structure (agent, api, providers, tools, memory, profiles, tasks, mcp).

## API Surface Highlights
- Health: /, /health, /health/live, /health/ready
- Chat and sessions: /api/chat/*
- Prompts: /api/prompts/*
- Skills admin: /api/skills/custom/*
- Collaboration: /api/collab/*
- Providers and profiles: /api/providers/* and /api/profiles/*
- Diagnostics: /api/doctor

## Local Run and Deployment Options
### Local development
- Backend: uvicorn main:app --reload --port 8000
- Frontend: npm run dev (Vite)

### Containerized
- docker-compose.yml includes backend and frontend services
- Default local URLs:
  - Frontend: http://localhost:5173
  - Backend: http://localhost:8000

## Portfolio-Ready Value Proposition
KODO demonstrates end-to-end full-stack engineering with practical AI product depth: real-time UX, secure-by-default controls, provider-agnostic model orchestration, autonomous tool execution, and operational visibility. It is positioned as a production-minded developer platform rather than a simple chatbot UI.

## Links for Portfolio Card
- Project Repo: https://github.com/hxrrrrri/kodo-agent-export
- GitHub Profile: https://github.com/hxrrrrri
- Live Demo (Vercel): Not found in repository docs/config at this time

## Suggested Portfolio Description (Short)
Built a self-hosted autonomous AI coding platform with FastAPI + React that supports multi-provider LLM routing, real-time tool streaming, session replay, collaboration links, custom skills/prompts, and strong observability/permission controls.

## Suggested Portfolio Description (Detailed)
Engineered KODO Agent, a full-stack self-hosted AI developer assistant that goes beyond chat by executing tools autonomously (filesystem, shell, git, web, database, REPL). Implemented a modular FastAPI backend with provider abstraction and smart routing across major LLM vendors, plus a React/TypeScript frontend with streaming UX, notebook/editor panels, replay controls, and collaboration features. Added feature flags, request-level observability, profile-based configuration, and Dockerized setup for robust local deployment.

## Notes
- If you have a live Vercel deployment URL, add it in the Links section above for portfolio publishing.
