/**
 * DepthSelector — response depth control that prepends a style instruction.
 * Concise / Balanced / Thorough / Expert modes.
 * The selection is shown as a pill in the composer, cleared after each send.
 */
import { useState } from 'react'

export type DepthMode = 'concise' | 'balanced' | 'thorough' | 'expert'

const DEPTH_OPTIONS: Array<{
  key: DepthMode
  label: string
  abbr: string
  instruction: string
  color: string
}> = [
  {
    key: 'concise',
    label: 'Concise',
    abbr: 'C',
    instruction: 'Be extremely concise — 1-3 sentences maximum. No preamble, no filler.',
    color: 'var(--green)',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    abbr: 'B',
    instruction: '',
    color: 'var(--text-2)',
  },
  {
    key: 'thorough',
    label: 'Thorough',
    abbr: 'T',
    instruction: 'Be comprehensive and thorough. Cover all relevant details, edge cases, and examples.',
    color: 'var(--blue)',
  },
  {
    key: 'expert',
    label: 'Expert',
    abbr: 'E',
    instruction: 'Respond at expert/senior level. Use precise technical language, include implementation details, trade-offs, and best practices. Assume deep domain knowledge.',
    color: 'var(--accent)',
  },
]

/** Apply depth instruction to a prompt string. */
export function applyDepth(prompt: string, depth: DepthMode): string {
  const opt = DEPTH_OPTIONS.find((o) => o.key === depth)
  if (!opt?.instruction) return prompt
  return `[${opt.instruction}]\n\n${prompt}`
}

type Props = {
  value: DepthMode
  onChange: (mode: DepthMode) => void
}

export function DepthSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const current = DEPTH_OPTIONS.find((o) => o.key === value)!

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Response depth — controls how detailed Kodo's answers are"
        style={{
          background: open ? 'var(--bg-3)' : 'var(--bg-2)',
          border: `1px solid ${value !== 'balanced' ? current.color : 'var(--border)'}`,
          color: value !== 'balanced' ? current.color : 'var(--text-2)',
          borderRadius: 'var(--radius)',
          padding: '3px 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontWeight: 700 }}>{current.abbr}</span>
        <span style={{ opacity: 0.7 }}>{current.label.toUpperCase()}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          background: 'var(--bg-1)',
          border: '1px solid var(--border-bright)',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          zIndex: 100,
          minWidth: 200,
        }}>
          {DEPTH_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { onChange(opt.key); setOpen(false) }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 14px',
                background: value === opt.key ? 'var(--bg-3)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-2)' }}
              onMouseLeave={(e) => { ;(e.currentTarget as HTMLElement).style.background = value === opt.key ? 'var(--bg-3)' : 'transparent' }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                color: opt.color, width: 14,
              }}>{opt.abbr}</span>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-0)', fontWeight: value === opt.key ? 600 : 400 }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 1 }}>
                  {opt.key === 'balanced' ? 'Default — no instruction added' : opt.instruction.slice(0, 60) + '...'}
                </div>
              </div>
              {value === opt.key && (
                <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: opt.color }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
