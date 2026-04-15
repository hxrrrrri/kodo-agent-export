import { useEffect, useRef, useState } from 'react'
import { Copy, Pencil, RotateCcw, Volume2, Square, ExternalLink, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { AdvisorReview, ArtifactItem, Message, PreviewItem, TodoItem } from '../store/chatStore'
import { buildApiHeaders, parseApiError } from '../lib/api'
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

async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text || '')
  if (!value.trim()) return false

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall back to execCommand clipboard path below.
  }

  try {
    if (typeof document === 'undefined') return false
    const el = document.createElement('textarea')
    el.value = value
    el.setAttribute('readonly', '')
    el.style.position = 'absolute'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
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

function normalizeReviewList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3)
}

function AdvisorReviewCard({ review }: { review: AdvisorReview }) {
  const strengths = normalizeReviewList(review.strengths)
  const risks = normalizeReviewList(review.risks)
  const nextSteps = normalizeReviewList(review.next_steps)
  const score = Number.isFinite(Number(review.score)) ? Math.max(0, Math.min(100, Number(review.score))) : null
  const summary = String(review.summary || '').trim()

  if (!summary && strengths.length === 0 && risks.length === 0 && nextSteps.length === 0) {
    return null
  }

  const toneColor = score === null ? 'var(--text-2)' : (score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)')

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-2)',
        padding: '8px 10px',
        marginBottom: 10,
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-2)' }}>ADVISOR</span>
        {score !== null && (
          <span style={{ fontSize: 10, color: toneColor }}>score {score}/100</span>
        )}
      </div>

      {summary && (
        <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.4 }}>{summary}</div>
      )}

      {strengths.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--green)' }}>
          strengths: {strengths.join(' | ')}
        </div>
      )}

      {risks.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--yellow)' }}>
          risks: {risks.join(' | ')}
        </div>
      )}

      {nextSteps.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
          next: {nextSteps.join(' | ')}
        </div>
      )}
    </div>
  )
}

