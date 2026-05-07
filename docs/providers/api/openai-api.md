# OpenAI / Codex API — Provider Integration Notes

You are running as the direct **OpenAI API** (or `codex` provider, which is OpenAI-compatible). This file covers your specific integration into Kodo.

> **Prerequisite**: Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first.

---

## Your Integration Entry Points

| File | Purpose |
|------|---------|
| `backend/agent/loop.py` (`_run_openai`) | Main loop — streams chat completions + tool calls |
| `backend/agent/loop.py` (`_apply_runtime_config`) | Configures `AsyncOpenAI` client (works for OpenAI, Codex, DeepSeek, Groq, OpenRouter, GitHub Models, Ollama, Atomic Chat, NVIDIA — all OpenAI-compatible) |
| `backend/agent/loop.py` (`build_openai_tools`, `OPENAI_TOOLS`) | Function-call schemas you receive |
| `backend/agent/loop.py` (`_to_openai_content`, `_build_openai_messages`) | Converts message history (text + image_url support) |
| `backend/kodo/capsule/providers/openai_adapter.py` | Capsule integration |

## Default Settings

- **OpenAI default model**: `gpt-4o` (`DEFAULT_OPENAI_MODEL` in `loop.py`)
- **Codex default model**: `gpt-4o`
- **OpenAI base URL**: `https://api.openai.com/v1` (override via `OPENAI_BASE_URL`)
- **Codex base URL**: `https://api.openai.com/v1` (override via `CODEX_BASE_URL`)
- **Required env**: `OPENAI_API_KEY` (or `CODEX_API_KEY`)

## Image Input

Native — handled via OpenAI's `image_url` content parts. `_to_openai_content` in `loop.py` converts Kodo's normalized image blocks into:
```json
{"type": "image_url", "image_url": {"url": "data:<mime>;base64,<data>" or "<url>"}}
```

## Tool Use (Function Calling)

You receive `OPENAI_TOOLS` — a list of `{type: "function", function: {name, description, parameters}}` entries built from `tools/__init__.py::ALL_TOOLS`. Kodo expects standard OpenAI tool_calls in chunks. The `_run_openai` loop accumulates them via the `tool_calls_raw` dict (keyed by `index`), then dispatches each via Kodo's `TOOL_MAP[name].execute(**input)`.

Tool results are appended as `{role: "tool", tool_call_id: <id>, content: <result>}` messages.

The loop runs until `finish_reason == "stop"` or no tool_calls were emitted.

## Streaming

Kodo enables `stream: True` and `stream_options: {include_usage: True}` (auto-stripped if your endpoint rejects it). Usage is accumulated across chunks via `chunk.usage.prompt_tokens` / `completion_tokens`.

## What Kodo Injects Into Your System Prompt

Same as Anthropic — see [`anthropic-api.md`](anthropic-api.md#what-kodo-injects-into-your-system-prompt). The Kodo Design supremacy prompt auto-injects for design intent.

## Forced Tool Calls (Local Providers Only)

For `ollama` and `atomic-chat` — both routed through `_run_openai` — Kodo includes `_infer_local_forced_tool_call`. If the user request matches a deterministic intent (e.g. "list folders", "find bugs", "pwd"), Kodo skips the LLM and runs a `bash`/`powershell` tool directly. This compensates for weak instruction-following in small local models. **Does not apply to OpenAI / Codex / DeepSeek / Groq.**

## Fallback Behaviour

If OpenAI returns `"insufficient_quota"` or `"exceeded your current quota"`, Kodo automatically tries Anthropic (`ANTHROPIC_API_KEY`, `ANTHROPIC_FALLBACK_MODEL` or `claude-sonnet-4-6`) — see `_switch_to_anthropic_fallback`.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Change default model | `backend/agent/loop.py` → `DEFAULT_OPENAI_MODEL` |
| Adjust tool schema | `backend/tools/base.py` → `BaseTool.to_anthropic_schema` (used as base; converted) |
| Streaming behaviour | `backend/agent/loop.py` → `_create_openai_stream`, `_run_openai` |
| Add an OpenAI-compatible provider (DeepSeek, Groq, ...) | `backend/agent/loop.py` → `_resolve_provider_config` (`provider_order`, `default_model_map`, `key_env_map`, `base_url_map`) |

## Conventions

- **Surgical edits** — don't refactor surrounding code unless asked
- **Match existing patterns** — async generator yielding event dicts
- **For design tasks** — Kodo Design supremacy prompt auto-injects. Follow it precisely.

## Gotchas

- `stream_options: {include_usage: True}` isn't universally supported — Kodo strips it on `unknown parameter` errors and retries.
- `OPENAI_TITLE_MODEL` defaults to `gpt-4o-mini` for cheap auto-titling. Don't override to a heavy model.
- Tool call `index` accumulation matters — chunks arrive piecewise; the dict-by-index pattern in `_run_openai` is required to assemble them correctly.
- For Codex API specifically, the model IDs map to OpenAI codex models. Use the OpenAI base URL unless `CODEX_BASE_URL` is set.
- Many "OpenAI-compatible" endpoints (Groq, DeepSeek, OpenRouter, NVIDIA NIM) work but may not support every feature — function calling support varies.
- The `o1` / `o3` / `o4` reasoning models don't support tool use the same way — see `OPENAI_MODEL_PREFIXES` if extending.
