import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ── Conversion helpers ─────────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
  return '#' + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function hexToHsl(hex: string): [number, number, number] {
  let r = 0, g = 0, b = 0
  const h = hex.replace('#', '')
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16) / 255
    g = parseInt(h[1] + h[1], 16) / 255
    b = parseInt(h[2] + h[2], 16) / 255
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16) / 255
    g = parseInt(h.slice(2, 4), 16) / 255
    b = parseInt(h.slice(4, 6), 16) / 255
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let hv = 0, sv = 0; const lv = (max + min) / 2
  if (max !== min) {
    const d = max - min
    sv = lv > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: hv = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: hv = ((b - r) / d + 2) / 6; break
      case b: hv = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(hv * 360), Math.round(sv * 100), Math.round(lv * 100)]
}

function isValidHex(v: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(v)
}

function normalizeHex(v: string): string {
  const h = v.startsWith('#') ? v : '#' + v
  return h.toLowerCase()
}

// ── Canvas-based pickers ────────────────────────────────────────────────────────

function SLSquare({ hue, sl, onChange }: {
  hue: number
  sl: [number, number]
  onChange: (s: number, l: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const SIZE = 180

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, SIZE, SIZE)
    // White-to-hue horizontal
    const hGrad = ctx.createLinearGradient(0, 0, SIZE, 0)
    hGrad.addColorStop(0, 'hsl(0,0%,100%)')
    hGrad.addColorStop(1, `hsl(${hue},100%,50%)`)
    ctx.fillStyle = hGrad
    ctx.fillRect(0, 0, SIZE, SIZE)
    // Transparent-to-black vertical overlay
    const bGrad = ctx.createLinearGradient(0, 0, 0, SIZE)
    bGrad.addColorStop(0, 'rgba(0,0,0,0)')
    bGrad.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = bGrad
    ctx.fillRect(0, 0, SIZE, SIZE)
  }, [hue])

  function pick(e: React.MouseEvent | MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    // x=saturation, y=inverted lightness+blackness
    const s = Math.round(x * 100)
    const l = Math.round((1 - y * 0.5) * (1 - x * 0.5) * 100)
    onChange(s, Math.max(0, Math.min(100, l)))
  }

  useEffect(() => {
    const up = () => { dragging.current = false }
    const move = (e: MouseEvent) => { if (dragging.current) pick(e) }
    window.addEventListener('mouseup', up)
    window.addEventListener('mousemove', move)
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move) }
  })

  const cx = (sl[0] / 100) * SIZE
  // Approximate cursor position from HSL (reverse map is complex, use approximation)
  const cy = SIZE - (sl[1] / 100) * SIZE * 0.7

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <canvas
        ref={canvasRef}
        width={SIZE} height={SIZE}
        style={{ display: 'block', borderRadius: 8, cursor: 'crosshair', border: '1px solid var(--border)' }}
        onMouseDown={(e) => { dragging.current = true; pick(e) }}
      />
      {/* Cursor */}
      <div style={{
        position: 'absolute',
        left: cx - 7, top: Math.max(0, cy - 7),
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid #fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        background: hslToHex(hue, sl[0], sl[1]),
      }} />
    </div>
  )
}

