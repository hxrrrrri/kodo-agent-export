# Artifacts v2 — manual test checklist

Run once per provider after any change to the artifact pipeline. Each prompt below is designed to exercise the protocol without leaning on Anthropic- or OpenAI-specific output conventions.

## Setup

1. `cd backend && python -m uvicorn main:app --reload` (port 8000).
2. `cd frontend && npm run dev` (port 5173).
3. Open http://localhost:5173 and toggle **Artifact mode** on in the composer bar.
4. Select the provider + model under test via the sidebar profile switcher.

## Per-provider smoke suite

For each provider (Anthropic / OpenAI / Gemini / DeepSeek / Groq / OpenRouter / GitHub Models / Codex / Ollama / Atomic Chat), run these prompts in order:

### 1. Single HTML artifact

> Build me a simple HTML page with a centred "Hello Kodo" heading on a dark background. Emit it as an artifact.

Expected:
- Side panel opens automatically on first `tool_result`-like update.
- `type=html`, `version=1`.
- Preview renders in iframe. Sandbox attribute is `allow-scripts` only (inspect element).
- Download button saves a single `index.html`.

### 2. React counter

> Build a React counter artifact with + / − buttons and a reset. Use hooks.

Expected:
- `type=react`, `version=1`.
- Preview boots React 18 via esm.sh import map or Babel fallback.
- Interacting with the buttons inside the iframe updates the count.
- Copy + ZIP download work.

### 3. Update existing artifact

> Update the counter to persist its value in localStorage across reloads.

Expected:
- New fence emits `id=counter` (or whatever the model used) + `version=2`.
- Version switcher shows `v1 | v2 | diff`.
- Clicking `diff` shows added/removed lines.
- Reload iframe — counter value persists.

### 4. Multi-file bundle

> Build an html-multi bundle: `index.html` imports `style.css` and `app.js`. Make `style.css` apply a gradient; make `app.js` animate a colour transition on a button.

Expected:
- Two or three fences share the same `id=` with `bundle=true`.
- File tree in side panel lists all files; entrypoint marker visible.
- Inside the iframe, `<link rel=stylesheet href=style.css>` + `<script src=app.js>` resolve via blob URLs.
- ZIP download contains all files at original paths + `artifact.json`.

### 5. Mermaid diagram

> Diagram the OAuth 2.0 authorisation code flow in Mermaid.

Expected:
- `type=mermaid`, preview renders the diagram via mermaid@10 from CDN inside the iframe.

### 6. SVG

> Draw an SVG icon of a cup of coffee.

Expected:
- `type=svg`, preview renders centred.

### 7. Graphviz

> Render a dot graph of a package dependency tree: foo -> bar, bar -> baz, foo -> baz.

Expected:
- `type=dot`, preview loads `@viz-js/viz` via CDN and renders the SVG.

### 8. Inline snippet (must NOT artifactify)

> Write a one-line bash command to count files in this directory. Keep it inline.

Expected:
- Regular `` ```bash `` fence, no artifact panel appears.
- Inline code block rendered in the assistant message body.

## Weak-model sanity (Ollama / Gemma)

With `PRIMARY_PROVIDER=ollama` + `MODEL=llama3` (or `gemma:2b`), rerun prompts 1, 2, and 4. Known behaviours:

- Weaker models occasionally drop `version=`. Parser tolerates this and defaults to 1.
- If the model produces a bare `artifact:html` fence (legacy v1), the parser still surfaces it as an artifact.

## Share link

1. On any artifact, click the share icon.
2. URL is copied to clipboard.
3. Open the URL in an incognito window.
4. `SharedArtifactPage` renders the artifact read-only. Preview + code + file tree are visible; version switcher + downloads are hidden.
5. If `KODO_ENABLE_COLLAB=0`, the endpoint returns 404 and the page shows "Could not load artifact".

## Hardening checks

Open DevTools:

- Inspect the preview iframe: `sandbox` attribute contains **only** `allow-scripts` (unless user enabled the `forms` / `popups` checkboxes).
- Try evaluating `parent.document.cookie` inside an iframe script. It must throw a SecurityError.
- Submit an artifact larger than 2 MB via `POST /api/artifacts/<session>` with curl. Expect `413 Payload Too Large`.
- POST an artifact with `type=binary-blob`. Expect `400`.
- GET `/api/artifacts/<session>/..%2Fetc`. Expect `400` or `404`.

## Regression

Before closing the session, run:

```
cd backend && python -m pytest tests/ -q
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
cd backend && python -m ruff check .
```

All four must exit green.
