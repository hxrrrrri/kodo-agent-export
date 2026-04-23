import { useEffect, useState } from 'react'
import { Eye, Grid, Search } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { ArtifactV2 } from '../lib/artifacts/types'
import { buildApiHeaders } from '../lib/api'

type GalleryItem = {
  sessionId: string
  sessionTitle: string
  artifact: ArtifactV2
}

const TYPE_ICONS: Record<string, string> = {
  html: '🌐', react: '⚛️', svg: '🎨', mermaid: '📊',
  markdown: '📝', code: '💻', dot: '🕸️',
  'html-multi': '🌐', 'react-multi': '⚛️',
}

const TYPE_COLOR: Record<string, string> = {
  html: 'var(--accent)', react: '#61dafb', svg: '#ff8c42',
  mermaid: '#9b59b6', markdown: 'var(--text-2)', code: 'var(--green)',
  dot: '#e67e22', 'html-multi': 'var(--accent)', 'react-multi': '#61dafb',
}

export function ArtifactGallery() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const sessions = useChatStore((s) => s.sessions)
  const sessionArtifacts = useChatStore((s) => s.sessionArtifacts)
  const setSelectedArtifactV2 = useChatStore((s) => s.setSelectedArtifactV2)
  const loadSession = useChatStore((s) => s.sessionId)

  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      const allItems: GalleryItem[] = []

      // First: load artifacts already in memory (current session)
      for (const [, versions] of Object.entries(sessionArtifacts)) {
        const latest = versions[versions.length - 1]
        if (latest) {
          const sess = sessions.find((s) => s.session_id === loadSession)
          allItems.push({
            sessionId: loadSession || '',
            sessionTitle: sess?.title || 'Current session',
            artifact: latest,
          })
        }
      }

      // Then: fetch from other sessions (up to 10 most recent)
      const otherSessions = sessions.filter((s) => s.session_id !== loadSession).slice(0, 10)
      for (const sess of otherSessions) {
        try {
          const res = await fetch(`/api/artifacts/${encodeURIComponent(sess.session_id)}`, {
            headers: buildApiHeaders(),
          })
          if (!res.ok) continue
          const data = await res.json()
          const list: any[] = data.artifacts || []
          for (const art of list) {
            const versionsRes = await fetch(
              `/api/artifacts/${encodeURIComponent(sess.session_id)}/${encodeURIComponent(art.id)}`,
              { headers: buildApiHeaders() }
            )
            if (!versionsRes.ok) continue
            const vData = await versionsRes.json()
            const latest = vData.versions?.[vData.versions.length - 1]
            if (latest) {
              allItems.push({
                sessionId: sess.session_id,
                sessionTitle: sess.title || sess.session_id.slice(0, 8),
                artifact: latest as ArtifactV2,
              })
            }
          }
        } catch { /* skip */ }
      }

      setItems(allItems)
      setLoading(false)
    }
    void loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length])

  const types = ['all', ...Array.from(new Set(items.map((i) => i.artifact.type)))]

  const filtered = items.filter((item) => {
    const matchType = typeFilter === 'all' || item.artifact.type === typeFilter
    const q = query.toLowerCase()
    const matchQuery = !q ||
      item.artifact.title.toLowerCase().includes(q) ||
      item.artifact.type.toLowerCase().includes(q) ||
      item.sessionTitle.toLowerCase().includes(q)
    return matchType && matchQuery
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Grid size={13} color="var(--accent)" />
          <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            ARTIFACT GALLERY
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artifacts…"
            style={{
              width: '100%',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              color: 'var(--text-0)',
              padding: '6px 8px 6px 24px',
              fontSize: 11,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Type filter pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              style={{
                background: typeFilter === t ? 'var(--accent-dim)' : 'transparent',
                border: `1px solid ${typeFilter === t ? 'var(--accent)' : 'var(--border)'}`,
                color: typeFilter === t ? 'var(--accent)' : 'var(--text-2)',
                borderRadius: 10,
                padding: '2px 8px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              {t === 'all' ? 'ALL' : t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-2)', fontSize: 12 }}>
            Loading artifacts…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-2)', fontSize: 12 }}>
            {items.length === 0 ? 'No artifacts created yet. Build something with Kodo!' : 'No matches.'}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: 8,
          }}>
            {filtered.map((item) => (
              <button
                key={`${item.sessionId}-${item.artifact.id}-${item.artifact.version}`}
                type="button"
                onClick={() => {
                  setSelectedArtifactV2({ id: item.artifact.id, version: item.artifact.version })
                }}
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-3)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
                  ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                  ;(e.currentTarget as HTMLElement).style.transform = 'none'
                }}
              >
                {/* Type badge + icon */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{TYPE_ICONS[item.artifact.type] || '📄'}</span>
                  <span style={{
                    fontSize: 8,
                    fontFamily: 'var(--font-mono)',
                    color: TYPE_COLOR[item.artifact.type] || 'var(--text-2)',
                    letterSpacing: '0.08em',
                    border: `1px solid ${TYPE_COLOR[item.artifact.type] || 'var(--border)'}`,
                    borderRadius: 4,
                    padding: '1px 4px',
                    opacity: 0.9,
                  }}>
                    {item.artifact.type.replace('-multi', 'M')}
                  </span>
                </div>

                {/* Title */}
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-0)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.artifact.title}
                </div>

                {/* Meta */}
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                  v{item.artifact.version} · {item.artifact.files.length} file{item.artifact.files.length !== 1 ? 's' : ''}
                </div>

                {/* Session */}
                <div style={{
                  fontSize: 9,
                  color: 'var(--text-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.sessionTitle}
                </div>

                {/* Action hint */}
                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  <Eye size={10} color="var(--text-2)" />
                  <span style={{ fontSize: 9, color: 'var(--text-2)' }}>Open</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
