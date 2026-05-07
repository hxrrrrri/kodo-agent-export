# Claude CLI — Provider Integration Notes

You are running as the local **Anthropic Claude Code CLI** (`claude` binary). This file tells you everything you need to operate inside the Kodo codebase efficiently.

> **Prerequisite**: Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first. It's the master architecture map. This file only covers Claude-CLI-specific integration.

---

## Your Integration Entry Points

| File | Purpose |
|------|---------|
| `backend/agent/cli_runner.py` | `run_claude_cli`, `_build_claude_attempts` — how Kodo invokes you |
| `backend/agent/cli_runner.py` (`cli_path`) | Discovers `claude` exe — env override `KODO_CLAUDE_CLI_PATH`, fallback `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude` |
| `backend/agent/loop.py` (`_run_cli`) | Builds the prompt sent to you (system + history + user msg + image flags) |
| `backend/agent/cli_runner.py` (`_parse_claude_event`) | Parses your `--output-format stream-json` events into Kodo events |

## Invocation

Kodo runs you as:
```
claude [--image <path>]... [--permission-mode bypassPermissions] -p [--output-format stream-json --verbose] [--include-partial-messages] [--model <model>]
```

with the prompt piped via stdin (or as the trailing positional arg on Windows when stdin fails).

**Streaming output** — Kodo expects `stream-json` events: `system{init}`, `stream_event{message_start, content_block_delta(text_delta|thinking_delta)}`, `assistant{tool_use|text|thinking blocks}`, `user{tool_result}`, `result{usage, total_cost_usd, duration_ms}`.

**Models you'll see** (from [`cli_runner.py`](../../backend/agent/cli_runner.py) `CLI_PROVIDER_MODEL_FALLBACKS["claude-cli"]`):
- `default`
- `claude-sonnet-4-6`
- `claude-opus-4-1`

(Plus anything `claude models list` returns.)

## Image Input

When the user uploads an image, Kodo decodes it from base64, writes a temp file, and adds `--image <tmp-path>` to your args **before** `-p`. Multiple images stack as multiple flags. Kodo cleans the temp files up after the run, regardless of success/error. You don't need to do anything special — your existing `--image` support handles it.

## What Kodo Injects Into Your System Prompt

The `<kodo_instructions>` block in your prompt contains, in order:

1. **`BASE_SYSTEM_PROMPT`** — Kodo's agent contract (autonomous, surgical, verify outcomes)
2. **Artifact protocol** (if `artifact_mode=True`) — fence format for live in-chat rendering
3. **Mode prompt** — current operating mode
4. **Kodo tool catalogue** — descriptions of all 40+ Kodo tools (use as reference)
5. **Memory context** — per-session and per-project memory
6. **Project context** — repo-level info from `project_context.py`
7. **Auto-inject skills** — user's selected always-on skills (default: `smart-planner`)
8. **Kodo Design supremacy prompt** (if design-window request detected) — `KODO_DESIGN_GENERATION_SYSTEM` from `backend/kodo/design/generator.py`
9. **Kodo tool catalog** — full list of Kodo tools (for reference)
10. **Skill injection** — pre-loaded skill content for this specific request + full skill catalog
11. **CLI addendum** — instructions specific to your CLI text-pipe context

## Your Native Tools vs Kodo Tools

You have your own tools (Bash, Read, Write, Edit, Grep, Glob, etc. via Claude Code). **Use your own tools** for filesystem and shell — they're faster and don't round-trip through Kodo's permission layer.

Kodo's tool catalogue in your prompt is for **awareness** — so you know what capabilities exist if the user references "the Kodo crg tools" or similar. You don't invoke Kodo tools directly; if a user asks for a Kodo-specific operation (e.g. `mcp_server_add`, `crg_build_graph`), describe the action and Kodo's agent layer will execute it.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Add a new Claude-CLI flag | `backend/agent/cli_runner.py` → `_build_claude_attempts` |
| Change how Claude events are parsed | `backend/agent/cli_runner.py` → `_parse_claude_event` |
| Add a new Claude-CLI model to dropdown | `backend/agent/cli_runner.py` → `CLI_PROVIDER_MODEL_FALLBACKS["claude-cli"]` |
| Adjust the CLI system prompt | `backend/agent/loop.py` → `_run_cli` and `_build_cli_addendum` |
| Add an auto-inject skill | drop `.md` in `backend/skills/bundled/` + toggle "Auto-inject" in Skills Library, OR edit `_DEFAULT_AUTO_INJECT` in `backend/skills/settings.py` |

## Conventions

- **Don't write artifacts to disk** — emit them as artifact fences. Kodo renders live in chat.
- **For visual builds** — Kodo Design system is auto-injected. Follow it exactly (HTML5 boilerplate, CSS custom properties, font pairs, Unsplash images).
- **For code work** — surgical diffs. Don't refactor unless asked.
- **Streaming** — text deltas should flow continuously; emit `assistant` blocks as you reason, not just at the end.
- **Tool calls** — your `tool_use` blocks are surfaced in the Kodo UI as visible tool steps.

## Quick Test

```bash
# Confirm Kodo can discover and invoke you
curl http://localhost:8000/api/providers/cli-status | jq '.cli_providers."claude-cli"'

# List the models Kodo will offer in the dropdown
curl http://localhost:8000/api/providers/cli-models | jq '.models."claude-cli"'

# Smoke test
PRIMARY_PROVIDER=claude-cli curl -s -X POST http://localhost:8000/api/chat/send \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Hi"}],"session_id":"test"}'
```

## Gotchas

- Kodo strips most `CLAUDE_*` env vars before invoking you — keep `CLAUDE_HOME` and OS auth dirs but everything else gets cleared (avoids stale config).
- On Windows, prompts >7000 chars get piped via stdin instead of as a positional arg (cmdline limit).
- `--include-partial-messages` is detected via `--help` and only added if supported (older versions don't have it).
- The retry chain: `permission-mode → stream-json → plain → with-prompt-arg → without-prompt-arg`. If image flags fail, fallback attempts strip them.
