---
name: ship
description: Build, lint, test, and summarize a ready-to-ship KODO change.
---

# Ship Command

Prepare the current change for handoff.

1. Inspect `git status --short`.
2. Identify files changed by this task versus pre-existing unrelated changes.
3. Run focused tests for changed backend and frontend behavior.
4. Run broader checks only when the touched surface is shared or high risk.
5. Summarize changed files, validation results, and remaining risks.

Do not commit unless the user explicitly asks.
