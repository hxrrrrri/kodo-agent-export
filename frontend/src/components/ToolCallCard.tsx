import { useState } from 'react'
import { ToolCall } from '../store/chatStore'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSearchTokens(query: string): string[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

  return Array.from(new Set(tokens)).sort((a, b) => b.length - a.length)
}

function renderHighlightedText(text: string, query: string): JSX.Element {
  const tokens = buildSearchTokens(query)
  if (tokens.length === 0) {
    return <>{text}</>
  }

  const tokenSet = new Set(tokens.map((token) => token.toLowerCase()))
  const pattern = new RegExp(`(${tokens.map((token) => escapeRegExp(token)).join('|')})`, 'ig')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, idx) => {
        if (tokenSet.has(part.toLowerCase())) {
          return (
            <mark
              key={`${part}-${idx}`}
              style={{
                background: 'var(--accent-dim)',
                color: 'var(--text-0)',
                border: '1px solid var(--accent)',
                padding: '0 2px',
                borderRadius: 3,
                boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
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

const TOOL_COLORS: Record<string, string> = {
  bash: 'var(--yellow)',
  file_read: 'var(--blue)',
  file_write: 'var(--accent)',
  file_edit: 'var(--accent)',
  grep: 'var(--green)',
  glob: 'var(--green)',
  web_fetch: 'var(--blue)',
  krawlx: 'var(--blue)',
  mcp_tool_call: 'var(--text-2)',
}

function getInputPreview(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'bash': return String(input.command || '').slice(0, 80)
    case 'file_read': return String(input.path || '')
    case 'file_write': return String(input.path || '')
    case 'file_edit': return String(input.path || '')
    case 'grep': return `"${input.pattern}" in ${input.path || '.'}`
    case 'glob': return String(input.pattern || '')
    case 'web_fetch': return String(input.url || '')
    case 'krawlx': return String(input.url || '')
    case 'mcp_tool_call': return `${String(input.server_name || '')}:${String(input.tool_name || '')}`
    default: return JSON.stringify(input).slice(0, 80)
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
      borderRadius: 4,
      background: 'var(--bg-0)',
      maxHeight: 220,
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
            style={{ background, color, padding: '1px 8px', whiteSpace: 'pre' }}
          >
            {line || ' '}
          </div>
        )
      })}
    </div>
  )
}

// Spinner dot animation via inline keyframe trick
function SpinnerDot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        border: `1.5px solid ${color}`,
        borderTopColor: 'transparent',
        flexShrink: 0,
        animation: 'tool-spin 0.7s linear infinite',
      }}
    />
  )
}

export function ToolCallCard({ tc, isLast, searchQuery }: { tc: ToolCall; isLast: boolean; searchQuery?: string }) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[tc.tool] || 'var(--text-2)'
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
  const generatedImageUrl = (() => {
    if (tc.tool === 'image_gen' && typeof tc.metadata?.url === 'string') {
      return String(tc.metadata.url)
    }
    if (tc.tool === 'screenshot' && typeof tc.metadata?.image_base64 === 'string') {
      return `data:image/png;base64,${String(tc.metadata.image_base64)}`
    }
    return ''
  })()

  return (
    <div
      className="fade-in"
      style={{
        margin: '1px 0',
        background: searchMatch ? 'rgba(255,200,0,0.05)' : 'transparent',
        borderRadius: 4,
        borderLeft: searchMatch ? '2px solid var(--yellow)' : '2px solid transparent',
        paddingLeft: searchMatch ? 4 : 0,
      }}
    >
      {/* Compact single-line label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 0',
          cursor: hasResult ? 'pointer' : 'default',
          userSelect: 'none',
          minWidth: 0,
        }}
        onClick={() => hasResult && setExpanded(!expanded)}
        title={hasResult ? (expanded ? 'Collapse' : 'Expand output') : undefined}
      >
        {/* Status indicator */}
        {isRunning ? (
          <SpinnerDot color={color} />
        ) : tc.success === false ? (
          <span style={{ color: 'var(--red)', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✗</span>
        ) : hasResult ? (
          <span style={{ color: 'var(--green)', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>
        ) : (
          <span style={{ display: 'inline-block', width: 7, height: 7 }} />
        )}

        {/* Tool name */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 600,
          color,
          letterSpacing: '0.06em',
          flexShrink: 0,
        }}>
          {tc.tool.toUpperCase()}
        </span>

        {/* Preview text */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}>
          {normalizedSearch ? renderHighlightedText(preview, normalizedSearch) : preview}
        </span>

        {/* Expand hint when there's output */}
        {hasResult && (
          <span style={{ fontSize: 9, color: 'var(--text-2)', opacity: 0.5, flexShrink: 0 }}>
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>

      {/* Expanded details panel */}
      {expanded && hasResult && (
        <div style={{
          marginLeft: 13,
          marginBottom: 4,
          borderLeft: '1px solid var(--border)',
          paddingLeft: 8,
        }}>
          {/* Input */}
          <div style={{
            fontSize: 10,
            color: 'var(--text-2)',
            letterSpacing: '0.08em',
            marginBottom: 2,
            marginTop: 3,
          }}>
            INPUT
          </div>
          <pre style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-1)',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: 80,
            overflow: 'auto',
            margin: 0,
          }}>
            {JSON.stringify(tc.input, null, 2)}
          </pre>

          {/* Output */}
          {tc.output && (
            <>
              <div style={{
                fontSize: 10,
                color: tc.success === false ? 'var(--red)' : 'var(--text-2)',
                letterSpacing: '0.08em',
                marginBottom: 2,
                marginTop: 5,
              }}>
                {tc.success === false ? 'ERROR' : 'OUTPUT'}
              </div>
              <pre style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: tc.success === false ? 'var(--red)' : 'var(--text-0)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 160,
                overflow: 'auto',
                margin: 0,
              }}>
                {normalizedSearch
                  ? renderHighlightedText(tc.output, normalizedSearch)
                  : tc.output}
              </pre>
            </>
          )}

          {/* Diff */}
          {diffText && (
            <>
              <div style={{
                fontSize: 10,
                color: 'var(--text-2)',
                letterSpacing: '0.08em',
                marginBottom: 4,
                marginTop: 5,
              }}>
                DIFF
              </div>
              {renderDiff(diffText)}
            </>
          )}

          {/* Generated image */}
          {generatedImageUrl && (
            <img
              src={generatedImageUrl}
              alt="Generated"
              style={{
                maxWidth: '100%',
                borderRadius: 4,
                border: '1px solid var(--border)',
                marginTop: 6,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
