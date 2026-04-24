/**
 * ThemeStudio — world-class UI customizer for Kodo.
 *
 * Applies CSS custom properties live to the document root.
 * Saves named themes to localStorage so they persist across sessions.
 * Supports: per-variable color editing, gradient builder, custom CSS injection,
 * per-component group overrides, theme export/import.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Download, Minus, Palette, Plus, RotateCcw, Save, Upload, X } from 'lucide-react'
import { ColorPicker, ColorSwatch } from './ColorPicker'

// ── Variable groups ─────────────────────────────────────────────────────────────

type VarEntry = { name: string; label: string }
type VarGroup = { title: string; icon: string; vars: VarEntry[] }

const VAR_GROUPS: VarGroup[] = [
  {
    title: 'Backgrounds', icon: 'BG',
    vars: [
      { name: '--bg-0', label: 'Surface (darkest)' },
      { name: '--bg-1', label: 'Base' },
      { name: '--bg-2', label: 'Elevated' },
      { name: '--bg-3', label: 'Overlay' },
    ],
  },
  {
    title: 'Text', icon: 'TXT',
    vars: [
      { name: '--text-0', label: 'Primary' },
      { name: '--text-1', label: 'Secondary' },
      { name: '--text-2', label: 'Muted / Labels' },
    ],
  },
  {
    title: 'Accent & Brand', icon: 'ACC',
    vars: [
      { name: '--accent', label: 'Brand accent' },
      { name: '--accent-dim', label: 'Accent dim (overlay)' },
      { name: '--accent-glow', label: 'Accent glow (shadow)' },
    ],
  },
  {
    title: 'Semantic', icon: 'SEM',
    vars: [
      { name: '--green', label: 'Success' },
      { name: '--yellow', label: 'Warning' },
      { name: '--red', label: 'Error / Danger' },
      { name: '--blue', label: 'Info' },
    ],
  },
  {
    title: 'Borders', icon: 'BDR',
    vars: [
      { name: '--border', label: 'Default border' },
      { name: '--border-bright', label: 'Active / bright border' },
    ],
  },
]

// ── Gradient presets ─────────────────────────────────────────────────────────────

type GradientStop = { color: string; position: number }
type GradientDef = { type: 'linear' | 'radial'; angle: number; stops: GradientStop[]; cx: number; cy: number }

const GRADIENT_PRESETS: Array<{ label: string; def: GradientDef; bg: string }> = [
  {
    label: 'Ember Dark',
    bg: '#0a0a0b',
    def: { type: 'radial', angle: 135, cx: 16, cy: 12, stops: [{ color: 'rgba(255,77,33,0.12)', position: 0 }, { color: 'transparent', position: 100 }] },
  },
  {
    label: 'Ocean Pulse',
    bg: '#071821',
    def: { type: 'radial', angle: 135, cx: 14, cy: 8, stops: [{ color: 'rgba(18,200,197,0.22)', position: 0 }, { color: 'transparent', position: 100 }] },
  },
  {
    label: 'Aurora',
    bg: '#0d1020',
    def: { type: 'linear', angle: 135, cx: 50, cy: 50, stops: [{ color: '#1a0533', position: 0 }, { color: '#0d1020', position: 50 }, { color: '#051a2e', position: 100 }] },
  },
  {
    label: 'Sunset',
    bg: '#1a0a00',
    def: { type: 'linear', angle: 160, cx: 50, cy: 50, stops: [{ color: '#2d0a1a', position: 0 }, { color: '#1a0a00', position: 60 }, { color: '#0a1a2d', position: 100 }] },
  },
  {
    label: 'Clean White',
    bg: '#fafafa',
    def: { type: 'linear', angle: 180, cx: 50, cy: 50, stops: [{ color: '#fafafa', position: 0 }, { color: '#f0f0f5', position: 100 }] },
  },
  {
    label: 'Midnight Galaxy',
    bg: '#07000f',
    def: { type: 'radial', angle: 135, cx: 30, cy: 20, stops: [{ color: 'rgba(100,60,200,0.25)', position: 0 }, { color: 'transparent', position: 60 }] },
  },
]

function buildGradientCss(def: GradientDef, bg: string): string {
  const stops = def.stops.map((s) => `${s.color} ${s.position}%`).join(', ')
  if (def.type === 'radial') {
    return `radial-gradient(circle at ${def.cx}% ${def.cy}%, ${stops}), ${bg}`
  }
  return `linear-gradient(${def.angle}deg, ${stops}), ${bg}`
}

// ── Theme persistence ──────────────────────────────────────────────────────────

const LS_KEY = 'kodo-custom-themes-v1'
const LS_ACTIVE = 'kodo-active-theme-vars-v1'

type SavedTheme = { name: string; vars: Record<string, string>; gradient: string; customCss: string }

function loadSavedThemes(): SavedTheme[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function saveSavedThemes(t: SavedTheme[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(t))
}
function loadActiveVars(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_ACTIVE) || '{}') } catch { return {} }
}

export function applyVarsToDOM(vars: Record<string, string>) {
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value)
  }
}

export function resetVarsInDOM(vars: Record<string, string>) {
  for (const name of Object.keys(vars)) {
    document.documentElement.style.removeProperty(name)
  }
}

function injectCustomCss(css: string) {
  let el = document.getElementById('kodo-custom-css')
  if (!el) {
    el = document.createElement('style')
    el.id = 'kodo-custom-css'
    document.head.appendChild(el)
  }
  el.textContent = css
}

/** Read the computed value of a CSS variable from the document root. */
function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// ── Gradient Editor ─────────────────────────────────────────────────────────────

