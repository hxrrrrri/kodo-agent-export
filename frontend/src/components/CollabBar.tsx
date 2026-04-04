import { Copy, Share2, Users, Ban } from 'lucide-react'

interface CollabBarProps {
  sessionId: string | null
  observerMode: boolean
  shareUrl: string
  expiresAt: string
  viewerCount: number
  lastEventType: string
  error: string
  onShare: () => void
  onRevoke: () => void
}

export function CollabBar({
  sessionId,
  observerMode,
  shareUrl,
  expiresAt,
  viewerCount,
  lastEventType,
  error,
  onShare,
  onRevoke,
}: CollabBarProps) {
  if (!sessionId) return null

  return (
    <div
      style={{
        padding: '6px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-2)',
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onShare}
          disabled={observerMode}
          style={{
            ...actionButtonStyle,
            cursor: observerMode ? 'not-allowed' : 'pointer',
            opacity: observerMode ? 0.55 : 1,
          }}
        >
          <Share2 size={12} /> SHARE SESSION
        </button>

        <button
          type="button"
          onClick={onRevoke}
          disabled={observerMode}
          style={{
            ...actionButtonStyle,
            cursor: observerMode ? 'not-allowed' : 'pointer',
            opacity: observerMode ? 0.55 : 1,
          }}
        >
          <Ban size={12} /> REVOKE SHARES
        </button>

        <span style={{
          border: '1px solid var(--border)',
          borderRadius: 999,
          padding: '3px 8px',
          fontSize: 10,
          color: observerMode ? 'var(--yellow)' : 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
        }}>
          {observerMode ? 'Observer mode — read only' : 'Driver mode'}
        </span>

        <span style={{
          border: '1px solid var(--border)',
          borderRadius: 999,
          padding: '3px 8px',
          fontSize: 10,
          color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <Users size={11} /> {viewerCount} viewer{viewerCount === 1 ? '' : 's'}
        </span>

        {lastEventType && (
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            Live: {lastEventType}
          </span>
        )}
      </div>

      {shareUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div className="truncate" style={{ flex: 1, fontSize: 11, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
            {shareUrl}
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl)
            }}
            disabled={observerMode}
            aria-label="Copy share URL"
            style={{
              ...actionButtonStyle,
              cursor: observerMode ? 'not-allowed' : 'pointer',
              opacity: observerMode ? 0.55 : 1,
            }}
          >
            <Copy size={12} />
          </button>
          {expiresAt && (
            <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              Expires: {new Date(expiresAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: 'var(--red)' }}>{error}</div>
      )}
    </div>
  )
}

const actionButtonStyle = {
  border: '1px solid var(--border)',
  background: 'var(--bg-3)',
  color: 'var(--text-1)',
  borderRadius: 'var(--radius)',
  padding: '4px 8px',
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}
