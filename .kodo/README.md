# Project-Local KODO Context

This folder gives KODO project-native behavior that works across cloud and local LLM providers.

KODO injects relevant markdown from this folder into the system prompt and exposes project-local skills and commands through normal KODO commands.

## Layout

- `skills/`: reusable workflows the model can load or run with `/skills`.
- `commands/`: project-local slash commands runnable with `/commands run <name>` or `/<name>`.
- `agents/`: role definitions for specialized subagents and review workflows.
- `rules/`: path-scoped or subsystem-scoped coding rules.
- `output-styles/`: response formatting contracts.
- `settings.json`: project policy metadata and future hook registry.
- `mcp.json`: optional project MCP server hints.

## Model Compatibility

All files are plain markdown or JSON. Avoid provider-specific XML, tool-call syntax, or hidden state. A small local model should still understand the instructions when they are injected into the prompt.
