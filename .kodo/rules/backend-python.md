---
name: backend-python
description: Rules for FastAPI, agent, tool, provider, and backend test changes.
globs: backend/**/*.py
---

# Backend Python Rules

- Keep APIs provider-neutral unless the file is a provider adapter.
- Prefer small helpers over broad framework changes.
- Validate request models with Pydantic and keep route errors explicit.
- Use async boundaries consistently; do not block event loops with heavy synchronous work.
- For tools, return structured `ToolResult` data and clear user-facing errors.
- For prompt changes, keep wording compact enough for local models.
- Add or update focused pytest coverage for changed behavior.
