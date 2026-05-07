# GitHub Copilot CLI — Provider Integration Notes

You are running as **GitHub Copilot CLI** — either via `gh copilot` (the `gh-copilot` extension) or a standalone `copilot` binary.

> **Prerequisite**: Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first.

---

## Your Integration Entry Points

| File | Purpose |
|------|---------|
| `backend/agent/cli_runner.py` | `run_copilot_cli`, `_build_copilot_attempts`, `_parse_copilot_event` |
| `backend/agent/cli_runner.py` (`cli_path`, `_gh_copilot_available`) | Discovers `gh copilot` or `copilot` exe; env override `KODO_COPILOT_CLI_PATH` |

## Invocation

If using `gh copilot`:
```
gh copilot [chat] [--allow-all|--allow-all-tools] [--no-ask-user] [--output-format json] [--model <model>] [-p]
```

If using standalone `copilot`:
```
copilot [--allow-all|--allow-all-tools] [--no-ask-user] [--output-format json] [--model <model>] [-p]
```

with the prompt either piped via stdin or as the trailing positional arg.

**Output**: JSON-line events (`session.tools_updated`, `assistant.turn_start`, `assistant.message_delta{deltaContent}`, `assistant.reasoning_delta`, `tool.execution_start`, `tool.execution_complete`, `result{usage}`).

**Models you'll see** (from `CLI_PROVIDER_MODEL_FALLBACKS["copilot-cli"]`):
- `default`
- `gpt-5.3-codex`

## Image Input

Currently **not wired** for Copilot CLI. If/when supported, add image flag handling to `_build_copilot_attempts` and add `image_paths` parameter to `run_copilot_cli` (mirror the Claude/Gemini implementations).

## What Kodo Injects Into Your System Prompt

Same as all CLIs — see [`claude-cli.md`](claude-cli.md#what-kodo-injects-into-your-system-prompt). Design supremacy prompt auto-injects for design requests.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Add a new Copilot flag | `backend/agent/cli_runner.py` → `_build_copilot_attempts` |
| Parse new event types | `backend/agent/cli_runner.py` → `_parse_copilot_event` |
| Add a model to dropdown | `backend/agent/cli_runner.py` → `CLI_PROVIDER_MODEL_FALLBACKS["copilot-cli"]` |
| Change `gh copilot` detection | `backend/agent/cli_runner.py` → `_gh_copilot_available` |

## Conventions

- **Don't write artifacts to disk** — emit them as artifact fences.
- **For design work** — Kodo Design supremacy prompt is auto-injected.
- **Tool calls** — your `tool.execution_start` / `tool.execution_complete` events are surfaced as visible tool steps.

## Gotchas

- The VS Code GitHub Copilot extension does NOT expose a headless prompt CLI. Kodo cannot use it for chat — install `gh` with `gh-copilot` extension, or a standalone `copilot` CLI, or set `KODO_COPILOT_CLI_PATH` to a working binary.
- For `gh copilot`, Kodo first probes `gh copilot --help` to confirm availability before listing it as a provider.
- Both `--allow-all` and `--allow-all-tools` are tried (different versions use different flag names).
- Both `gh copilot <prompt>` and `gh copilot chat <prompt>` invocation modes are tried.

## Quick Test

```bash
curl http://localhost:8000/api/providers/cli-status | jq '.cli_providers."copilot-cli"'
curl http://localhost:8000/api/providers/cli-models | jq '.models."copilot-cli"'

# Confirm gh-copilot is installed
gh copilot --help
```
