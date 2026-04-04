import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, Pause, Download } from 'lucide-react'
import { buildApiHeaders, parseApiError } from '../lib/api'

type ReplayEvent = {
  event_index: number
  event_type: string
  timestamp: string
  content?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_output?: string
  approved?: boolean
}

interface ReplayPanelProps {
  sessionId: string
  onClose: () => void
}

export function ReplayPanel({ sessionId, onClose }: ReplayPanelProps) {
  const [events, setEvents] = useState<ReplayEvent[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoPlay, setAutoPlay] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/events`, {
          headers: buildApiHeaders(),
        })
        if (!response.ok) {
          throw new Error(await parseApiError(response))
        }
        const data = await response.json()
        const rows = Array.isArray(data.events) ? data.events as ReplayEvent[] : []
        if (!cancelled) {
          setEvents(rows)
          setIndex(0)
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (!autoPlay || events.length === 0) return

    const timer = window.setInterval(() => {
      setIndex((prev) => {
        if (prev >= events.length - 1) {
          setAutoPlay(false)
          return prev
        }
        return prev + 1
      })
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [autoPlay, events.length])

  const current = events[index]

  useEffect(() => {
    if (!current) return
    window.dispatchEvent(new CustomEvent('kodo:replay-highlight', { detail: { content: current.content || '' } }))
  }, [current])

  const title = useMemo(() => {
    if (!current) return 'No event'
    const tool = current.tool_name ? ` — ${current.tool_name}` : ''
    return `STEP ${index + 1} of ${events.length}: ${current.event_type}${tool}`
  }, [current, events.length, index])

  const exportEvents = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `kodo-replay-${sessionId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in srgb, var(--bg-0) 72%, black)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 70,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(920px, 96vw)',
          minHeight: 420,
          maxHeight: '90vh',
          overflow: 'auto',
          borderRadius: 12,
          border: '1px solid var(--border-bright)',
          background: 'var(--bg-1)',
          padding: 14,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 14, color: 'var(--text-0)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Session Replay
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-2)',
              borderRadius: 8,
              color: 'var(--text-1)',
              padding: '5px 9px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            CLOSE
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setIndex(0)} disabled={events.length === 0} style={controlButtonStyle}>
            <ChevronsLeft size={13} />
          </button>
          <button type="button" onClick={() => setIndex((prev) => Math.max(0, prev - 1))} disabled={events.length === 0} style={controlButtonStyle}>
            <ChevronLeft size={13} />
          </button>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-1)', minWidth: 260 }}>
            {title}
          </div>
          <button type="button" onClick={() => setIndex((prev) => Math.min(events.length - 1, prev + 1))} disabled={events.length === 0} style={controlButtonStyle}>
            <ChevronRight size={13} />
          </button>
          <button type="button" onClick={() => setIndex(Math.max(0, events.length - 1))} disabled={events.length === 0} style={controlButtonStyle}>
            <ChevronsRight size={13} />
          </button>
          <button type="button" onClick={() => setAutoPlay((prev) => !prev)} disabled={events.length === 0} style={controlButtonStyle}>
            {autoPlay ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button type="button" onClick={exportEvents} disabled={events.length === 0} style={controlButtonStyle}>
            <Download size={13} />
          </button>
        </div>

        {loading && <div style={{ color: 'var(--text-2)', fontSize: 12 }}>Loading replay events...</div>}
        {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg-2)',
                padding: 10,
                minHeight: 200,
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                {current?.timestamp || '-'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-0)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {current?.content || 'No content for this step.'}
              </div>
              {current?.tool_input && (
                <pre style={{
                  margin: 0,
                  padding: 8,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-0)',
                  color: 'var(--text-1)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  maxHeight: 180,
                  overflow: 'auto',
                }}>
                  {JSON.stringify(current.tool_input, null, 2)}
                </pre>
              )}
              {typeof current?.approved === 'boolean' && (
                <div style={{
                  fontSize: 11,
                  color: current.approved ? 'var(--green)' : 'var(--red)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {current.approved ? 'APPROVED' : 'DENIED'}
                </div>
              )}
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(0, events.length - 1)}
              value={index}
              onChange={(event) => setIndex(Number(event.target.value))}
              disabled={events.length === 0}
            />
          </>
        )}
      </div>
    </div>
  )
}

const controlButtonStyle = {
  border: '1px solid var(--border)',
  background: 'var(--bg-2)',
  borderRadius: 8,
  color: 'var(--text-1)',
  width: 30,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
