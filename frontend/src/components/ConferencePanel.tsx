/**
 * ConferencePanel — Multi-Model Live Debate.
 *
 * Sends the same prompt to 2-6 different AI models.
 * In DEBATE mode: models respond to each other in a live chat timeline.
 * In SYNTHESIZE mode: parallel responses + best composite answer.
 *
 * After the debate: shows Best Answers, Best Code, and Best Suggestions sections.
 * The live debate log is collapsible and stays collapsible when saved to session.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Lightbulb,
  Loader,
  Pause,
  Plus,
  Send,
  Trophy,
  X,
  Zap,
} from 'lucide-react'
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

interface DebateTurn {
  id: string
  name: string
  provider: string
  color: string
  round: number
  text: string
  done: boolean
  error: string | null
  started: boolean
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
  anthropic: '#d97756',
}

const DEFAULT_PARTICIPANTS: Participant[] = [
  { id: '0', provider: 'openai', model: '', name: 'GPT-4o', color: PROVIDER_COLORS.openai },
  { id: '1', provider: 'groq', model: '', name: 'Llama 3', color: PROVIDER_COLORS.groq },
]

type KnownProvider = { name: string; big_model: string; configured: boolean; healthy: boolean }
type ConferenceModelsResponse = { models: Record<string, string[]> }

// ── Debate Message Bubble ──────────────────────────────────────────────────────

function DebateBubble({ turn }: { turn: DebateTurn }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0' }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: `${turn.color}22`, border: `2px solid ${turn.color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: turn.color,
      }}>
        {turn.name.slice(0, 2).toUpperCase()}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: turn.color, fontFamily: 'var(--font-mono)' }}>
            {turn.name}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            Round {turn.round}
          </span>
          {turn.started && !turn.done && !turn.error && (
            <Loader size={10} color={turn.color} style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {turn.done && !turn.error && <CheckCircle2 size={11} color={turn.color} />}
        </div>

        <div style={{
          background: 'var(--bg-2)', borderRadius: 10,
          border: `1px solid ${turn.error ? 'var(--red)' : turn.done ? `${turn.color}44` : 'var(--border)'}`,
          padding: '10px 14px',
          fontSize: 13, lineHeight: 1.7, color: 'var(--text-0)',
          transition: 'border-color 0.3s',
        }}>
          {turn.error ? (
            <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              Error: {turn.error}
            </span>
          ) : turn.text ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                code({ children, ...props }: any) {
                  return <code style={{ background: 'var(--bg-3)', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }} {...props}>{children}</code>
                },
                p({ children }) { return <p style={{ marginBottom: 6 }}>{children}</p> },
              }}>
                {turn.text}
              </ReactMarkdown>
              {!turn.done && (
                <span style={{ display: 'inline-block', width: 6, height: 12, background: turn.color, animation: 'blink 1s step-end infinite', marginLeft: 2, verticalAlign: 'middle' }} />
              )}
            </>
          ) : (
            <span style={{ color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>Thinking...</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Synthesis / Parallel response column ──────────────────────────────────────

function ParticipantColumn({ participant, state }: { participant: Participant; state: ParticipantState }) {
  return (
    <div style={{
      flex: 1, minWidth: 200,
      border: `1px solid ${state.error ? 'var(--red)' : state.done ? participant.color : 'var(--border)'}`,
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: 'var(--bg-1)', transition: 'border-color 0.3s',
    }}>
      <div style={{
        padding: '7px 12px', background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: participant.color }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)', flex: 1 }}>
          {participant.name}
        </span>
        {state.started && !state.done && !state.error && (
          <Loader size={10} color={participant.color} style={{ animation: 'spin 1s linear infinite' }} />
        )}
        {state.done && !state.error && <CheckCircle2 size={11} color={participant.color} />}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-1)' }}>
        {state.error ? (
          <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Error: {state.error}</div>
        ) : state.text ? (
          <>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              code({ children, ...props }: any) {
                return <code style={{ background: 'var(--bg-3)', borderRadius: 3, padding: '1px 4px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }} {...props}>{children}</code>
              },
              p({ children }) { return <p style={{ marginBottom: 7 }}>{children}</p> },
            }}>{state.text}</ReactMarkdown>
            {!state.done && (
              <span style={{ display: 'inline-block', width: 6, height: 12, background: participant.color, animation: 'blink 1s step-end infinite', marginLeft: 2, verticalAlign: 'middle' }} />
            )}
          </>
        ) : state.started ? (
          <div style={{ color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>Thinking...</div>
        ) : null}
      </div>
    </div>
  )
}

// ── Best-Of Section ────────────────────────────────────────────────────────────

function extractBestSections(texts: string[]): { bestAnswer: string; bestCode: string; bestSuggestions: string } {
  let bestAnswer = ''
  let bestCode = ''
  let bestSuggestions = ''

  // Find longest substantive answer
  const sorted = [...texts].sort((a, b) => b.length - a.length)
  bestAnswer = sorted[0] || ''

  // Extract first code block found
  for (const t of texts) {
    const codeMatch = t.match(/```[\w]*\n([\s\S]*?)```/)
    if (codeMatch) {
      bestCode = codeMatch[0]
      break
    }
  }

  // Extract bullet point suggestions
  const suggestions: string[] = []
  for (const t of texts) {
    const lines = t.split('\n')
    for (const line of lines) {
      if (/^[\s]*[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        const clean = line.trim().replace(/^[-*\d.]+\s+/, '')
        if (clean.length > 20 && !suggestions.includes(clean)) {
          suggestions.push(clean)
        }
      }
    }
  }
  bestSuggestions = suggestions.slice(0, 6).map((s) => `- ${s}`).join('\n')

  return { bestAnswer, bestCode, bestSuggestions }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function ConferencePanel() {
  const sessionId = useChatStore((state) => state.sessionId)
  const [participants, setParticipants] = useState<Participant[]>(DEFAULT_PARTICIPANTS)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [participantStates, setParticipantStates] = useState<Record<string, ParticipantState>>({})
  const [debateTurns, setDebateTurns] = useState<DebateTurn[]>([])
  const [debateExpanded, setDebateExpanded] = useState(true)
  const [bestExpanded, setBestExpanded] = useState(true)
  const [synthesis, setSynthesis] = useState('')
  const [synthesisRunning, setSynthesisRunning] = useState(false)
  const [synthesisStarted, setSynthesisStarted] = useState(false)
  const [knownProviders, setKnownProviders] = useState<KnownProvider[]>([])
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({})
  const [synthesize, setSynthesize] = useState(true)
  const [runMode, setRunMode] = useState<'synthesis' | 'debate'>('debate')
  const [error, setError] = useState<string | null>(null)
  const [debateDone, setDebateDone] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debateEndRef = useRef<HTMLDivElement>(null)

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

  // Auto-scroll debate feed
  useEffect(() => {
    if (running) debateEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [debateTurns, running])

  function addParticipant() {
    if (participants.length >= 6) return
    const configured = knownProviders.filter((p) => p.configured)
    const unused = configured.find((p) => !participants.some((part) => part.provider === p.name))
    const provider = unused?.name || 'openai'
    const color = PROVIDER_COLORS[provider] || '#888'
    setParticipants((prev) => [...prev, { id: String(Date.now()), provider, model: '', name: provider, color }])
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
    setDebateExpanded(true)
    setBestExpanded(true)
    setSynthesisStarted(false)
    setSynthesisRunning(false)
    setDebateDone(false)

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
              id, name, provider, round,
              color: PROVIDER_COLORS[provider] || '#888',
              text: '', done: false, error: null, started: true,
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
            setDebateDone(true)
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setRunning(false)
      setSynthesisRunning(false)
      setDebateDone(true)
    }
  }, [prompt, participants, runMode, sessionId, synthesize])

  const configuredProviderNames = knownProviders.filter((p) => p.configured).map((p) => p.name)

  function participantModelOptions(participant: Participant): string[] {
    const models = modelsByProvider[participant.provider] || []
    const current = String(participant.model || '').trim()
    if (!current || models.includes(current)) return models
    return [current, ...models]
  }

  const allParticipantTexts = Object.values(participantStates).map((s) => s.text).filter(Boolean)
  const debateTexts = debateTurns.map((t) => t.text).filter(Boolean)
  const allTexts = [...allParticipantTexts, ...debateTexts]
  const bestSections = debateDone && allTexts.length > 0 ? extractBestSections(allTexts) : null

  const hasResults = Object.keys(participantStates).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header / Controls */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Zap size={14} color="var(--accent)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>
            MULTI-MODEL CONFERENCE
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            {participants.length} models · {runMode}
          </span>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)', overflow: 'hidden', marginBottom: 8 }}>
          {(['debate', 'synthesis'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setRunMode(mode)} disabled={running} style={{
              border: 'none', borderRight: mode === 'debate' ? '1px solid var(--border)' : 'none',
              background: runMode === mode ? 'var(--accent-dim)' : 'transparent',
              color: runMode === mode ? 'var(--accent)' : 'var(--text-2)',
              fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 10px', cursor: running ? 'not-allowed' : 'pointer',
            }}>
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Participants */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {participants.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              border: `1px solid ${p.color}`, borderRadius: 8,
              padding: '3px 8px', background: `${p.color}11`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
              <select value={p.provider} onChange={(e) => updateParticipant(p.id, { provider: e.target.value })} disabled={running}
                style={{ background: 'none', border: 'none', color: 'var(--text-0)', fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', outline: 'none' }}>
                {knownProviders.filter((kp) => kp.configured).map((kp) => (
                  <option key={kp.name} value={kp.name}>{kp.name}</option>
                ))}
                {configuredProviderNames.length === 0 && <option value={p.provider}>{p.provider}</option>}
              </select>
              <select value={p.model} onChange={(e) => updateParticipant(p.id, { model: e.target.value })} disabled={running}
                style={{ maxWidth: 160, background: 'none', border: 'none', color: 'var(--text-0)', fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', outline: 'none' }}>
                {!p.model && <option value="">default</option>}
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
              background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 8,
              padding: '3px 8px', cursor: 'pointer', color: 'var(--text-2)', fontSize: 10,
              fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <Plus size={9} /> ADD
            </button>
          )}
        </div>

        {/* Prompt */}
        <div style={{ display: 'flex', gap: 6 }}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void run() } }}
            placeholder="Topic to debate... (Cmd+Enter to start)"
            rows={2}
            disabled={running}
            style={{
              flex: 1, resize: 'none', background: 'var(--bg-2)',
              border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text-0)', fontSize: 13, padding: '7px 10px',
              outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.5, boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button type="button" onClick={running ? stop : () => void run()}
              disabled={!running && (!prompt.trim() || participants.length < 2)}
              style={{
                background: running ? 'var(--red-dim)' : 'var(--accent)',
                border: running ? '1px solid var(--red)' : 'none',
                color: running ? 'var(--red)' : '#000',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              {running ? <><Pause size={12} /> STOP</> : <><Send size={12} /> DEBATE</>}
            </button>
            {runMode === 'synthesis' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                <input type="checkbox" checked={synthesize} onChange={(e) => setSynthesize(e.target.checked)} disabled={running} style={{ accentColor: 'var(--accent)' }} />
                SYNTHESIZE
              </label>
            )}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{error}</div>
        )}
      </div>

      {/* Results area */}
      {hasResults ? (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* SYNTHESIS mode: parallel columns */}
          {runMode === 'synthesis' && Object.keys(participantStates).length > 0 && (
            <div style={{ padding: 10 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, minHeight: 180 }}>
                {participants.map((p) => (
                  <ParticipantColumn
                    key={p.id}
                    participant={p}
                    state={participantStates[p.id] || { text: '', done: false, error: null, started: false }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* DEBATE mode: live chat timeline */}
          {runMode === 'debate' && debateTurns.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setDebateExpanded((v) => !v)} style={{
                width: '100%', border: 'none', background: 'var(--bg-2)',
                color: 'var(--text-0)', padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
                borderBottom: debateExpanded ? '1px solid var(--border)' : 'none',
              }}>
                {debateExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Zap size={12} color="var(--accent)" />
                LIVE DEBATE
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-2)' }}>
                  {debateTurns.length} turns · {debateTurns.filter((t) => t.done).length} done
                </span>
                {running && <Loader size={10} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
              </button>

              {debateExpanded && (
                <div style={{ padding: '4px 14px 8px', background: 'var(--bg-0)' }}>
                  {debateTurns.map((turn) => (
                    <DebateBubble key={turn.id} turn={turn} />
                  ))}
                  <div ref={debateEndRef} />
                </div>
              )}
            </div>
          )}

          {/* Synthesis result */}
          {synthesisStarted && (
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{
                padding: '8px 14px', background: 'var(--bg-2)',
                display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: synthesisRunning ? 'var(--accent)' : 'var(--green)', animation: synthesisRunning ? 'pulse-accent 1.4s ease infinite' : 'none' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: synthesisRunning ? 'var(--accent)' : 'var(--green)' }}>
                  {synthesisRunning ? 'SYNTHESIZING...' : 'SYNTHESIS — BEST COMPOSITE ANSWER'}
                </span>
                {synthesisRunning && <Loader size={10} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
                {!synthesisRunning && synthesis && <CheckCircle2 size={12} color="var(--green)" />}
              </div>
              <div style={{ padding: '12px 16px', fontSize: 13.5, color: 'var(--text-0)', lineHeight: 1.75 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  code({ children, ...props }: any) {
                    return <code style={{ background: 'var(--bg-3)', borderRadius: 3, padding: '1px 5px', fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--green)' }} {...props}>{children}</code>
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

          {/* Best-of section — shown after debate completes */}
          {bestSections && (
            <div>
              <button type="button" onClick={() => setBestExpanded((v) => !v)} style={{
                width: '100%', border: 'none', background: 'var(--bg-2)',
                color: 'var(--text-0)', padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
                borderBottom: bestExpanded ? '1px solid var(--border)' : 'none',
              }}>
                {bestExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Trophy size={12} color="var(--yellow)" />
                BEST ANSWERS &amp; INSIGHTS
              </button>

              {bestExpanded && (
                <div style={{ padding: '0 0 16px' }}>
                  {/* Best Answer */}
                  {bestSections.bestAnswer && (
                    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Award size={13} color="var(--yellow)" />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>BEST ANSWER</span>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text-0)' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          code({ children, ...props }: any) {
                            return <code style={{ background: 'var(--bg-3)', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }} {...props}>{children}</code>
                          },
                          p({ children }) { return <p style={{ marginBottom: 8 }}>{children}</p> },
                        }}>
                          {bestSections.bestAnswer.length > 1500 ? bestSections.bestAnswer.slice(0, 1500) + '...' : bestSections.bestAnswer}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Best Code */}
                  {bestSections.bestCode && (
                    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Code2 size={13} color="var(--green)" />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>BEST CODE</span>
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-0)' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          code({ children, ...props }: any) {
                            return <code style={{ background: 'var(--bg-3)', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }} {...props}>{children}</code>
                          },
                        }}>
                          {bestSections.bestCode}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Best Suggestions */}
                  {bestSections.bestSuggestions && (
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Lightbulb size={13} color="var(--blue)" />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>KEY INSIGHTS</span>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text-0)' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          li({ children }) { return <li style={{ marginBottom: 6, paddingLeft: 4 }}>{children}</li> },
                        }}>
                          {bestSections.bestSuggestions}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <div style={{ fontSize: 30, fontFamily: 'var(--font-mono)', color: 'var(--border-bright)', letterSpacing: '-0.02em' }}>[ CONFERENCE ]</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.7, maxWidth: 380 }}>
            Select 2–6 models and a topic. In DEBATE mode, models argue back and forth in a live timeline.
            Best answers, code, and insights are extracted when the debate finishes.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              'Which sorting algorithm is fastest in practice?',
              'Best practices for React performance?',
              'Explain quantum entanglement simply',
              'REST vs GraphQL vs tRPC?',
            ].map((eg) => (
              <button key={eg} type="button" onClick={() => { setPrompt(eg); textareaRef.current?.focus() }}
                style={{
                  background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 20,
                  padding: '5px 12px', fontSize: 10, fontFamily: 'var(--font-mono)',
                  color: 'var(--text-1)', cursor: 'pointer',
                }}>
                {eg}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
