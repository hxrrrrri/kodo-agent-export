# Anthropic API — Provider Integration Notes

You are running as the direct **Anthropic Claude API** (not the Claude Code CLI). This file covers your specific integration into Kodo.

> **Prerequisite**: Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first.

---

## Your Integration Entry Points

| File | Purpose |
|------|---------|
| `backend/agent/loop.py` (`_run_anthropic`) | The main loop that streams tool calls and text from you |
| `backend/agent/loop.py` (`_apply_runtime_config`) | Configures `AsyncAnthropic` client with `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` |
| `backend/agent/loop.py` (`build_anthropic_tools`, `ANTHROPIC_TOOLS`) | Builds the structured tool schemas you receive (one per Kodo tool) |
| `backend/agent/loop.py` (`_to_anthropic_content`, `_build_anthropic_messages`) | Converts message history to your content-block format (text + image support) |
| `backend/kodo/capsule/providers/anthropic_adapter.py` | Capsule (session-snapshot) integration |

## Default Settings

- **Default model**: `claude-sonnet-4-6` (`DEFAULT_ANTHROPIC_MODEL` in `loop.py`)
- **Default base URL**: `https://api.anthropic.com` (override via `ANTHROPIC_BASE_URL`)
- **Required env**: `ANTHROPIC_API_KEY`
- **Max tokens**: capped at `min(MAX_TOKENS, ANTHROPIC_MAX_TOKENS)` (default 8192 each)

## Image Input

Native — handled via Anthropic's `image` content blocks (base64 or URL). `_to_anthropic_content` in `loop.py` builds these from Kodo's normalized content format. URL images get inlined as `{type: "image", source: {type: "url", url: ...}}` (newer API) or fall back to text references for older routes.

## Tool Use (Native)

You receive `ANTHROPIC_TOOLS` — a list built by calling `tool.to_anthropic_schema()` on every entry in `tools/__init__.py::ALL_TOOLS`. Each tool schema has `name`, `description`, and `input_schema`. Kodo expects standard Anthropic tool-use blocks back: `{type: "tool_use", id, name, input}`. Results return as `{type: "tool_result", tool_use_id, content, is_error}`.

The `_run_anthropic` loop runs until you stop emitting tool_use blocks.

## Prompt Caching

Optional — controlled by `KODO_ENABLE_PROMPT_CACHE` env (default off). When enabled:
- The system prompt is wrapped in `{type: "text", cache_control: {type: "ephemeral"}}`
- The last `N_CACHE_MESSAGES` (default 4) messages get `cache_control` on their first content block
- Cap: 4 cache_control blocks total per request (Anthropic limit) — system uses 1, messages get 3

`_apply_anthropic_cache_controls` in `loop.py` handles this.

## What Kodo Injects Into Your System Prompt

Built by `build_system_prompt` in `prompt_builder.py`, in order:

1. `BASE_SYSTEM_PROMPT` (Kodo agent contract)
2. Artifact protocol (if `artifact_mode=True`)
3. Mode prompt (`get_mode(mode).prompt`)
4. Tool guidance (each tool's `prompt()` text — short usage hint)
5. Memory context (per-session + per-project from `memory_manager`)
6. Project context (`build_project_context_prompt`)
7. Caveman mode prompt (if enabled)
8. Auto-inject skill bodies (defaults: `smart-planner`)
9. Artifact reminder (re-primes the protocol just before user message)
10. **Kodo Design supremacy prompt** + design skill content (when `artifact_mode=True` AND request matches design intent — `is_design_window_request`)

## Fallback Behaviour

If Anthropic returns `"credit balance is too low"`, `"plans & billing"`, or `"purchase credits"`, Kodo automatically tries OpenAI (`OPENAI_API_KEY`, `OPENAI_FALLBACK_MODEL` or `gpt-4o`) — see `_switch_to_openai_fallback` in `loop.py`.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Change default model | `backend/agent/loop.py` → `DEFAULT_ANTHROPIC_MODEL` |
| Adjust tool schema generation | `backend/tools/base.py` → `BaseTool.to_anthropic_schema` |
| Tweak prompt caching policy | `backend/agent/loop.py` → `_apply_anthropic_cache_controls`, `_anthropic_system_payload` |
| Change fallback target | `backend/agent/loop.py` → `_switch_to_openai_fallback` |
| Adjust max_tokens cap | `backend/agent/loop.py` → `_max_tokens_for_provider` |

## Conventions

- **Surgical edits** — don't refactor surrounding code unless asked
- **Match existing patterns** — async generator yielding event dicts (`{type: "text"|"tool_start"|"tool_result"|"usage"|"done"|"error"}`)
- **For design tasks** — the Kodo Design supremacy prompt auto-injects. Follow it precisely.

## Gotchas

- `claude-sonnet-4-6` is the canonical default. Older code may reference `claude-sonnet-4-5` or `claude-3-5-sonnet-latest` — those are stale. Always use the current ID.
- The `ANTHROPIC_TITLE_MODEL` env defaults to `claude-3-5-haiku-latest` for cheap auto-titling. Don't change this to a Sonnet/Opus model.
- The `_run_anthropic` loop appends `assistant_content` (with text + tool_use blocks) and `user{tool_result}` blocks to keep tool turns in sync. Don't break this turn structure.
- When `disable_tools=True`, Kodo strips `tools` from the request — used by Design Studio surfaces that just want raw HTML output.
