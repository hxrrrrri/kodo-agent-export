# Ollama — Provider Integration Notes

You are running as a **local Ollama-served model**. This file covers your specific integration into Kodo.

> **Prerequisite**: Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first.

---

## Your Integration Entry Points

| File | Purpose |
|------|---------|
| `backend/agent/loop.py` (`_run_openai`) | You go through the OpenAI-compatible client (Ollama exposes a `/v1` endpoint) |
| `backend/providers/ollama_provider.py` | Ollama-specific helpers (model discovery) |
| `backend/providers/discovery.py` | `discover_local_providers`, `list_available_models("ollama")` |
| `backend/api/providers.py` (`/api/providers/ollama/setup`) | Frontend setup — base URL, API key, default model |
| `backend/kodo/capsule/providers/ollama_adapter.py` | Capsule integration |

## Default Settings

- **Base URL**: `http://localhost:11434` (override via `OLLAMA_BASE_URL`). Kodo automatically appends `/v1` when calling.
- **Optional**: `OLLAMA_API_KEY` (for hosted Ollama Cloud)
- **Default model**: `llama3` (only used if discovery returns nothing)
- **Smart fallback**: If `_resolve_model_for_switch` runs without an explicit model, Kodo lists available models via Ollama's `/api/tags`, then picks one with `recommend_model(models, "balanced")`.

## Calling Convention

Routed through `_run_openai` like any OpenAI-compatible provider — no special path. The `AsyncOpenAI` client points at `<OLLAMA_BASE_URL>/v1`.

## Tool Use

Most Ollama models do NOT support function calling reliably. To compensate, Kodo includes `_infer_local_forced_tool_call` in `loop.py`. If the user's request matches a deterministic intent (list folders, list files, find bugs, pwd, list contents), Kodo skips the LLM entirely and runs a `bash`/`powershell` tool with a sensible command. Otherwise, the request flows to you with `OPENAI_TOOLS` attached — but you may ignore them.

## Image Input

Some Ollama models (LLaVA, BakLLaVA, gemma:7b-vision, etc.) support vision. Kodo passes images via the OpenAI `image_url` content-part format (`data:<mime>;base64,<data>`). If your model doesn't support vision, Ollama will return an error — Kodo surfaces it.

## What Kodo Injects Into Your System Prompt

Same as all providers — see [`anthropic-api.md`](../api/anthropic-api.md#what-kodo-injects-into-your-system-prompt). The Kodo Design supremacy prompt auto-injects for design intent.

For **weak local models**, the artifact protocol is repeated twice (top + bottom of system prompt) so it survives the model's poor instruction-following. See `build_system_prompt` in `prompt_builder.py`.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Change Ollama base URL handling | `backend/api/providers.py` → `_normalize_ollama_base_url` |
| Change model discovery | `backend/providers/discovery.py` → `list_available_models("ollama")` |
| Add a forced-tool-call intent | `backend/agent/loop.py` → `_infer_local_forced_tool_call` (terms + commands per OS) |
| Change setup endpoint behaviour | `backend/api/providers.py` → `ollama_setup_endpoint`, `_ollama_setup_status` |

## Conventions

- **Surgical edits** — don't refactor surrounding code unless asked
- **Match existing patterns** — async generator yielding event dicts
- **For design tasks** — Kodo Design supremacy prompt auto-injects (large — may exceed small-context Ollama models; consider testing context limit)

## Gotchas

- Kodo's `_resolve_provider_config` only routes to Ollama when `PRIMARY_PROVIDER=ollama` is explicitly set. Without that, even if Ollama is reachable, an API provider takes precedence.
- The base URL must NOT end in `/v1` in your config — Kodo strips trailing `/v1` and re-appends it. Double-`/v1` causes 404s.
- Many Ollama models can't actually follow the artifact protocol — they emit raw HTML without fences. The forced-tool-call shortcut and the doubled artifact reminder are workarounds. For best artifact quality, use Anthropic / OpenAI / Gemini.
- `_run_openai` enables `stream_options: {include_usage: True}` — Ollama may not return usage; Kodo handles that gracefully.
- Smart router never includes Ollama unless explicitly listed in its provider catalog (it relies on a healthy `ping_url`).
- For very weak models (Llama-3-8B and below), even the auto-skill injection can crowd out user context. Set `MAX_CONTEXT_MESSAGES=10` and consider disabling auto-inject skills.
