"""System prompt block teaching every LLM the artifact protocol.

Tight budget so even small local models (Gemma-2B, Llama-3-8B) can absorb it
without crowding out user context. Uses plain code fences with a key=value info
string — a form every tokenizer handles reliably.
"""

from __future__ import annotations

ARTIFACT_PROTOCOL_PROMPT = """# ARTIFACT PROTOCOL — RENDER LIVE ARTIFACTS
## CRITICAL: Never write UI artifacts to disk
When asked to BUILD/CREATE something visual (website, app, game, chart...), emit it as an artifact fence — NOT to a file. Kodo renders these live in chat.
**Wrong**: `file_write("/tmp/app.html", ...)`
**Right**: Emit fence below.

## Fence format
```artifact type=<type> id=<id> title="<title>" version=1 bundle=true
<your code here>
```
Types: `html`, `react`, `svg`, `mermaid`, `markdown`, `code`, `dot`.
`id`: kebab-case (e.g., `todo-app`).

## Minimal Examples
HTML Animation:
```artifact type=html id=bounce title="Bounce" version=1
<!DOCTYPE html><html><head><style>
body{background:#0f0f13;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.ball{width:60px;height:60px;border-radius:50%;background:#ff4d21;animation:bounce 1s infinite alternate}
@keyframes bounce{from{transform:translateY(-80px)}to{transform:translateY(80px)}}
</style></head><body><div class="ball"></div></body></html>
```

React Counter:
```artifact type=react id=counter title="Counter" version=1
export default function App() {
  const [n, setN] = React.useState(0);
  return <button onClick={() => setN(n+1)} style={{padding:20,background:'#ff4d21',borderRadius:8}}>Count: {n}</button>;
}
```

## Rules
- Close every fence with a bare ` ``` ` on its own line.
- HTML: Use `<script src="...">`. Tailwind: `<script src="https://cdn.tailwindcss.com"></script>`.
- UI Theme (MANDATORY — Claude-style blending):
  - `html, body { background: transparent !important; margin: 0; }` — host chat bg shows through.
  - Component cards/panels: use `#111114` or `#1a1a1f` backgrounds (NOT white, NOT #0f0f13).
  - Every card/panel MUST have `border: 1px solid rgba(255,255,255,0.14)` — subtle grey outline.
  - Text: `#e0e0e8`. Secondary: `#a8a8b8`. Borders: `rgba(255,255,255,0.14)`.
  - NEVER use `white`, `#f5f5f5`, or any light color on body/root.
  - Example card: `background:#111114; border:1px solid rgba(255,255,255,0.14); border-radius:12px; padding:16px`
""".strip()


def build_artifact_system_block(enabled: bool) -> str:
    """Return the artifact protocol prompt text if enabled, else empty string."""
    return ARTIFACT_PROTOCOL_PROMPT if enabled else ""
