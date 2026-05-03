---
name: provider-neutral-agent-feature
description: Add an agent feature so all supported LLM providers can understand and use it.
license: MIT
---

# Provider-Neutral Agent Feature

Use this skill when adding prompts, skills, tools, commands, artifacts, or execution behavior that should work with Anthropic, OpenAI-compatible providers, Gemini, Groq, DeepSeek, Ollama, and other local models.

## Workflow

1. Put durable instructions in markdown or a system-prompt section.
2. Keep the instruction compact and explicit for weaker local models.
3. Expose the feature through KODO's existing tools, commands, skills, or API routes.
4. Avoid provider-only syntax unless the provider adapter owns it.
5. Add tests that prove the feature appears in the provider-neutral path.

## Verification

- Confirm `build_system_prompt` includes the needed context when relevant.
- Confirm commands or tools can reach the feature without a vendor-specific model.
- Run focused pytest coverage for the touched path.
