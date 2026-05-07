"""System prompt block teaching every LLM the artifact protocol.

Uses plain code fences with a key=value info string — a form every tokenizer
handles reliably. Includes production-grade design standards so artifacts match
the quality of native Claude AI output.
"""

from __future__ import annotations

ARTIFACT_PROTOCOL_PROMPT = """# ARTIFACT PROTOCOL — RENDER LIVE ARTIFACTS

## CRITICAL: Never write UI artifacts to disk
When asked to BUILD/CREATE something visual (website, app, game, chart, dashboard, animation...), emit it as an artifact fence — NOT to a file. Kodo renders these live in chat.
**Wrong**: `file_write("/tmp/app.html", ...)`
**Right**: Emit the artifact fence directly in your response.

## Fence Format
```artifact type=<type> id=<id> title="<title>" version=1
<your code here>
```
Types: `html`, `react`, `svg`, `mermaid`, `markdown`, `code`, `dot`.
`id`: kebab-case slug (e.g., `sales-dashboard`, `todo-app`, `bounce-animation`).

## Type Selection
- `html` — Full HTML page with inline CSS/JS. Best for: landing pages, apps, games, animations, dashboards, data visualizations, tools. Prefer this for ALL visual builds unless user explicitly asks for React.
- `react` — React/JSX with hooks. Best for: interactive components where React's reactivity matters. Always use `React.useState`, `React.useEffect` etc (React is globally available).
- `svg` — Pure SVG graphics, icons, illustrations, diagrams.
- `mermaid` — Flowcharts, sequence diagrams, ER diagrams.
- `markdown` — Rich formatted documents, reports, specs.
- `code` — Code snippet with syntax highlighting (non-runnable).

## Production Design Standard (MANDATORY for all HTML/React artifacts)

### Design Tokens — Always Define These
```css
:root {
  --bg: transparent;
  --surface: #111114;
  --surface-2: #1a1a1f;
  --border: rgba(255,255,255,0.10);
  --border-strong: rgba(255,255,255,0.18);
  --text: #e0e0e8;
  --text-2: #a8a8b8;
  --text-3: #6b6b7b;
  --accent: #ff4d21;
  --accent-hover: #ff6b45;
  --radius: 10px;
  --radius-lg: 16px;
  --font: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}
```

### Mandatory Base Styles
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent !important; color: var(--text); font-family: var(--font); line-height: 1.6; }
```

### Card / Panel Pattern
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}
```

### Button Pattern
```css
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 10px 20px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 10px 20px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.btn-secondary:hover { background: var(--surface-2); }
```

### Input / Form Pattern
```css
input, textarea, select {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  padding: 10px 14px;
  font-size: 14px;
  outline: none;
  width: 100%;
  transition: border-color 0.15s;
}
input:focus, textarea:focus, select:focus { border-color: var(--accent); }
```

## Quality Rules (Non-Negotiable)

### NEVER do these (auto-fail):
1. **Default indigo/purple gradients** — `#6366f1`, `#8b5cf6`, `from-purple-500 to-blue-600` without brand reason
2. **Fake trust metrics** — "500K+ users", "99.9% uptime" unless the brief provides them
3. **Emoji as icons** — 🚀 ⚡ 💡 🎯 for UI icons. Use SVG, CSS shapes, or Unicode geometric marks instead
4. **Lorem ipsum / filler copy** — Write real, specific, coherent placeholder content
5. **Generic gradient hero backgrounds** — `linear-gradient(135deg, #667eea, #764ba2)` is forbidden
6. **White or light backgrounds** — Never `background: white` or `#f5f5f5` on body/root
7. **Placeholder image services** — Never `via.placeholder.com`, `picsum.photos`

### Always do these:
- Use CSS custom properties (`var(--accent)`) — not hard-coded hex values scattered through the code
- Every interactive element has a visible hover/focus state
- Typography has clear hierarchy: display size → section heading → body → caption
- Spacing is consistent — use multiples of 4px or 8px
- Components are self-contained — no external dependencies unless CDN is required (e.g. Tailwind, Chart.js)
- For data/charts: prefer Chart.js (`<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`) or pure SVG
- For icons: use inline SVG `<svg>` elements with `width`/`height`/`viewBox` set

## HTML Artifact Rules
- Always start with `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">...`
- Inline all CSS inside `<style>` in `<head>` — no external stylesheets
- Inline all JS inside `<script>` before `</body>` — no external scripts except explicit CDN requests
- Use Tailwind only if the user requests it: `<script src="https://cdn.tailwindcss.com"></script>`

## React Artifact Rules
- React, ReactDOM, and Babel are globally available — do not import them
- Always `export default function App() { ... }`
- Use `React.useState`, `React.useEffect`, `React.useRef`, `React.useMemo`, `React.useCallback`
- For styling: inline style objects with the design tokens as values
- For icons: inline SVG inside JSX

## Minimal Working Examples

HTML dark card UI:
```artifact type=html id=card-demo title="Card Demo" version=1
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--surface:#111114;--border:rgba(255,255,255,0.10);--text:#e0e0e8;--text-2:#a8a8b8;--accent:#ff4d21;--radius:10px}
html,body{background:transparent;color:var(--text);font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;max-width:360px;width:100%}
h2{font-size:18px;font-weight:600;margin-bottom:8px}
p{color:var(--text-2);font-size:14px;line-height:1.6;margin-bottom:16px}
.btn{background:var(--accent);color:#fff;border:none;border-radius:var(--radius);padding:10px 20px;font-weight:600;cursor:pointer}
</style></head><body>
<div class="card"><h2>Hello from Kodo</h2><p>This is a dark-mode card with design tokens.</p><button class="btn">Get Started</button></div>
</body></html>
```

React counter:
```artifact type=react id=counter title="Counter" version=1
export default function App() {
  const [n, setN] = React.useState(0);
  const style = {
    display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:32,
    fontFamily:'-apple-system,sans-serif',color:'#e0e0e8'
  };
  const btnStyle = {
    background:'#ff4d21',color:'#fff',border:'none',borderRadius:8,
    padding:'10px 24px',fontSize:16,fontWeight:600,cursor:'pointer'
  };
  return (
    <div style={style}>
      <div style={{fontSize:48,fontWeight:700}}>{n}</div>
      <div style={{display:'flex',gap:8}}>
        <button style={btnStyle} onClick={() => setN(n-1)}>−</button>
        <button style={btnStyle} onClick={() => setN(n+1)}>+</button>
      </div>
    </div>
  );
}
```

## Output Rules
- Emit the artifact fence DIRECTLY — no preceding explanation, no wrapping markdown, no plan.
- Close every fence with a bare ``` on its own line.
- If you include a filename, put it in the fence info: `filename=index.html`. Never put it as the first line of the code body.
- After the fence, you may add 1–2 sentences of context if helpful (what was built, how to interact with it). Nothing more.
- REMINDER: Never refuse to generate an artifact by claiming you lack a renderer — Kodo renders all artifact types live.
""".strip()


def build_artifact_system_block(enabled: bool) -> str:
    """Return the artifact protocol prompt text if enabled, else empty string."""
    return ARTIFACT_PROTOCOL_PROMPT if enabled else ""
