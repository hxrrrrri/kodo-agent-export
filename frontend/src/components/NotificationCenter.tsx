import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { UiNotification } from '../lib/notifications'

const MAX_NOTIFICATIONS = 4
const DISMISS_MS = 6500

export function NotificationCenter() {
  const [items, setItems] = useState<UiNotification[]>([])

  useEffect(() => {
    const onNotify = (event: Event) => {
      const custom = event as CustomEvent<UiNotification>
      const payload = custom.detail
      if (!payload || !payload.id) return

      setItems((prev) => [payload, ...prev].slice(0, MAX_NOTIFICATIONS))
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== payload.id))
      }, DISMISS_MS)
    }

    window.addEventListener('kodo:notify', onNotify as EventListener)
    return () => {
      window.removeEventListener('kodo:notify', onNotify as EventListener)
    }
  }, [])

  const ordered = useMemo(
    () => [...items].sort((a, b) => b.createdAt - a.createdAt),
    [items],
  )

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        right: 14,
        bottom: 14,
        zIndex: 120,
        width: 'min(340px, 92vw)',
        display: 'grid',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {ordered.map((item) => {
        const tone = toneByKind(item.kind)
        return (
          <div
            key={item.id}
            style={{
              border: `1px solid ${tone.border}`,
              background: tone.background,
              borderRadius: 10,
              padding: '9px 10px',
              display: 'grid',
              gap: 3,
              boxShadow: '0 10px 28px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: tone.title }}>
              {tone.icon}
              <strong>{item.title}</strong>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.4 }}>
              {item.message}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function toneByKind(kind: UiNotification['kind']): {
  border: string
  background: string
  title: string
  icon: JSX.Element
} {
  if (kind === 'success') {
    return {
      border: 'var(--green)',
      background: 'var(--green-dim)',
      title: 'var(--green)',
      icon: <CheckCircle2 size={14} />,
    }
  }
  if (kind === 'warning') {
    return {
      border: 'var(--yellow)',
      background: 'var(--yellow-dim)',
      title: 'var(--yellow)',
      icon: <AlertTriangle size={14} />,
    }
  }
  if (kind === 'error') {
    return {
      border: 'var(--red)',
      background: 'var(--red-dim)',
      title: 'var(--red)',
      icon: <XCircle size={14} />,
    }
  }
  return {
    border: 'var(--blue)',
    background: 'var(--blue-dim)',
    title: 'var(--blue)',
    icon: <Info size={14} />,
  }
}
