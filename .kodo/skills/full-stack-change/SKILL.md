---
name: full-stack-change
description: Plan, implement, and verify a scoped KODO change that may touch backend and frontend code.
license: MIT
---

# Full-Stack KODO Change

Use this skill for feature work that may touch API routes, agent behavior, tools, providers, and React UI.

## Workflow

1. Inspect the existing backend and frontend paths involved in the request.
2. Identify the smallest cross-layer contract change.
3. Update backend behavior first, then frontend consumers.
4. Add focused tests at the layer where behavior is owned.
5. Run targeted backend and frontend checks.

## Guardrails

- Do not create a new abstraction until existing patterns are insufficient.
- Keep provider-specific logic inside provider adapters.
- Keep user-facing copy concise and operational.
- Report exact validation commands and remaining gaps.
