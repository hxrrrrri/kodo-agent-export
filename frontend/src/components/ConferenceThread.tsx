/**
 * ConferenceThread — renders multi-model debate results inline in the chat.
 * Shown as a horizontal row of model cards (streaming), followed by a
 * synthesis conclusion card with a gradient border.
 */
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Loader, Maximize2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface ConferenceResult {
  participantId: number
  name: string
  provider: string
  color: string
  text: string
  done: boolean
  error: string | null
  started: boolean
}

export interface ConferenceThreadData {
  prompt: string
  mode?: 'synthesis' | 'debate'
  results: ConferenceResult[]
  debateTurns?: ConferenceResult[]
  synthesis: string
  synthesisStarted: boolean
  synthesisDone: boolean
  running: boolean
}

function FullResponseModal({ result, onClose }: { result: ConferenceResult; onClose: () => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          border: `2px solid ${result.color}66`,
          borderRadius: 16,
          width: '100%', maxWidth: 760,
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: `0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px ${result.color}33`,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{
          padding: '12px 16px', background: 'var(--bg-2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: result.color }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-0)', flex: 1 }}>
            {result.name}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
            {result.text.split(/\s+/).filter(Boolean).length} words
          </span>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', fontSize: 14, lineHeight: 1.8, color: 'var(--text-0)' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            code({ children, className, ...props }: any) {
              const isBlock = className?.includes('language-')
              if (isBlock) {
                return (
                  <pre style={{
                    background: '#0f0f13', borderRadius: 8, padding: '12px 16px',
                    margin: '12px 0', overflow: 'auto', fontSize: 12, fontFamily: 'var(--font-mono)',
                    border: '1px solid var(--border)',
                  }}>
                    <code style={{ color: '#e0e0e8' }} {...props}>{children}</code>
                  </pre>
                )
              }
              return (
                <code style={{
                  background: 'var(--bg-3)', borderRadius: 4, padding: '2px 6px',
                  fontSize: '0.9em', fontFamily: 'var(--font-mono)', color: 'var(--green)',
                }} {...props}>{children}</code>
              )
            },
            p({ children }) { return <p style={{ marginBottom: 12 }}>{children}</p> },
            ul({ children }) { return <ul style={{ marginLeft: 22, marginBottom: 10 }}>{children}</ul> },
            ol({ children }) { return <ol style={{ marginLeft: 22, marginBottom: 10 }}>{children}</ol> },
            li({ children }) { return <li style={{ marginBottom: 5 }}>{children}</li> },
            h2({ children }) { return <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: 'var(--text-0)' }}>{children}</h2> },
            h3({ children }) { return <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{children}</h3> },
            strong({ children }) { return <strong style={{ fontWeight: 700, color: 'var(--text-0)' }}>{children}</strong> },
            blockquote({ children }) { return <blockquote style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 12, margin: '10px 0', color: 'var(--text-1)', fontStyle: 'italic' }}>{children}</blockquote> },
          }}>
            {result.text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

type Props = {
  data: ConferenceThreadData
}

function ModelCard({ result, onExpand }: { result: ConferenceResult; onExpand?: () => void }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!result.done) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [result.text, result.done])

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      border: `1px solid ${result.error ? 'var(--red)' : result.done ? result.color + '66' : 'var(--border)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      background: 'var(--bg-1)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 0.3s',
    }}>
      {/* Model header */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: result.color, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-0)', fontWeight: 700, flex: 1 }}>
          {result.name}
        </span>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
          {result.provider}
        </span>
        {result.started && !result.done && !result.error && (
          <Loader size={10} color={result.color} style={{ animation: 'spin 1s linear infinite' }} />
        )}
        {result.done && !result.error && (
          <CheckCircle2 size={11} color={result.color} />
        )}
        {!result.started && (
          <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>WAITING</span>
        )}
        {result.done && result.text && onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="Expand full response in modal"
            style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}
          >
            <Maximize2 size={11} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 14px',
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--text-1)',
        maxHeight: 300,
      }}>
        {result.error ? (
          <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {result.error}
          </span>
        ) : result.text ? (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              code({ children, ...props }: any) {
                return (
                  <code style={{
                    background: 'var(--bg-3)', borderRadius: 3, padding: '1px 5px',
                    fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)',
                  }} {...props}>{children}</code>
                )
              },
              p({ children }) { return <p style={{ marginBottom: 6 }}>{children}</p> },
            }}>
              {result.text}
            </ReactMarkdown>
            {!result.done && (
              <span style={{
                display: 'inline-block', width: 6, height: 12,
                background: result.color,
                animation: 'blink 1s step-end infinite',
                marginLeft: 2, verticalAlign: 'middle',
              }} />
            )}
          </>
        ) : result.started ? (
          <span style={{ color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            Thinking...
          </span>
        ) : null}
        <div ref={endRef} />
      </div>

      {/* Word count */}
      {result.done && result.text && (
        <div style={{
          padding: '4px 12px', background: 'var(--bg-2)',
          borderTop: '1px solid var(--border)',
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)',
        }}>
          {result.text.split(/\s+/).filter(Boolean).length} words
        </div>
      )}
    </div>
  )
}

export function ConferenceThread({ data }: Props) {
  const [expandedCard, setExpandedCard] = useState<number | null>(null)
  const [debateExpanded, setDebateExpanded] = useState(false)
  const synthEndRef = useRef<HTMLDivElement>(null)
  const isDebateMode = data.mode === 'debate'
  const debateTurns = data.debateTurns || []
  const expandedResult = expandedCard === null
    ? null
    : expandedCard < data.results.length
      ? data.results[expandedCard]
      : debateTurns[expandedCard - data.results.length]

  useEffect(() => {
    if (data.synthesisStarted && !data.synthesisDone) {
      synthEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [data.synthesis, data.synthesisStarted, data.synthesisDone])

  return (
    <div style={{ margin: '16px 0', animation: 'fadeIn 0.2s ease' }}>
      {/* Label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
      }}>
        <div style={{
          height: 1, flex: 1,
          background: 'linear-gradient(90deg, transparent, var(--border))',
        }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-2)', letterSpacing: '0.12em',
          padding: '2px 10px',
          border: '1px solid var(--border)',
          borderRadius: 20,
          background: 'var(--bg-1)',
          whiteSpace: 'nowrap',
        }}>
          MULTI-MODEL CONFERENCE · {data.results.length} PARTICIPANTS
        </span>
        <div style={{
          height: 1, flex: 1,
          background: 'linear-gradient(90deg, var(--border), transparent)',
        }} />
      </div>

      {/* Full response modal */}
      {expandedResult && (
        <FullResponseModal
          result={expandedResult}
          onClose={() => setExpandedCard(null)}
        />
      )}

      {!isDebateMode && (
        <div style={{
          display: 'flex',
          gap: 10,
          marginBottom: data.synthesisStarted ? 12 : 0,
        }}>
          {data.results.map((result) => (
            <ModelCard
              key={result.participantId}
              result={result}
              onExpand={() => setExpandedCard(result.participantId)}
            />
          ))}
        </div>
      )}

      {/* Synthesis conclusion */}
      {data.synthesisStarted && (
        <div style={{
          border: `1px solid ${data.synthesisDone ? 'var(--green)' : 'var(--accent)'}`,
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--bg-1)',
          position: 'relative',
          transition: 'border-color 0.4s ease',
        }}>
          {/* Gradient top accent */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: data.synthesisDone
              ? 'linear-gradient(90deg, var(--green), var(--blue))'
              : 'linear-gradient(90deg, var(--accent), var(--blue), var(--accent))',
            backgroundSize: '200% 100%',
            animation: data.synthesisDone ? 'none' : 'gradientShift 2s ease infinite',
          }} />

          <div style={{
            padding: '10px 14px 8px',
            background: 'var(--bg-2)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {data.synthesisDone ? (
              <CheckCircle2 size={13} color="var(--green)" />
            ) : (
              <Loader size={13} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
            )}
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              color: data.synthesisDone ? 'var(--green)' : 'var(--accent)',
              letterSpacing: '0.06em',
            }}>
              {data.synthesisDone ? 'SYNTHESIS — FINAL CONCLUSION' : 'SYNTHESIZING BEST ANSWER...'}
            </span>
            {data.synthesisDone && (
              <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                Composite of {data.results.length} models
              </span>
            )}
          </div>

          <div style={{ padding: '14px 16px', fontSize: 13.5, lineHeight: 1.75, color: 'var(--text-0)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              code({ children, className, ...props }: any) {
                const isBlock = className?.includes('language-')
                if (isBlock) {
                  return (
                    <pre style={{
                      background: '#0f0f13', borderRadius: 8,
                      padding: '12px 16px', margin: '10px 0',
                      overflow: 'auto', fontSize: 12, fontFamily: 'var(--font-mono)',
                      border: '1px solid var(--border)',
                    }}>
                      <code style={{ color: '#e0e0e8' }} {...props}>{children}</code>
                    </pre>
                  )
                }
                return (
                  <code style={{
                    background: 'var(--bg-3)', borderRadius: 4, padding: '2px 6px',
                    fontSize: '0.9em', fontFamily: 'var(--font-mono)', color: 'var(--green)',
                  }} {...props}>{children}</code>
                )
              },
              p({ children }) { return <p style={{ marginBottom: 10 }}>{children}</p> },
              ul({ children }) { return <ul style={{ marginLeft: 20, marginBottom: 8 }}>{children}</ul> },
              ol({ children }) { return <ol style={{ marginLeft: 20, marginBottom: 8 }}>{children}</ol> },
              li({ children }) { return <li style={{ marginBottom: 4 }}>{children}</li> },
              h2({ children }) { return <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-0)' }}>{children}</h2> },
              h3({ children }) { return <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-0)' }}>{children}</h3> },
              strong({ children }) { return <strong style={{ fontWeight: 700, color: 'var(--text-0)' }}>{children}</strong> },
            }}>
              {data.synthesis}
            </ReactMarkdown>
            {!data.synthesisDone && (
              <span style={{
                display: 'inline-block', width: 8, height: 14,
                background: 'var(--accent)',
                animation: 'blink 1s step-end infinite',
                marginLeft: 2, verticalAlign: 'middle',
              }} />
            )}
            <div ref={synthEndRef} />
          </div>
        </div>
      )}

      {isDebateMode && debateTurns.length > 0 && (
        <div style={{
          marginTop: 12,
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--bg-1)',
          overflow: 'hidden',
        }}>
          <button
            type="button"
            onClick={() => setDebateExpanded((value) => !value)}
            style={{
              width: '100%',
              border: 'none',
              background: 'var(--bg-2)',
              color: 'var(--text-0)',
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              borderBottom: debateExpanded ? '1px solid var(--border)' : 'none',
            }}
          >
            {debateExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            LIVE DEBATE TRANSCRIPT
            <span style={{ marginLeft: 'auto', color: 'var(--text-2)', fontSize: 10 }}>
              {debateTurns.length} turns
            </span>
          </button>

          {debateExpanded && (
            <div style={{ display: 'grid', gap: 10, padding: 12 }}>
              {debateTurns.map((turn, idx) => (
                <ModelCard
                  key={`${turn.participantId}-${idx}`}
                  result={turn}
                  onExpand={() => setExpandedCard(data.results.length + idx)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
