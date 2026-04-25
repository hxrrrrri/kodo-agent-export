/**
 * TodoPanel — professional inline task list rendered inside assistant message bubbles.
 * Auto-shown for 3+ item plans (heavy tasks); hidden for simple 1-2 item updates.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TodoItem } from '../store/chatStore'

const CATEGORY_COLORS: Record<string, string> = {
  analysis: 'var(--blue)',
  code: 'var(--green)',
  test: 'var(--yellow)',
  docs: 'var(--text-2)',
  deploy: 'var(--accent)',
  design: '#a78bfa',
  review: '#f59e0b',
  fix: 'var(--red)',
  plan: 'var(--blue)',
}

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  if (status === 'completed') {
    return (
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--green)', border: '2px solid var(--green)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <polyline points="1.5,5.5 4,8 8.5,2" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  if (status === 'in_progress') {
    return (
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        border: '2px solid var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, animation: 'pulse-accent 1.6s ease-in-out infinite',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
      </div>
    )
  }
  return (
    <div style={{
      width: 18, height: 18, borderRadius: '50%',
      border: '2px solid var(--border-bright)',
      flexShrink: 0, opacity: 0.45,
    }} />
  )
}

type Props = {
  items: TodoItem[]
  /** If true, always show regardless of item count */
  forceShow?: boolean
}

export function TodoPanel({ items, forceShow = false }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  // Only auto-show for heavy tasks (3+ items). Simple responses skip the panel.
  if (!forceShow && items.length < 3) return null
  if (items.length === 0) return null

  const allDone = items.every((i) => i.status === 'completed')
  const doneCount = items.filter((i) => i.status === 'completed').length
  const inProgressCount = items.filter((i) => i.status === 'in_progress').length
  const pct = Math.round((doneCount / items.length) * 100)

  return (
    <div style={{
      marginTop: 14,
      background: 'var(--bg-1)',
      border: `1px solid ${allDone ? 'var(--green)' : 'var(--border)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.4s ease',
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          padding: '10px 14px', background: 'none', border: 'none',
          cursor: 'pointer', gap: 10, borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        }}
      >
        {/* Progress ring */}
        {allDone ? (
          <div style={{
            width: 22, height: 22, borderRadius: '50%', background: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
              <polyline points="1.5,5.5 4,8 8.5,2" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: `conic-gradient(var(--accent) 0% ${pct}%, var(--bg-3) ${pct}% 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--bg-1)' }} />
          </div>
        )}

        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: allDone ? 'var(--green)' : 'var(--text-0)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
            {allDone ? 'ALL TASKS COMPLETE' : inProgressCount > 0 ? 'TASK PLAN — IN PROGRESS' : 'TASK PLAN'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
            {doneCount}/{items.length} done · {pct}%
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ width: 80, height: 4, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 99,
            background: allDone ? 'var(--green)' : 'var(--accent)',
            transition: 'width 0.3s ease',
          }} />
        </div>

        {collapsed ? <ChevronRight size={13} style={{ color: 'var(--text-2)', flexShrink: 0 }} /> : <ChevronDown size={13} style={{ color: 'var(--text-2)', flexShrink: 0 }} />}
      </button>

      {/* Item list */}
      {!collapsed && (
        <div style={{ padding: '8px 0' }}>
          {items.map((item, idx) => {
            const catColor = item.category ? (CATEGORY_COLORS[item.category] || 'var(--text-2)') : 'var(--text-2)'
            return (
              <div key={item.id || idx} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '7px 14px',
                background: item.status === 'in_progress' ? 'var(--accent-dim)' : 'transparent',
                borderLeft: item.status === 'in_progress' ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'background 0.2s',
              }}>
                <StatusIcon status={item.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    color: item.status === 'completed' ? 'var(--text-2)' : 'var(--text-0)',
                    textDecoration: item.status === 'completed' ? 'line-through' : 'none',
                    lineHeight: 1.4,
                    fontWeight: item.status === 'in_progress' ? 600 : 400,
                  }}>
                    {item.title}
                  </div>
                  {item.detail && (
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.4 }}>
                      {item.detail}
                    </div>
                  )}
                </div>
                {item.category && (
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-mono)', color: catColor,
                    border: `1px solid ${catColor}`, borderRadius: 6,
                    padding: '1px 6px', flexShrink: 0, opacity: 0.8, marginTop: 2,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {item.category}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
