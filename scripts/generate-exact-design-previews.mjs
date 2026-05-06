import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const ROOT = 'c:/project_github/kodo-agent-export'
const DOCS = join(ROOT, 'backend/skills/bundled/design-systems')
const OUT = join(ROOT, 'frontend/public/design-previews')

const requested = [
  ['openai-research', 'OpenAI', 'ai-minimal'],
  ['anthropic-editorial', 'Anthropic', 'editorial'],
  ['huggingface-community', 'Hugging Face', 'catalog'],
  ['deepseek-tech', 'DeepSeek', 'code-lab'],
  ['github-utility', 'GitHub', 'repo'],
  ['arc-browser', 'Arc Browser', 'browser'],
  ['fintech-dark', 'Fintech Dark', 'dashboard'],
  ['porsche-precision', 'Porsche', 'automotive'],
  ['mercedes-luxury', 'Mercedes', 'automotive'],
  ['canva-playful', 'Canva', 'creative'],
  ['shadcn-system', 'shadcn/ui', 'components'],
  ['magazine-bold', 'Magazine Bold', 'magazine'],
  ['japanese-minimal', 'Japanese Minimal', 'minimal'],
  ['substack-newsletter', 'Substack', 'newsletter'],
  ['atlassian-team', 'Atlassian', 'kanban'],
  ['material-google', 'Google Material', 'material'],
  ['microsoft-fluent', 'Microsoft Fluent', 'fluent'],
  ['salesforce-crm', 'Salesforce', 'crm'],
  ['hubspot-marketing', 'HubSpot', 'pipeline'],
  ['pagerduty-incident', 'PagerDuty', 'incident'],
  ['datadog-ops', 'Datadog', 'observability'],
  ['netflix-streaming', 'Netflix', 'streaming'],
  ['discord-community', 'Discord', 'chat'],
  ['gaming-esports', 'Gaming & Esports', 'esports'],
  ['dropbox-work', 'Dropbox', 'files'],
  ['loom-video', 'Loom', 'video'],
  ['mailchimp-friendly', 'Mailchimp', 'campaign'],
  ['xiaohongshu-social', 'Xiaohongshu', 'social'],
  ['amazon-commerce', 'Amazon', 'commerce'],
  ['neo-brutal', 'Neo Brutal', 'brutal'],
  ['neobrutalism', 'Neobrutalism', 'brutal'],
  ['glassmorphism', 'Glassmorphism', 'glass'],
  ['claymorphism', 'Claymorphism', 'clay'],
  ['retro-80s', "Retro 80's", 'retro'],
  ['cosmic-space', 'Cosmic', 'cosmic'],
  ['cyberpunk-neon', 'Cyberpunk Neon', 'cyberpunk'],
  ['luxury-premium', 'Luxury Premium', 'luxury'],
  ['warmth-organic', 'Warmth & Organic', 'organic'],
]

