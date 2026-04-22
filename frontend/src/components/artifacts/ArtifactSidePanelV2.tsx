import { useEffect, useMemo, useState } from 'react'
import { Code, Copy, Download, Eye, FileArchive, Link2, Monitor, Share2, Smartphone, SplitSquareHorizontal, Tablet, X } from 'lucide-react'
import { ArtifactV2, useChatStore } from '../../store/chatStore'
import { ArtifactRuntime, canLivePreview } from './ArtifactRuntime'
import { CodeRuntime } from './CodeRuntime'
import { DiffView } from './DiffView'
import { FileTree } from './FileTree'
import { VersionSwitcher } from './VersionSwitcher'
import { downloadArtifactAsZip, downloadArtifactFile } from '../../lib/artifacts/download'
import { buildApiHeaders } from '../../lib/api'

type DeviceMode = 'desktop' | 'tablet' | 'mobile'
type Tab = 'code' | 'preview' | 'split'

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

type Props = {
  artifactId: string
  onClose: () => void
}

export function ArtifactSidePanelV2({ artifactId, onClose }: Props) {
  const sessionArtifacts = useChatStore((s) => s.sessionArtifacts)
  const sessionId = useChatStore((s) => s.sessionId)

  const versions = sessionArtifacts[artifactId] || []
  const [activeVersion, setActiveVersion] = useState<number>(versions[versions.length - 1]?.version ?? 1)
  const [tab, setTab] = useState<Tab>('preview')
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [diffMode, setDiffMode] = useState(false)
  const [activeFile, setActiveFile] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [shareStatus, setShareStatus] = useState<string>('')
  const [allowForms, setAllowForms] = useState(false)
  const [allowPopups, setAllowPopups] = useState(false)

  useEffect(() => {
    // When the artifact gets a new version, jump to it.
    const latest = versions[versions.length - 1]
    if (latest && latest.version > activeVersion) {
      setActiveVersion(latest.version)
    }
  }, [versions.length, activeVersion, versions])

  const artifact: ArtifactV2 | undefined = useMemo(
    () => versions.find((v) => v.version === activeVersion) || versions[versions.length - 1],
    [versions, activeVersion],
  )

  useEffect(() => {
    if (!artifact) return
    const currentExists = artifact.files.some((f) => f.path === activeFile)
    if (!currentExists) {
      setActiveFile(artifact.entrypoint || artifact.files[0]?.path || '')
    }
  }, [artifact, activeFile])

  if (!artifact) {
    return (
      <div style={{ padding: 16, color: 'var(--text-2)' }}>
        Artifact no longer available.
        <button type="button" onClick={onClose} style={{ marginLeft: 8 }}>Close</button>
      </div>
    )
  }

  const canPreview = canLivePreview(artifact.type)
  const activeTab: Tab = canPreview ? tab : 'code'

  const previousVersion = versions.find((v) => v.version === activeVersion - 1)
  const currentFile = artifact.files.find((f) => f.path === activeFile) || artifact.files[0]
  const previousFile = previousVersion?.files.find((f) => f.path === currentFile.path) || previousVersion?.files[0]
  const showDiff = diffMode && previousVersion !== undefined

  const exceedsSizeLimit = artifact.files.reduce((acc, f) => acc + (f.content?.length || 0), 0) > 2 * 1024 * 1024

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(currentFile.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  async function share() {
    if (!sessionId) {
      setShareStatus('No session')
      return
    }
    setShareStatus('Creating link...')
    try {
      const res = await fetch(`/api/collab/sessions/${encodeURIComponent(sessionId)}/share`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const token = String(data.token || '').trim()
      if (!token) throw new Error('no-token')
      if (!artifact) throw new Error('no-artifact')
      const url = `${window.location.origin}/shared-artifact/${encodeURIComponent(sessionId)}/${encodeURIComponent(artifact.id)}?token=${encodeURIComponent(token)}&version=${artifact.version}`
      await navigator.clipboard.writeText(url)
      setShareStatus('Link copied')
      setTimeout(() => setShareStatus(''), 2500)
    } catch (err) {
      setShareStatus(`Share failed: ${String(err).slice(0, 60)}`)
      setTimeout(() => setShareStatus(''), 4000)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-1)',
      borderLeft: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        height: 44,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-0)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          paddingRight: 6,
          borderRight: '1px solid var(--border)',
        }}>
          ARTIFACT
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {artifact.title}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
          ({artifact.type})
        </span>
        <div style={{ flex: 1 }} />
        <VersionSwitcher
          versions={versions}
          activeVersion={activeVersion}
          onSelect={setActiveVersion}
          diffMode={diffMode}
          onToggleDiff={() => setDiffMode((d) => !d)}
        />
        <button type="button" onClick={copyCode} style={iconBtn()} title="Copy current file">
          <Copy size={13} />
          <span style={{ fontSize: 10 }}>{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <button type="button" onClick={() => downloadArtifactFile(currentFile)} style={iconBtn()} title="Download file">
          <Download size={13} />
        </button>
        {artifact.files.length > 1 && (
          <button type="button" onClick={() => downloadArtifactAsZip(artifact)} style={iconBtn()} title="Download bundle as ZIP">
            <FileArchive size={13} />
            <span style={{ fontSize: 10 }}>ZIP</span>
          </button>
        )}
        <button type="button" onClick={share} style={iconBtn()} title="Share link">
          {shareStatus ? <Link2 size={13} /> : <Share2 size={13} />}
          {shareStatus && <span style={{ fontSize: 9, color: 'var(--text-2)' }}>{shareStatus}</span>}
        </button>
        <button type="button" onClick={onClose} style={iconBtn()} title="Close panel">
          <X size={14} />
        </button>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: 6,
      }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" style={tabBtn(activeTab === 'code')} onClick={() => setTab('code')}>
            <Code size={11} /> Code
          </button>
          {canPreview && !exceedsSizeLimit && (
            <>
              <button type="button" style={tabBtn(activeTab === 'preview')} onClick={() => setTab('preview')}>
                <Eye size={11} /> Preview
              </button>
              <button type="button" style={tabBtn(activeTab === 'split')} onClick={() => setTab('split')}>
                <SplitSquareHorizontal size={11} /> Split
              </button>
            </>
          )}
        </div>

        {canPreview && (activeTab === 'preview' || activeTab === 'split') && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <label style={{ fontSize: 10, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <input type="checkbox" checked={allowForms} onChange={(e) => setAllowForms(e.target.checked)} />
              forms
            </label>
            <label style={{ fontSize: 10, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <input type="checkbox" checked={allowPopups} onChange={(e) => setAllowPopups(e.target.checked)} />
              popups
            </label>
            {(['desktop', 'tablet', 'mobile'] as DeviceMode[]).map((d) => (
              <button
                key={d}
                type="button"
                title={d}
                onClick={() => setDevice(d)}
                style={tabBtn(device === d)}
              >
                {d === 'desktop' && <Monitor size={11} />}
                {d === 'tablet' && <Tablet size={11} />}
                {d === 'mobile' && <Smartphone size={11} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: activeTab === 'split' ? 'row' : 'column',
        overflow: 'hidden',
      }}>
        {(activeTab === 'code' || activeTab === 'split') && (
          <div style={{
            flex: activeTab === 'split' ? '0 0 50%' : 1,
            display: 'flex',
            borderRight: activeTab === 'split' ? '1px solid var(--border)' : 'none',
            overflow: 'hidden',
          }}>
            <FileTree
              files={artifact.files}
              activePath={activeFile}
              entrypoint={artifact.entrypoint}
              onSelect={setActiveFile}
            />
            <div style={{ flex: 1, overflow: 'auto' }}>
              {showDiff && previousFile ? (
                <DiffView before={previousFile.content} after={currentFile.content} filename={currentFile.path} />
              ) : (
                <CodeRuntime artifact={artifact} activeFile={activeFile} />
              )}
            </div>
          </div>
        )}

        {(activeTab === 'preview' || activeTab === 'split') && canPreview && !exceedsSizeLimit && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: device !== 'desktop' ? '#e8e8e8' : '#f5f5f5',
            overflow: 'hidden',
            padding: device !== 'desktop' ? '20px 16px' : 0,
          }}>
            <div style={{
              width: DEVICE_WIDTHS[device],
              height: '100%',
              boxShadow: device !== 'desktop' ? '0 8px 40px rgba(0,0,0,0.22)' : 'none',
              borderRadius: device !== 'desktop' ? 12 : 0,
              border: device !== 'desktop' ? '1px solid #ccc' : 'none',
              overflow: 'hidden',
              background: '#fff',
              transition: 'width 0.25s ease',
            }}>
              <ArtifactRuntime
                key={`${artifact.id}-${artifact.version}`}
                artifact={artifact}
                allowForms={allowForms}
                allowPopups={allowPopups}
              />
            </div>
          </div>
        )}

        {exceedsSizeLimit && (
          <div style={{ padding: 20, color: 'var(--text-2)' }}>
            Artifact exceeds the 2&nbsp;MB preview cap. Use the Download button to get the full bundle.
          </div>
        )}
      </div>
    </div>
  )
}

function tabBtn(active: boolean) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 9px',
    borderRadius: 6,
    border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
    background: active ? 'var(--bg-3)' : 'transparent',
    color: active ? 'var(--text-0)' : 'var(--text-2)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }
}

function iconBtn() {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text-2)' as const,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
  }
}