type GradientEditorProps = {
  gradient: string
  onChange: (css: string) => void
  presets: Array<{ label: string; def: GradientDef; bg: string }>
  onPreset: (p: { label: string; def: GradientDef; bg: string }) => void
}

function buildCustomGradientCss(
  type: 'linear' | 'radial',
  angle: number,
  cx: number, cy: number,
  stops: GradientStop[],
  base: string,
): string {
  const s = stops.map((st) => `${st.color} ${st.position}%`).join(', ')
  if (type === 'radial') return `radial-gradient(circle at ${cx}% ${cy}%, ${s}), ${base}`
  return `linear-gradient(${angle}deg, ${s}), ${base}`
}

function GradientEditor({ gradient, onChange, presets, onPreset }: GradientEditorProps) {
  const [type, setType] = useState<'linear' | 'radial'>('linear')
  const [angle, setAngle] = useState(135)
  const [cx, setCx] = useState(50)
  const [cy, setCy] = useState(50)
  const [base, setBase] = useState('#0a0a0b')
  const [stops, setStops] = useState<GradientStop[]>([
    { color: '#ff4d21', position: 0 },
    { color: '#0a0a0b', position: 100 },
  ])
  const [openStopPicker, setOpenStopPicker] = useState<number | null>(null)
  const [manualCss, setManualCss] = useState('')
  const [mode, setMode] = useState<'builder' | 'presets' | 'manual'>('builder')

  function rebuild(
    t = type, a = angle, px = cx, py = cy, b = base, st = stops
  ) {
    const css = buildCustomGradientCss(t, a, px, py, st, b)
    onChange(css)
    setManualCss(css)
  }

  function updateStop(idx: number, patch: Partial<GradientStop>) {
    const next = stops.map((s, i) => i === idx ? { ...s, ...patch } : s)
      .sort((a, b) => a.position - b.position)
    setStops(next)
    rebuild(type, angle, cx, cy, base, next)
  }

  function addStop() {
    const positions = stops.map((s) => s.position)
    const gaps = stops.slice(0, -1).map((_, i) => ({
      pos: (positions[i] + positions[i + 1]) / 2,
      mid: `#888888`,
    }))
    const best = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : { pos: 50, mid: '#888888' }
    const next = [...stops, { color: best.mid, position: Math.round(best.pos) }]
      .sort((a, b) => a.position - b.position)
    setStops(next)
    rebuild(type, angle, cx, cy, base, next)
  }

  function removeStop(idx: number) {
    if (stops.length <= 2) return
    const next = stops.filter((_, i) => i !== idx)
    setStops(next)
    rebuild(type, angle, cx, cy, base, next)
  }

  const previewCss = buildCustomGradientCss(type, angle, cx, cy, stops, base)

  const tabSt = (t: string) => ({
    padding: '4px 10px', fontSize: 10, fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    background: mode === t ? 'var(--accent)' : 'transparent',
    color: mode === t ? '#fff' : 'var(--text-2)',
    border: 'none', borderRadius: 5, letterSpacing: '0.05em',
  })

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--bg-2)', borderRadius: 8, padding: 4 }}>
        {(['builder', 'presets', 'manual'] as const).map((t) => (
          <button key={t} type="button" style={tabSt(t)} onClick={() => setMode(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* BUILDER MODE */}
      {mode === 'builder' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Preview strip */}
          <div style={{
            height: 70, borderRadius: 10, background: previewCss,
            border: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
          }}>
            {/* Stop position markers on the strip */}
            {type === 'linear' && stops.map((st, i) => (
              <div key={i} style={{
                position: 'absolute', top: 0, bottom: 0,
                left: st.position + '%',
                width: 2, background: 'rgba(255,255,255,0.5)',
                transform: 'translateX(-50%)',
              }} />
            ))}
          </div>

          {/* Type + angle/position */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['linear', 'radial'] as const).map((t) => (
                <button key={t} type="button" onClick={() => { setType(t); rebuild(t) }} style={{
                  padding: '4px 10px', fontSize: 10, fontFamily: 'var(--font-mono)',
                  background: type === t ? 'var(--accent)' : 'var(--bg-2)',
                  color: type === t ? '#fff' : 'var(--text-1)',
                  border: `1px solid ${type === t ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6, cursor: 'pointer',
                }}>{t.toUpperCase()}</button>
              ))}
            </div>
            {type === 'linear' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>ANGLE</span>
                <input type="range" min={0} max={360} value={angle}
                  onChange={(e) => { const v = Number(e.target.value); setAngle(v); rebuild(type, v) }}
                  style={{ flex: 1, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', width: 28 }}>{angle}deg</span>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: 'X', val: cx, set: (v: number) => { setCx(v); rebuild(type, angle, v, cy) } },
                  { label: 'Y', val: cy, set: (v: number) => { setCy(v); rebuild(type, angle, cx, v) } },
                ].map(({ label, val, set }) => (
                  <div key={label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{label}</span>
                    <input type="range" min={0} max={100} value={val}
                      onChange={(e) => set(Number(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--accent)' }} />
                    <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', width: 24 }}>{val}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Base color (background fallback) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>BASE COLOR</span>
            <div style={{ position: 'relative', flex: 1 }}>
              <ColorSwatch varName="" label="Background base" value={base}
                onChange={(_, c) => { setBase(c); rebuild(type, angle, cx, cy, c) }} />
            </div>
          </div>

          {/* Color stops */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>COLOR STOPS</span>
              <button type="button" onClick={addStop} style={{
                background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 5,
                padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
              }}>
                <Plus size={10} /> ADD STOP
              </button>
            </div>

            {stops.map((stop, idx) => (
              <div key={idx} style={{ marginBottom: 8, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <button type="button" onClick={() => setOpenStopPicker(openStopPicker === idx ? null : idx)} style={{
                    width: 28, height: 28, borderRadius: 6, background: stop.color,
                    border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0,
                  }} />
                  <input
                    value={stop.color}
                    onChange={(e) => updateStop(idx, { color: e.target.value })}
                    style={{ flex: 1, background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-0)', borderRadius: 5, padding: '4px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none' }}
                    placeholder="#rrggbb or rgba(...)"
                  />
                  <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {stop.position}%
                  </span>
                  {stops.length > 2 && (
                    <button type="button" onClick={() => removeStop(idx)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}>
                      <Minus size={11} />
                    </button>
                  )}
                </div>
                {/* Position slider */}
                <input type="range" min={0} max={100} value={stop.position}
                  onChange={(e) => updateStop(idx, { position: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: stop.color || 'var(--accent)' }} />

                {/* Color picker popover */}
                {openStopPicker === idx && (
                  <div style={{ marginTop: 8 }}>
                    <ColorPicker
                      value={stop.color}
                      onChange={(c) => updateStop(idx, { color: c })}
                      onClose={() => setOpenStopPicker(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Generated CSS */}
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', wordBreak: 'break-all', lineHeight: 1.5, background: 'var(--bg-2)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
            {previewCss}
          </div>
        </div>
      )}

      {/* PRESETS MODE */}
      {mode === 'presets' && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 10, letterSpacing: '0.06em' }}>
            BUILT-IN PRESETS — click to apply
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {presets.map((p) => (
              <button key={p.label} type="button" onClick={() => onPreset(p)} style={{
                height: 70, borderRadius: 10, cursor: 'pointer',
                background: buildGradientCss(p.def, p.bg),
                border: '2px solid var(--border)',
                display: 'flex', alignItems: 'flex-end', padding: '7px 9px',
                transition: 'border-color 0.15s, transform 0.1s',
              }}
                onMouseEnter={(e) => { ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'; ;(e.currentTarget as HTMLElement).style.transform = 'scale(1.02)' }}
                onMouseLeave={(e) => { ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; ;(e.currentTarget as HTMLElement).style.transform = 'none' }}
              >
                <span style={{ fontSize: 9, color: '#fff', fontFamily: 'var(--font-mono)', textShadow: '0 1px 4px rgba(0,0,0,0.9)', letterSpacing: '0.06em' }}>
                  {p.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MANUAL CSS MODE */}
      {mode === 'manual' && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.06em' }}>
            RAW CSS — any valid background value
          </div>
          <div style={{ height: 60, borderRadius: 8, background: gradient || 'var(--bg-2)', border: '1px solid var(--border)', marginBottom: 10 }} />
          <textarea
            value={manualCss || gradient}
            onChange={(e) => { setManualCss(e.target.value); onChange(e.target.value) }}
            style={{
              width: '100%', height: 100, background: 'var(--bg-2)', border: '1px solid var(--border)',
              color: 'var(--text-0)', borderRadius: 8, padding: 10, fontSize: 11,
              fontFamily: 'var(--font-mono)', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
            placeholder="linear-gradient(135deg, #ff4d21, #0a0a0b)"
          />
        </div>
      )}
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  onClose: () => void
}

export function ThemeStudio({ onClose }: Props) {
  const [vars, setVars] = useState<Record<string, string>>(() => {
    const active = loadActiveVars()
    if (Object.keys(active).length > 0) return active
    // Snapshot current computed values
    const all = [...VAR_GROUPS.flatMap((g) => g.vars.map((v) => v.name))]
    return Object.fromEntries(all.map((n) => [n, readVar(n) || '#888888']))
  })

  const [gradient, setGradient] = useState<string>(() => {
    return loadActiveVars()['--page-gradient'] || readVar('--page-gradient') || 'none'
  })

  const [customCss, setCustomCss] = useState<string>('')
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>(loadSavedThemes)
  const [themeName, setThemeName] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['Backgrounds', 'Accent & Brand']))
  const [activeTab, setActiveTab] = useState<'colors' | 'gradient' | 'layout' | 'css'>('colors')
  const [radius, setRadius] = useState<string>(() => readVar('--radius') || '4px')
  const importRef = useRef<HTMLInputElement>(null)

  // Apply on mount to restore
  useEffect(() => {
    applyVarsToDOM({ ...vars, '--page-gradient': gradient, '--radius': radius })
    const savedCss = localStorage.getItem('kodo-custom-css-v1') || ''
    setCustomCss(savedCss)
    injectCustomCss(savedCss)
  }, [])

  function handleVarChange(name: string, value: string) {
    const next = { ...vars, [name]: value }
    setVars(next)
    document.documentElement.style.setProperty(name, value)
    // Persist
    localStorage.setItem(LS_ACTIVE, JSON.stringify({ ...next, '--page-gradient': gradient, '--radius': radius }))
  }

  function handleGradientPreset(p: typeof GRADIENT_PRESETS[0]) {
    const css = buildGradientCss(p.def, p.bg)
    setGradient(css)
    document.documentElement.style.setProperty('--page-gradient', css)
    document.documentElement.style.setProperty('--bg-0', p.bg)
    setVars((v) => ({ ...v, '--bg-0': p.bg }))
    localStorage.setItem(LS_ACTIVE, JSON.stringify({ ...vars, '--page-gradient': css, '--radius': radius }))
  }

  function handleRadius(v: string) {
    setRadius(v)
    document.documentElement.style.setProperty('--radius', v)
    localStorage.setItem(LS_ACTIVE, JSON.stringify({ ...vars, '--page-gradient': gradient, '--radius': v }))
  }

  function handleCustomCss(css: string) {
    setCustomCss(css)
    injectCustomCss(css)
    localStorage.setItem('kodo-custom-css-v1', css)
  }

  function saveTheme() {
    const name = themeName.trim() || `Custom ${savedThemes.length + 1}`
    const theme: SavedTheme = { name, vars, gradient, customCss }
    const next = [...savedThemes.filter((t) => t.name !== name), theme]
    setSavedThemes(next)
    saveSavedThemes(next)
    setThemeName('')
    setSaveMsg('Saved!')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  function loadTheme(t: SavedTheme) {
    setVars(t.vars)
    setGradient(t.gradient)
    setCustomCss(t.customCss)
    applyVarsToDOM(t.vars)
    document.documentElement.style.setProperty('--page-gradient', t.gradient)
    injectCustomCss(t.customCss)
    localStorage.setItem(LS_ACTIVE, JSON.stringify({ ...t.vars, '--page-gradient': t.gradient }))
    localStorage.setItem('kodo-custom-css-v1', t.customCss)
  }

  function deleteTheme(name: string) {
    const next = savedThemes.filter((t) => t.name !== name)
    setSavedThemes(next)
    saveSavedThemes(next)
  }

  function resetToDefault() {
    for (const g of VAR_GROUPS) for (const v of g.vars) {
      document.documentElement.style.removeProperty(v.name)
    }
    document.documentElement.style.removeProperty('--page-gradient')
    document.documentElement.style.removeProperty('--radius')
    localStorage.removeItem(LS_ACTIVE)
    localStorage.removeItem('kodo-custom-css-v1')
    injectCustomCss('')
    setCustomCss('')
    // Re-read computed after reset
    const next = Object.fromEntries(VAR_GROUPS.flatMap((g) => g.vars.map((v) => v.name)).map((n) => [n, readVar(n) || '#888888']))
    setVars(next)
    setGradient(readVar('--page-gradient') || 'none')
    setRadius(readVar('--radius') || '4px')
  }

  function exportTheme() {
    const data = JSON.stringify({ vars, gradient, customCss, radius }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kodo-theme.json'; a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (data.vars) loadTheme({ name: 'Imported', vars: data.vars, gradient: data.gradient || '', customCss: data.customCss || '' })
        if (data.radius) handleRadius(data.radius)
      } catch { alert('Invalid theme file') }
    }
    reader.readAsText(file)
  }

  const toggleGroup = (title: string) => setOpenGroups((s) => {
    const next = new Set(s)
    if (next.has(title)) next.delete(title); else next.add(title)
    return next
  })

  const tabStyle = (t: string) => ({
    padding: '6px 14px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    background: activeTab === t ? 'var(--accent)' : 'transparent',
    color: activeTab === t ? '#fff' : 'var(--text-2)',
    border: 'none',
    borderRadius: 6,
    letterSpacing: '0.06em',
    transition: 'all 0.15s',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9997,
      display: 'flex', justifyContent: 'flex-end',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div
        style={{
          width: 380, height: '100%', background: 'var(--bg-1)',
          borderLeft: '1px solid var(--border-bright)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', animation: 'slideInRight 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <Palette size={16} color="var(--accent)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)' }}>Theme Studio</div>
            <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>Full UI customization</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" onClick={resetToDefault} title="Reset to theme default" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>
              <RotateCcw size={11} />
            </button>
            <button type="button" onClick={exportTheme} title="Export theme JSON" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>
              <Download size={11} />
            </button>
            <button type="button" onClick={() => importRef.current?.click()} title="Import theme JSON" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>
              <Upload size={11} />
            </button>
            <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 12px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['colors', 'gradient', 'layout', 'css'] as const).map((t) => (
            <button key={t} type="button" style={tabStyle(t)} onClick={() => setActiveTab(t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

          {/* COLORS TAB */}
          {activeTab === 'colors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {VAR_GROUPS.map((group) => {
                const isOpen = openGroups.has(group.title)
                return (
                  <div key={group.title} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.title)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 12px', background: 'var(--bg-2)', border: 'none',
                        cursor: 'pointer', color: 'var(--text-0)',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 4px', letterSpacing: '0.06em' }}>{group.icon}</span>
                      <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 600 }}>{group.title}</span>
                      {isOpen ? <ChevronDown size={13} color="var(--text-2)" /> : <ChevronRight size={13} color="var(--text-2)" />}
                    </button>
                    {isOpen && (
                      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {group.vars.map((v) => (
                          <ColorSwatch
                            key={v.name}
                            varName={v.name}
                            label={v.label}
                            value={vars[v.name] || readVar(v.name) || '#888'}
                            onChange={handleVarChange}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* GRADIENT TAB */}
          {activeTab === 'gradient' && (
            <GradientEditor
              gradient={gradient}
              onChange={(css) => {
                setGradient(css)
                document.documentElement.style.setProperty('--page-gradient', css)
                localStorage.setItem(LS_ACTIVE, JSON.stringify({ ...vars, '--page-gradient': css, '--radius': radius }))
              }}
              presets={GRADIENT_PRESETS}
              onPreset={handleGradientPreset}
            />
          )}

          {/* LAYOUT TAB */}
          {activeTab === 'layout' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.06em' }}>BORDER RADIUS</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['0px', '2px', '4px', '6px', '8px', '12px', '16px', '24px'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRadius(r)}
                      style={{
                        padding: '6px 12px', fontSize: 11, fontFamily: 'var(--font-mono)',
                        background: radius === r ? 'var(--accent)' : 'var(--bg-2)',
                        color: radius === r ? '#fff' : 'var(--text-1)',
                        border: `1px solid ${radius === r ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: r, cursor: 'pointer',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                {/* Preview */}
                <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 60, height: 32, background: 'var(--accent)', borderRadius: radius, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 9, color: '#fff', fontFamily: 'var(--font-mono)' }}>BUTTON</span>
                  </div>
                  <div style={{ width: 100, height: 32, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: radius }} />
                  <div style={{ width: 44, height: 44, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: radius }} />
                </div>
              </div>

              {/* Font selector */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.06em' }}>MONOSPACE FONT</div>
                <select
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) { document.documentElement.style.setProperty('--font-mono', e.target.value) } }}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-0)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}
                >
                  <option value="">— keep current —</option>
                  {[
                    ["'JetBrains Mono', monospace", 'JetBrains Mono'],
                    ["'Fira Code', monospace", 'Fira Code'],
                    ["'Cascadia Code', monospace", 'Cascadia Code'],
                    ["'Source Code Pro', monospace", 'Source Code Pro'],
                    ["'Inconsolata', monospace", 'Inconsolata'],
                    ["'Courier New', monospace", 'Courier New'],
                    ['monospace', 'System Mono'],
                  ].map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* CSS TAB */}
          {activeTab === 'css' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.06em' }}>
                CUSTOM CSS INJECTION
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.6 }}>
                Override any Kodo style. Applied live. Use CSS variables like <code style={{ color: 'var(--accent)', fontSize: 10 }}>var(--accent)</code>.
                Target components with their class names.
              </div>
              <textarea
                value={customCss}
                onChange={(e) => handleCustomCss(e.target.value)}
                placeholder={`/* Examples: */
.user-message-body {
  background: var(--accent-dim) !important;
  border-color: var(--accent) !important;
}
button {
  border-radius: 12px !important;
}`}
                style={{
                  width: '100%', height: 280, background: '#0f0f13', border: '1px solid var(--border)',
                  color: '#e0e0e0', borderRadius: 8, padding: 12, fontSize: 12,
                  fontFamily: 'var(--font-mono)', resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box', lineHeight: 1.6,
                }}
              />
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                CSS is auto-saved and persists across sessions.
              </div>
            </div>
          )}
        </div>

        {/* Saved themes */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--bg-2)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '0.08em', marginBottom: 8 }}>
            SAVED THEMES {savedThemes.length > 0 && `(${savedThemes.length})`}
          </div>

          {savedThemes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {savedThemes.map((t) => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button
                    type="button"
                    onClick={() => loadTheme(t)}
                    style={{
                      background: 'var(--bg-1)', border: '1px solid var(--border)',
                      color: 'var(--text-1)', borderRadius: 6, padding: '4px 8px',
                      fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {t.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTheme(t.name)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: '2px 3px', fontSize: 10 }}
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveTheme() }}
              placeholder="Theme name…"
              style={{
                flex: 1, background: 'var(--bg-1)', border: '1px solid var(--border)',
                color: 'var(--text-0)', borderRadius: 6, padding: '6px 8px', fontSize: 11,
                outline: 'none', fontFamily: 'var(--font-sans)',
              }}
            />
            <button
              type="button"
              onClick={saveTheme}
              style={{
                background: 'var(--accent)', border: 'none', color: '#fff',
                borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
                fontSize: 11, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {saveMsg ? <Check size={12} /> : <Save size={12} />}
              {saveMsg || 'SAVE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