function HueStrip({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const H = 180, W = 16

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    for (let i = 0; i <= 360; i += 30) grad.addColorStop(i / 360, `hsl(${i},100%,50%)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }, [])

  function pick(e: React.MouseEvent | MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    onChange(Math.round(y * 360))
  }

  useEffect(() => {
    const up = () => { dragging.current = false }
    const move = (e: MouseEvent) => { if (dragging.current) pick(e) }
    window.addEventListener('mouseup', up)
    window.addEventListener('mousemove', move)
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move) }
  })

  const cy = (hue / 360) * H

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <canvas
        ref={canvasRef}
        width={W} height={H}
        style={{ display: 'block', borderRadius: 6, cursor: 'ns-resize', border: '1px solid var(--border)' }}
        onMouseDown={(e) => { dragging.current = true; pick(e) }}
      />
      <div style={{
        position: 'absolute', left: -2, top: cy - 4,
        width: W + 4, height: 8, borderRadius: 4,
        border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

// ── Main ColorPicker ────────────────────────────────────────────────────────────

type Props = {
  value: string
  onChange: (hex: string) => void
  onClose?: () => void
  label?: string
}

export function ColorPicker({ value, onChange, onClose, label }: Props) {
  const safe = isValidHex(value) ? normalizeHex(value) : '#888888'
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexToHsl(safe))
  const [hexInput, setHexInput] = useState(safe)
  const ref = useRef<HTMLDivElement>(null)

  const [h, s, l] = hsl

  const commit = useCallback((newH: number, newS: number, newL: number) => {
    const hex = hslToHex(newH, newS, newL)
    setHsl([newH, newS, newL])
    setHexInput(hex)
    onChange(hex)
  }, [onChange])

  // Close on outside click
  useEffect(() => {
    if (!onClose) return
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', fn)
    return () => window.removeEventListener('mousedown', fn)
  }, [onClose])

  const swatches = [
    '#ff4d21','#ff9f00','#ffd700','#00ff88','#12c8c5',
    '#4da6ff','#8b92ff','#d95180','#64d492','#ffffff','#888888','#111111',
  ]

  return (
    <div
      ref={ref}
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--border-bright)',
        borderRadius: 12,
        padding: 14,
        width: 240,
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        userSelect: 'none',
      }}
    >
      {label && (
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '0.1em', marginBottom: 10 }}>
          {label.toUpperCase()}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <SLSquare hue={h} sl={[s, l]} onChange={(ns, nl) => commit(h, ns, nl)} />
        <HueStrip hue={h} onChange={(nh) => commit(nh, s, l)} />
      </div>

      {/* Preview + hex */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: hslToHex(h, s, l),
          border: '1px solid var(--border)', flexShrink: 0,
          boxShadow: `0 0 0 4px ${hslToHex(h, s, l)}22`,
        }} />
        <input
          value={hexInput}
          onChange={(e) => {
            const v = e.target.value
            setHexInput(v)
            if (isValidHex(v)) {
              const norm = normalizeHex(v)
              const newHsl = hexToHsl(norm)
              setHsl(newHsl)
              onChange(norm)
            }
          }}
          style={{
            flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)',
            color: 'var(--text-0)', borderRadius: 6, padding: '6px 8px',
            fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
          }}
          spellCheck={false}
        />
      </div>

      {/* HSL sliders */}
      {[
        { label: 'H', value: h, max: 360, onChange: (v: number) => commit(v, s, l) },
        { label: 'S', value: s, max: 100, onChange: (v: number) => commit(h, v, l) },
        { label: 'L', value: l, max: 100, onChange: (v: number) => commit(h, s, v) },
      ].map(({ label: slLabel, value: slVal, max, onChange: slChange }) => (
        <div key={slLabel} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', width: 10 }}>{slLabel}</span>
          <input
            type="range" min={0} max={max} value={slVal}
            onChange={(e) => slChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: hslToHex(h, s, l) }}
          />
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', width: 26, textAlign: 'right' }}>{slVal}</span>
        </div>
      ))}

      {/* Quick swatches */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
        {swatches.map((sw) => (
          <button
            key={sw}
            type="button"
            onClick={() => {
              const newHsl = hexToHsl(sw)
              setHsl(newHsl)
              setHexInput(sw)
              onChange(sw)
            }}
            style={{
              width: 18, height: 18, borderRadius: 4, background: sw,
              border: sw === hslToHex(h, s, l) ? '2px solid #fff' : '1px solid var(--border)',
              cursor: 'pointer', padding: 0, outline: 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Inline color swatch that opens picker ───────────────────────────────────────

type SwatchProps = {
  value: string
  label: string
  varName: string
  onChange: (varName: string, value: string) => void
}

export function ColorSwatch({ value, label, varName, onChange }: SwatchProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })

  function openPicker() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const top = r.bottom + 6
      // Keep picker on screen horizontally
      const left = Math.min(r.left, window.innerWidth - 260)
      setPickerPos({ top, left })
    }
    setOpen(true)
  }

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openPicker()}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer', width: '100%',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => { ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)' }}
        onMouseLeave={(e) => { ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 4, background: value,
          border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0,
        }} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 11, color: 'var(--text-0)' }}>{label}</div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{varName}</div>
        </div>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
          {value}
        </span>
      </button>

      {/* Render picker in a portal at document.body so it escapes all overflow:hidden parents */}
      {open && createPortal(
        <div style={{
          position: 'fixed',
          top: pickerPos.top,
          left: pickerPos.left,
          zIndex: 99999,
        }}>
          <ColorPicker
            value={value}
            label={label}
            onChange={(hex) => onChange(varName, hex)}
            onClose={() => setOpen(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}
