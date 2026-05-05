import { writeFileSync } from 'fs'
import { join } from 'path'

const OUT = 'c:/project_github/kodo-agent-export/frontend/public/design-previews'

const presets = [
  { id: 'openai-research', label: 'OpenAI', category: 'AI & LLM', colors: ['#f7f7f2','#ffffff','#111111','#6b6962','#10a37f'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Research-product clarity with quiet neutrals, confident copy, and minimal green signal.' },
  { id: 'anthropic-editorial', label: 'Anthropic', category: 'AI & LLM', colors: ['#f3efe7','#fbfaf7','#191714','#6f6860','#d97757'], displayFont: 'Georgia, serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Warm research editorial with serif scale, measured spacing, and muted clay accent.' },
  { id: 'huggingface-community', label: 'Hugging Face', category: 'AI & LLM', colors: ['#fff8e7','#ffffff','#1f2937','#6b7280','#ffcc4d'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Open AI community UI with model cards, datasets, approachable yellow, and technical metadata.' },
  { id: 'deepseek-tech', label: 'DeepSeek', category: 'AI & LLM', colors: ['#f0f4ff','#ffffff','#0d1526','#4b5a7a','#4f6ef7'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Research-lab AI with deep navy branding, precise blue accent, and benchmark-focused technical clarity.' },
  { id: 'github-utility', label: 'GitHub', category: 'Developer Tools', colors: ['#0d1117','#161b22','#f0f6fc','#8b949e','#2f81f7'], displayFont: 'system-ui, sans-serif', bodyFont: 'system-ui, sans-serif', summary: 'Dense engineering UI with repos, diffs, checks, issues, and exact state treatment.' },
  { id: 'arc-browser', label: 'Arc Browser', category: 'Developer Tools', colors: ['#f0edff','#ffffff','#1a0535','#5e4a8b','#a78bfa'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Opinionated browser with soft purple gradient identity and personality-forward creative UI.' },
  { id: 'fintech-dark', label: 'Fintech Dark', category: 'Fintech', colors: ['#050b12','#0d1a24','#e8f4ff','#6a8fa0','#00b4d8'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Dark premium fintech with deep navy surfaces, teal data signals, and institutional authority.' },
  { id: 'porsche-precision', label: 'Porsche', category: 'Automotive', colors: ['#f2f2f2','#ffffff','#1a1a1a','#666666','#c0392b'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Performance-heritage automotive with precision typography, sport red, and configurator UI.' },
  { id: 'mercedes-luxury', label: 'Mercedes', category: 'Automotive', colors: ['#f5f5f5','#ffffff','#171717','#6b6b6b','#c4a35a'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Ultra-premium automotive refinement with silver-gold accents and cinematic product imagery.' },
  { id: 'canva-playful', label: 'Canva', category: 'Design Tools', colors: ['#f8fbff','#ffffff','#1f2937','#64748b','#00c4cc'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Accessible creative workspace with friendly teal, template grids, and approachable controls.' },
  { id: 'shadcn-system', label: 'shadcn/ui', category: 'Design Tools', colors: ['#fafafa','#ffffff','#09090b','#71717a','#18181b'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Composable component library with neutral tokens, accessible variants, and exact focus states.' },
  { id: 'magazine-bold', label: 'Magazine Bold', category: 'Publishing', colors: ['#f8f1e8','#fffaf2','#111111','#6a5b4f','#d13f22'], displayFont: 'Georgia, serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Large serif headlines, editorial spreads, pull quotes, and decisive red accent.' },
  { id: 'japanese-minimal', label: 'Japanese Minimal', category: 'Publishing', colors: ['#f7f3ea','#fffdf8','#20201d','#706a60','#9b2c1f'], displayFont: 'Georgia, serif', bodyFont: 'system-ui, sans-serif', summary: 'Quiet asymmetry, paper texture, sparse warm accent, and refined negative space.' },
  { id: 'substack-newsletter', label: 'Substack', category: 'Publishing', colors: ['#ffffff','#f9f9f9','#1c1c1c','#6b6b6b','#ff6719'], displayFont: 'Georgia, serif', bodyFont: 'Georgia, serif', summary: 'Independent newsletter with serif-first reading experience and writer-identity design.' },
  { id: 'atlassian-team', label: 'Atlassian', category: 'Enterprise', colors: ['#f7f8f9','#ffffff','#172b4d','#626f86','#0c66e4'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Team software with work items, boards, status colors, and practical hierarchy.' },
  { id: 'material-google', label: 'Google Material', category: 'Enterprise', colors: ['#f8fafd','#ffffff','#1f1f1f','#5f6368','#1a73e8'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Material 3 with clear elevation, dynamic color tokens, and accessible system components.' },
  { id: 'microsoft-fluent', label: 'Microsoft Fluent', category: 'Enterprise', colors: ['#f5f5f5','#ffffff','#1b1a19','#605e5c','#0078d4'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Fluent productivity with panes, ribbons, command bars, and enterprise blue.' },
  { id: 'salesforce-crm', label: 'Salesforce', category: 'Enterprise', colors: ['#f3f3f3','#ffffff','#032d60','#444444','#0176d3'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Lightning Design System with CRM record layouts, activity timelines, and Salesforce Blue.' },
  { id: 'hubspot-marketing', label: 'HubSpot', category: 'Enterprise', colors: ['#fff9f5','#ffffff','#1f2937','#6b7280','#ff7a59'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Inbound marketing with warm orange brand, pipeline visualization, and growth UI.' },
  { id: 'pagerduty-incident', label: 'PagerDuty', category: 'Enterprise', colors: ['#f9f9fb','#ffffff','#151515','#5a5a6a','#06ac38'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Incident management with on-call schedules, alert severity hierarchy, and rapid response UI.' },
  { id: 'datadog-ops', label: 'Datadog', category: 'Developer Tools', colors: ['#0e0e19','#13132a','#e0e0f0','#8888aa','#774aa4'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Observability with dark ops surfaces, metric charts, trace waterfalls, and purple brand.' },
  { id: 'netflix-streaming', label: 'Netflix', category: 'Consumer', colors: ['#141414','#1f1f1f','#ffffff','#808080','#e50914'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Dark cinema with horizontal content rows, gradient overlay heroes, and signature Netflix Red.' },
  { id: 'discord-community', label: 'Discord', category: 'Consumer', colors: ['#313338','#2b2d31','#dbdee1','#949ba4','#5865f2'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Community chat with dark panels, server/channel sidebar nav, and Blurple identity.' },
  { id: 'gaming-esports', label: 'Gaming & Esports', category: 'Consumer', colors: ['#0a0a12','#111120','#e8e8ff','#6666aa','#00ff88'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Competitive gaming with high-contrast dark panels, team-badge UI, and neon-green activity signal.' },
  { id: 'dropbox-work', label: 'Dropbox', category: 'Consumer', colors: ['#f7f5f2','#ffffff','#1e1919','#736c64','#0061ff'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'File workspace with crisp blue actions, folder metaphors, and collaboration status.' },
  { id: 'loom-video', label: 'Loom', category: 'Consumer', colors: ['#f5f4ff','#ffffff','#1a1033','#7b68c8','#6d28d9'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Async video messaging with purple brand and recording/playback workspace UI.' },
  { id: 'mailchimp-friendly', label: 'Mailchimp', category: 'Consumer', colors: ['#ffe01b','#fff8dc','#241c15','#6b5d4d','#007c89'], displayFont: 'Georgia, serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Friendly marketing tooling with yellow identity, playful serif type, and campaign UI.' },
  { id: 'xiaohongshu-social', label: 'Xiaohongshu', category: 'Consumer', colors: ['#ffffff','#f5f5f5','#303034','#8a8a8f','#ff2442'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Lifestyle social commerce with white canvas, red engagement states, and image-led feeds.' },
  { id: 'amazon-commerce', label: 'Amazon', category: 'Consumer', colors: ['#ffffff','#f5f5f5','#111111','#555555','#ff9900'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Dense e-commerce with orange accent, reviews, variations, and conversion-optimized layout.' },
  { id: 'neo-brutal', label: 'Neo Brutal', category: 'Styles', colors: ['#fffdf2','#ffffff','#111111','#333333','#ff4d00'], displayFont: 'Arial Black, Impact, system-ui, sans-serif', bodyFont: 'ui-monospace, monospace', summary: 'Hard borders, loud type, minimal radius, and intentionally assertive composition.' },
  { id: 'neobrutalism', label: 'Neobrutalism', category: 'Styles', colors: ['#ffe135','#ffffff','#000000','#000000','#ff4d00'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Yellow-dominant palette, thick black borders, offset box-shadows, and playful assertiveness.' },
  { id: 'glassmorphism', label: 'Glassmorphism', category: 'Styles', colors: ['#1a1a2e','#16213e','#e0e0ff','#9090c0','#7b68ee'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Frosted glass surfaces with backdrop-blur, translucent layers, and luminous borders.' },
  { id: 'claymorphism', label: 'Claymorphism', category: 'Styles', colors: ['#f0e6ff','#e8f4ff','#2d1b69','#6b5b95','#ff6b9d'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Puffy 3D clay shapes with pastel fills, inner highlights, and tactile depth.' },
  { id: 'retro-80s', label: 'Retro 80s', category: 'Styles', colors: ['#0d0221','#120435','#ff00ff','#00ffff','#ffff00'], displayFont: 'monospace', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Synthwave neon on dark purple with perspective grid and chromatic digital nostalgia.' },
  { id: 'cosmic-space', label: 'Cosmic', category: 'Styles', colors: ['#03001c','#080032','#e8e8ff','#9090dd','#7c3aed'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Deep space with near-black cosmic background, star field, and violet nebula accent.' },
  { id: 'luxury-premium', label: 'Luxury Premium', category: 'Styles', colors: ['#0b0a08','#17130f','#f7efe4','#b7a58d','#c8a45d'], displayFont: 'Georgia, serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Dark premium surfaces, refined serif type, gold restraint, and high-end spacing.' },
  { id: 'cyberpunk-neon', label: 'Cyberpunk Neon', category: 'Styles', colors: ['#070812','#111827','#e5faff','#7dd3fc','#00f5d4'], displayFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Futuristic panels, neon accents, kinetic data, and dark sci-fi atmosphere.' },
  { id: 'warmth-organic', label: 'Warmth & Organic', category: 'Styles', colors: ['#fdf6ee','#fff9f5','#2c1810','#8a6550','#d4763b'], displayFont: 'Georgia, serif', bodyFont: 'Inter, system-ui, sans-serif', summary: 'Parchment surfaces, terracotta accent, serif headlines, and human-centered spacing.' },
]

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return {r,g,b}
}
function luminance(hex) {
  const {r,g,b} = hexToRgb(hex)
  const toLinear = c => { c/=255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4) }
  return 0.2126*toLinear(r)+0.7152*toLinear(g)+0.0722*toLinear(b)
}
function isDark(hex) { return luminance(hex) < 0.18 }
function onAccent(hex) { return luminance(hex)>0.35?'#000000':'#ffffff' }
function alpha(hex, a) {
  const {r,g,b} = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

function generate(p) {
  const [bg, surface, text, muted, accent] = p.colors
  const dark = isDark(bg)
  const border = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const borderStrong = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'
  const accentOn = onAccent(accent)
  const shadow = dark ? '0 2px 16px rgba(0,0,0,0.5)' : '0 2px 16px rgba(0,0,0,0.07)'
  const accentAlpha = alpha(accent, 0.15)

  // Color names for palette display
  const colorLabels = [
    { hex: bg, name: 'Canvas / Background', desc: 'Page base surface' },
    { hex: surface, name: 'Surface / Card', desc: 'Elevated containers' },
    { hex: text, name: 'Text / Ink', desc: 'Primary foreground' },
    { hex: muted, name: 'Muted / Secondary', desc: 'Subdued text & icons' },
    { hex: accent, name: 'Accent / Brand', desc: 'Primary action color' },
  ]

  const typeScale = [
    { name: 'Display XL', size: '64px', weight: 800 },
    { name: 'Display LG', size: '48px', weight: 800 },
    { name: 'Display MD', size: '36px', weight: 700 },
    { name: 'Display SM', size: '28px', weight: 700 },
    { name: 'Title LG', size: '22px', weight: 600 },
    { name: 'Title MD', size: '18px', weight: 600 },
    { name: 'Body MD', size: '16px', weight: 400 },
    { name: 'Body SM', size: '14px', weight: 400 },
    { name: 'Caption', size: '12px', weight: 400 },
  ]
  const typeSamples = ['THE ULTIMATE MACHINE', 'Design that moves', 'Build something great', 'Precision by design', 'Title heading text', 'Subtitle line here', 'Body paragraph text reads at this size.', 'Small supporting text for metadata.', 'Caption · Label · Tag']

  const spacingScale = [4,8,12,16,24,32,48,64,96]
  const radiusScale = [
    { label: '0', val: '0px' },
    { label: 'xs', val: '2px' },
    { label: 'sm', val: '4px' },
    { label: 'md', val: '8px' },
    { label: 'lg', val: '12px' },
    { label: 'xl', val: '16px' },
    { label: 'full', val: '9999px' },
  ]

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.label} — Design System</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:${bg};--surface:${surface};--text:${text};--muted:${muted};--accent:${accent};
  --font-d:${p.displayFont};--font-b:${p.bodyFont};
  --border:${border};--border-strong:${borderStrong};
  --shadow:${shadow};--accent-alpha:${accentAlpha};
}
html{font-size:16px;-webkit-font-smoothing:antialiased;color-scheme:${dark?'dark':'light'}}
body{background:var(--bg);color:var(--text);font-family:var(--font-b);min-height:100vh;overflow-x:hidden}
a{color:inherit;text-decoration:none}

/* NAV */
nav{display:flex;align-items:center;gap:32px;padding:0 48px;height:64px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:50}
.nav-brand{font-family:var(--font-d);font-weight:800;font-size:16px;letter-spacing:-0.02em}
.nav-links{display:flex;gap:24px;list-style:none}
.nav-links a{font-size:14px;font-weight:500;color:var(--muted)}
.nav-links a:hover{color:var(--text)}
.nav-right{margin-left:auto;display:flex;gap:10px;align-items:center}
.btn-ghost{background:none;border:1px solid var(--border-strong);color:var(--text);font-size:13px;font-weight:500;padding:7px 16px;border-radius:8px;cursor:pointer;font-family:var(--font-b)}
.btn-accent{background:${accent};border:none;color:${accentOn};font-size:13px;font-weight:700;padding:8px 18px;border-radius:8px;cursor:pointer;font-family:var(--font-b)}

/* HEADER BAND */
.header-band{padding:12px 48px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)}

/* SECTION WRAPPER */
.section{padding:56px 48px;border-bottom:1px solid var(--border)}
.section-label{font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.section-title{font-family:var(--font-d);font-size:28px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;margin-bottom:8px}
.section-desc{font-size:14px;color:var(--muted);line-height:1.6;max-width:600px;margin-bottom:32px}

/* COLOR PALETTE */
.color-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.color-swatch-wrap{border:1px solid var(--border);border-radius:10px;overflow:hidden}
.color-swatch{height:80px}
.color-meta{padding:10px 12px;background:var(--surface)}
.color-name{font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:3px}
.color-hex{font-size:12px;font-family:monospace;color:var(--muted);margin-bottom:3px}
.color-desc{font-size:11px;color:var(--muted)}

/* M-STRIPE (accent stripe) */
.accent-stripe{height:4px;background:${accent};margin:0 0 0 0}

/* TYPOGRAPHY */
.type-table{width:100%;border:1px solid var(--border);border-radius:10px;overflow:hidden}
.type-row{display:grid;grid-template-columns:140px 1fr;align-items:center;border-top:1px solid var(--border);padding:12px 16px;gap:24px}
.type-row:first-child{border-top:none}
.type-meta{font-size:11px;color:var(--muted);font-family:monospace}
.type-meta strong{display:block;font-size:12px;color:var(--text);font-weight:600;margin-bottom:2px}

/* BUTTONS */
.btn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.btn-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;box-shadow:var(--shadow)}
.btn-card-label{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${accent};margin-bottom:12px}
.btn-card-desc{font-size:11px;color:var(--muted);margin-top:8px}
.demo-btn-primary{display:inline-flex;align-items:center;gap:8px;background:${accent};color:${accentOn};border:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:700;font-family:var(--font-b);cursor:pointer;letter-spacing:0.02em}
.demo-btn-outline{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--text);border:1px solid var(--border-strong);padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;font-family:var(--font-b);cursor:pointer}
.demo-btn-ghost{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--muted);border:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:500;font-family:var(--font-b);cursor:pointer}
.demo-btn-danger{display:inline-flex;align-items:center;gap:8px;background:#dc2626;color:#fff;border:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:700;font-family:var(--font-b);cursor:pointer}

/* CARDS */
.card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.design-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;box-shadow:var(--shadow)}
.card-img{height:120px;background:linear-gradient(135deg,${accent}33,${muted}22)}
.card-body{padding:16px}
.card-tag{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${accent};margin-bottom:8px}
.card-title{font-family:var(--font-d);font-size:16px;font-weight:700;margin-bottom:6px;letter-spacing:-0.01em}
.card-desc{font-size:13px;color:var(--muted);line-height:1.5}

/* FORM */
.form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px}
.form-field label{display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--muted)}
.form-input{width:100%;background:var(--surface);border:1px solid var(--border-strong);color:var(--text);font-size:14px;font-family:var(--font-b);padding:10px 12px;border-radius:8px;outline:none}
.form-input:focus{border-color:${accent}}
.form-input.focused{border-color:${accent};box-shadow:0 0 0 3px ${alpha(accent,0.15)}}
textarea.form-input{resize:vertical;min-height:80px}

/* SPEC CELLS */
.spec-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:10px;overflow:hidden}
.spec-cell{background:var(--bg);padding:20px;text-align:center}
.spec-value{font-family:var(--font-d);font-size:28px;font-weight:800;letter-spacing:-0.03em;margin-bottom:4px}
.spec-label{font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted)}

/* SPACING */
.spacing-row{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap}
.spacing-item{display:flex;flex-direction:column;align-items:center;gap:6px}
.spacing-bar{width:24px;background:${accent};border-radius:3px}
.spacing-val{font-size:10px;font-family:monospace;color:var(--muted)}

/* RADIUS */
.radius-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.radius-box{display:flex;flex-direction:column;align-items:center;gap:8px}
.radius-demo{width:56px;height:56px;background:var(--accent-alpha);border:2px solid ${accent}}
.radius-label{font-size:11px;font-family:monospace;color:var(--muted)}

/* ELEVATION */
.elev-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.elev-card{background:var(--surface);border-radius:10px;padding:20px;border:1px solid var(--border)}
.elev-label{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${accent};margin-bottom:4px}
.elev-sub{font-size:11px;color:var(--muted);line-height:1.5}

/* CTA BAND */
.cta-band{padding:64px 48px;text-align:center;background:linear-gradient(135deg,${accent}22,${muted}11)}
.cta-title{font-family:var(--font-d);font-size:36px;font-weight:800;letter-spacing:-0.02em;margin-bottom:16px}
.cta-sub{font-size:16px;color:var(--muted);margin-bottom:32px}

/* RESPONSIVE TABLE */
.resp-table{width:100%;border:1px solid var(--border);border-radius:10px;overflow:hidden;border-collapse:collapse}
.resp-table th{background:var(--surface);padding:12px 16px;text-align:left;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)}
.resp-table td{padding:12px 16px;font-size:13px;border-bottom:1px solid var(--border)}
.resp-table tr:last-child td{border-bottom:none}
.resp-table td:first-child{font-weight:600}

/* FOOTER */
footer{padding:32px 48px;border-top:1px solid var(--border)}
.footer-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:32px;margin-bottom:24px}
.footer-col h6{font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.footer-col span{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
.footer-credit{font-size:12px;color:var(--muted);border-top:1px solid var(--border);padding-top:20px}

.badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.04em}
.badge-accent{background:${accentAlpha};color:${accent}}
.badge-muted{background:${alpha(text,0.08)};color:var(--muted)}
</style>
</head>
<body>

<div class="accent-stripe"></div>

<nav>
  <span class="nav-brand">${p.label.toUpperCase()}</span>
  <ul class="nav-links">
    <li><a href="#">Overview</a></li>
    <li><a href="#">Tokens</a></li>
    <li><a href="#">Components</a></li>
    <li><a href="#">Guidelines</a></li>
  </ul>
  <div class="nav-right">
    <button class="btn-ghost">Docs</button>
    <button class="btn-accent">Get Started</button>
  </div>
</nav>

<div class="header-band">Design System Inspiration · ${p.category} · Kodo</div>

<!-- HERO -->
<div class="section">
  <div class="section-label">Design System Overview</div>
  <div class="section-title">${p.label.toUpperCase()}</div>
  <div class="section-desc">${p.summary}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button class="demo-btn-primary">Get Started →</button>
    <button class="demo-btn-outline">View Docs</button>
    <span class="badge badge-accent">${p.category}</span>
    <span class="badge badge-muted">Design System</span>
  </div>
</div>

<!-- 01 COLOR PALETTE -->
<div class="section">
  <div class="section-label">01 — Color Palette</div>
  <div class="section-title">Core Token Colors</div>
  <div class="section-desc">Five foundational tokens drive the entire visual identity. Each token has a semantic role — never use colors outside these roles.</div>
  <div class="color-grid">
    ${colorLabels.map(c=>`
    <div class="color-swatch-wrap">
      <div class="color-swatch" style="background:${c.hex}"></div>
      <div class="color-meta">
        <div class="color-name">${c.name}</div>
        <div class="color-hex">${c.hex}</div>
        <div class="color-desc">${c.desc}</div>
      </div>
    </div>`).join('')}
  </div>
</div>

<!-- 02 TYPOGRAPHY -->
<div class="section">
  <div class="section-label">02 — Typography Scale</div>
  <div class="section-title">Type Hierarchy</div>
  <div class="section-desc">Display: <strong>${p.displayFont.split(',')[0]}</strong> · Body: <strong>${p.bodyFont.split(',')[0]}</strong>. Weight contrast between display (800) and body (400) creates editorial signature.</div>
  <div class="type-table">
    ${typeScale.map((t,i)=>`
    <div class="type-row" style="${i===0?'':''}">
      <div class="type-meta">
        <strong>${t.name}</strong>
        ${t.size} / ${t.weight} / −0.02em
      </div>
      <div style="font-family:${p.displayFont};font-size:${t.size};font-weight:${t.weight};letter-spacing:-0.02em;line-height:1.1;color:var(--text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${typeSamples[i]}</div>
    </div>`).join('')}
  </div>
</div>

<!-- 03 BUTTONS -->
<div class="section">
  <div class="section-label">03 — Button Variants</div>
  <div class="section-title">Interactive Controls</div>
  <div class="section-desc">All buttons share 8px radius and 700 weight for primary actions. Accent color drives primary CTAs — never dilute with decorative fills.</div>
  <div class="btn-grid">
    <div class="btn-card">
      <div class="btn-card-label">Primary</div>
      <button class="demo-btn-primary">Get Started →</button>
      <div class="btn-card-desc">Accent fill · ${accentOn} text · main CTA</div>
    </div>
    <div class="btn-card">
      <div class="btn-card-label">Outline</div>
      <button class="demo-btn-outline">Learn More</button>
      <div class="btn-card-desc">Transparent bg · border-strong · secondary</div>
    </div>
    <div class="btn-card">
      <div class="btn-card-label">Ghost</div>
      <button class="demo-btn-ghost">View Docs</button>
      <div class="btn-card-desc">No border · muted color · tertiary nav</div>
    </div>
    <div class="btn-card">
      <div class="btn-card-label">Destructive</div>
      <button class="demo-btn-danger">Delete</button>
      <div class="btn-card-desc">Red fill · white text · irreversible actions</div>
    </div>
  </div>
</div>

<!-- 04 CARDS -->
<div class="section">
  <div class="section-label">04 — Cards & Containers</div>
  <div class="section-title">Content Surfaces</div>
  <div class="section-desc">Cards use surface token on canvas background. 12px radius, hairline border, and subtle shadow creates depth without ornamentation.</div>
  <div class="card-grid">
    <div class="design-card">
      <div class="card-img"></div>
      <div class="card-body">
        <div class="card-tag">${p.category.split(' ')[0].toUpperCase()} · FEATURE</div>
        <div class="card-title">Design with Clarity</div>
        <div class="card-desc">A system built on restraint. Every token earns its place through function, not decoration.</div>
      </div>
    </div>
    <div class="design-card">
      <div class="card-img" style="background:linear-gradient(135deg,${muted}22,${accent}11)"></div>
      <div class="card-body">
        <div class="card-tag">${p.category.split(' ')[0].toUpperCase()} · GUIDE</div>
        <div class="card-title">Token Architecture</div>
        <div class="card-desc">Five core tokens map to semantic roles. Primitive → semantic → component. No raw hex values in components.</div>
      </div>
    </div>
    <div class="design-card">
      <div class="card-img" style="background:linear-gradient(135deg,${bg},${accent}22)"></div>
      <div class="card-body">
        <div class="card-tag">${p.category.split(' ')[0].toUpperCase()} · MOTION</div>
        <div class="card-title">Interaction Patterns</div>
        <div class="card-desc">150ms ease-out for micro-interactions. Hover states use accent-alpha overlay. Focus rings use 3px accent glow.</div>
      </div>
    </div>
  </div>
</div>

<!-- 05 FORM ELEMENTS -->
<div class="section">
  <div class="section-label">05 — Form Elements</div>
  <div class="section-title">Input Components</div>
  <div class="section-desc">Inputs use 8px radius and surface background. Focus state thickens border to accent color with 3px glow ring.</div>
  <div class="form-grid">
    <div class="form-field">
      <label>Email address</label>
      <input class="form-input" type="email" placeholder="you@example.com">
    </div>
    <div class="form-field">
      <label>Email (focused)</label>
      <input class="form-input focused" type="email" value="design@studio.com">
    </div>
    <div class="form-field">
      <label>Organization</label>
      <input class="form-input" type="text" placeholder="Your company">
    </div>
  </div>
  <div class="form-field" style="max-width:480px">
    <label>Message</label>
    <textarea class="form-input" placeholder="Tell us about your project..."></textarea>
  </div>
</div>

<!-- 06 SPEC CELLS -->
<div class="section">
  <div class="section-label">06 — Design Specs</div>
  <div class="section-title">Key Measurements</div>
  <div class="section-desc">Core dimensions used across the system. Sharp corners on data cells — values sit in 4-up grid with hairline dividers.</div>
  <div class="spec-grid">
    <div class="spec-cell"><div class="spec-value">8px</div><div class="spec-label">Base Grid</div></div>
    <div class="spec-cell"><div class="spec-value">8</div><div class="spec-label">Border Radius</div></div>
    <div class="spec-cell"><div class="spec-value">60px</div><div class="spec-label">Nav Height</div></div>
    <div class="spec-cell"><div class="spec-value">1440</div><div class="spec-label">Max Width</div></div>
    <div class="spec-cell"><div class="spec-value">48px</div><div class="spec-label">Section Gap</div></div>
    <div class="spec-cell"><div class="spec-value">150ms</div><div class="spec-label">Transition</div></div>
    <div class="spec-cell"><div class="spec-value">4.5:1</div><div class="spec-label">Min Contrast</div></div>
    <div class="spec-cell"><div class="spec-value">WCAG AA</div><div class="spec-label">Accessibility</div></div>
  </div>
</div>

<!-- 07 SPACING -->
<div class="section">
  <div class="section-label">07 — Spacing Scale</div>
  <div class="section-title">Layout Rhythm</div>
  <div class="section-desc">8px base unit. Section rhythm at 48–96px. Spacing tokens scale by 1.5× increments.</div>
  <div class="spacing-row">
    ${spacingScale.map(s=>`
    <div class="spacing-item">
      <div class="spacing-bar" style="height:${s}px"></div>
      <span class="spacing-val">${s}px</span>
    </div>`).join('')}
  </div>
</div>

<!-- 08 BORDER RADIUS -->
<div class="section">
  <div class="section-label">08 — Border Radius Scale</div>
  <div class="section-title">Shape Language</div>
  <div class="section-desc">Reserve full radius for pill buttons and avatars only. Components use sm–lg range. Sharp corners on data tables.</div>
  <div class="radius-row">
    ${radiusScale.map(r=>`
    <div class="radius-box">
      <div class="radius-demo" style="border-radius:${r.val}"></div>
      <span class="radius-label">${r.val}</span>
    </div>`).join('')}
  </div>
</div>

<!-- 09 ELEVATION -->
<div class="section">
  <div class="section-label">09 — Elevation & Depth</div>
  <div class="section-title">Surface Layers</div>
  <div class="section-desc">${dark ? 'No drop shadows. Depth from background contrast between layers.' : 'Subtle shadows create depth. No heavy elevation — trust surface-card on canvas.'}</div>
  <div class="elev-grid">
    <div class="elev-card" style="box-shadow:none">
      <div class="elev-label">Flat</div>
      <div class="elev-sub">No shadow. Body, top nav, footer, photo bands.</div>
    </div>
    <div class="elev-card" style="box-shadow:0 1px 3px rgba(0,0,0,0.1)">
      <div class="elev-label">Soft</div>
      <div class="elev-sub">1px shadow. Section dividers, card outlines.</div>
    </div>
    <div class="elev-card" style="box-shadow:${dark?'0 4px 16px rgba(0,0,0,0.5)':'0 4px 16px rgba(0,0,0,0.1)'}">
      <div class="elev-label">Card Surface</div>
      <div class="elev-sub">surface-card over canvas — visible elevation.</div>
    </div>
    <div class="elev-card" style="box-shadow:${dark?'0 8px 32px rgba(0,0,0,0.6)':'0 8px 32px rgba(0,0,0,0.15)'}">
      <div class="elev-label">Modal / Float</div>
      <div class="elev-sub">Dialogs, dropdowns, tooltips. Maximum elevation.</div>
    </div>
  </div>
</div>

<!-- CTA BAND -->
<div class="cta-band">
  <div class="cta-title">Use ${p.label} in Your Project</div>
  <div class="cta-sub">Apply this design system to any Kodo project and let AI build matching UI.</div>
  <button class="demo-btn-primary" style="font-size:16px;padding:14px 32px">Apply Design System →</button>
</div>

<!-- 10 RESPONSIVE -->
<div class="section">
  <div class="section-label">10 — Responsive Behavior</div>
  <div class="section-title">Breakpoint System</div>
  <div class="section-desc">Mobile-first. Photography stays full-bleed at every breakpoint. Card grids reduce columns rather than scaling cards down.</div>
  <table class="resp-table">
    <thead><tr><th>Name</th><th>Width</th><th>Key Changes</th></tr></thead>
    <tbody>
      <tr><td>Mobile</td><td>&lt; 768px</td><td>Single column · hamburger nav · stacked cards</td></tr>
      <tr><td>Tablet</td><td>768–1024px</td><td>2-col grids · compact nav · 2-up spec tables</td></tr>
      <tr><td>Desktop</td><td>1024–1440px</td><td>Full nav · 3-col grids · 4-up spec grids</td></tr>
      <tr><td>Wide</td><td>&gt; 1440px</td><td>Max 1440px container · same as desktop</td></tr>
    </tbody>
  </table>
</div>

<footer>
  <div class="footer-grid">
    <div class="footer-col">
      <h6>${p.label}</h6>
      <span>Design System</span>
      <span>Component Library</span>
      <span>Token Reference</span>
    </div>
    <div class="footer-col">
      <h6>Guidelines</h6>
      <span>Color Usage</span>
      <span>Typography Rules</span>
      <span>Spacing System</span>
    </div>
    <div class="footer-col">
      <h6>Resources</h6>
      <span>Figma Kit</span>
      <span>CSS Variables</span>
      <span>Icon Set</span>
    </div>
    <div class="footer-col">
      <h6>Kodo</h6>
      <span>All Design Systems</span>
      <span>Create Project</span>
      <span>Documentation</span>
    </div>
  </div>
  <div class="footer-credit">Design system inspiration powered by Kodo · ${p.category}</div>
</footer>

</body>
</html>`
}

let count = 0
for (const p of presets) {
  const html = generate(p)
  const out = join(OUT, `${p.id}.html`)
  writeFileSync(out, html, 'utf8')
  console.log(`✓ ${p.id} (${(html.length/1024).toFixed(1)}KB)`)
  count++
}
console.log(`\nGenerated ${count} preview files.`)
