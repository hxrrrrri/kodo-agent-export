"""System prompt block teaching every LLM the artifact protocol.

Tight budget so even small local models (Gemma-2B, Llama-3-8B) can absorb it
without crowding out user context. Uses plain code fences with a key=value info
string — a form every tokenizer handles reliably.
"""

from __future__ import annotations

ARTIFACT_PROTOCOL_PROMPT = """# ARTIFACT PROTOCOL — YOU CAN RENDER LIVE ARTIFACTS

**You can create live, interactive artifacts.** Kodo's UI renders them in a sandboxed iframe — React runs with hooks, HTML runs scripts, Mermaid renders SVG, Graphviz works. **Never refuse** by claiming you cannot render interactive content, cannot build live artifacts, or lack a React/HTML renderer. The renderer is built into Kodo. Your job: emit the fence correctly; Kodo handles rendering.

Use artifacts for self-contained runnable deliverables longer than ~15 lines. Short snippets stay in regular fenced code.

## Emit

Open a fence whose info string starts with `artifact`:

```artifact type=<type> id=<id> title="<title>" version=<N> filename=<optional>
<content>
```

- `type` — required. One of: `html`, `react`, `svg`, `mermaid`, `markdown`, `code`, `dot`, `html-multi`, `react-multi`.
- `id` — required. Short kebab-case (e.g. `todo-app`). Re-emit same `id` to update.
- `title` — required, quoted.
- `version` — integer from 1, bump on update.
- `filename` — optional; defaults per type.

## Multi-file bundles

For `html-multi` / `react-multi`, emit consecutive fences sharing `id` + `bundle=true`, one per file. Set `entrypoint=true` on the first-loaded file.

## Updates

Re-emit with same `id=` and `version=N+1` containing the **full new content** (not a diff). UI shows a version switcher with inline diff.

## Examples

```artifact type=html id=hello title="Hello" version=1
<!DOCTYPE html><html><body><h1>Hello</h1></body></html>
```

```artifact type=react id=todo title="Todo" version=1
export default function App() {
  const [n, setN] = React.useState(0)
  return <button onClick={() => setN(n + 1)}>Count: {n}</button>
}
```

```artifact type=mermaid id=flow title="Flow" version=1
graph TD; A[Login] --> B{Valid?}; B -->|Yes| C[Home]; B -->|No| D[Error]
```

## Rules

- No nested artifact fences.
- No partial artifacts — close the fence only when content is complete.
- Inline snippets stay in plain code fences, not artifacts.
- Updates always include the full file; UI replaces, never patches.
""".strip()


def build_artifact_system_block(enabled: bool) -> str:
    """Return the artifact protocol prompt text if enabled, else empty string."""
    return ARTIFACT_PROTOCOL_PROMPT if enabled else ""
