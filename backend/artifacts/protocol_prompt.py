"""System prompt block teaching every LLM the artifact protocol.

Tight budget so even small local models (Gemma-2B, Llama-3-8B) can absorb it
without crowding out user context. Uses plain code fences with a key=value info
string — a form every tokenizer handles reliably.
"""

from __future__ import annotations

ARTIFACT_PROTOCOL_PROMPT = """# ARTIFACT PROTOCOL — RENDER LIVE ARTIFACTS IN CHAT

## CRITICAL: Never write UI artifacts to disk

When a user asks you to BUILD, CREATE, or SHOW something visual (website, animation, dashboard, chart, app, visualizer, game, diagram, calculator, form…) you MUST emit it as an artifact fence in your response — NOT write it to a file on disk. Writing to disk creates a file the user cannot see. Emitting an artifact fence causes Kodo to render it live, inline, in the chat.

**Wrong**: `file_write("/tmp/app.html", content)` → user sees nothing
**Right**: emit the artifact fence below → user sees it live immediately

You are a capable model. The renderer is already built into Kodo. HTML, React, Mermaid, SVG, canvas, animations — all work. Never say you cannot render interactive content.

## Fence format

```artifact type=<type> id=<id> title="<title>" version=1
<your complete code here>
```

**Required attributes:**
- `type` — one of: `html` `react` `svg` `mermaid` `markdown` `code` `dot`
- `id` — short kebab-case, no spaces (e.g. `gradient-viz`, `todo-app`, `bar-chart`)
- `title` — quoted string shown in the UI header

## Quick reference

| Want to build | Use type | Notes |
|---|---|---|
| Webpage, animation, canvas, game | `html` | Full HTML doc. Use CDN scripts. |
| Interactive UI component | `react` | `export default function App()`. Tailwind included. |
| Chart, graph | `html` or `react` | recharts, Chart.js via CDN |
| Flowchart, diagram | `mermaid` | Mermaid syntax |
| Network graph | `dot` | Graphviz DOT |
| SVG illustration | `svg` | Raw SVG |
| Code file to explain | `code` | syntax-highlighted |

## Minimal examples

HTML animation:
```artifact type=html id=bounce title="Bounce" version=1
<!DOCTYPE html><html><head><style>
body{background:#0f0f13;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.ball{width:60px;height:60px;border-radius:50%;background:#ff4d21;animation:bounce 1s infinite alternate}
@keyframes bounce{from{transform:translateY(-80px)}to{transform:translateY(80px)}}
</style></head><body><div class="ball"></div></body></html>
```

React counter:
```artifact type=react id=counter title="Counter" version=1
export default function App() {
  const [n, setN] = React.useState(0)
  return (
    <div style={{padding:24,color:'#f0f0f5'}}>
      <button onClick={() => setN(n+1)} style={{padding:'8px 20px',background:'#ff4d21',border:'none',borderRadius:8,color:'#000',cursor:'pointer',fontSize:16}}>
        Count: {n}
      </button>
    </div>
  )
}
```

Mermaid diagram:
```artifact type=mermaid id=flow title="Flow" version=1
graph TD; A[Start] --> B{Check}; B -->|Yes| C[Done]; B -->|No| D[Retry]
```

## Update an artifact

Re-emit with same `id=` and `version=N+1` with complete new content:
```artifact type=html id=bounce title="Bounce v2" version=2
...full updated content...
```

## Rules

- NEVER nest artifact fences inside each other.
- NEVER emit partial artifacts — the fence must be complete before closing.
- Close every fence with a bare ` ``` ` on its own line.
- HTML: CDN scripts must use `<script src="...">` (no `type="module"`). Canvas + requestAnimationFrame work. For Tailwind: `<script src="https://cdn.tailwindcss.com"></script>`.
- React: Any npm package works via import (lucide-react, recharts, framer-motion…). Use `export default function App()`.
- UI theme (MANDATORY): host background is `#0f0f13` (very dark). Your artifact must blend in:
  - `html, body { background: transparent; margin: 0; padding: 0; }` — always set this.
  - Use dark colors: `#0d1117`, `#1a1a2e`, `#1e1e2e`, `rgba(255,255,255,0.08)` for cards.
  - NEVER use `background: white`, `background: #fff`, `background: #f5f5f5` — visible as ugly white boxes.
  - Text: `#e0e0e8`, `rgba(255,255,255,0.85)`. Borders: `rgba(255,255,255,0.1)`.
  - Tailwind dark classes: `bg-gray-900`, `bg-slate-900`, `bg-zinc-900`. Never `bg-white` or `bg-gray-50`.
""".strip()


def build_artifact_system_block(enabled: bool) -> str:
    """Return the artifact protocol prompt text if enabled, else empty string."""
    return ARTIFACT_PROTOCOL_PROMPT if enabled else ""
