import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, MessageSquare, Cpu, Save, RotateCcw, Sun, Moon } from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { Session } from '../store/chatStore'
import { clearApiAuthToken, getApiAuthToken, setApiAuthToken } from '../lib/api'
import { ProviderPanel } from './ProviderPanel'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderHighlightedText(text: string, query: string): JSX.Element {
  const trimmed = query.trim()
  if (!trimmed) {
    return <>{text}</>
  }

  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, idx) => {
        if (part.toLowerCase() === trimmed.toLowerCase()) {
          return (
            <mark
              key={`${part}-${idx}`}
              style={{
                background: 'var(--yellow-dim)',
                color: 'var(--yellow)',
                padding: '0 1px',
                borderRadius: 2,
              }}
            >
              {part}
            </mark>
          )
        }
        return <span key={`${part}-${idx}`}>{part}</span>
      })}
    </>
  )
}

export function Sidebar() {
  const {
    sessions,
    sessionId,
    loadModes,
    loadSessions,
    loadSession,
    newSession,
    deleteSession,
    loadUsage,
    usageSummary,
    checkpoints,
    loadCheckpoints,
    createCheckpoint,
    restoreCheckpoint,
    updateSessionTitle,
    theme,
    setTheme,
    searchQuery,
  } = useChat()
  const [tokenDraft, setTokenDraft] = useState('')
  const [tokenSaved, setTokenSaved] = useState(false)
  const [checkpointLabel, setCheckpointLabel] = useState('')
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<'sessions' | 'providers'>('sessions')

  useEffect(() => {
    loadModes()
    loadSessions()
    loadUsage()
    setTokenDraft(getApiAuthToken())
    const savedTheme = window.localStorage.getItem('kodo_theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme)
    }
  }, [])

  useEffect(() => {
    if (sessionId) {
      void loadCheckpoints(sessionId)
    } else {
      void loadCheckpoints(null)
    }
  }, [sessionId])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('kodo_theme', theme)
  }, [theme])

  const handleNew = async () => {
    await newSession()
  }

  const handleCreateCheckpoint = async () => {
    if (!sessionId || checkpointBusy) return
    setCheckpointBusy(true)
    await createCheckpoint(checkpointLabel || undefined, sessionId)
    setCheckpointLabel('')
    setCheckpointBusy(false)
  }

  const handleRestoreCheckpoint = async (checkpointId: string) => {
    if (!sessionId || checkpointBusy) return
    const confirmed = window.confirm(`Restore checkpoint ${checkpointId}? This replaces current session history.`)
    if (!confirmed) return
    setCheckpointBusy(true)
    await restoreCheckpoint(checkpointId, sessionId)
    setCheckpointBusy(false)
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const formatDate = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const saveToken = () => {
    setApiAuthToken(tokenDraft)
    setTokenSaved(true)
    window.setTimeout(() => setTokenSaved(false), 1500)
    loadSessions()
  }

  const clearToken = () => {
    clearApiAuthToken()
    setTokenDraft('')
    loadSessions()
  }

  const usageCost = usageSummary?.totals.cost_usd_total ?? usageSummary?.totals.estimated_cost_usd ?? 0
  const usageInput = usageSummary?.totals.input_tokens ?? 0
  const usageOutput = usageSummary?.totals.output_tokens ?? 0
  const normalizedSearch = searchQuery.trim().toLowerCase()

  const visibleSessions = useMemo(() => {
    if (!normalizedSearch) return sessions
    return sessions.filter((session) => {
      const title = (session.title || '').toLowerCase()
      const sessionKey = session.session_id.toLowerCase()
      return title.includes(normalizedSearch) || sessionKey.includes(normalizedSearch)
    })
  }, [sessions, normalizedSearch])

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      minWidth: 'var(--sidebar-width)',
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 32, height: 32,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 2,
        }}>
          <Cpu size={18} color="#0a0a0b" strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px' }}>
            KŌDO
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.15em' }}>
            AUTONOMOUS AGENT
          </div>
        </div>
      </div>

      {/* New chat button */}
      <div style={{ padding: '12px 12px 8px' }}>
        <button
          onClick={handleNew}
          style={{
            width: '100%',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            padding: '8px 12px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--accent)'
            ;(e.currentTarget as HTMLElement).style.color = '#0a0a0b'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--accent-dim)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--accent)'
          }}
        >
          <Plus size={14} />
          NEW SESSION
        </button>
      </div>

      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
        <button
          onClick={() => setActiveTab('sessions')}
          style={{
            flex: 1,
            background: activeTab === 'sessions' ? 'var(--bg-3)' : 'var(--bg-2)',
            border: `1px solid ${activeTab === 'sessions' ? 'var(--border-bright)' : 'var(--border)'}`,
            color: activeTab === 'sessions' ? 'var(--text-0)' : 'var(--text-1)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
          }}
        >
          SESSIONS
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          style={{
            flex: 1,
            background: activeTab === 'providers' ? 'var(--bg-3)' : 'var(--bg-2)',
            border: `1px solid ${activeTab === 'providers' ? 'var(--border-bright)' : 'var(--border)'}`,
            color: activeTab === 'providers' ? 'var(--text-0)' : 'var(--text-1)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
          }}
        >
          PROVIDERS
        </button>
      </div>

      {/* Sessions list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: activeTab === 'sessions' ? '4px 8px' : '0',
      }}>
        {activeTab === 'sessions' && (
          <>
            {sessions.length === 0 && (
              <div style={{ padding: '16px 8px', color: 'var(--text-2)', fontSize: 12, textAlign: 'center' }}>
                No sessions yet.<br />Start a conversation.
              </div>
            )}
            {sessions.length > 0 && normalizedSearch && visibleSessions.length === 0 && (
              <div style={{ padding: '12px 8px', color: 'var(--text-2)', fontSize: 11, textAlign: 'center' }}>
                No sessions match "{searchQuery.trim()}".
              </div>
            )}
            {visibleSessions.map((session: Session) => (
              <SessionItem
                key={session.session_id}
                session={session}
                active={session.session_id === sessionId}
                onSelect={() => loadSession(session.session_id)}
                onDelete={() => deleteSession(session.session_id)}
                onRename={(title) => updateSessionTitle(session.session_id, title)}
                formatDate={formatDate}
                searchQuery={searchQuery}
              />
            ))}

            {sessionId && (
              <div style={{
                marginTop: 8,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-2)',
                padding: '8px',
                display: 'grid',
                gap: 8,
              }}>
                <div style={{
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: 'var(--text-2)',
                }}>
                  CHECKPOINTS
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={checkpointLabel}
                    onChange={(event) => setCheckpointLabel(event.target.value)}
                    placeholder="checkpoint label"
                    style={{
                      flex: 1,
                      background: 'var(--bg-0)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-0)',
                      borderRadius: 'var(--radius)',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      padding: '6px 8px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleCreateCheckpoint}
                    disabled={checkpointBusy}
                    style={{
                      border: '1px solid var(--accent)',
                      background: 'var(--accent-dim)',
                      color: 'var(--accent)',
                      borderRadius: 'var(--radius)',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      padding: '6px 8px',
                      cursor: checkpointBusy ? 'wait' : 'pointer',
                    }}
                    title="Create checkpoint"
                  >
                    <Save size={12} />
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 4, maxHeight: 170, overflowY: 'auto' }}>
                  {checkpoints.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>No checkpoints yet.</div>
                  )}
                  {checkpoints.map((checkpoint) => (
                    <div
                      key={checkpoint.checkpoint_id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg-3)',
                        padding: '6px 8px',
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--text-1)' }}>
                        {checkpoint.label || checkpoint.checkpoint_id}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-2)' }}>
                        {formatDate(checkpoint.created_at)} · {checkpoint.message_count} msgs
                      </div>
                      <button
                        onClick={() => handleRestoreCheckpoint(checkpoint.checkpoint_id)}
                        disabled={checkpointBusy}
                        style={{
                          border: '1px solid var(--blue)',
                          background: 'var(--blue-dim)',
                          color: 'var(--blue)',
                          borderRadius: 'var(--radius)',
                          fontSize: 9,
                          fontFamily: 'var(--font-mono)',
                          padding: '4px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          cursor: checkpointBusy ? 'wait' : 'pointer',
                        }}
                      >
                        <RotateCcw size={11} />
                        RESTORE
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'providers' && <ProviderPanel />}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        display: 'grid',
        gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.05em', marginBottom: 6 }}>
            API AUTH TOKEN
          </div>
          <input
            type="password"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder="optional bearer token"
            style={{
              width: '100%',
              background: 'var(--bg-0)',
              border: '1px solid var(--border)',
              color: 'var(--text-0)',
              borderRadius: 'var(--radius)',
              padding: '6px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              onClick={saveToken}
              style={{
                flex: 1,
                background: 'var(--accent-dim)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                padding: '5px 8px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {tokenSaved ? 'SAVED' : 'SAVE'}
            </button>
            <button
              onClick={clearToken}
              style={{
                flex: 1,
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                padding: '5px 8px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
            >
              CLEAR
            </button>
          </div>
        </div>

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '8px 10px',
          background: 'var(--bg-2)',
          fontSize: 10,
          color: 'var(--text-2)',
          letterSpacing: '0.03em',
          lineHeight: 1.5,
        }}>
          <div style={{ color: 'var(--text-1)', marginBottom: 4 }}>USAGE (7D)</div>
          <div>Cost: ${usageCost.toFixed(4)}</div>
          <div>In: {usageInput.toLocaleString()} tok</div>
          <div>Out: {usageOutput.toLocaleString()} tok</div>
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.05em' }}>
          <div>POWERED BY CLAUDE API</div>
          <div style={{ marginTop: 2, color: 'var(--accent)', opacity: 0.6 }}>v1.2.0</div>
        </div>

        <button
          onClick={toggleTheme}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-2)',
            color: 'var(--text-1)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            letterSpacing: '0.07em',
          }}
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          {theme === 'dark' ? 'LIGHT THEME' : 'DARK THEME'}
        </button>
      </div>
    </aside>
  )
}

function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
  onRename,
  formatDate,
  searchQuery,
}: {
  session: Session
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
  formatDate: (d: string) => string
  searchQuery: string
}) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(session.title || 'Untitled')

  useEffect(() => {
    setDraftTitle(session.title || 'Untitled')
  }, [session.title])

  const submitRename = () => {
    const next = draftTitle.trim()
    if (!next || next === session.title) {
      setEditing(false)
      return
    }
    onRename(next)
    setEditing(false)
  }

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        marginBottom: 2,
        background: active ? 'var(--bg-3)' : 'transparent',
        border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        transition: 'all 0.1s',
        animation: 'slideIn 0.15s ease',
      }}
      onClick={onSelect}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <MessageSquare size={13} color={active ? 'var(--accent)' : 'var(--text-2)'} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {!editing ? (
          <div
            className="truncate"
            style={{ fontSize: 12, color: active ? 'var(--text-0)' : 'var(--text-1)' }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              setEditing(true)
            }}
            title="Double-click to rename"
          >
            {searchQuery.trim()
              ? renderHighlightedText(session.title || 'Untitled', searchQuery)
              : (session.title || 'Untitled')}
          </div>
        ) : (
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submitRename()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setEditing(false)
                setDraftTitle(session.title || 'Untitled')
              }
            }}
            onBlur={submitRename}
            autoFocus
            style={{
              width: '100%',
              background: 'var(--bg-0)',
              border: '1px solid var(--accent)',
              borderRadius: 3,
              color: 'var(--text-0)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 5px',
              outline: 'none',
            }}
          />
        )}
        <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>
          {formatDate(session.updated_at)} · {session.message_count} msgs{session.mode ? ` · ${session.mode}` : ''}
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-2)', padding: 2, borderRadius: 2,
          opacity: 0, transition: 'opacity 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.color = 'var(--red)'
          ;(e.currentTarget as HTMLElement).style.opacity = '1'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
          ;(e.currentTarget as HTMLElement).style.opacity = '0'
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
