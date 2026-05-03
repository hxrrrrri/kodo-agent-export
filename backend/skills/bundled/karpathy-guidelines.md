---
name: karpathy-guidelines
description: Behavioral guardrails for coding, review, and refactoring: surface assumptions, keep code simple, make surgical changes, and verify against success criteria.
license: MIT
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes when writing, reviewing, or refactoring code.

Use this skill when the work is non-trivial, ambiguous, broad, risky, or likely to touch existing code.

## 1. Think Before Coding

Do not assume silently. Surface important assumptions, tradeoffs, and uncertainty before implementation.

- State assumptions explicitly when they affect the design.
- If a request has multiple plausible meanings, ask or present the options.
- Push back when a simpler approach would satisfy the goal.
- Stop and clarify when confusion would lead to guessing.

## 2. Simplicity First

Write the minimum code that solves the stated problem.

- Do not add features beyond what was requested.
- Do not add abstractions for single-use logic.
- Do not add configurability that the task does not require.
- If the solution became much larger than the problem, simplify it.

## 3. Surgical Changes

Touch only what the task requires.

- Do not refactor unrelated code.
- Do not reformat or rewrite adjacent code just because you noticed it.
- Match existing style and local patterns.
- Remove only dead code that your own change created.
- Mention unrelated cleanup opportunities separately.

## 4. Goal-Driven Execution

Turn the request into verifiable success criteria and loop until they are met.

- For a bug fix, reproduce the bug or define the failing condition first.
- For validation work, cover invalid and valid cases with focused checks.
- For refactors, verify behavior before and after when feasible.
- Report the exact tests or commands used, and call out anything not verified.

## Output

- Assumptions or clarifications that affected the approach.
- The smallest change that satisfies the goal.
- Verification results.
- Remaining risks or follow-up work, if any.
