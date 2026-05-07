# Gemma — Provider Integration Notes

You are running as a **Gemma 2 / Gemma 3 / Gemma 4** model — typically served through Ollama, occasionally via the Gemini API or a self-hosted endpoint. This file covers Gemma-specific integration concerns.

> **Prerequisites**:
> 1. Read [`docs/providers/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) first.
> 2. If you're served via Ollama, also read [`ollama.md`](ollama.md).

---

## Where Gemma Plugs In

Gemma models flow through whatever serving layer hosts them:

| Serving layer | Kodo path | Provider key |
|---------------|-----------|--------------|
| Ollama (`ollama run gemma3`, `ollama run gemma2:27b`) | `_run_openai` (OpenAI-compat) | `ollama` |
| Google Gemini API (Gemma model IDs) | `_run_gemini` | `gemini` |
| Self-hosted vLLM / TGI with OpenAI-compat | `_run_openai` | `openai` (custom base URL) |

Kodo doesn't have a dedicated `gemma` provider — pick the underlying serving provider.

## Default Model IDs

- **Ollama**: `gemma3:27b`, `gemma3:12b`, `gemma3:4b`, `gemma3:1b`, `gemma2:27b`, `gemma2:9b`, `gemma2:2b`
- **Gemini API**: `gemma-2-27b-it`, `gemma-2-9b-it` (and successors)

Kodo discovers these at runtime via `list_available_models("ollama")` or the Gemini API's listing endpoint.

## Image Input

- **Gemma 3 (4B+)** — vision-capable. Pass images via OpenAI `image_url` content parts (Ollama) or Gemini's native multimodal API.
- **Gemma 2** — text-only. Ignore image attachments.

Kodo's content normalization (`_to_openai_content` / `_to_anthropic_content`) handles both — it passes images through and lets the serving layer either use or reject them.

## Tool Use

Gemma models are **weak at function calling**. Treat their tool support as best-effort. When routed through Ollama, Kodo's `_infer_local_forced_tool_call` deterministic shortcut compensates for the most common file/folder listing requests.

For complex tool workflows, prefer Anthropic / OpenAI / Gemini-Pro instead.

## What Kodo Injects Into Your System Prompt

Same structure as all providers — see [`../api/anthropic-api.md`](../api/anthropic-api.md#what-kodo-injects-into-your-system-prompt). Two important Gemma-specific concerns:

1. **Context budget** — Gemma 2 has 8K context, Gemma 3 has 128K. The full Kodo system prompt + tool catalog + skill injection can be 50K+ chars. For Gemma 2 deployments, drastically trim by setting `MAX_CONTEXT_MESSAGES=4` and disabling auto-inject skills.
2. **Artifact protocol repetition** — `build_system_prompt` repeats the artifact reminder at the bottom of the prompt because small models forget the rule before reaching it. Don't strip this duplication.

## For Design Window Requests

The Kodo Design supremacy prompt is ~22 KB. For Gemma 2 (8K context), this single prompt blows the context budget. Recommendations:

- For Gemma 2 → use the basic artifact protocol only. Disable design-mode auto-injection in the Kodo Design Studio settings, or skip Gemma for design work.
- For Gemma 3 (128K context) → the design prompt fits. Quality is still lower than Claude / Gemini-Pro for visual builds, but workable for prototyping.

## Where to Make Edits for Common Tasks

| Task | File(s) |
|------|---------|
| Add a Gemma model fallback | `backend/agent/cli_runner.py` (Gemini CLI side) or `backend/providers/gemini_provider.py` (API side) |
| Tune token cap for Gemma | `backend/agent/loop.py` → `_max_tokens_for_provider` (or `MAX_TOKENS` env) |
| Add a forced-tool-call intent (Ollama-served Gemma) | `backend/agent/loop.py` → `_infer_local_forced_tool_call` |
| Change auto-inject skill set when running Gemma | `backend/skills/settings.py` — but this is global; consider a per-provider override pattern if you need it |

## Gotchas

- Gemma **does not** match the prefix for the Gemini CLI's discovery (`gemini-` only) — but the model name returned from Ollama may be `gemma3:27b` or similar. Don't try to route Gemma through `gemini-cli`; route it through `ollama` provider.
- Gemma's chat template is sensitive — Ollama / vLLM handle this for you. If you self-host raw weights, you must format with the Gemma chat tokens (`<start_of_turn>user\n...<end_of_turn>\n<start_of_turn>model\n`).
- For very long Kodo prompts, Gemma 2 will silently truncate. Outputs may look fine but be missing key context. Set `MAX_CONTEXT_MESSAGES` low and trust the symptom of "model doesn't seem to know about a recent message" → context overflow.
- If `OLLAMA_BASE_URL` points to Ollama Cloud (`https://ollama.com`), set `OLLAMA_API_KEY` too — Cloud requires it; local does not.
