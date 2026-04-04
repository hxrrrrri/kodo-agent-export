import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Message } from '../store/chatStore'
import { ToolCallCard } from './ToolCallCard'

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

function extractGeneratedImageUrl(content: string): string | null {
  const match = content.match(/https?:\/\/[^\s]*oaidalleapiprodscus\.blob\.core\.windows\.net[^\s]*/i)
  if (!match) return null
  return match[0].replace(/[),.;!?]+$/, '')
}

function CursorBlink() {
  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 14,
      background: 'var(--accent)',
      marginLeft: 2,
      verticalAlign: 'middle',
      animation: 'blink 1s step-end infinite',
    }} />
  )
}

export function MessageBubble({ message, searchQuery }: { message: Message; searchQuery?: string }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const isUser = message.role === 'user'
  const normalizedSearch = (searchQuery || '').trim()
  const hasSearch = normalizedSearch.length > 0
  const contentMatch = hasSearch && message.content.toLowerCase().includes(normalizedSearch.toLowerCase())
  const generatedImageUrl = !isUser ? extractGeneratedImageUrl(message.content) : null
  let codeBlockIndex = -1
  const imageSrc = (() => {
    if (!message.imageAttachment) return ''
    if (message.imageAttachment.url) return message.imageAttachment.url
    if (message.imageAttachment.data) {
      const media = message.imageAttachment.media_type || 'image/png'
      return `data:${media};base64,${message.imageAttachment.data}`
    }
    return ''
  })()

  if (isUser) {
    return (
      <div
        className="fade-in"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 20,
        }}
      >
        <div style={{
          maxWidth: '75%',
          background: 'var(--bg-3)',
          border: '1px solid var(--border-bright)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          fontSize: 14,
          color: 'var(--text-0)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {imageSrc && (
            <div style={{ marginBottom: message.content ? 8 : 0 }}>
              <img
                src={imageSrc}
                alt="Uploaded"
                style={{
                  maxWidth: '100%',
                  maxHeight: 260,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  objectFit: 'cover',
                }}
              />
            </div>
          )}
          {hasSearch ? renderHighlightedText(message.content, normalizedSearch) : message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in" style={{ marginBottom: 24 }}>
      {/* Agent label */}
      <div style={{
        fontSize: 10,
        color: 'var(--accent)',
        letterSpacing: '0.15em',
        fontWeight: 700,
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'inline-block',
          animation: message.isStreaming ? 'pulse-accent 1.5s ease-in-out infinite' : 'none',
        }} />
        KODO
        {message.isStreaming && !message.content && !message.toolCalls?.length && (
          <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>thinking...</span>
        )}
      </div>

      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div style={{ marginBottom: message.content ? 12 : 0 }}>
          {message.toolCalls.map((tc, i) => (
            <ToolCallCard
              key={i}
              tc={tc}
              isLast={i === message.toolCalls!.length - 1 && !!message.isStreaming}
              searchQuery={normalizedSearch}
            />
          ))}
        </div>
      )}

      {/* Text content */}
      {generatedImageUrl && (
        <div style={{ marginBottom: message.content ? 10 : 0 }}>
          <img
            src={generatedImageUrl}
            alt="Generated image"
            style={{
              maxWidth: 'min(100%, 560px)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      )}

      {message.content && (
        <div style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: 'var(--text-0)',
          borderLeft: contentMatch ? '2px solid var(--yellow)' : undefined,
          paddingLeft: contentMatch ? 10 : 0,
        }}>
          {hasSearch ? (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {renderHighlightedText(message.content, normalizedSearch)}
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const isInline = !match
                  if (isInline) {
                    return (
                      <code
                        style={{
                          background: 'var(--bg-3)',
                          border: '1px solid var(--border)',
                          borderRadius: 2,
                          padding: '1px 5px',
                          fontSize: '0.9em',
                          color: 'var(--green)',
                          fontFamily: 'var(--font-mono)',
                        }}
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  }
                  codeBlockIndex += 1
                  const blockIndex = codeBlockIndex
                  return (
                    <div style={{ margin: '12px 0', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{
                        background: 'var(--bg-3)',
                        padding: '5px 12px',
                        fontSize: 10,
                        color: 'var(--text-2)',
                        letterSpacing: '0.1em',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <span>{match[1].toUpperCase()}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const rawCode = String(children).replace(/\n$/, '')
                            void navigator.clipboard.writeText(rawCode).then(() => {
                              setCopiedIndex(blockIndex)
                              window.setTimeout(() => {
                                setCopiedIndex((prev) => (prev === blockIndex ? null : prev))
                              }, 2000)
                            })
                          }}
                          style={{
                            border: '1px solid var(--border)',
                            background: 'var(--bg-2)',
                            color: copiedIndex === blockIndex ? 'var(--green)' : 'var(--text-1)',
                            borderRadius: 3,
                            cursor: 'pointer',
                            fontSize: 9,
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 6px',
                            letterSpacing: '0.08em',
                          }}
                        >
                          {copiedIndex === blockIndex ? 'COPIED' : 'COPY'}
                        </button>
                      </div>
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: 0,
                          background: '#0f0f13',
                          fontSize: 12,
                          padding: '12px 16px',
                        }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  )
                },
                p({ children }) {
                  return <p style={{ marginBottom: 10 }}>{children}</p>
                },
                ul({ children }) {
                  return <ul style={{ marginLeft: 20, marginBottom: 10 }}>{children}</ul>
                },
                ol({ children }) {
                  return <ol style={{ marginLeft: 20, marginBottom: 10 }}>{children}</ol>
                },
                li({ children }) {
                  return <li style={{ marginBottom: 3 }}>{children}</li>
                },
                h1({ children }) {
                  return <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, marginBottom: 10, color: 'var(--text-0)' }}>{children}</h1>
                },
                h2({ children }) {
                  return <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-0)' }}>{children}</h2>
                },
                h3({ children }) {
                  return <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-0)' }}>{children}</h3>
                },
                strong({ children }) {
                  return <strong style={{ fontWeight: 700, color: 'var(--text-0)' }}>{children}</strong>
                },
                blockquote({ children }) {
                  return (
                    <blockquote style={{
                      borderLeft: '3px solid var(--accent)',
                      paddingLeft: 12,
                      margin: '10px 0',
                      color: 'var(--text-1)',
                      fontStyle: 'italic',
                    }}>
                      {children}
                    </blockquote>
                  )
                },
                table({ children }) {
                  return (
                    <div style={{ overflowX: 'auto', margin: '10px 0' }}>
                      <table style={{
                        borderCollapse: 'collapse',
                        width: '100%',
                        fontSize: 12,
                      }}>
                        {children}
                      </table>
                    </div>
                  )
                },
                th({ children }) {
                  return <th style={{ padding: '6px 10px', background: 'var(--bg-3)', border: '1px solid var(--border)', fontWeight: 600 }}>{children}</th>
                },
                td({ children }) {
                  return <td style={{ padding: '6px 10px', border: '1px solid var(--border)' }}>{children}</td>
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
          {message.isStreaming && <CursorBlink />}
        </div>
      )}

      {/* Usage */}
      {message.usage && (
        <div style={{
          marginTop: 8,
          fontSize: 10,
          color: 'var(--text-2)',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <span>↑ {message.usage.input_tokens} tokens</span>
          <span>↓ {message.usage.output_tokens} tokens</span>
          {message.usage.input_cache_read_tokens ? (
            <span>cache read {message.usage.input_cache_read_tokens}</span>
          ) : null}
          {message.usage.input_cache_write_tokens ? (
            <span>cache write {message.usage.input_cache_write_tokens}</span>
          ) : null}
          <span>{message.usage.model}</span>
        </div>
      )}
    </div>
  )
}
