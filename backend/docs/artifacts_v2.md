# Artifacts v2 — design summary

Date: 2026-04-22.
Feature flag: `KODO_ENABLE_ARTIFACTS_V2` (default `1`).

## Why v2 existed

v1 parsed fenced code blocks client-side. It had:

- no server awareness — `artifact_mode` was a dead flag on `ChatRequest`
- no versioning or update protocol
- no multi-file support
- html-only live preview, missing React/Mermaid/SVG/dot/markdown
- `sandbox="allow-scripts allow-same-origin allow-forms"` on the preview iframe — meaning artifact JS could read the parent app's cookies / localStorage
- no share links, no ZIP downloads, no diff view

## Goals

Parity with Claude.ai artifacts (or better), fully provider-agnostic. Works with Anthropic, OpenAI, Gemini, DeepSeek, Groq, OpenRouter, GitHub Models, Codex, Ollama, Atomic Chat. No tool-use, no function-calling, no JSON mode — pure text fences every LLM can emit.

## Protocol

Code fence with a structured info string:

```
```artifact type=<type> id=<stable-id> title="<title>" version=<N> [filename=<f>] [bundle=true] [entrypoint=true]
<content>
```
```

Types: `html`, `react`, `svg`, `mermaid`, `markdown`, `code`, `dot`, `html-multi`, `react-multi`.

Multi-file bundles emit consecutive fences sharing `id=` + `bundle=true`. Updates re-emit the same `id=` with `version=N+1` containing the full new content.

The protocol prompt lives at [`backend/artifacts/protocol_prompt.py`](../artifacts/protocol_prompt.py) and is injected by `build_system_prompt` when `artifact_mode=True` and the feature flag is on. Kept under ~2.4 KB so weaker local models (Llama-3-8B, Gemma) can absorb it without crowding out context.

## Backend components

- [`backend/artifacts/protocol_prompt.py`](../artifacts/protocol_prompt.py) — protocol text + `build_artifact_system_block(enabled)`.
- [`backend/artifacts/store.py`](../artifacts/store.py) — session-scoped on-disk artifact store at `~/.kodo/artifacts/<session_id>.json`. LRU-capped at 50 versions per artifact, 100 artifacts per session.
- [`backend/api/artifacts.py`](../api/artifacts.py) — REST endpoints (authed upsert/list/get + public share-token read).
- Wiring: [`agent/prompt_builder.py`](../agent/prompt_builder.py), [`agent/loop.py`](../agent/loop.py), [`agent/session_runner.py`](../agent/session_runner.py), [`api/chat.py`](../api/chat.py) all thread `artifact_mode` through.

## Frontend components

- `frontend/src/lib/artifacts/parser.ts` — provider-neutral parser supporting v2 grammar + legacy `artifact:`/`artifact` fences. Detects unclosed trailing fences (`streaming: true`).
- `frontend/src/lib/artifacts/types.ts` — `ArtifactV2`, `ArtifactFile`, `ArtifactRef`.
- `frontend/src/lib/artifacts/download.ts` — single-file + ZIP downloads (lazy-loads `jszip`).
- `frontend/src/components/artifacts/` — runtime dispatcher + per-type runtimes (html, react, svg, mermaid, markdown, dot, code), diff view, version switcher, file tree, hardened side panel.
- `frontend/src/pages/SharedArtifactPage.tsx` — read-only public view, mounted when `window.location.pathname` matches `/shared-artifact/:session/:artifact`.
- `frontend/src/store/chatStore.ts` — new `sessionArtifacts: Record<artifactId, ArtifactV2[]>`, `selectedArtifactV2`, and `upsertSessionArtifact`.

## Streaming

`useChat.handleEvent('text')` runs the v2 parser on every accumulated chunk. The parser is a pure function, and `upsertSessionArtifact` dedupes by `(id, version)` — so re-parsing on every token is safe. Mid-stream unclosed fences are detected and suppressed (parser returns `streaming: true`, no artifacts).

## Security

- All artifact HTML is rendered inside a `<iframe sandbox="allow-scripts" srcdoc=...>`. `allow-same-origin` is **never** applied — including to the legacy v1 panel (fixed as part of this change).
- Optional `allow-forms` / `allow-popups` toggles exposed per-artifact, opt-in via the side-panel checkboxes.
- Host never interpolates artifact content into the parent DOM — every renderer goes through `srcdoc`.
- React runtime uses `esm.sh` via importmap (no eval in parent origin) or Babel standalone inside the sandbox iframe.
- Upsert endpoint enforces a 2 MB bundle cap and validates artifact type against an allowlist. Preview refuses to render and offers download-only when a bundle exceeds 2 MB at render time.
- Share endpoint requires a valid collab token; gated by `KODO_ENABLE_COLLAB`.
- Every new `postMessage` handler (`HtmlRuntime`) checks `e.source === iframeRef.current?.contentWindow`.
- Artifact `id`s with `/`, `\`, `..`, or null bytes are rejected at the API boundary.

## Testing

- Backend: `tests/test_artifact_protocol.py` (4), `tests/test_artifact_store.py` (6), `tests/test_artifacts_api.py` (5), plus `artifact_mode` kwarg threaded through existing `tests/test_session_runner.py` / `tests/test_chat_project_dir_fallback.py` fakes.
- Frontend: `src/lib/artifacts/parser.test.ts` (12), `src/lib/artifacts/streaming.test.ts` (4), `src/components/artifacts/ArtifactRuntime.test.tsx` (2), `src/pages/SharedArtifactPage.test.tsx` (5).

Total change: +16 backend tests (156 → 172), +23 frontend tests (28 → 51).

## Backward compatibility

- Legacy `artifact:<lang>` and bare `artifact` fences still parse — synthesised as v2 items with `type=code` (or `html` if the file looks like HTML) and `version=1`.
- Old per-message `ArtifactItem[]` path in `MessageBubble` remains the fallback when `artifactRefs` is absent; the v2 panel wins when both are present.
- `KODO_ENABLE_ARTIFACTS_V2=0` suppresses the protocol system block entirely, reverting behaviour to v1 — useful for debugging or for users who want terser model outputs.

## Known limitations / deferred work

- React runtime import allowlist is permissive (lets any `esm.sh` package through). A stricter `KODO_ARTIFACT_ALLOW_ALL_IMPORTS=0` mode is wired but not yet enforced strictly.
- Backend persistence is append-only; no delete-version-N endpoint.
- Mermaid / viz.js load from CDN inside the iframe. Offline usage would need those bundled.
- Automatic title generation for artifacts is not implemented — models must provide `title=`.