function TodoList({ items }: { items: TodoItem[] }) {
  const pending = items.filter((i) => i.status === 'pending').length
  const done = items.filter((i) => i.status === 'completed').length
  const total = items.length

  return (
    <div style={{
      marginBottom: 12,
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '8px 10px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-2)', fontWeight: 600 }}>
          TASKS
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
          {done}/{total}
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{
          height: 2,
          background: 'var(--border)',
          borderRadius: 2,
          marginBottom: 7,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${(done / total) * 100}%`,
            background: done === total ? 'var(--green)' : 'var(--accent)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item) => (
          <div key={item.id} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
            opacity: item.status === 'completed' ? 0.6 : 1,
          }}>
            {/* Status icon */}
            <span style={{
              flexShrink: 0,
              marginTop: 1,
              width: 13,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {item.status === 'completed' ? (
                <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700 }}>✓</span>
              ) : item.status === 'in_progress' ? (
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: 'pulse-accent 1.5s ease-in-out infinite',
                }} />
              ) : (
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  border: '1.5px solid var(--text-2)',
                }} />
              )}
            </span>

            <span style={{
              fontSize: 12,
              color: item.status === 'completed' ? 'var(--text-2)' : 'var(--text-0)',
              textDecoration: item.status === 'completed' ? 'line-through' : 'none',
              lineHeight: 1.4,
            }}>
              {item.title}
            </span>
          </div>
        ))}
      </div>

      {pending === 0 && total > 0 && (
        <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 6, letterSpacing: '0.05em' }}>
          all tasks complete
        </div>
      )}
    </div>
  )
}

function ArtifactPanel({ artifacts }: { artifacts: ArtifactItem[] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const artifact = artifacts[Math.min(activeIdx, artifacts.length - 1)]

  async function copyArtifact(idx: number) {
    const text = artifacts[idx]?.content || ''
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      window.setTimeout(() => setCopiedIdx((p) => (p === idx ? null : p)), 2000)
    } catch { /* ignore */ }
  }

  if (!artifact) return null

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      background: 'var(--bg-0)',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
        gap: 0,
      }}>
        <div style={{
          fontSize: 9,
          color: 'var(--text-2)',
          letterSpacing: '0.12em',
          padding: '5px 10px',
          borderRight: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          ARTIFACT
        </div>
        {artifacts.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setActiveIdx(i)}
            style={{
              background: i === activeIdx ? 'var(--bg-3)' : 'transparent',
              border: 'none',
              borderRight: '1px solid var(--border)',
              borderBottom: i === activeIdx ? '2px solid var(--accent)' : '2px solid transparent',
              color: i === activeIdx ? 'var(--text-0)' : 'var(--text-2)',
              padding: '5px 12px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {a.filename || a.title}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => copyArtifact(activeIdx)}
          style={{
            border: 'none',
            background: 'transparent',
            color: copiedIdx === activeIdx ? 'var(--green)' : 'var(--text-2)',
            padding: '5px 10px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            flexShrink: 0,
            letterSpacing: '0.08em',
          }}
        >
          {copiedIdx === activeIdx ? 'COPIED' : 'COPY'}
        </button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={artifact.language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          background: '#0f0f13',
          fontSize: 12,
          padding: '12px 16px',
          maxHeight: 400,
          overflow: 'auto',
        }}
      >
        {artifact.content}
      </SyntaxHighlighter>
    </div>
  )
}

function PreviewPanel({ previews }: { previews: PreviewItem[] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const visible = previews.filter((_, i) => !dismissed.has(i))

  if (visible.length === 0) return null
  const preview = previews[activeIdx]
  if (!preview || dismissed.has(activeIdx)) {
    const nextIdx = previews.findIndex((_, i) => !dismissed.has(i))
    if (nextIdx >= 0) setActiveIdx(nextIdx)
    return null
  }

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      background: 'var(--bg-0)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
        padding: '5px 10px',
      }}>
        <span style={{
          display: 'inline-block',
          width: 7, height: 7,
          borderRadius: '50%',
          background: 'var(--green)',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 9, color: 'var(--text-2)', letterSpacing: '0.12em', flex: 0 }}>
          PREVIEW
        </span>
        {previews.length > 1 && previews.map((p, i) => !dismissed.has(i) && (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveIdx(i)}
            style={{
              background: i === activeIdx ? 'var(--accent-dim)' : 'transparent',
              border: '1px solid ' + (i === activeIdx ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 3,
              color: i === activeIdx ? 'var(--accent)' : 'var(--text-2)',
              padding: '2px 7px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            {i + 1}
          </button>
        ))}
        <div style={{ flex: 1 }}>
          <span style={{
            fontSize: 10,
            color: 'var(--text-2)',
            fontFamily: 'var(--font-mono)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
            maxWidth: 300,
          }}>
            {preview.url}
          </span>
        </div>
        <a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--text-2)',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 4px',
          }}
          title="Open in new tab"
        >
          <ExternalLink size={12} />
        </a>
        <button
          type="button"
          onClick={() => setDismissed((d) => new Set([...d, activeIdx]))}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-2)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 4px',
          }}
          title="Dismiss preview"
        >
          <X size={12} />
        </button>
      </div>

      {/* iframe */}
      <iframe
        src={preview.url}
        style={{
          width: '100%',
          height: 480,
          border: 'none',
          display: 'block',
          background: '#fff',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title={`Preview: ${preview.url}`}
      />
    </div>
  )
}

type MessageBubbleProps = {
  message: Message
  searchQuery?: string
  onEditUserPrompt?: (content: string) => void
  onRetryUserPrompt?: (content: string) => void
  disableUserRetry?: boolean
}

export function MessageBubble({
  message,
  searchQuery,
  onEditUserPrompt,
  onRetryUserPrompt,
  disableUserRetry = false,
}: MessageBubbleProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [userPromptCopied, setUserPromptCopied] = useState(false)
  const [assistantResponseCopied, setAssistantResponseCopied] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string>('')
  const synthUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
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

  const stopSpeechPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = ''
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    synthUtteranceRef.current = null
  }

  useEffect(() => {
    return () => {
      stopSpeechPlayback()
      setIsSpeaking(false)
    }
  }, [])

  const toggleSpeech = async () => {
    if (!message.content.trim()) return

    if (isSpeaking) {
      stopSpeechPlayback()
      setIsSpeaking(false)
      return
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: message.content, voice: 'alloy' }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      const blob = await response.blob()
      const audioUrl = URL.createObjectURL(blob)
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
      }
      audioUrlRef.current = audioUrl
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      audio.onended = () => {
        setIsSpeaking(false)
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current)
          audioUrlRef.current = ''
        }
      }
      audio.onerror = () => {
        setIsSpeaking(false)
        stopSpeechPlayback()
      }
      setIsSpeaking(true)
      await audio.play()
      return
    } catch {
      // Fall back to browser speech synthesis when API TTS is unavailable.
    }

    try {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        setIsSpeaking(false)
        return
      }

      const utterance = new SpeechSynthesisUtterance(message.content)
      utterance.rate = 1
      utterance.pitch = 1
      utterance.onend = () => {
        synthUtteranceRef.current = null
        setIsSpeaking(false)
      }
      utterance.onerror = () => {
        synthUtteranceRef.current = null
        setIsSpeaking(false)
      }

      window.speechSynthesis.cancel()
      synthUtteranceRef.current = utterance
      setIsSpeaking(true)
      window.speechSynthesis.speak(utterance)
    } catch {
      setIsSpeaking(false)
    }
  }

  const handleCopyAssistantResponse = async () => {
    const text = String(message.content || '')
    if (!text.trim()) return
    const copied = await copyTextToClipboard(text)
    if (!copied) return
    setAssistantResponseCopied(true)
    window.setTimeout(() => {
      setAssistantResponseCopied(false)
    }, 1400)
  }

  if (isUser) {
    const handleCopyUserPrompt = async () => {
      const text = String(message.content || '')
      if (!text.trim()) return
      const copied = await copyTextToClipboard(text)
      if (!copied) return
      setUserPromptCopied(true)
      window.setTimeout(() => {
        setUserPromptCopied(false)
      }, 1400)
    }

    const handleEditUserPrompt = () => {
      if (!onEditUserPrompt) return
      onEditUserPrompt(String(message.content || ''))
    }

    const handleRetryUserPrompt = () => {
      if (!onRetryUserPrompt || disableUserRetry) return
      onRetryUserPrompt(String(message.content || ''))
    }

    return (
      <div
        className="fade-in message-enter user-message-shell"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 20,
        }}
      >
        <div className="user-message-actions" role="group" aria-label="User message actions">
          <button
            type="button"
            className={`user-message-action-btn${userPromptCopied ? ' is-success' : ''}`}
            onClick={() => { void handleCopyUserPrompt() }}
            aria-label={userPromptCopied ? 'Prompt copied' : 'Copy prompt'}
            title={userPromptCopied ? 'Copied' : 'Copy prompt'}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            className="user-message-action-btn"
            onClick={handleEditUserPrompt}
            disabled={!onEditUserPrompt}
            aria-label="Edit prompt"
            title="Edit prompt"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="user-message-action-btn"
            onClick={handleRetryUserPrompt}
            disabled={!onRetryUserPrompt || disableUserRetry}
            aria-label="Retry prompt"
            title={disableUserRetry ? 'Wait for current response to finish' : 'Retry prompt'}
          >
            <RotateCcw size={13} />
          </button>
        </div>
        <div className="user-message-body" style={{
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
    <div className="fade-in message-enter" style={{ marginBottom: 24 }}>
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
        {!message.isStreaming && message.content.trim() && (
          <button
            type="button"
            onClick={() => { void toggleSpeech() }}
            aria-label={isSpeaking ? 'Stop reading aloud' : 'Read message aloud'}
            title={isSpeaking ? 'Stop' : 'Read aloud'}
            style={{
              border: '1px solid var(--border)',
              background: isSpeaking ? 'var(--green-dim)' : 'var(--bg-2)',
              color: isSpeaking ? 'var(--green)' : 'var(--text-2)',
              borderRadius: 6,
              width: 22,
              height: 20,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginLeft: 2,
            }}
          >
            {isSpeaking ? <Square size={11} /> : <Volume2 size={11} />}
          </button>
        )}
      </div>

      {/* Todo list */}
      {message.todoItems && message.todoItems.length > 0 && (
        <TodoList items={message.todoItems} />
      )}

      {/* Advisor review */}
      {message.advisorReview && <AdvisorReviewCard review={message.advisorReview} />}

      {/* Tool calls - compact inline labels */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div style={{ marginBottom: message.content ? 10 : 0 }}>
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
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-([\w-]+)/.exec(className || '')
                  const rawValue = String(children || '')
                  const startLine = Number((node as any)?.position?.start?.line || 0)
                  const endLine = Number((node as any)?.position?.end?.line || 0)
                  const spansMultipleLines = startLine > 0 && endLine > 0 && endLine > startLine
                  const isInlineCode = Boolean(inline) || (!match && !rawValue.includes('\n') && !spansMultipleLines)
                  if (isInlineCode) {
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
                  const language = match?.[1] || 'text'
                  const rawCode = rawValue.replace(/\n$/, '')
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
                        <span>{language.toUpperCase()}</span>
                        <button
                          type="button"
                          onClick={() => {
                            void copyTextToClipboard(rawCode).then((copied) => {
                              if (!copied) return
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
                        language={language}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: 0,
                          background: '#0f0f13',
                          fontSize: 12,
                          padding: '12px 16px',
                        }}
                      >
                        {rawCode}
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

      {message.content.trim() && (
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <button
            type="button"
            onClick={() => { void handleCopyAssistantResponse() }}
            aria-label={assistantResponseCopied ? 'Response copied' : 'Copy response'}
            title={assistantResponseCopied ? 'Copied' : 'Copy response'}
            style={{
              border: `1px solid ${assistantResponseCopied ? 'var(--green)' : 'var(--border)'}`,
              background: 'var(--bg-2)',
              color: assistantResponseCopied ? 'var(--green)' : 'var(--text-1)',
              borderRadius: 6,
              cursor: 'pointer',
              padding: '5px 7px',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <Copy size={12} />
          </button>
        </div>
      )}

      {/* Artifacts */}
      {message.artifacts && message.artifacts.length > 0 && (
        <ArtifactPanel artifacts={message.artifacts} />
      )}

      {/* Previews */}
      {message.previews && message.previews.length > 0 && (
        <PreviewPanel previews={message.previews} />
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
          <span>↑ {Number(message.usage.input_tokens || 0).toLocaleString()} tokens</span>
          <span>↓ {Number(message.usage.output_tokens || 0).toLocaleString()} tokens</span>
          {message.usage.input_cache_read_tokens ? (
            <span>Cache read {Number(message.usage.input_cache_read_tokens).toLocaleString()}</span>
          ) : null}
          {message.usage.input_cache_write_tokens ? (
            <span>Cache write {Number(message.usage.input_cache_write_tokens).toLocaleString()}</span>
          ) : null}
          <span>{message.usage.model}</span>
        </div>
      )}
    </div>
  )
}
