import { useState } from 'react'
import { X, Copy, Download, Code, Eye, Monitor, Tablet, Smartphone, SplitSquareHorizontal } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ArtifactItem } from '../store/chatStore'

type DeviceMode = 'desktop' | 'tablet' | 'mobile'
type Tab = 'code' | 'preview' | 'split'

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

const PREVIEWABLE = new Set(['html', 'svg', 'css'])

type Props = {
  artifacts: ArtifactItem[]
  onClose: () => void
}

function btn(active: boolean) {
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
    letterSpacing: '0.04em',
  }
}

function iconBtn() {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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

function buildPreviewSrc(artifact: ArtifactItem): string | null {
  const lang = (artifact.language || '').toLowerCase()
  if (lang === 'html') return null // uses srcdoc
  if (lang === 'svg') return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`
  if (lang === 'css') {
    const html = `<!DOCTYPE html><html><head><style>${artifact.content}</style></head><body style="padding:20px;font-family:sans-serif"><h2>CSS Preview</h2><p>Your styles are applied to this page.</p><button>Button</button></body></html>`
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  }
  return null
}

export function ArtifactSidePanel({ artifacts, onClose }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [tab, setTab] = useState<Tab>('code')
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [copied, setCopied] = useState(false)

  const artifact = artifacts[Math.min(activeIdx, artifacts.length - 1)]
  if (!artifact) return null

  const lang = (artifact.language || '').toLowerCase()
  const canPreview = PREVIEWABLE.has(lang)
  const previewSrc = buildPreviewSrc(artifact)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const download = () => {
    const blob = new Blob([artifact.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = artifact.filename || `${artifact.title}.${lang || 'txt'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeTab = canPreview ? tab : 'code'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-1)',
      borderLeft: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        height: 44,
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'var(--bg-0)',
      }}>
        <span style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
          paddingRight: 6,
          borderRight: '1px solid var(--border)',
          marginRight: 2,
        }}>
          ARTIFACT
        </span>

        {/* Artifact tabs */}
        <div style={{ display: 'flex', gap: 3, flex: 1, overflow: 'auto', alignItems: 'center' }}>
          {artifacts.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { setActiveIdx(i); setTab('code') }}
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                border: 'none',
                background: i === activeIdx ? 'var(--accent)' : 'var(--bg-2)',
                color: i === activeIdx ? '#fff' : 'var(--text-1)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {a.filename || a.title}
            </button>
          ))}
        </div>

        <button type="button" onClick={copy} style={iconBtn()} title="Copy">
          <Copy size={13} />
          <span style={{ fontSize: 10 }}>{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <button type="button" onClick={download} style={iconBtn()} title="Download">
          <Download size={13} />
        </button>
        <button type="button" onClick={onClose} style={{ ...iconBtn(), color: 'var(--text-1)' }} title="Close panel">
          <X size={14} />
        </button>
      </div>

      {/* ── Toolbar ── */}
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
          <button type="button" style={btn(activeTab === 'code')} onClick={() => setTab('code')}>
            <Code size={11} /> Code
          </button>
          {canPreview && (
            <>
              <button type="button" style={btn(activeTab === 'preview')} onClick={() => setTab('preview')}>
                <Eye size={11} /> Preview
              </button>
              <button type="button" style={btn(activeTab === 'split')} onClick={() => setTab('split')}>
                <SplitSquareHorizontal size={11} /> Split
              </button>
            </>
          )}
        </div>

        {canPreview && (activeTab === 'preview' || activeTab === 'split') && (
          <div style={{ display: 'flex', gap: 2 }}>
            {(['desktop', 'tablet', 'mobile'] as DeviceMode[]).map((d) => (
              <button
                key={d}
                type="button"
                title={d.charAt(0).toUpperCase() + d.slice(1)}
                onClick={() => setDevice(d)}
                style={btn(device === d)}
              >
                {d === 'desktop' && <Monitor size={11} />}
                {d === 'tablet' && <Tablet size={11} />}
                {d === 'mobile' && <Smartphone size={11} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: activeTab === 'split' ? 'row' : 'column',
        overflow: 'hidden',
      }}>
        {/* Code pane */}
        {(activeTab === 'code' || activeTab === 'split') && (
          <div style={{
            flex: activeTab === 'split' ? '0 0 50%' : 1,
            overflow: 'auto',
            borderRight: activeTab === 'split' ? '1px solid var(--border)' : 'none',
          }}>
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={lang || 'text'}
              PreTag="div"
              customStyle={{
                margin: 0,
                borderRadius: 0,
                background: '#080810',
                fontSize: 12,
                padding: '16px',
                minHeight: '100%',
                lineHeight: 1.6,
              }}
            >
              {artifact.content}
            </SyntaxHighlighter>
          </div>
        )}

        {/* Preview pane */}
        {(activeTab === 'preview' || activeTab === 'split') && canPreview && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            background: device !== 'desktop' ? '#e8e8e8' : '#f5f5f5',
            overflow: 'auto',
            padding: device !== 'desktop' ? '20px 16px' : 0,
          }}>
            {lang === 'html' ? (
              <iframe
                key={`${artifact.id}-${device}-${activeTab}`}
                srcDoc={artifact.content}
                sandbox="allow-scripts allow-same-origin allow-forms"
                style={{
                  width: DEVICE_WIDTHS[device],
                  height: device === 'desktop' ? '100%' : 600,
                  minHeight: 300,
                  border: device !== 'desktop' ? '1px solid #ccc' : 'none',
                  borderRadius: device !== 'desktop' ? 12 : 0,
                  background: '#fff',
                  boxShadow: device !== 'desktop' ? '0 8px 40px rgba(0,0,0,0.22)' : 'none',
                  transition: 'width 0.25s ease',
                  flexShrink: 0,
                }}
                title="Artifact Preview"
              />
            ) : (
              <iframe
                key={`${artifact.id}-${device}`}
                src={previewSrc ?? undefined}
                sandbox="allow-scripts"
                style={{
                  width: DEVICE_WIDTHS[device],
                  height: '100%',
                  border: 'none',
                  background: '#fff',
                }}
                title="Artifact Preview"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
