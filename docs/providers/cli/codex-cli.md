# Codex CLI — Provider Integration Notes

You are running as the local **OpenAI Codex CLI** (`codex` binary, often shipped via the ChatGPT VS Code extension). This file covers your specific integration into Kodo.

> **Prerequisite**: Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first.

---

## Your Integration Entry Points

| File | Purpose |
|------|---------|
| `backend/agent/cli_runner.py` | `run_codex_cli`, `_codex_attempts`, `_codex_args`, `_parse_codex_event` |
| `backend/agent/cli_runner.py` (`cli_path`, `_extension_binary_candidates`) | Discovers `codex` exe — env override `KODO_CODEX_CLI_PATH`, fallback to ChatGPT VS Code extension's bundled `codex` |
| `backend/agent/loop.py` (`_run_cli`) | Builds the prompt sent to you |

## Invocation

```
codex exec --json --output-last-message <tmp> --skip-git-repo-check --full-auto -c sandbox_workspace_write.network_access=true [-C <cwd>] [--model <model>] [--disable plugins]
```

with the prompt piped via stdin.

**Output**: `--json` line-delimited events (`thread.started`, `turn.started`, `item.started{command_execution}`, `item.completed{command_execution|agent_message}`, `turn.completed`, `error`, `turn.failed`). Plus the final answer is dumped to `--output-last-message <file>` as a fallback.

**Models you'll see** (from `CLI_PROVIDER_MODEL_FALLBACKS["codex-cli"]`):
- `default`
- `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.2`

## What Kodo Injects Into Your System Prompt

Same as all CLIs — see [`claude-cli.md`](claude-cli.md#what-kodo-injects-into-your-system-prompt). Notable items: full tool catalogue, auto-selected skills, and the Kodo Design supremacy prompt for design-window requests.

## Image Input

Kodo passes uploaded images to `codex exec` with repeated `--image <path>` flags. This is required for screenshot/reference-image design work; without it Codex only sees the text prompt.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Add a Codex flag | `backend/agent/cli_runner.py` → `_codex_args` |
| Change retry behaviour | `backend/agent/cli_runner.py` → `_codex_attempts`, `_codex_attempt_needs_retry` |
| Parse a new Codex event type | `backend/agent/cli_runner.py` → `_parse_codex_event` |
| Add a Codex-CLI model to dropdown | `backend/agent/cli_runner.py` → `CLI_PROVIDER_MODEL_FALLBACKS["codex-cli"]` |
| Adjust env scrubbing | `backend/agent/cli_runner.py` → `_codex_env` |

## Conventions

- **Don't write artifacts to disk** — emit them as artifact fences.
- **For design work** — the Kodo Design supremacy prompt is auto-injected when the request matches design intent. Follow it exactly.
- **Tool calls** — your `command_execution` items are surfaced as visible Bash tool steps in the Kodo UI.

## Gotchas

- Kodo strips ALL `CODEX_*` env vars except `CODEX_HOME` before invoking you (avoids stale config). It also unsets `OPENAI_API_KEY` and `CODEX_API_KEY` so you authenticate via your ChatGPT login.
- The CLI version is sniffed (`_codex_cli_version`) — if older than `0.128.0`, Kodo prefers the bundled extension binary.
- On Windows, Kodo also tries shell-pipe and `CREATE_NEW_CONSOLE` capture modes if direct subprocess fails.
- The retry chain matches errors like `"requires a newer version of codex"`, `"unsupported model"`, `"failed to sync plugin"`, `"forbidden"`, `403` — these trigger fallback attempts with `--disable plugins` and `default` model.
- On retry, `--output-last-message <tmp>` is read from disk if no stdout text was produced.
- Kodo retries with `CLI_DEFAULT_MODEL` ("default") if the requested model fails.

## Quick Test

```bash
curl http://localhost:8000/api/providers/cli-status | jq '.cli_providers."codex-cli"'
curl http://localhost:8000/api/providers/cli-models | jq '.models."codex-cli"'
```