const themeOverrides = {
  'openai-research': { bg: '#ffffff', surface: '#f7f7f8', text: '#0a0a0a', body: '#353740', muted: '#8e8ea0', border: '#e5e5e5', accent: '#10a37f', fontD: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontB: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', radius: '12px', buttonRadius: '6px', heroSize: '96px' },
  'anthropic-editorial': { bg: '#f3efe7', surface: '#ece6db', text: '#191714', body: '#4a4640', muted: '#7a7268', border: '#d9d2c5', accent: '#d97757', fontD: 'Cormorant Garamond, EB Garamond, Georgia, serif', fontB: 'Inter, -apple-system, sans-serif', radius: '10px', buttonRadius: '6px', heroWeight: 400 },
  'huggingface-community': { bg: '#ffffff', surface: '#f8f9fb', text: '#111827', body: '#374151', muted: '#6b7280', border: '#e5e7eb', accent: '#ffcc4d', fontD: 'Inter, system-ui, sans-serif', fontB: 'Inter, system-ui, sans-serif', radius: '12px', buttonRadius: '8px' },
  'deepseek-tech': { bg: '#050507', surface: '#10131a', text: '#e6eaf3', body: '#a8b1c3', muted: '#6f7a8f', border: '#242936', accent: '#4b9eff', fontD: 'Inter, system-ui, sans-serif', fontB: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, Menlo, Consolas, monospace', radius: '10px', buttonRadius: '8px' },
  'github-utility': { bg: '#0d1117', surface: '#161b22', text: '#f0f6fc', body: '#c9d1d9', muted: '#8b949e', border: '#30363d', accent: '#2f81f7', link: '#58a6ff', success: '#3fb950', danger: '#f85149', warning: '#d29922', radius: '6px', buttonRadius: '6px' },
  'arc-browser': { bg: '#f0edff', surface: '#ffffff', text: '#1a0535', body: '#2c1850', muted: '#6f61a0', border: '#ddd4ff', accent: '#a78bfa', radius: '18px', buttonRadius: '999px' },
  'fintech-dark': { bg: '#050b12', surface: '#0d1a24', text: '#e8f4ff', body: '#b7d0df', muted: '#6a8fa0', border: '#1d3442', accent: '#00b4d8', success: '#18c964', danger: '#ff4d4f', radius: '12px', buttonRadius: '8px' },
  'porsche-precision': { bg: '#0a0a0a', surface: '#111111', text: '#ffffff', body: '#a0a0a0', muted: '#6a6a6a', border: '#2a2a2a', accent: '#c4a97d', accent2: '#d5001c', radius: '0px', buttonRadius: '0px', heroWeight: 300 },
  'mercedes-luxury': { bg: '#0b0d10', surface: '#171a1f', text: '#f5f5f5', body: '#c7c7c7', muted: '#8f949a', border: '#2d3137', accent: '#c4a35a', radius: '4px', buttonRadius: '999px', heroWeight: 300 },
  'canva-playful': { bg: '#f8fbff', surface: '#ffffff', text: '#1f2937', body: '#334155', muted: '#64748b', border: '#dbeafe', accent: '#00c4cc', accent2: '#8b3dff', radius: '16px', buttonRadius: '999px' },
  'shadcn-system': { bg: '#fafafa', surface: '#ffffff', text: '#09090b', body: '#27272a', muted: '#71717a', border: '#e4e4e7', accent: '#18181b', radius: '8px', buttonRadius: '6px' },
  'magazine-bold': { bg: '#fffaf2', surface: '#f8f1e8', text: '#111111', body: '#2b2420', muted: '#6a5b4f', border: '#111111', accent: '#d13f22', fontD: 'Georgia, "Times New Roman", serif', radius: '0px', buttonRadius: '0px', heroWeight: 900 },
  'japanese-minimal': { bg: '#fffdf8', surface: '#f7f3ea', text: '#20201d', body: '#464239', muted: '#706a60', border: '#ddd4c4', accent: '#9b2c1f', fontD: 'Yu Mincho, Hiragino Mincho ProN, Georgia, serif', radius: '2px', buttonRadius: '0px', heroWeight: 400 },
  'substack-newsletter': { bg: '#ffffff', surface: '#f9f9f9', text: '#1c1c1c', body: '#404040', muted: '#6b6b6b', border: '#e6e6e6', accent: '#ff6719', fontD: 'Georgia, "Times New Roman", serif', fontB: 'Georgia, "Times New Roman", serif', radius: '6px', buttonRadius: '999px', heroWeight: 400 },
  'atlassian-team': { bg: '#f7f8f9', surface: '#ffffff', text: '#172b4d', body: '#44546f', muted: '#626f86', border: '#dcdfe4', accent: '#0c66e4', success: '#22a06b', warning: '#f5cd47', danger: '#c9372c', radius: '8px', buttonRadius: '3px' },
  'material-google': { bg: '#f8fafd', surface: '#ffffff', text: '#1f1f1f', body: '#3c4043', muted: '#5f6368', border: '#dadce0', accent: '#1a73e8', accent2: '#34a853', radius: '20px', buttonRadius: '999px' },
  'microsoft-fluent': { bg: '#f5f5f5', surface: '#ffffff', text: '#1b1a19', body: '#323130', muted: '#605e5c', border: '#d2d0ce', accent: '#0078d4', radius: '4px', buttonRadius: '4px' },
  'salesforce-crm': { bg: '#f3f3f3', surface: '#ffffff', text: '#032d60', body: '#181818', muted: '#444444', border: '#dddbda', accent: '#0176d3', success: '#2e844a', warning: '#fe9339', radius: '4px', buttonRadius: '4px' },
  'hubspot-marketing': { bg: '#fff9f5', surface: '#ffffff', text: '#1f2937', body: '#33475b', muted: '#6b7280', border: '#f5c8bc', accent: '#ff7a59', accent2: '#00a4bd', radius: '12px', buttonRadius: '6px' },
  'pagerduty-incident': { bg: '#f9f9fb', surface: '#ffffff', text: '#151515', body: '#2a2a33', muted: '#5a5a6a', border: '#dcdee6', accent: '#06ac38', danger: '#d83b01', warning: '#f59e0b', radius: '6px', buttonRadius: '4px' },
  'datadog-ops': { bg: '#ffffff', surface: '#f8f9fb', text: '#2b2b35', body: '#4a4a5a', muted: '#8a8a9a', border: '#e2e4ea', accent: '#7b44eb', accent2: '#1d76db', success: '#00a851', danger: '#dc3131', warning: '#e07c00', radius: '8px', buttonRadius: '6px' },
  'netflix-streaming': { bg: '#141414', surface: '#1f1f1f', text: '#ffffff', body: '#e5e5e5', muted: '#808080', border: '#333333', accent: '#e50914', radius: '4px', buttonRadius: '4px', heroWeight: 800 },
  'discord-community': { bg: '#313338', surface: '#2b2d31', text: '#dbdee1', body: '#dcddde', muted: '#949ba4', border: '#1e1f22', accent: '#5865f2', success: '#23a55a', danger: '#f23f42', radius: '8px', buttonRadius: '4px' },
  'gaming-esports': { bg: '#0a0a12', surface: '#111120', text: '#e8e8ff', body: '#b9b9e6', muted: '#6666aa', border: '#24244a', accent: '#00ff88', accent2: '#7c3aed', radius: '10px', buttonRadius: '4px' },
  'dropbox-work': { bg: '#f7f5f2', surface: '#ffffff', text: '#1e1919', body: '#3d3937', muted: '#736c64', border: '#d8d3cc', accent: '#0061ff', radius: '0px', buttonRadius: '0px' },
  'loom-video': { bg: '#f5f4ff', surface: '#ffffff', text: '#1a1033', body: '#36285a', muted: '#7b68c8', border: '#dfd9ff', accent: '#6d28d9', radius: '18px', buttonRadius: '999px' },
  'mailchimp-friendly': { bg: '#ffe01b', surface: '#fff8dc', text: '#241c15', body: '#3b3128', muted: '#6b5d4d', border: '#241c15', accent: '#007c89', fontD: 'Georgia, "Times New Roman", serif', radius: '8px', buttonRadius: '999px' },
  'xiaohongshu-social': { bg: '#ffffff', surface: '#f5f5f5', text: '#303034', body: '#4a4a50', muted: '#8a8a8f', border: '#ececec', accent: '#ff2442', radius: '12px', buttonRadius: '999px' },
  'amazon-commerce': { bg: '#ffffff', surface: '#f5f5f5', text: '#111111', body: '#333333', muted: '#555555', border: '#d5d9d9', accent: '#ff9900', accent2: '#146eb4', radius: '8px', buttonRadius: '999px' },
  'neo-brutal': { bg: '#fffdf2', surface: '#ffffff', text: '#111111', body: '#111111', muted: '#333333', border: '#111111', accent: '#ff4d00', radius: '0px', buttonRadius: '0px', heroWeight: 900 },
  'neobrutalism': { bg: '#ffe135', surface: '#ffffff', text: '#000000', body: '#000000', muted: '#000000', border: '#000000', accent: '#ff4d00', radius: '0px', buttonRadius: '0px', heroWeight: 900 },
  'glassmorphism': { bg: '#1a1a2e', surface: 'rgba(255,255,255,0.12)', text: '#e0e0ff', body: '#c7c7f5', muted: '#9090c0', border: 'rgba(255,255,255,0.24)', accent: '#7b68ee', radius: '24px', buttonRadius: '999px', glass: true },
  'claymorphism': { bg: '#f0e6ff', surface: '#e8f4ff', text: '#2d1b69', body: '#4d3b7a', muted: '#6b5b95', border: '#ded1ff', accent: '#ff6b9d', radius: '28px', buttonRadius: '20px', clay: true },
  'retro-80s': { bg: '#0d0221', surface: '#120435', text: '#ff00ff', body: '#00ffff', muted: '#ffff00', border: '#ff00ff', accent: '#00ffff', accent2: '#ffff00', radius: '0px', buttonRadius: '0px', mono: 'Courier New, monospace' },
  'cosmic-space': { bg: '#03001c', surface: '#080032', text: '#e8e8ff', body: '#cacaee', muted: '#9090dd', border: '#2d1b69', accent: '#7c3aed', radius: '18px', buttonRadius: '999px' },
  'cyberpunk-neon': { bg: '#070812', surface: '#111827', text: '#e5faff', body: '#b8efff', muted: '#7dd3fc', border: '#00f5d4', accent: '#00f5d4', accent2: '#ff00e6', radius: '2px', buttonRadius: '0px' },
  'luxury-premium': { bg: '#0b0a08', surface: '#17130f', text: '#f7efe4', body: '#e8dcc9', muted: '#b7a58d', border: '#3a3128', accent: '#c8a45d', fontD: 'Georgia, "Times New Roman", serif', radius: '2px', buttonRadius: '0px', heroWeight: 400 },
  'warmth-organic': { bg: '#fdf6ee', surface: '#fff9f5', text: '#2c1810', body: '#4a3026', muted: '#8a6550', border: '#ead7c5', accent: '#d4763b', fontD: 'Georgia, "Times New Roman", serif', radius: '18px', buttonRadius: '999px', heroWeight: 400 },
}

function escapeHtml(value) {
  return String(value)
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = channels.map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function onColor(hex) {
  return luminance(hex) > 0.45 ? '#111111' : '#ffffff'
}

function rgba(hex, a) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return `rgba(0,0,0,${a})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function pickSummary(md) {
  const text = md
    .replace(/^# .+$/m, '')
    .split('## 2.')[0]
    .replace(/##.+/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 360 ? `${text.slice(0, 360).trim()}...` : text
}

function extractColors(md, theme) {
  const seen = new Set()
  const colors = []
  const patterns = [
    /\*\*([^*:#`(]+?)\*\*\s*\((#[0-9a-fA-F]{6})\)\s*:?\s*([^.\n]*)/g,
    /-\s*\*\*([^*:#`(]+?)\*\*\s*\((#[0-9a-fA-F]{6})\)\s*:?\s*([^.\n]*)/g,
    /([A-Z][A-Za-z0-9 /&-]{2,36})\s*(?:\(|:)\s*`?(#[0-9a-fA-F]{6})`?\)?\s*:?\s*([^.\n]*)/g,
  ]
  for (const pattern of patterns) {
    for (const match of md.matchAll(pattern)) {
      const name = match[1].replace(/[*`:-]/g, '').trim()
      const hex = match[2].toLowerCase()
      if (!seen.has(hex) && colors.length < 18) {
        seen.add(hex)
        colors.push({ name, hex, desc: (match[3] || '').trim() || 'Documented design token' })
      }
    }
  }
  for (const [name, hex] of Object.entries({
    Canvas: theme.bg,
    Surface: theme.surface,
    Ink: theme.text,
    Body: theme.body,
    Muted: theme.muted,
    Border: theme.border,
    Accent: theme.accent,
  })) {
    if (/^#[0-9a-f]{6}$/i.test(hex) && !seen.has(hex.toLowerCase())) {
      colors.push({ name, hex: hex.toLowerCase(), desc: 'Preview base token' })
      seen.add(hex.toLowerCase())
    }
  }
  return colors.slice(0, 14)
}

function extractTypeRows(md, theme) {
  const rows = []
  const tableLine = /^\|\s*([^|\n]+?)\s*\|\s*([^|\n]+px)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*(?:\|.*)?$/gm
  for (const match of md.matchAll(tableLine)) {
    const role = match[1].trim()
    if (/role|---/i.test(role)) continue
    const size = match[2].trim()
    const weightRaw = match[3].trim()
    const weight = Number.parseInt(weightRaw, 10) || theme.heroWeight || 600
    const lineHeight = match[4].trim()
    const tracking = match[5].trim()
    rows.push({ role, size, weight, lineHeight, tracking })
    if (rows.length >= 9) break
  }
  if (rows.length) return rows
  return [
    { role: 'Display Hero', size: theme.heroSize || '72px', weight: theme.heroWeight || 700, lineHeight: '1.0', tracking: '-0.03em' },
    { role: 'Display Large', size: '52px', weight: theme.heroWeight || 700, lineHeight: '1.05', tracking: '-0.02em' },
    { role: 'Heading', size: '32px', weight: 600, lineHeight: '1.15', tracking: '-0.01em' },
    { role: 'Title', size: '20px', weight: 600, lineHeight: '1.25', tracking: '0' },
    { role: 'Body', size: '16px', weight: 400, lineHeight: '1.55', tracking: '0' },
    { role: 'Caption', size: '13px', weight: 400, lineHeight: '1.4', tracking: '0' },
  ]
}

function firstSection(md, heading) {
  const re = new RegExp(`## \\d+\\. ${heading}[\\s\\S]*?(?=\\n## \\d+\\.|$)`, 'i')
  return (md.match(re)?.[0] || '').replace(/\n{3,}/g, '\n\n').trim()
}

function bulletsFrom(text, max = 5) {
  return [...text.matchAll(/(?:^|\n)-\s+(.+)/g)].map(m => m[1].replace(/\*\*/g, '').replace(/`/g, '')).slice(0, max)
}

function getTheme(id) {
  const base = {
    bg: '#ffffff',
    surface: '#f7f7f8',
    text: '#111111',
    body: '#353740',
    muted: '#6b7280',
    border: '#e5e7eb',
    accent: '#111111',
    fontD: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontB: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: 'SFMono-Regular, Menlo, Consolas, monospace',
    radius: '12px',
    buttonRadius: '8px',
    heroWeight: 700,
  }
  return { ...base, ...(themeOverrides[id] || {}) }
}

function tokenCard(color) {
  const border = luminance(color.hex) > 0.9 ? 'border:1px solid var(--hairline);' : ''
  return `<div class="swatch">
    <div class="swatch-color" style="background:${color.hex};${border}"></div>
    <div class="swatch-meta">
      <div class="swatch-name">${escapeHtml(color.name)}</div>
      <div class="swatch-hex">${color.hex}</div>
      <div class="swatch-role">${escapeHtml(color.desc)}</div>
    </div>
  </div>`
}

function typeRow(row, label) {
  const size = row.size.match(/\d+/)?.[0] ? row.size : '16px'
  const lineHeight = /[0-9]/.test(row.lineHeight) ? row.lineHeight : '1.2'
  const tracking = /-?\d/.test(row.tracking) ? row.tracking : '0'
  return `<div class="type-row">
    <div class="type-meta"><strong>${escapeHtml(row.role)}</strong>${escapeHtml(row.size)} / ${escapeHtml(row.weight)} / ${escapeHtml(lineHeight)} / ${escapeHtml(tracking)}</div>
    <div class="type-sample" style="font-size:${size};font-weight:${row.weight};line-height:${lineHeight};letter-spacing:${tracking};">${escapeHtml(label)}</div>
  </div>`
}

function metricBars(theme) {
  return `<div class="chart">
    ${[72, 44, 88, 58, 96, 67, 38, 78, 52, 84].map((h, i) => `<i style="height:${h}%;background:${i % 3 === 0 ? 'var(--accent)' : i % 3 === 1 ? 'var(--accent-2)' : 'var(--muted)'}"></i>`).join('')}
  </div>`
}

function signatureScene(kind, label, theme) {
  const accentOn = onColor(theme.accent)
  switch (kind) {
    case 'repo':
      return `<div class="app-shell github-shell">
        <aside><strong>octo/research-ui</strong><span>Issues</span><span>Pull requests</span><span>Actions</span><span>Projects</span></aside>
        <main>
          <div class="repo-head"><b>research-ui</b><button>Code</button></div>
          ${['Add token preview page', 'Fix contrast on muted labels', 'Update workflow checks'].map((t, i) => `<div class="issue-row"><span class="status ${i === 1 ? 'danger' : 'success'}"></span><div><b>${t}</b><p>#${128 + i} opened by design-systems</p></div><em>${i === 0 ? 'enhancement' : i === 1 ? 'bug' : 'ci'}</em></div>`).join('')}
          <pre class="diff">+ color: var(--fgColor-accent);
- border-radius: 12px;
+ border-radius: 6px;</pre>
        </main>
      </div>`
    case 'streaming':
      return `<div class="poster-stage">
        <div class="poster-hero"><span class="eyebrow">Series</span><h3>Design Systems</h3><p>Dark cinema, red action, thumbnail-first browsing.</p><button>Play</button></div>
        <div class="poster-row">${['A', 'N', 'UI', 'UX', 'TV'].map(x => `<div class="poster">${x}</div>`).join('')}</div>
      </div>`
    case 'chat':
      return `<div class="app-shell chat-shell">
        <aside><strong>Servers</strong><span># design</span><span># product</span><span># launches</span></aside>
        <main>
          <div class="chat-title"># design-systems</div>
          ${['Token pass is ready for review.', 'Pinned the new component preview.', 'Need a tighter hover state on cards.'].map((m, i) => `<div class="message"><div class="avatar">${i + 1}</div><div><b>${['Mira', 'Devon', 'Kai'][i]}</b><p>${m}</p></div></div>`).join('')}
          <div class="composer">Message #design-systems</div>
        </main>
      </div>`
    case 'commerce':
      return `<div class="commerce-grid">
        <div class="product-gallery"><div class="product-image">Product</div><div class="thumbs"><i></i><i></i><i></i></div></div>
        <div class="buy-box"><h3>Precision UI Kit</h3><p class="rating">***** 4.8 / 2,318 ratings</p><p class="price">$49.00</p><button>Add to cart</button><button class="secondary">Buy now</button></div>
      </div>`
    case 'observability':
    case 'dashboard':
      return `<div class="ops-grid">
        <div class="ops-card wide"><div class="ops-title">Revenue / latency overview</div>${metricBars(theme)}</div>
        <div class="ops-card"><b>99.98%</b><span>uptime</span></div>
        <div class="ops-card"><b>142ms</b><span>p95 latency</span></div>
        <div class="ops-card"><b>${kind === 'observability' ? '2.1M' : '$84.2K'}</b><span>${kind === 'observability' ? 'events' : 'volume'}</span></div>
      </div>`
    case 'incident':
      return `<div class="incident-panel">
        <div class="incident-top"><span class="pulse"></span><b>SEV-2 Checkout latency</b><button>Acknowledge</button></div>
        ${['Assigned responder', 'Escalation policy', 'Status update'].map((x, i) => `<div class="timeline"><i>${i + 1}</i><span>${x}</span><em>${i * 4 + 2}m ago</em></div>`).join('')}
      </div>`
    case 'kanban':
      return `<div class="kanban">${['To do', 'In progress', 'Done'].map((col, i) => `<div class="lane"><h4>${col}</h4><div class="ticket">Design preview polish</div><div class="ticket">Token audit ${i + 1}</div></div>`).join('')}</div>`
    case 'crm':
    case 'pipeline':
      return `<div class="crm-grid">
        <div class="record-card"><h3>${kind === 'crm' ? 'Acme Renewal' : 'Lifecycle campaign'}</h3><p>Owner / Priority / Next step</p><button>Update record</button></div>
        <div class="pipeline">${['Lead', 'Qualified', 'Proposal', 'Closed'].map((x, i) => `<div><b>${x}</b><span style="width:${45 + i * 12}%"></span></div>`).join('')}</div>
      </div>`
    case 'automotive':
      return `<div class="auto-stage">
        <div class="car-silhouette"></div>
        <div class="auto-specs"><b>911 Carrera</b><span>0-100 km/h / 4.1s</span><span>Power / 290 kW</span><button>Configure</button></div>
      </div>`
    case 'browser':
      return `<div class="browser-frame">
        <div class="browser-sidebar"><b>Today</b><span>Inbox</span><span>Design</span><span>Research</span></div>
        <div class="browser-page"><div class="url-pill">kodo.local/design-systems</div><h3>Spaces for focused browsing</h3><p>Soft gradients, rounded panels, and personality-forward chrome.</p></div>
      </div>`
    case 'creative':
      return `<div class="creative-board"><div class="toolbar">Templates / Brand / Export</div><div class="canvas-art"><span>Social Post</span></div><div class="asset-grid"><i></i><i></i><i></i><i></i></div></div>`
    case 'video':
      return `<div class="video-card"><div class="play">Play</div><div class="video-timeline"><span></span></div><div class="bubble">Async review ready</div></div>`
    case 'files':
      return `<div class="files-grid">${['Roadmap.pdf', 'Brand kit', 'Launch notes', 'Preview.html'].map((x, i) => `<div class="file"><i>${i === 1 ? 'Folder' : 'File'}</i><b>${x}</b><span>Shared with team</span></div>`).join('')}</div>`
    case 'social':
      return `<div class="masonry">${['Travel notes', 'Cafe finds', 'Style board', 'Saved list', 'City guide'].map((x, i) => `<div class="note" style="height:${120 + i * 18}px"><span>Like ${120 + i * 31}</span><b>${x}</b></div>`).join('')}</div>`
    case 'newsletter':
      return `<div class="article-card"><p class="kicker">Independent writing</p><h3>The operating notes behind better interface taste</h3><p>Serif reading surfaces, clean subscription controls, and writer-first hierarchy.</p><button>Subscribe</button></div>`
    case 'magazine':
      return `<div class="mag-layout"><h3>THE INTERFACE ISSUE</h3><p>Bold editorial rhythm, rule-heavy layouts, oversized serif display, and decisive accent color.</p><div class="pullquote">"Type is the layout."</div></div>`
    case 'minimal':
      return `<div class="minimal-layout"><span>Yohaku</span><h3>Quiet structure</h3><p>Asymmetry, paper surfaces, careful rules, and disciplined absence.</p></div>`
    case 'components':
    case 'material':
    case 'fluent':
      return `<div class="component-board">
        <div class="command-row"><button>Primary</button><button class="secondary">Secondary</button><input value="Design system" /></div>
        <div class="table-card"><div><b>Component</b><b>Status</b><b>Token</b></div><div><span>Button</span><em>Ready</em><code>--radius</code></div><div><span>Input</span><em>Focus</em><code>--ring</code></div></div>
      </div>`
    case 'brutal':
      return `<div class="brutal-board"><h3>SHIP IT LOUD</h3><p>Hard borders. Offset shadows. No apology.</p><button>SMASH CTA</button></div>`
    case 'glass':
      return `<div class="glass-scene"><div class="glass-card"><h3>Frosted Panel</h3><p>Blurred translucent layers, luminous borders, and atmospheric depth.</p><button>Enter</button></div></div>`
    case 'clay':
      return `<div class="clay-scene"><div class="clay-blob"></div><div class="clay-panel"><h3>Soft tactile UI</h3><p>Puffy surfaces, inner highlights, pastel depth.</p></div></div>`
    case 'retro':
      return `<div class="retro-scene"><h3>NEON GRID</h3><p>1980S SYNTHWAVE TERMINAL</p><button>START</button></div>`
    case 'cosmic':
      return `<div class="cosmic-scene"><div class="planet"></div><h3>Orbital interface</h3><p>Deep space, violet glow, and calm celestial hierarchy.</p></div>`
    case 'cyberpunk':
      return `<div class="cyber-scene"><h3>NEON OPS</h3><p>System online / Signal clean / Grid active</p><button>Execute</button></div>`
    case 'luxury':
      return `<div class="luxury-scene"><p>Maison Interface</p><h3>Quiet Premium</h3><span>Gold restraint / Deep surfaces / Serif craft</span></div>`
    case 'organic':
      return `<div class="organic-scene"><h3>Human warmth</h3><p>Organic rhythm, terracotta action, soft tactile sections.</p><button>Explore</button></div>`
    case 'code-lab':
      return `<div class="code-panel"><pre><span>const</span> model = await deepseek.chat({
  system: "reason carefully",
  tokens: 8192
})</pre><div class="bench"><b>92.4</b><span>reasoning score</span></div></div>`
    case 'catalog':
      return `<div class="model-grid">${['text-generation', 'image-to-text', 'dataset', 'space'].map((x, i) => `<div class="model-card"><b>${x}</b><p>${1200 + i * 418} downloads</p><span>Like ${89 + i * 12}</span></div>`).join('')}</div>`
    case 'editorial':
      return `<div class="paper-grid"><article><p>Research</p><h3>Constitutional systems and careful deployment</h3><span>Policy / Safety / Evaluation</span></article><article><p>Product</p><h3>Claude for teams and knowledge work</h3><span>Workspace / Docs / Code</span></article></div>`
    case 'ai-minimal':
    default:
      return `<div class="research-grid"><div><h3>Research preview</h3><p>Minimal surfaces, large type, restrained accent, and exact system tokens.</p><button style="color:${accentOn}">Start building</button></div><div class="quiet-card">Model response<br><span>Tokens, evaluations, product controls.</span></div></div>`
  }
}

function generate(id, label, kind) {
  const docPath = join(DOCS, `${id}.md`)
  if (!existsSync(docPath)) throw new Error(`Missing design system doc: ${docPath}`)
  const md = readFileSync(docPath, 'utf8')
  const theme = getTheme(id)
  const colors = extractColors(md, theme)
  const typeRows = extractTypeRows(md, theme)
  const summary = pickSummary(md)
  const bullets = [
    ...bulletsFrom(firstSection(md, 'Visual Theme & Atmosphere'), 4),
    ...bulletsFrom(firstSection(md, "Do's and Don'ts"), 4),
  ].slice(0, 6)
  const typeSamples = [
    `${label} design system`,
    'Interface direction',
    'Component hierarchy',
    'Primary surface title',
    'Body copy sits here with readable rhythm.',
    'Caption / Metadata / State',
    'Action label',
    'Utility text',
    'Microcopy',
  ]

  const dark = luminance(theme.bg) < 0.22 || theme.glass
  const accentOn = onColor(theme.accent)
  const heroSize = theme.heroSize || (theme.heroWeight === 400 ? '74px' : '78px')
  const glow = dark ? `0 24px 70px ${rgba(theme.accent, 0.22)}` : `0 18px 48px ${rgba(theme.accent, 0.14)}`
  const glassExtra = theme.glass ? 'backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);' : ''
  const clayShadow = theme.clay ? `box-shadow: 12px 16px 30px ${rgba('#6b5b95', 0.2)}, inset 8px 8px 18px rgba(255,255,255,0.7);` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design System Inspiration of ${escapeHtml(label)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--canvas:${theme.bg};--surface:${theme.surface};--ink:${theme.text};--body:${theme.body};--muted:${theme.muted};--hairline:${theme.border};--accent:${theme.accent};--accent-2:${theme.accent2 || theme.link || theme.success || theme.accent};--success:${theme.success || '#22c55e'};--danger:${theme.danger || '#ef4444'};--warning:${theme.warning || '#f59e0b'};--display:${theme.fontD};--text:${theme.fontB};--mono:${theme.mono};--radius:${theme.radius};--button-radius:${theme.buttonRadius};--accent-on:${accentOn};--shadow:${glow};}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;-webkit-font-smoothing:antialiased;color-scheme:${dark ? 'dark' : 'light'}}
body{background:var(--canvas);color:var(--ink);font-family:var(--text);line-height:1.5;overflow-x:hidden}
button,input{font:inherit}
.nav{position:sticky;top:0;z-index:20;height:68px;padding:0 48px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:${dark ? rgba(theme.bg, 0.88) : rgba(theme.bg, 0.92)};border-bottom:1px solid var(--hairline);${glassExtra}backdrop-filter:blur(14px)}
.brand{font-family:var(--display);font-weight:${theme.heroWeight || 700};font-size:17px;letter-spacing:-.02em}
.nav-links{list-style:none;display:flex;gap:28px;align-items:center;justify-self:center}
.nav-links a{color:var(--muted);text-decoration:none;font-size:14px;font-weight:600}
.nav-cta{justify-self:end;background:var(--ink);color:${onColor(theme.text)};border:1px solid var(--hairline);border-radius:var(--button-radius);padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}
.hero{max-width:1440px;margin:0 auto;padding:86px 48px 72px;display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.86fr);gap:56px;align-items:center;border-bottom:1px solid var(--hairline)}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:18px}
h1{font-family:var(--display);font-size:clamp(48px,7vw,${heroSize});font-weight:${theme.heroWeight || 800};line-height:.96;letter-spacing:-.045em;max-width:880px;margin-bottom:24px}
.hero p{max-width:760px;color:var(--body);font-size:18px;line-height:1.65;margin-bottom:28px}
.hero-actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.btn-primary,.btn-secondary{min-height:44px;padding:11px 22px;border-radius:var(--button-radius);font-size:15px;font-weight:650;cursor:pointer}
.btn-primary{background:var(--accent);color:var(--accent-on);border:1px solid transparent}
.btn-secondary{background:transparent;color:var(--ink);border:1px solid var(--hairline)}
.hero-panel{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);${glassExtra}${clayShadow}}
section{max-width:1440px;margin:0 auto;padding:64px 48px;border-bottom:1px solid var(--hairline)}
.section-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800;margin-bottom:12px}
.section-heading{font-family:var(--display);font-size:32px;font-weight:${theme.heroWeight || 750};line-height:1.12;letter-spacing:-.025em;margin-bottom:14px}
.section-intro{font-size:16px;color:var(--body);max-width:760px;margin-bottom:34px;line-height:1.6}
.palette-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}
.swatch{border:1px solid var(--hairline);background:var(--surface);border-radius:var(--radius);overflow:hidden;${glassExtra}}
.swatch-color{height:102px}
.swatch-meta{padding:14px 15px}
.swatch-name{font-size:13px;font-weight:750;color:var(--ink);margin-bottom:4px}.swatch-hex{font:12px var(--mono);color:var(--muted);margin-bottom:6px}.swatch-role{font-size:12px;color:var(--body);line-height:1.45}
.type-table{border:1px solid var(--hairline);border-radius:var(--radius);overflow:hidden;background:var(--surface)}
.type-row{display:grid;grid-template-columns:280px 1fr;gap:28px;align-items:baseline;padding:18px 20px;border-top:1px solid var(--hairline)}
.type-row:first-child{border-top:none}.type-meta{font:12px var(--mono);color:var(--muted)}.type-meta strong{display:block;font-family:var(--text);font-size:13px;color:var(--ink);margin-bottom:4px}.type-sample{font-family:var(--display);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.button-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}.button-cell{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius);padding:22px;${glassExtra}${clayShadow}}.button-label{font-size:12px;color:var(--muted);font-weight:750;margin-bottom:14px}.button-meta{font-size:12px;color:var(--body);margin-top:12px}.demo-ghost,.demo-danger{min-height:42px;border-radius:var(--button-radius);padding:10px 18px;font-weight:650}.demo-ghost{background:transparent;color:var(--ink);border:1px solid var(--hairline)}.demo-danger{background:var(--danger);color:#fff;border:0}
.component-stage{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius);padding:24px;${glassExtra}${clayShadow}}
.rules-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.rule-card{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius);padding:18px;color:var(--body);font-size:14px}.rule-card b{display:block;color:var(--accent);font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
.spec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:var(--hairline);border:1px solid var(--hairline);border-radius:var(--radius);overflow:hidden}.spec-cell{background:var(--surface);padding:22px}.spec-value{font-family:var(--display);font-size:28px;font-weight:800;color:var(--ink)}.spec-label{font-size:12px;color:var(--muted);font-weight:650;margin-top:2px}
.footer{padding:44px 48px;background:var(--surface);border-top:1px solid var(--hairline)}.footer-inner{max-width:1440px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:32px}.footer h6{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}.footer p,.footer span{color:var(--body);font-size:14px}
.app-shell{display:grid;grid-template-columns:230px 1fr;min-height:360px;border:1px solid var(--hairline);border-radius:var(--radius);overflow:hidden;background:var(--canvas)}.app-shell aside{background:var(--surface);border-right:1px solid var(--hairline);padding:18px;display:flex;flex-direction:column;gap:12px;color:var(--muted);font-size:14px}.app-shell aside strong{color:var(--ink);margin-bottom:8px}.app-shell main{padding:18px;background:var(--canvas)}
.repo-head,.incident-top,.chat-title{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--hairline);padding-bottom:14px;margin-bottom:12px}.repo-head button,.incident-top button,.buy-box button,.record-card button,.article-card button,.organic-scene button,.component-board button,.poster-hero button,.auto-specs button,.brutal-board button,.cyber-scene button,.research-grid button{background:var(--accent);color:var(--accent-on);border:0;border-radius:var(--button-radius);padding:9px 14px;font-weight:700}
.issue-row,.message,.timeline{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--hairline);border-radius:var(--button-radius);margin:10px 0;background:var(--surface)}.issue-row p,.message p,.timeline em{color:var(--muted);font-size:12px;font-style:normal}.status,.pulse{width:12px;height:12px;border-radius:999px;background:var(--success);margin-top:4px}.status.danger{background:var(--danger)}.diff,.code-panel pre{font-family:var(--mono);font-size:13px;background:${dark ? '#010409' : '#f6f8fa'};color:var(--body);border:1px solid var(--hairline);border-radius:var(--button-radius);padding:14px;overflow:auto}.code-panel span{color:var(--accent)}
.poster-stage{min-height:390px;background:linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.2)),var(--surface);border-radius:var(--radius);padding:28px;display:flex;flex-direction:column;justify-content:space-between}.poster-hero h3{font-size:48px;line-height:1;font-family:var(--display);margin:8px 0}.poster-hero p{max-width:330px;color:var(--body)}.poster-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.poster{height:112px;border-radius:4px;background:linear-gradient(135deg,var(--accent),var(--surface));display:flex;align-items:end;padding:10px;font-weight:900;font-size:24px;color:#fff}
.commerce-grid,.crm-grid,.research-grid{display:grid;grid-template-columns:1fr 320px;gap:20px}.product-image,.quiet-card{min-height:260px;background:linear-gradient(135deg,var(--accent),var(--accent-2));border-radius:var(--radius);display:flex;align-items:center;justify-content:center;color:var(--accent-on);font-weight:900}.thumbs{display:flex;gap:8px;margin-top:12px}.thumbs i{width:56px;height:56px;background:var(--surface);border:1px solid var(--hairline);border-radius:var(--button-radius)}.buy-box,.record-card,.pipeline,.article-card{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius);padding:20px}.price{font-size:30px;font-weight:800;color:var(--ink);margin:14px 0}.rating{color:var(--accent)}
.ops-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.ops-card{background:var(--canvas);border:1px solid var(--hairline);border-radius:var(--radius);padding:18px}.ops-card.wide{grid-column:span 3}.ops-card b{font-size:32px}.ops-card span{display:block;color:var(--muted)}.chart{height:170px;display:flex;align-items:end;gap:9px}.chart i{flex:1;border-radius:6px 6px 0 0;opacity:.88}
.kanban{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.lane{background:var(--canvas);border:1px solid var(--hairline);border-radius:var(--radius);padding:14px}.lane h4{margin-bottom:12px}.ticket{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--button-radius);padding:12px;margin:10px 0}
.auto-stage{min-height:350px;background:linear-gradient(135deg,var(--surface),var(--canvas));border-radius:var(--radius);padding:26px;display:grid;grid-template-columns:1fr 260px;align-items:end;gap:20px}.car-silhouette{height:150px;border-bottom:34px solid var(--ink);border-radius:55% 45% 16px 16px;box-shadow:0 16px 0 var(--accent)}.auto-specs{background:var(--canvas);border:1px solid var(--hairline);padding:18px;border-radius:var(--radius);display:flex;flex-direction:column;gap:10px}
.browser-frame,.creative-board,.component-board,.video-card,.files-grid,.masonry,.paper-grid,.model-grid{border:1px solid var(--hairline);border-radius:var(--radius);background:var(--canvas);padding:16px}.browser-frame{display:grid;grid-template-columns:180px 1fr;gap:16px}.browser-sidebar{border-right:1px solid var(--hairline);display:flex;flex-direction:column;gap:10px;color:var(--muted)}.url-pill{border:1px solid var(--hairline);border-radius:999px;padding:9px 14px;color:var(--muted);margin-bottom:36px}
.creative-board{display:grid;grid-template-columns:1fr 150px;gap:14px}.toolbar{grid-column:1/-1;color:var(--muted);border-bottom:1px solid var(--hairline);padding-bottom:12px}.canvas-art{height:250px;border-radius:var(--radius);background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;color:#fff;font-size:34px;font-weight:900}.asset-grid{display:grid;gap:10px}.asset-grid i,.file{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--button-radius)}
.video-card{height:310px;position:relative;background:linear-gradient(135deg,var(--accent),var(--surface));display:flex;align-items:center;justify-content:center}.play{width:82px;height:82px;border-radius:999px;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:28px}.video-timeline{position:absolute;left:20px;right:20px;bottom:24px;height:8px;background:rgba(255,255,255,.35);border-radius:999px}.video-timeline span{display:block;width:46%;height:100%;background:var(--accent);border-radius:999px}.bubble{position:absolute;top:22px;right:22px;background:var(--surface);border-radius:999px;padding:8px 12px}
.files-grid,.model-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.file{padding:16px;min-height:130px}.file i{font-size:32px;color:var(--accent);font-style:normal}.file b,.file span{display:block}.file span{color:var(--muted);font-size:12px}
.masonry{columns:5 150px;column-gap:14px}.note{break-inside:avoid;background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius);margin-bottom:14px;padding:14px;display:flex;flex-direction:column;justify-content:end;background:linear-gradient(135deg,var(--surface),${rgba(theme.accent, 0.16)})}.note span{color:var(--accent);font-size:12px}
.article-card{text-align:center;max-width:760px;margin:auto;padding:50px}.article-card h3{font:400 48px/1.05 var(--display);letter-spacing:-.03em;margin-bottom:16px}.kicker{color:var(--accent);text-transform:uppercase;letter-spacing:.12em;font-size:12px}
.mag-layout,.minimal-layout,.brutal-board,.glass-scene,.clay-scene,.retro-scene,.cosmic-scene,.cyber-scene,.luxury-scene,.organic-scene{min-height:340px;border:1px solid var(--hairline);border-radius:var(--radius);background:var(--surface);padding:28px;position:relative;overflow:hidden}
.mag-layout h3{font:900 66px/.86 var(--display);max-width:620px}.pullquote{position:absolute;right:28px;bottom:28px;font:italic 30px var(--display);color:var(--accent)}.minimal-layout{display:grid;place-items:center;text-align:center}.minimal-layout span{font-size:64px;color:var(--accent)}.minimal-layout h3{font:400 44px var(--display)}
.brutal-board{border-width:4px;box-shadow:10px 10px 0 var(--ink);background:var(--accent)}.brutal-board h3{font:900 64px/.9 var(--display);color:var(--ink)}
.glass-scene{background:radial-gradient(circle at 20% 20%,${rgba(theme.accent, .5)},transparent 28%),radial-gradient(circle at 80% 40%,${rgba(theme.accent2 || theme.accent, .35)},transparent 28%),var(--canvas);display:grid;place-items:center}.glass-card{max-width:420px;padding:28px;border:1px solid var(--hairline);background:var(--surface);border-radius:var(--radius);backdrop-filter:blur(22px)}
.clay-scene{display:grid;grid-template-columns:1fr 1fr;align-items:center}.clay-blob{width:220px;height:220px;border-radius:42% 58% 48% 52%;background:var(--accent);box-shadow:18px 24px 40px ${rgba(theme.accent, .25)},inset 12px 16px 22px rgba(255,255,255,.35)}.clay-panel{background:var(--surface);padding:24px;border-radius:28px;${clayShadow}}
.retro-scene{background:linear-gradient(transparent 60%,${rgba(theme.accent, .3)}),var(--canvas);display:grid;place-items:center;text-align:center;text-shadow:0 0 12px currentColor}.retro-scene h3{font:900 58px var(--mono)}
.cosmic-scene{background:radial-gradient(circle at 40% 35%,${rgba(theme.accent, .55)},transparent 18%),var(--canvas);display:grid;place-items:center;text-align:center}.planet{width:120px;height:120px;border-radius:999px;background:linear-gradient(135deg,var(--accent),var(--surface));box-shadow:0 0 80px ${rgba(theme.accent, .55)}}
.cyber-scene{border-color:var(--accent);box-shadow:0 0 30px ${rgba(theme.accent, .4)};background:linear-gradient(135deg,var(--canvas),var(--surface));color:var(--accent);font-family:var(--mono)}.cyber-scene h3{font-size:54px}
.luxury-scene{text-align:center;display:grid;place-items:center;background:var(--surface)}.luxury-scene h3{font:400 56px var(--display);color:var(--accent)}.organic-scene{background:radial-gradient(circle at 80% 20%,${rgba(theme.accent, .18)},transparent 30%),var(--surface)}
.code-panel{display:grid;grid-template-columns:1fr 180px;gap:16px}.bench{background:var(--canvas);border:1px solid var(--hairline);border-radius:var(--radius);padding:18px;display:grid;place-items:center;text-align:center}.bench b{font-size:44px;color:var(--accent)}
.model-card{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radius);padding:16px}.model-card span{color:var(--accent);font-size:12px}
@media (max-width:900px){.nav{padding:0 20px;grid-template-columns:1fr auto}.nav-links{display:none}.hero,section{padding-left:20px;padding-right:20px}.hero{grid-template-columns:1fr;padding-top:52px}.type-row{grid-template-columns:1fr;gap:8px}.commerce-grid,.crm-grid,.research-grid,.auto-stage,.code-panel{grid-template-columns:1fr}.ops-grid,.kanban,.poster-row,.files-grid,.model-grid{grid-template-columns:1fr}.ops-card.wide{grid-column:span 1}.app-shell,.browser-frame,.creative-board{grid-template-columns:1fr}.app-shell aside{border-right:0;border-bottom:1px solid var(--hairline)}.footer-inner{grid-template-columns:1fr}}
</style>
</head>
<body>
<nav class="nav"><div class="brand">${escapeHtml(label)}</div><ul class="nav-links"><li><a href="#colors">Colors</a></li><li><a href="#type">Type</a></li><li><a href="#components">Components</a></li><li><a href="#rules">Rules</a></li></ul><button class="nav-cta">Preview</button></nav>
<main>
  <div class="hero">
    <div>
      <div class="eyebrow">Design System Inspiration</div>
      <h1>${escapeHtml(label)}</h1>
      <p>${escapeHtml(summary)}</p>
      <div class="hero-actions"><button class="btn-primary">Primary action</button><button class="btn-secondary">Secondary</button></div>
    </div>
    <div class="hero-panel">${signatureScene(kind, label, theme)}</div>
  </div>
  <section id="colors"><div class="section-label">01 - Color Palette</div><h2 class="section-heading">Documented brand tokens</h2><p class="section-intro">Extracted from the bundled ${escapeHtml(label)} design-system source, with base preview tokens added where the docs describe roles without a swatch.</p><div class="palette-grid">${colors.map(tokenCard).join('')}</div></section>
  <section id="type"><div class="section-label">02 - Typography Scale</div><h2 class="section-heading">Font, scale, weight, tracking</h2><p class="section-intro">The preview uses the documented font intent with practical web fallbacks. Large display rows preserve the stated weight and tracking where available.</p><div class="type-table">${typeRows.map((r, i) => typeRow(r, typeSamples[i] || label)).join('')}</div></section>
  <section id="components"><div class="section-label">03 - Button Variants</div><h2 class="section-heading">Action hierarchy</h2><p class="section-intro">Primary, secondary, muted, and danger controls use the documented accent color, radius, border, and density for this design system.</p><div class="button-grid"><div class="button-cell"><div class="button-label">Primary</div><button class="btn-primary">Continue</button><div class="button-meta">Accent fill / documented button radius</div></div><div class="button-cell"><div class="button-label">Secondary</div><button class="btn-secondary">Learn more</button><div class="button-meta">Transparent or surface with hairline border</div></div><div class="button-cell"><div class="button-label">Default / Ghost</div><button class="demo-ghost">View details</button><div class="button-meta">Low-emphasis utility action</div></div><div class="button-cell"><div class="button-label">Danger / Alert</div><button class="demo-danger">Escalate</button><div class="button-meta">Semantic destructive or incident color</div></div></div></section>
  <section><div class="section-label">04 - Signature Component</div><h2 class="section-heading">A real interface pattern, not a placeholder card</h2><p class="section-intro">Each preview renders the component shape that users associate with the source brand: repo rows, incident timelines, media rails, commerce panels, CRM records, or style-specific surfaces.</p><div class="component-stage">${signatureScene(kind, label, theme)}</div></section>
  <section><div class="section-label">05 - Layout Specs</div><h2 class="section-heading">Spacing, radius, surface depth</h2><p class="section-intro">The key measurements are rendered as inspectable UI so the preview carries implementation cues, not only mood-board colors.</p><div class="spec-grid"><div class="spec-cell"><div class="spec-value">8px</div><div class="spec-label">Base grid</div></div><div class="spec-cell"><div class="spec-value">${escapeHtml(theme.buttonRadius)}</div><div class="spec-label">Button radius</div></div><div class="spec-cell"><div class="spec-value">${escapeHtml(theme.radius)}</div><div class="spec-label">Card radius</div></div><div class="spec-cell"><div class="spec-value">1px</div><div class="spec-label">Hairline border</div></div><div class="spec-cell"><div class="spec-value">64-96</div><div class="spec-label">Section rhythm</div></div><div class="spec-cell"><div class="spec-value">${dark ? 'Dark' : 'Light'}</div><div class="spec-label">Color scheme</div></div></div></section>
  <section id="rules"><div class="section-label">06 - Usage Rules</div><h2 class="section-heading">Do this, avoid drift</h2><p class="section-intro">The following rules are pulled from the design-system document and are kept visible in the preview for implementation review.</p><div class="rules-grid">${(bullets.length ? bullets : ['Use documented colors semantically.', 'Keep component radius and density consistent.', 'Let the signature component shape lead the composition.', 'Avoid decorative colors outside the token roles.']).map((b, i) => `<div class="rule-card"><b>Rule ${i + 1}</b>${escapeHtml(b)}</div>`).join('')}</div></section>
</main>
<footer class="footer"><div class="footer-inner"><div><h6>${escapeHtml(label)}</h6><p>Live preview generated from <code>backend/skills/bundled/design-systems/${id}.md</code>.</p></div><div><h6>Source path</h6><span>frontend/public/design-previews/${id}.html</span></div></div></footer>
</body>
</html>`
}

let count = 0
for (const [id, label, kind] of requested) {
  const html = generate(id, label, kind)
  writeFileSync(join(OUT, `${id}.html`), html, 'utf8')
  console.log(`generated ${id}`)
  count++
}
console.log(`Generated ${count} requested design previews.`)
