/**
 * BrowserPanel — UI for the browser-harness daemon.
 *
 * Shows live screenshot, URL bar, action log, and start/stop controls.
 * The agent's browser tools (browser_open, browser_click, …) drive the same
 * daemon, so anything the agent does is visible here in real time.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Camera,
  ExternalLink,
  Globe,
  Loader,
  Power,
  RefreshCw,
  Square,
} from 'lucide-react'
import { buildApiHeaders } from '../lib/api'

interface BrowserStatus {
  running: boolean
  url?: string
  title?: string
  target_id?: string
  session?: string
}

interface ActionLogEntry {
  kind: string
  action: string
  detail: Record<string, unknown>
  ts: number
}

const KIND_COLORS: Record<string, string> = {
  navigate: 'var(--blue)',
  input: 'var(--accent)',
  visual: 'var(--green)',
  tabs: '#9333ea',
  dialog: 'var(--yellow)',
  daemon: 'var(--text-2)',
}

export function BrowserPanel() {
  const [status, setStatus] = useState<BrowserStatus>({ running: false })
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [screenshotKey, setScreenshotKey] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [actions, setActions] = useState<ActionLogEntry[]>([])
  const [logExpanded, setLogExpanded] = useState(true)
  const lastTsRef = useRef<number>(0)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Status polling ──────────────────────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/browser/status', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = (await res.json()) as BrowserStatus
      setStatus(data)
      if (data.url && !urlInput) setUrlInput(data.url)
    } catch {
      setStatus({ running: false })
    }
  }, [urlInput])

  useEffect(() => {
    void refreshStatus()
    const id = setInterval(() => void refreshStatus(), 4000)
    return () => clearInterval(id)
  }, [refreshStatus])

  // ── Auto-refresh screenshot when running ────────────────────────────────
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    if (!status.running || !autoRefresh) return
    refreshTimerRef.current = setInterval(() => {
      setScreenshotKey((k) => k + 1)
    }, 2000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [status.running, autoRefresh])

  // ── Action log polling ──────────────────────────────────────────────────
  const refreshLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/browser/log?since=${lastTsRef.current}`, { headers: buildApiHeaders() })
      if (!res.ok) return
      const data = (await res.json()) as { entries: ActionLogEntry[]; running: boolean }
      const fresh = data.entries || []
      if (fresh.length === 0) return
      lastTsRef.current = Math.max(lastTsRef.current, ...fresh.map((e) => e.ts || 0))
      setActions((prev) => [...prev, ...fresh].slice(-50))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (logTimerRef.current) clearInterval(logTimerRef.current)
    if (!status.running) return
    logTimerRef.current = setInterval(() => void refreshLog(), 1500)
    return () => {
      if (logTimerRef.current) clearInterval(logTimerRef.current)
    }
  }, [status.running, refreshLog])

  // ── Actions ─────────────────────────────────────────────────────────────
  const startBrowser = async () => {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/browser/start', {
        method: 'POST',
        headers: buildApiHeaders(),
      })
      if (!res.ok) throw new Error(await res.text())
      lastTsRef.current = 0
      setActions([])
      await refreshStatus()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const stopBrowser = async () => {
    setStopping(true)
    setError(null)
    try {
      await fetch('/api/browser/stop', { method: 'POST', headers: buildApiHeaders() })
      await refreshStatus()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStopping(false)
    }
  }

  const navigate = async () => {
    if (!urlInput.trim()) return
    let url = urlInput.trim()
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    setNavigating(true)
    setError(null)
    try {
      if (!status.running) await startBrowser()
      const res = await fetch('/api/browser/navigate', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error(await res.text())
      setScreenshotKey((k) => k + 1)
      setTimeout(() => void refreshStatus(), 600)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setNavigating(false)
    }
  }

  const screenshotUrl = `/api/browser/screenshot?refresh=true&_=${screenshotKey}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Globe size={14} color="var(--blue)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>
            BROWSER
          </span>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)',
            padding: '1px 6px', borderRadius: 6,
            background: status.running ? 'var(--green-dim)' : 'var(--bg-3)',
            color: status.running ? 'var(--green)' : 'var(--text-2)',
            border: `1px solid ${status.running ? 'var(--green)' : 'var(--border)'}`,
          }}>
            {status.running ? 'RUNNING' : 'STOPPED'}
          </span>
          <div style={{ flex: 1 }} />
          {status.running ? (
            <button type="button" onClick={() => void stopBrowser()} disabled={stopping}
              style={btnStyle('var(--red)')}>
              {stopping ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Square size={11} />}
              STOP
            </button>
          ) : (
            <button type="button" onClick={() => void startBrowser()} disabled={starting}
              style={btnStyle('var(--green)')}>
              {starting ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Power size={11} />}
              START
            </button>
          )}
        </div>

        {/* URL bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void navigate() }}
            placeholder="https://example.com"
            disabled={navigating}
            style={{
              flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 7, color: 'var(--text-0)', fontSize: 11,
              padding: '5px 9px', outline: 'none', fontFamily: 'var(--font-mono)',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--blue)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
          />
          <button type="button" onClick={() => void navigate()} disabled={navigating || !urlInput.trim()}
            title="Navigate"
            style={{
              background: 'var(--blue-dim)', border: '1px solid var(--blue)',
              color: 'var(--blue)', borderRadius: 7, padding: '5px 10px',
              cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
            {navigating ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={11} />}
          </button>
        </div>

        {/* Current page indicator */}
        {status.running && status.url && (
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            <ExternalLink size={10} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {status.title ? `${status.title} · ` : ''}{status.url}
            </span>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={11} /> {error}
          </div>
        )}
      </div>

      {/* ── Live screenshot ──────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflow: 'auto', padding: 12,
        background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {status.running ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)',
            }}>
              <Camera size={11} />
              <span>LIVE PREVIEW</span>
              <div style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }} />
                Auto
              </label>
              <button type="button" onClick={() => setScreenshotKey((k) => k + 1)}
                title="Refresh now"
                style={{
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '2px 6px', cursor: 'pointer',
                  color: 'var(--text-2)', display: 'flex', alignItems: 'center',
                }}>
                <RefreshCw size={10} />
              </button>
            </div>

            <div style={{
              border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
              background: 'var(--bg-0)', minHeight: 200,
            }}>
              <img
                key={screenshotKey}
                src={screenshotUrl}
                alt="Browser preview"
                style={{ display: 'block', width: '100%', height: 'auto' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 14, color: 'var(--text-2)', minHeight: 240,
          }}>
            <Globe size={36} style={{ opacity: 0.18 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Browser is stopped</div>
            <div style={{ fontSize: 11, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
              Click <strong style={{ color: 'var(--green)' }}>START</strong> to launch a controlled Chrome
              instance. The agent can then use{' '}
              <code style={{ background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 4 }}>browser_open</code>,{' '}
              <code style={{ background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 4 }}>browser_click</code>,
              etc.
            </div>
          </div>
        )}
      </div>

      {/* ── Action log ──────────────────────────────────────────────── */}
      {status.running && (
        <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0, maxHeight: 200, display: 'flex', flexDirection: 'column' }}>
          <button type="button" onClick={() => setLogExpanded((v) => !v)}
            style={{
              width: '100%', border: 'none', background: 'var(--bg-2)',
              color: 'var(--text-0)', padding: '6px 12px',
              display: 'flex', alignItems: 'center', gap: 6,
              cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)',
            }}>
            {logExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Activity size={11} color="var(--accent)" />
            ACTION LOG
            <span style={{ marginLeft: 'auto', color: 'var(--text-2)', fontSize: 9 }}>
              {actions.length} entries
            </span>
          </button>
          {logExpanded && (
            <div style={{ overflowY: 'auto', padding: '6px 12px', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              {actions.length === 0 ? (
                <div style={{ color: 'var(--text-2)', padding: '6px 0' }}>No actions yet…</div>
              ) : (
                actions.slice(-30).map((entry, i) => {
                  const color = KIND_COLORS[entry.kind] || 'var(--text-1)'
                  const detailStr = Object.entries(entry.detail || {})
                    .filter(([k]) => k !== 'preview')
                    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
                    .slice(0, 3)
                    .join(' ')
                  return (
                    <div key={`${entry.ts}-${i}`} style={{
                      display: 'flex', gap: 6, padding: '2px 0',
                      borderBottom: '1px solid var(--bg-2)',
                    }}>
                      <span style={{ color, minWidth: 60 }}>{entry.kind}</span>
                      <span style={{ color: 'var(--text-0)', minWidth: 80 }}>{entry.action}</span>
                      <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {detailStr}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: 'var(--bg-2)',
    border: `1px solid ${color}`,
    color,
    borderRadius: 7,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }
}
