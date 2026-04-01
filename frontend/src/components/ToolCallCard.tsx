import { useState } from 'react'
import { Terminal, FileText, Search, Globe, ChevronDown, ChevronRight, CheckCircle, XCircle, Loader } from 'lucide-react'
import { ToolCall } from '../store/chatStore'

const TOOL_ICONS: Record<string, React.ReactNode> = {
  bash: <Terminal size={13} />,
  file_read: <FileText size={13} />,
  file_write: <FileText size={13} />,
  file_edit: <FileText size={13} />,
  grep: <Search size={13} />,
  glob: <Search size={13} />,
  web_fetch: <Globe size={13} />,
}

const TOOL_COLORS: Record<string, string> = {
  bash: 'var(--yellow)',
  file_read: 'var(--blue)',
  file_write: 'var(--accent)',
  file_edit: 'var(--accent)',
  grep: 'var(--green)',
  glob: 'var(--green)',
  web_fetch: 'var(--blue)',
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
    default: return JSON.stringify(input).slice(0, 60)
  }
}

export function ToolCallCard({ tc, isLast }: { tc: ToolCall; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[tc.tool] || 'var(--text-1)'
  const icon = TOOL_ICONS[tc.tool] || <Terminal size={13} />
  const preview = getInputPreview(tc.tool, tc.input)
  const hasResult = tc.output !== undefined
  const isRunning = !hasResult && isLast

  return (
    <div
      className="fade-in"
      style={{
        margin: '6px 0',
        borderRadius: 'var(--radius)',
        border: `1px solid var(--border)`,
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
                {tc.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
