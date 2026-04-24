/**
 * StatusBar — VS Code-style bottom bar with live session metrics.
 * Shows: model, mode, tokens used, cost, context %, keyboard hints.
 */
import { useMemo } from 'react'
import { useChatStore } from '../store/chatStore'

const CONTEXT_BUDGET = Number(import.meta.env.VITE_CONTEXT_TOKEN_BUDGET || 60000)

type Props = {
  onOpenPalette: () => void
  onOpenTheme: () => void
  isFocusMode: boolean
  onToggleFocus: () => void
}

export function StatusBar({ onOpenPalette, onOpenTheme, isFocusMode, onToggleFocus }: Props) {
  const messages = useChatStore((s) => s.messages)
  const sessionMode = useChatStore((s) => s.sessionMode)
  const isLoading = useChatStore((s) => s.isLoading)

  const stats = useMemo(() => {
    let totalIn = 0, totalOut = 0
    for (const m of messages) {
      if (m.usage) {
        totalIn += m.usage.input_tokens || 0
        totalOut += m.usage.output_tokens || 0
      } else {
        totalIn += Math.ceil((m.content?.length || 0) / 3)
      }
    }
    const cost = (totalIn / 1e6) * 3 + (totalOut / 1e6) * 15
    const pct = Math.min(100, Math.round((totalIn / CONTEXT_BUDGET) * 100))
    const model = messages.slice().reverse().find((m) => m.usage?.model)?.usage?.model || null
    return { totalIn, totalOut, cost, pct, model }
  }, [messages])

  function Item({ label, value, onClick, title, color }: {
    label: string; value: string; onClick?: () => void; title?: string; color?: string
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        style={{
          background: 'none', border: 'none', cursor: onClick ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px',
          borderRight: '1px solid var(--border)',
          height: '100%', color: color || 'var(--text-2)',
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => { if (onClick) { ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-2)' } }}
        onMouseLeave={(e) => { ;(e.currentTarget as HTMLElement).style.background = 'none' }}
      >
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', opacity: 0.6 }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', color: color || 'var(--text-1)' }}>{value}</span>
      </button>
    )
  }

  return (
    <div style={{
      height: 24,
      display: 'flex',
      alignItems: 'center',
      background: 'var(--bg-0)',
      borderTop: '1px solid var(--border)',
      flexShrink: 0,
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Left section */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', flex: 1 }}>
        <Item label="MODE" value={sessionMode.toUpperCase()} />
        {stats.model && (
          <Item label="MODEL" value={stats.model.split('-').slice(-2).join('-')} />
        )}
        {stats.totalOut > 0 && (
          <Item label="COST" value={`$${stats.cost.toFixed(4)}`} />
        )}
        {isLoading && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px',
            borderRight: '1px solid var(--border)', height: '100%',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
              animation: 'pulse-accent 1s ease infinite',
            }} />
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.06em' }}>
              RUNNING
            </span>
          </div>
        )}
      </div>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <Item
          label=""
          value={isFocusMode ? 'EXIT FOCUS' : 'FOCUS'}
          onClick={onToggleFocus}
          title="Toggle Focus Mode (Cmd+Shift+F)"
          color={isFocusMode ? 'var(--accent)' : undefined}
        />
        <Item label="" value="PALETTE" onClick={onOpenPalette} title="Action palette (Cmd+Shift+K)" />
        <Item label="" value="THEME" onClick={onOpenTheme} title="Open Theme Studio" />
        <div style={{ padding: '0 8px', display: 'flex', gap: 10 }}>
          {[
            { key: 'K', mod: 'Cmd+', action: 'Commands' },
            { key: 'S', mod: 'Cmd+', action: 'Checkpoint' },
            { key: 'N', mod: 'Cmd+', action: 'New session' },
          ].map(({ key, mod, action }) => (
            <span key={key} title={`${mod}${key}: ${action}`} style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', display: 'flex', gap: 2 }}>
              <span style={{ opacity: 0.5 }}>{mod}</span>{key}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
