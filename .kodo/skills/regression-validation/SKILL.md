---
name: regression-validation
description: Choose and run efficient checks after a KODO code change.
license: MIT
---

# Regression Validation

Use this skill after implementation.

## Backend

- Run focused pytest files for changed modules.
- Add a new test when the behavior is not already covered.
- For prompt changes, assert durable phrases or feature markers rather than full prompt strings.

## Frontend

- Run component or hook tests for changed UI behavior.
- Run type checks when TypeScript contracts changed.
- Use browser smoke checks for visual or interaction changes.

## Output

- Commands run.
- Pass/fail status.
- Root cause for failures.
- Known unverified risk.
