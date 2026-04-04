import { useEffect, useRef, useState } from 'react'
import { Terminal, FileText, Search, Globe, ChevronDown, ChevronRight, CheckCircle, XCircle, Loader } from 'lucide-react'
import { ToolCall } from '../store/chatStore'

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

const TOOL_ICONS: Record<string, React.ReactNode> = {
  bash: <Terminal size={13} />,
  file_read: <FileText size={13} />,
  file_write: <FileText size={13} />,
  file_edit: <FileText size={13} />,
  grep: <Search size={13} />,
  glob: <Search size={13} />,
  web_fetch: <Globe size={13} />,
  mcp_tool_call: <Terminal size={13} />,
}

const TOOL_COLORS: Record<string, string> = {
  bash: 'var(--yellow)',
  file_read: 'var(--blue)',
  file_write: 'var(--accent)',
  file_edit: 'var(--accent)',
  grep: 'var(--green)',
  glob: 'var(--green)',
  web_fetch: 'var(--blue)',
  mcp_tool_call: 'var(--blue)',
}

function getInputPreview(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'bash': return String(input.command || '')
    case 'file_read': return String(input.path || '')
    case 'file_write': return String(input.path || '')
    case 'file_edit': return String(input.path || '')
    case 'grep': return `"${input.pattern}" in ${input.path || '.'}`
    case 'glob': return String(input.pattern || '')
    case 'web_fetch': return String(input.url || '')
    case 'mcp_tool_call': return `${String(input.server_name || '')}:${String(input.tool_name || '')}`
    default: return JSON.stringify(input).slice(0, 60)
  }
}

function getDiffText(tc: ToolCall): string {
  const value = tc.metadata?.diff
  return typeof value === 'string' ? value : ''
}

function renderDiff(diffText: string): JSX.Element | null {
  const lines = diffText.split('\n')
  if (lines.length === 0) return null

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      background: 'var(--bg-0)',
      maxHeight: 260,
      overflow: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      lineHeight: 1.45,
    }}>
      {lines.map((line, index) => {
        let background = 'transparent'
        let color = 'var(--text-1)'
        if (line.startsWith('+') && !line.startsWith('+++')) {
          background = 'rgba(0,255,136,0.08)'
          color = 'var(--green)'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          background = 'rgba(255,59,59,0.12)'
          color = 'var(--red)'
        } else if (line.startsWith('@@')) {
          background = 'rgba(77,166,255,0.12)'
          color = 'var(--blue)'
        }

        return (
          <div
            key={`${line}-${index}`}
            style={{
              background,
              color,
              padding: '2px 8px',
              whiteSpace: 'pre',
            }}
          >
            {line || ' '}
          </div>
        )
      })}
    </div>
  )
}

export function ToolCallCard({ tc, isLast, searchQuery }: { tc: ToolCall; isLast: boolean; searchQuery?: string }) {
  const [expanded, setExpanded] = useState(false)
  const liveOutputRef = useRef<HTMLDivElement>(null)
  const color = TOOL_COLORS[tc.tool] || 'var(--text-1)'
  const icon = TOOL_ICONS[tc.tool] || <Terminal size={13} />
  const preview = getInputPreview(tc.tool, tc.input)
  const diffText = getDiffText(tc)
  const normalizedSearch = (searchQuery || '').trim().toLowerCase()
  const searchMatch = Boolean(
    normalizedSearch && (
      preview.toLowerCase().includes(normalizedSearch) ||
      String(tc.output || '').toLowerCase().includes(normalizedSearch)
    )
  )
  const hasResult = tc.output !== undefined
  const isRunning = !hasResult && isLast
  const showLiveOutput = isRunning && Boolean(tc.streamLines && tc.streamLines.length > 0)
  const generatedImageUrl = tc.tool === 'image_gen' && typeof tc.metadata?.url === 'string'
    ? String(tc.metadata.url)
    : ''

  useEffect(() => {
    if (!showLiveOutput || !liveOutputRef.current) return
    liveOutputRef.current.scrollTop = liveOutputRef.current.scrollHeight
  }, [showLiveOutput, tc.streamLines?.length])

  return (
    <div
      className="fade-in"
      style={{
        margin: '6px 0',
        borderRadius: 'var(--radius)',
        border: `1px solid ${searchMatch ? 'var(--yellow)' : 'var(--border)'}`,
        background: 'var(--bg-2)',
        overflow: 'hidden',
        fontSize: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status icon */}
        {isRunning ? (
          <Loader size={13} color="var(--yellow)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        ) : tc.success === false ? (
          <XCircle size={13} color="var(--red)" style={{ flexShrink: 0 }} />
        ) : hasResult ? (
          <CheckCircle size={13} color="var(--green)" style={{ flexShrink: 0 }} />
        ) : (
          <div style={{ width: 13, height: 13, flexShrink: 0 }} />
        )}

        {/* Tool name badge */}
        <div style={{
          color,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontWeight: 600,
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          {icon}
          {tc.tool.toUpperCase()}
        </div>

        {/* Preview */}
        <div className="truncate" style={{ flex: 1, color: 'var(--text-1)', opacity: 0.8 }}>
          {preview}
        </div>

        {/* Expand toggle */}
        {hasResult && (
          expanded
            ? <ChevronDown size={13} color="var(--text-2)" style={{ flexShrink: 0 }} />
            : <ChevronRight size={13} color="var(--text-2)" style={{ flexShrink: 0 }} />
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div>
          {/* Input */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em', marginBottom: 4 }}>INPUT</div>
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-1)',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 120,
              overflow: 'auto',
            }}>
              {JSON.stringify(tc.input, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {tc.output && (
            <div style={{ padding: '8px 10px' }}>
              <div style={{
                fontSize: 10,
                color: tc.success === false ? 'var(--red)' : 'var(--text-2)',
                letterSpacing: '0.1em',
                marginBottom: 4,
              }}>
                {tc.success === false ? 'ERROR' : 'OUTPUT'}
              </div>
              <pre style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: tc.success === false ? 'var(--red)' : 'var(--text-0)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 200,
                overflow: 'auto',
              }}>
                {normalizedSearch
                  ? renderHighlightedText(tc.output, normalizedSearch)
                  : tc.output}
              </pre>
            </div>
          )}

          {diffText && (
            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
              <div style={{
                fontSize: 10,
                color: 'var(--text-2)',
                letterSpacing: '0.1em',
                marginBottom: 6,
              }}>
                DIFF
              </div>
              {renderDiff(diffText)}
            </div>
          )}
        </div>
      )}

      {showLiveOutput && (
        <div style={{ padding: '0 10px 10px' }}>
          <div
            ref={liveOutputRef}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              background: 'var(--bg-0)',
              color: 'var(--text-1)',
              padding: 8,
              borderRadius: 'var(--radius)',
              maxHeight: 200,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <div>&gt; {preview}</div>
            {tc.streamLines?.map((line, idx) => (
              <div key={`${line}-${idx}`}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {generatedImageUrl && (
        <div style={{ padding: '0 10px 10px' }}>
          <img
            src={generatedImageUrl}
            alt="Generated image"
            style={{
              maxWidth: '100%',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              marginTop: 8,
            }}
          />
        </div>
      )}
    </div>
  )
}
