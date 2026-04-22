import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { ArtifactRuntime, canLivePreview } from '../components/artifacts/ArtifactRuntime'
import { ArtifactV2 } from '../lib/artifacts/types'
import { CodeRuntime } from '../components/artifacts/CodeRuntime'
import { FileTree } from '../components/artifacts/FileTree'

type ParsedRoute = {
  sessionId: string
  artifactId: string
  token: string
  version: number | null
}

/**
 * Parses /shared-artifact/<session_id>/<artifact_id>?token=...&version=...
 * from the current window location. No router dependency.
 */
export function parseSharedRoute(href: string): ParsedRoute | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const match = url.pathname.match(/^\/shared-artifact\/([^/]+)\/([^/]+)\/?$/)
  if (!match) return null
  const token = url.searchParams.get('token') || ''
  if (!token) return null
  const rawVersion = url.searchParams.get('version')
  const version = rawVersion ? parseInt(rawVersion, 10) : null
  return {
    sessionId: decodeURIComponent(match[1]),
    artifactId: decodeURIComponent(match[2]),
    token,
    version: Number.isFinite(version) ? version : null,
  }
}

type Props = {
  route: ParsedRoute
}

export function SharedArtifactPage({ route }: Props) {
  const [artifact, setArtifact] = useState<ArtifactV2 | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFile, setActiveFile] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams({ token: route.token })
        if (route.version !== null) qs.set('version', String(route.version))
        const res = await fetch(
          `/api/artifacts/shared/${encodeURIComponent(route.sessionId)}/${encodeURIComponent(route.artifactId)}?${qs.toString()}`,
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(String(body.detail || `HTTP ${res.status}`))
        }
        const data = await res.json()
        if (cancelled) return
        const a = data.artifact as ArtifactV2
        setArtifact(a)
        setActiveFile(a.entrypoint || a.files[0]?.path || '')
      } catch (err) {
        if (!cancelled) setError(String((err as Error).message || err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [route.sessionId, route.artifactId, route.token, route.version])

  const preview = useMemo(() => {
    if (!artifact) return null
    return canLivePreview(artifact.type) ? <ArtifactRuntime artifact={artifact} /> : null
  }, [artifact])

  if (loading) {
    return (
      <div style={fullscreenCenterStyle}>
        <Loader2 className="spin" size={24} />
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>Loading artifact…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={fullscreenCenterStyle}>
        <AlertCircle size={28} color="var(--red)" />
        <div style={{ marginTop: 12, fontSize: 14 }}>Could not load artifact</div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{error}</div>
      </div>
    )
  }

  if (!artifact) return null

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-1)' }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-0)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
        }}>SHARED · READ-ONLY</span>
        <span style={{ fontSize: 14, color: 'var(--text-0)' }}>{artifact.title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
          v{artifact.version} · {artifact.type}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {preview && (
          <div style={{ flex: 1, borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
            {preview}
          </div>
        )}
        <div style={{
          width: preview ? 420 : '100%',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}>
          <FileTree
            files={artifact.files}
            activePath={activeFile}
            entrypoint={artifact.entrypoint}
            onSelect={setActiveFile}
          />
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CodeRuntime artifact={artifact} activeFile={activeFile} />
          </div>
        </div>
      </div>
    </div>
  )
}

const fullscreenCenterStyle = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  background: 'var(--bg-1)',
  color: 'var(--text-0)',
}
