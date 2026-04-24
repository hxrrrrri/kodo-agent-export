/**
 * ConferencePanel — Multi-Model Debate.
 *
 * Sends the same prompt to 2-6 different AI models simultaneously.
 * Each model's streaming response appears in its own column.
 * A synthesizer model reads all responses and produces the best composite answer.
 *
 * This is the feature no major AI platform offers: see GPT-4 vs Claude vs
 * Gemini answer the same question side-by-side, then get a synthesis.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Loader, Pause, Plus, Send, X, Zap } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildApiHeaders } from '../lib/api'
import { useChatStore } from '../store/chatStore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Participant {
  id: string
  provider: string
  model: string
  name: string
  color: string
}

interface ParticipantState {
  text: string
  done: boolean
  error: string | null
  started: boolean
}

interface DebateTurnState extends ParticipantState {
  id: string
  name: string
  provider: string
  color: string
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  gemini: '#4285f4',
  groq: '#f55036',
  deepseek: '#0066cc',
  ollama: '#9333ea',
  openrouter: '#7c3aed',
  'atomic-chat': '#0ea5e9',
  'github-models': '#24292f',
  codex: '#3b82f6',
}

const DEFAULT_PARTICIPANTS: Participant[] = [
  { id: '0', provider: 'openai', model: '', name: 'GPT-4o', color: PROVIDER_COLORS.openai },
  { id: '1', provider: 'groq', model: '', name: 'Llama 3', color: PROVIDER_COLORS.groq },
]

type KnownProvider = { name: string; big_model: string; configured: boolean; healthy: boolean }
type ConferenceModelsResponse = { models: Record<string, string[]> }

// ── ParticipantColumn ──────────────────────────────────────────────────────────

function ParticipantColumn({
  participant,
  state,
  onRemove,
}: {
  participant: Participant
  state: ParticipantState
  onRemove: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state.done) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [state.text, state.done])

  return (
    <div style={{
      flex: 1, minWidth: 220,
      border: `1px solid ${state.error ? 'var(--red)' : state.done ? participant.color : 'var(--border)'}`,
      borderRadius: 12,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      transition: 'border-color 0.3s ease',
      background: 'var(--bg-1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: participant.color, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-0)', fontWeight: 600, flex: 1 }}>
          {participant.name}
        </span>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '0.06em' }}>
          {participant.provider}
        </span>
        {!state.started && !state.done && (
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>WAITING</span>
        )}
        {state.started && !state.done && !state.error && (
          <Loader size={10} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
        )}
        {state.done && !state.error && (
          <CheckCircle2 size={12} color={participant.color} />
        )}
        <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}>
          <X size={11} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, fontSize: 12, lineHeight: 1.6, color: 'var(--text-1)' }}>
        {state.error ? (
          <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            Error: {state.error}
          </div>
        ) : state.text ? (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              code({ children, ...props }: any) {
                return <code style={{ background: 'var(--bg-3)', borderRadius: 3, padding: '1px 4px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }} {...props}>{children}</code>
              },
              p({ children }) { return <p style={{ marginBottom: 8 }}>{children}</p> },
            }}>
              {state.text}
            </ReactMarkdown>
            {!state.done && (
              <span style={{ display: 'inline-block', width: 6, height: 12, background: participant.color, animation: 'blink 1s step-end infinite', marginLeft: 2, verticalAlign: 'middle' }} />
            )}
          </>
        ) : state.started ? (
          <div style={{ color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>Thinking...</div>
        ) : null}
        <div ref={endRef} />
      </div>

      {/* Stats */}
      {state.done && state.text && !state.error && (
        <div style={{
          padding: '4px 12px', background: 'var(--bg-2)',
          borderTop: '1px solid var(--border)',
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)',
          display: 'flex', gap: 10,
        }}>
          <span>{state.text.length.toLocaleString()} chars</span>
          <span>{state.text.split(/\s+/).length.toLocaleString()} words</span>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function ConferencePanel() {
  const sessionId = useChatStore((state) => state.sessionId)
  const [participants, setParticipants] = useState<Participant[]>(DEFAULT_PARTICIPANTS)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [participantStates, setParticipantStates] = useState<Record<string, ParticipantState>>({})
  const [debateTurns, setDebateTurns] = useState<DebateTurnState[]>([])
  const [debateExpanded, setDebateExpanded] = useState(false)
  const [synthesis, setSynthesis] = useState('')
  const [synthesisRunning, setSynthesisRunning] = useState(false)
  const [synthesisStarted, setSynthesisStarted] = useState(false)
  const [knownProviders, setKnownProviders] = useState<KnownProvider[]>([])
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({})
  const [synthesize, setSynthesize] = useState(true)
  const [runMode, setRunMode] = useState<'synthesis' | 'debate'>('synthesis')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load available providers
  useEffect(() => {
    fetch('/api/conference/providers', { headers: buildApiHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.providers) setKnownProviders(d.providers) })
      .catch(() => {})
    fetch('/api/conference/models', { headers: buildApiHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((d: ConferenceModelsResponse | null) => {
        if (d?.models) {
          const next: Record<string, string[]> = {}
          for (const [provider, models] of Object.entries(d.models)) {
            next[provider] = Array.from(new Set((models || []).map((item) => String(item || '').trim()).filter(Boolean)))
          }
          setModelsByProvider(next)
        }
      })
      .catch(() => {})
  }, [])

  function addParticipant() {
    if (participants.length >= 6) return
    const configured = knownProviders.filter((p) => p.configured)
    const unused = configured.find((p) => !participants.some((part) => part.provider === p.name))
    const provider = unused?.name || 'openai'
    const color = PROVIDER_COLORS[provider] || '#888'
    setParticipants((prev) => [...prev, {
      id: String(Date.now()),
      provider,
      model: '',
      name: provider,
      color,
    }])
  }

  function removeParticipant(id: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== id))
  }

  function updateParticipant(id: string, patch: Partial<Participant>) {
    setParticipants((prev) => prev.map((p) => {
      if (p.id !== id) return p
      const next = { ...p, ...patch }
      if (patch.provider) {
        next.color = PROVIDER_COLORS[patch.provider] || '#888'
        next.name = patch.provider
        next.model = modelsByProvider[patch.provider]?.[0] || ''
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'model')) {
        next.name = patch.model || next.provider
      }
      return next
    }))
  }

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setRunning(false)
    setSynthesisRunning(false)
  }, [])

  const run = useCallback(async () => {
    if (!prompt.trim() || participants.length < 2) return
    setError(null)
    setSynthesis('')
    setDebateTurns([])
    setDebateExpanded(false)
    setSynthesisStarted(false)
    setSynthesisRunning(false)

    // Init states
    const initStates: Record<string, ParticipantState> = {}
    participants.forEach((p) => {
      initStates[p.id] = { text: '', done: false, error: null, started: false }
    })
    setParticipantStates(initStates)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)

    try {
      const body = {
        prompt: prompt.trim(),
        session_id: sessionId || undefined,
        participants: participants.map((p) => ({
          provider: p.provider,
          model: p.model || undefined,
          name: p.name,
        })),
        mode: runMode,
        synthesize: runMode === 'synthesis' ? synthesize : true,
        debate_rounds: 2,
        max_tokens: 2048,
      }

      const response = await fetch('/api/conference/debate', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Conference failed: ${response.status} ${text}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''
      const participantIdToKodoId: Record<number, string> = {}
      participants.forEach((p, i) => { participantIdToKodoId[i] = p.id })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let event: Record<string, unknown>
          try { event = JSON.parse(raw) } catch { continue }

          const type = event.type as string
          const pid = event.participant_id as number
          const kodoId = participantIdToKodoId[pid]

          if (type === 'participant_start' && kodoId) {
            setParticipantStates((s) => ({ ...s, [kodoId]: { ...s[kodoId], started: true } }))
          } else if (type === 'participant_text' && kodoId) {
            const content = event.content as string
            setParticipantStates((s) => ({ ...s, [kodoId]: { ...s[kodoId], text: (s[kodoId]?.text || '') + content } }))
          } else if (type === 'participant_done' && kodoId) {
            setParticipantStates((s) => ({ ...s, [kodoId]: { ...s[kodoId], done: true } }))
          } else if (type === 'conference_error') {
            if (kodoId) {
              setParticipantStates((s) => ({ ...s, [kodoId]: { ...s[kodoId], done: true, error: event.message as string } }))
            }
          } else if (type === 'debate_turn_start') {
            const round = Number(event.round || 1)
            const provider = String(event.provider || '')
            const name = String(event.name || provider || 'model')
            const id = String(event.turn_id || `${Date.now()}-${Math.random()}`)
            setDebateTurns((turns) => [...turns, {
              id,
              name: `R${round} ${name}`,
              provider,
              color: PROVIDER_COLORS[provider] || '#888',
              text: '',
              done: false,
              error: null,
              started: true,
            }])
          } else if (type === 'debate_turn_text') {
            setDebateTurns((turns) => {
              const next = [...turns]
              if (next.length > 0) {
                const idx = next.length - 1
                next[idx] = { ...next[idx], text: next[idx].text + (event.content as string || '') }
              }
              return next
            })
          } else if (type === 'debate_turn_done') {
            setDebateTurns((turns) => {
              const next = [...turns]
              if (next.length > 0) {
                const idx = next.length - 1
                next[idx] = { ...next[idx], done: true }
              }
              return next
            })
          } else if (type === 'synthesis_start') {
            setSynthesisStarted(true)
            setSynthesisRunning(true)
          } else if (type === 'synthesis_text') {
            setSynthesis((s) => s + (event.content as string))
          } else if (type === 'conference_done') {
            setSynthesisRunning(false)
            setRunning(false)
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message)
      }
    } finally {
      setRunning(false)
      setSynthesisRunning(false)
    }
  }, [prompt, participants, runMode, sessionId, synthesize])

  const configuredProviderNames = knownProviders.filter((p) => p.configured).map((p) => p.name)

  function participantModelOptions(participant: Participant): string[] {
    const models = modelsByProvider[participant.provider] || []
    const current = String(participant.model || '').trim()
    if (!current || models.includes(current)) return models
    return [current, ...models]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Zap size={14} color="var(--accent)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>
            MULTI-MODEL CONFERENCE
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            {participants.length} models - {runMode === 'debate' ? 'debate' : 'summarize'}
          </span>
        </div>

        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)', overflow: 'hidden', marginBottom: 8 }}>
          {[
            ['synthesis', 'SUMMARIZE'] as const,
            ['debate', 'DEBATE'] as const,
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRunMode(mode)}
              disabled={running}
              style={{
                border: 'none',
                borderRight: mode === 'synthesis' ? '1px solid var(--border)' : 'none',
                background: runMode === mode ? 'var(--accent-dim)' : 'transparent',
                color: runMode === mode ? 'var(--accent)' : 'var(--text-2)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                padding: '5px 9px',
                cursor: running ? 'not-allowed' : 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Participant selector row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {participants.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              border: `1px solid ${p.color}`, borderRadius: 8,
              padding: '3px 8px', background: `${p.color}11`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
              <select
                value={p.provider}
                onChange={(e) => updateParticipant(p.id, { provider: e.target.value })}
                disabled={running}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-0)',
                  fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', outline: 'none',
                }}
              >
                {knownProviders.filter((kp) => kp.configured).map((kp) => (
                  <option key={kp.name} value={kp.name}>{kp.name}</option>
                ))}
                {configuredProviderNames.length === 0 && <option value={p.provider}>{p.provider}</option>}
              </select>
              <select
                value={p.model}
                onChange={(e) => updateParticipant(p.id, { model: e.target.value })}
                disabled={running}
                style={{
                  maxWidth: 190,
                  background: 'none', border: 'none', color: 'var(--text-0)',
                  fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', outline: 'none',
                }}
              >
                {!p.model && participantModelOptions(p).length > 0 && <option value="">default</option>}
                {participantModelOptions(p).length === 0 && <option value="">default</option>}
                {participantModelOptions(p).map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              {participants.length > 2 && (
                <button type="button" onClick={() => removeParticipant(p.id)} disabled={running}
                  style={{ background: 'none', border: 'none', color: p.color, cursor: 'pointer', padding: 0 }}>
                  <X size={9} />
                </button>
              )}
            </div>
          ))}
          {participants.length < 6 && (
            <button type="button" onClick={addParticipant} disabled={running} style={{
              background: 'var(--bg-2)', border: '1px dashed var(--border)',
              borderRadius: 8, padding: '3px 8px', cursor: 'pointer',
              color: 'var(--text-2)', fontSize: 10, fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <Plus size={9} /> ADD
            </button>
          )}
        </div>

        {/* Prompt input */}
        <div style={{ display: 'flex', gap: 6 }}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void run() } }}
            placeholder="Ask a question to all models simultaneously... (Cmd+Enter to run)"
            rows={2}
            disabled={running}
            style={{
              flex: 1, resize: 'none', background: 'var(--bg-2)',
              border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text-0)', fontSize: 12, padding: '7px 10px',
              outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              type="button"
              onClick={running ? stop : () => void run()}
              disabled={!running && (!prompt.trim() || participants.length < 2)}
              style={{
                background: running ? 'var(--red-dim)' : 'var(--accent)',
                border: running ? '1px solid var(--red)' : 'none',
                color: running ? 'var(--red)' : '#000',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {running ? <><Pause size={12} /> STOP</> : <><Send size={12} /> DEBATE</>}
            </button>
            {runMode === 'synthesis' && <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
              <input type="checkbox" checked={synthesize} onChange={(e) => setSynthesize(e.target.checked)} disabled={running} style={{ accentColor: 'var(--accent)' }} />
              SYNTHESIZE
            </label>}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Columns area */}
      {Object.keys(participantStates).length > 0 ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          {/* Participant columns */}
          {runMode === 'synthesis' && <div style={{ display: 'flex', gap: 10, marginBottom: 10, minHeight: 200 }}>
            {participants.map((p) => (
              <ParticipantColumn
                key={p.id}
                participant={p}
                state={participantStates[p.id] || { text: '', done: false, error: null, started: false }}
                onRemove={() => removeParticipant(p.id)}
              />
            ))}
          </div>}

          {/* Synthesis section */}
          {synthesisStarted && (
            <div style={{
              border: `1px solid ${synthesisRunning ? 'var(--accent)' : 'var(--green)'}`,
              borderRadius: 12, overflow: 'hidden',
              background: 'var(--bg-1)',
              transition: 'border-color 0.3s ease',
            }}>
              <div style={{
                padding: '8px 12px', background: 'var(--bg-2)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: synthesisRunning ? 'var(--accent)' : 'var(--green)', animation: synthesisRunning ? 'pulse-accent 1.4s ease infinite' : 'none' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: synthesisRunning ? 'var(--accent)' : 'var(--green)' }}>
                  {synthesisRunning ? 'SYNTHESIZING...' : 'SYNTHESIS — BEST COMPOSITE ANSWER'}
                </span>
                {synthesisRunning && <Loader size={10} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
                {!synthesisRunning && synthesis && <CheckCircle2 size={12} color="var(--green)" />}
              </div>
              <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-0)', lineHeight: 1.7 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  code({ children, ...props }: any) {
                    return <code style={{ background: 'var(--bg-3)', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }} {...props}>{children}</code>
                  },
                  p({ children }) { return <p style={{ marginBottom: 10 }}>{children}</p> },
                }}>
                  {synthesis}
                </ReactMarkdown>
                {synthesisRunning && (
                  <span style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--accent)', animation: 'blink 1s step-end infinite', marginLeft: 2, verticalAlign: 'middle' }} />
                )}
              </div>
            </div>
          )}

          {runMode === 'debate' && debateTurns.length > 0 && (
            <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-1)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setDebateExpanded((value) => !value)}
                style={{ width: '100%', border: 'none', background: 'var(--bg-2)', color: 'var(--text-0)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              >
                {debateExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                LIVE DEBATE TRANSCRIPT
                <span style={{ marginLeft: 'auto', color: 'var(--text-2)', fontSize: 10 }}>{debateTurns.length} turns</span>
              </button>
              {debateExpanded && (
                <div style={{ display: 'grid', gap: 10, padding: 10 }}>
                  {debateTurns.map((turn) => (
                    <ParticipantColumn
                      key={turn.id}
                      participant={{ id: turn.id, provider: turn.provider, model: '', name: turn.name, color: turn.color }}
                      state={turn}
                      onRemove={() => {}}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', color: 'var(--border-bright)', letterSpacing: '-0.02em' }}>
            [ CONFERENCE ]
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.7, maxWidth: 380 }}>
            Select 2-6 models, write your question, hit DEBATE.
            Each model answers independently. A synthesizer reads all
            responses and produces the single best answer.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Which sorting algorithm is fastest?', 'Explain quantum entanglement', 'Best practices for API design?', 'How does React reconciliation work?'].map((eg) => (
              <button key={eg} type="button" onClick={() => { setPrompt(eg); textareaRef.current?.focus() }}
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', cursor: 'pointer' }}>
                {eg}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
