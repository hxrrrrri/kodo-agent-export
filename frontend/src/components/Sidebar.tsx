import { useEffect } from 'react'
import { Plus, Trash2, MessageSquare, Cpu } from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { Session } from '../store/chatStore'

export function Sidebar() {
  const { sessions, sessionId, loadSessions, loadSession, newSession, deleteSession } = useChat()

  useEffect(() => {
    loadSessions()
  }, [])

  const handleNew = async () => {
    await newSession()
  }

  const formatDate = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

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

      {/* Sessions list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 8px',
      }}>
        {sessions.length === 0 && (
          <div style={{ padding: '16px 8px', color: 'var(--text-2)', fontSize: 12, textAlign: 'center' }}>
            No sessions yet.<br />Start a conversation.
          </div>
        )}
        {sessions.map((session: Session) => (
          <SessionItem
            key={session.session_id}
            session={session}
            active={session.session_id === sessionId}
            onSelect={() => loadSession(session.session_id)}
            onDelete={() => deleteSession(session.session_id)}
            formatDate={formatDate}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        color: 'var(--text-2)',
        letterSpacing: '0.05em',
      }}>
        <div>POWERED BY CLAUDE API</div>
        <div style={{ marginTop: 2, color: 'var(--accent)', opacity: 0.6 }}>v1.0.0</div>
      </div>
    </aside>
  )
}

function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
  formatDate,
}: {
  session: Session
  active: boolean
  onSelect: () => void
  onDelete: () => void
  formatDate: (d: string) => string
}) {
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
        <div className="truncate" style={{ fontSize: 12, color: active ? 'var(--text-0)' : 'var(--text-1)' }}>
          {session.title || 'Untitled'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>
          {formatDate(session.updated_at)} · {session.message_count} msgs
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
