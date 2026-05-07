# Gemini CLI — Provider Integration Notes

You are running as the local **Google Gemini CLI** (`gemini` binary). This file covers your specific integration into Kodo.

> **Prerequisite**: Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first.

---

## Your Integration Entry Points

| File | Purpose |
|------|---------|
| `backend/agent/cli_runner.py` | `run_gemini_cli`, `_build_gemini_attempts`, `_parse_gemini_event` |
| `backend/agent/cli_runner.py` (`cli_path`) | Discovers `gemini` exe — env override `KODO_GEMINI_CLI_PATH`. Note: the Gemini Code Assist VS Code extension bundles `cloudcode_cli`, which is a language server, NOT a prompt CLI — Kodo does not use it. Install the standalone `gemini` CLI separately. |

## Invocation

```
gemini [--image <path>]... [--output-format stream-json|json] --skip-trust --yolo [--model <model>] [-p]
```

with the prompt either piped via stdin or as the trailing positional arg.

**Output formats** Kodo tries (in order):
1. `--output-format stream-json` (preferred — line-delimited events)
2. `--output-format json` (single JSON blob)
3. Plain text (fallback)

**Models you'll see** (from `_GEMINI_MODEL_FALLBACKS` in `cli_runner.py`):
- `default`
- `gemini-2.5-pro`, `gemini-2.5-flash`
- `gemini-2.5-pro-preview-05-06`, `gemini-2.5-flash-preview-04-17`
- `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-2.0-flash-001`
- `gemini-1.5-pro`, `gemini-1.5-flash`

(Plus anything `gemini models list` returns.)

## Image Input

When the user uploads an image, Kodo writes it to a temp file and adds `--image <tmp-path>` to your args. Multiple images stack as multiple flags. Kodo cleans up temp files after the run. If `--image` isn't supported by your version, Kodo retries without the flag (fallback attempts are appended).

## What Kodo Injects Into Your System Prompt

See [`claude-cli.md`](claude-cli.md#what-kodo-injects-into-your-system-prompt) — same structure for all CLIs. For design-window requests, the Kodo Design supremacy prompt + design skills get injected.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Add/remove Gemini models from dropdown | `backend/agent/cli_runner.py` → `_GEMINI_MODEL_FALLBACKS` |
| Change Gemini retry/argument logic | `backend/agent/cli_runner.py` → `_build_gemini_attempts` |
| Parse new Gemini event types | `backend/agent/cli_runner.py` → `_parse_gemini_event` |
| Filter Gemini stderr noise | `backend/agent/cli_runner.py` → `_GEMINI_NOISE_PREFIXES`, `_clean_gemini_error` |

## Conventions

- **Don't write artifacts to disk** — emit them as artifact fences.
- **For design work** — Kodo Design supremacy prompt is auto-injected. Follow it exactly.
- **Tool calls** — model output containing tool requests is parsed via `_parse_gemini_event`.

## Gotchas

- The Gemini Code Assist VS Code extension's `cloudcode_cli.zip` is a Language Server Protocol implementation, NOT a headless prompt CLI. Kodo cannot use it for chat. Install the standalone `gemini` CLI from Google.
- Stderr noise prefixes Kodo strips: `"Warning: 256-color support not detected."`, `"YOLO mode is enabled."`, `"Ripgrep is not available."`
- Common error: `"ModelNotFoundError"` / `"requested entity was not found"` → Kodo translates this to "Gemini CLI model was not found for this account. Set a supported model (for example gemini-2.5-flash)."
- On model failure, Kodo retries with each entry in `_GEMINI_MODEL_FALLBACKS` until one works.
- Kodo always passes `--skip-trust --yolo` to bypass interactive trust prompts.

## Quick Test

```bash
curl http://localhost:8000/api/providers/cli-status | jq '.cli_providers."gemini-cli"'
curl http://localhost:8000/api/providers/cli-models | jq '.models."gemini-cli"'
```
