---
name: agent-provider-neutral
description: Rules for features that must work across all local and cloud LLM providers.
globs: backend/agent/**/*.py,backend/providers/**/*.py,backend/skills/**/*.md,.kodo/**/*.md
---

# Provider-Neutral Agent Rules

- Put durable behavior in plain markdown, system prompt sections, or KODO tools rather than provider-specific syntax.
- Assume smaller local models need explicit capability statements and concise instructions.
- Avoid relying on hidden chain-of-thought, proprietary tool names, or vendor-specific role semantics.
- Confirm every new agent capability is reachable through KODO's existing execution path.
- Keep project context bounded; summarize indexes and include full content only for rules that must always apply.
