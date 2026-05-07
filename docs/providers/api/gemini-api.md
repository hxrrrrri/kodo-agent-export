# Gemini API — Provider Integration Notes

You are running as the direct **Google Gemini API** (Generative Language API). This file covers your specific integration into Kodo.

> **Prerequisite**: Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first.

---

## Your Integration Entry Points

| File | Purpose |
|------|---------|
| `backend/providers/gemini_provider.py` | `gemini_chat` — the REST client used by the agent loop |
| `backend/agent/loop.py` (`_run_gemini`) | Wraps `gemini_chat` for streaming + system prompt + history |
| `backend/kodo/capsule/providers/gemini_adapter.py` | Capsule (session-snapshot) integration |

## Default Settings

- **Default model**: `gemini-2.0-flash` (configurable via `GEMINI_MODEL` env)
- **Default base URL**: `https://generativelanguage.googleapis.com/v1beta` (override via `GEMINI_BASE_URL`)
- **Required env**: `GEMINI_API_KEY` (or fallback `GOOGLE_API_KEY`)

## Calling Convention

Gemini doesn't use the OpenAI-compatible interface — `_run_gemini` calls `gemini_chat(messages, model, system, max_tokens, stream, tools)` directly, which makes a native Google API request.

The system prompt is passed separately (Gemini's native `systemInstruction` field). History messages are converted from Kodo's normalized format inside `gemini_provider.py`.

## Tool Use

Tool schemas are passed via `tools=OPENAI_TOOLS` (the function-call schemas reused) — `gemini_provider.py` converts to Gemini's native `functionDeclarations` format.

## Image Input

Handled in `_to_anthropic_content` / `_to_openai_content` upstream — Gemini's REST endpoint expects inline image data as part of the multimodal `parts` array. See `gemini_provider.py` for the exact translation.

## What Kodo Injects Into Your System Prompt

Same as all providers — see [`anthropic-api.md`](anthropic-api.md#what-kodo-injects-into-your-system-prompt). Kodo Design supremacy prompt auto-injects for design intent.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Change default model | `backend/agent/loop.py` → `default_model_map["gemini"]`, or set `GEMINI_MODEL` env |
| Adjust REST request | `backend/providers/gemini_provider.py` → `gemini_chat` |
| Add Gemini models to dropdown | The dropdown for the API provider (not CLI) is populated by the Gemini API's model-list endpoint at runtime; for CLI fallback see `_GEMINI_MODEL_FALLBACKS` in `cli_runner.py` |
| Tweak streaming parsing | `backend/providers/gemini_provider.py` |

## Conventions

- **Surgical edits** — don't refactor surrounding code unless asked
- **Match existing patterns** — `gemini_chat` returns either an async iterator (when `stream=True`) or a dict
- **For design tasks** — Kodo Design supremacy prompt auto-injects

## Gotchas

- Gemini's `system_instruction` is one field, not part of `messages`. Don't try to inject it as a "system" role message.
- `GEMINI_API_KEY` is the canonical env var, but `GOOGLE_API_KEY` is also accepted as a fallback.
- Different Gemini model versions have different tool-use support — `gemini-2.5-pro` is most capable; `gemini-2.0-flash-lite` may not support function calling.
- The token-usage estimate in `_run_gemini` is approximate (`len(text) // 4`) — Gemini's actual token usage is reported by the API but Kodo currently only uses character-count heuristics for the local loop.
- For models the user wants in the dropdown but that aren't returned by Gemini's listing endpoint, add them to `_GEMINI_MODEL_FALLBACKS` (CLI side) or to the frontend's `DEFAULT_MODEL_BY_PROVIDER` map.
