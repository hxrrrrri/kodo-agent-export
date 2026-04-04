import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// SPECIES DEFINITIONS
// Each species has frames for: idle, think, run, happy, sleep, error
// ─────────────────────────────────────────────────────────────────────────────
type Mood = 'idle' | 'think' | 'run' | 'happy' | 'sleep' | 'error'

interface Species {
  name: string
  emoji: string
  rarity: 'common' | 'rare' | 'legendary'
  frames: Record<Mood, string[]>
  color: string
}

const SPECIES: Species[] = [
  {
    name: 'Duck',
    emoji: '🦆',
    rarity: 'common',
    color: '#f5c842',
    frames: {
      idle:  ['>(")>', '>(" )>', '>(")>' ],
      think: ['>(?.)', '>(?. )', '>(?.)', ],
      run:   ['>(")>', ' >(")>', '  >(")>'],
      happy: ['>(^)>', '>(^.)>', '>(^)>' ],
      sleep: ['>(-)>', '>( - )>', '>(-)>' ],
      error: ['>(x)>', '>(x.)>', '>(x)>' ],
    },
  },
  {
    name: 'Dragon',
    emoji: '🐉',
    rarity: 'rare',
    color: '#a855f7',
    frames: {
      idle:  ['=>(• •)>', '=>( •)>', '=>(• )>'],
      think: ['=>(?  )>', '=>( ? )>', '=>(?  )>'],
      run:   ['~>(• •)>', ' ~>(• •)', '  ~>(•)>'],
      happy: ['=>(^ ^)>', '=>(^.^)>', '=>(^ ^)>'],
      sleep: ['=>(- -)>', '=>( - )>', '=>(- -)>'],
      error: ['=>(x x)>', '=>(x.x)>', '=>(x x)>'],
    },
  },
  {
    name: 'Axolotl',
    emoji: '🦎',
    rarity: 'rare',
    color: '#f472b6',
    frames: {
      idle:  ['<( ·  ·)>', '<( · · )>', '<( ·  ·)>'],
      think: ['<( ¿  ¿)>', '<( ¿  · )>', '<( ¿  ¿)>'],
      run:   ['<(~  ~)~', ' <(~ ~)~', '  <(~)~'],
      happy: ['<( ^  ^)>', '<( ^.^ )>', '<( ^  ^)>'],
      sleep: ['<( -  -)>', '<( -  - )>', '<( -  -)>'],
      error: ['<( x  x)>', '<( x.x )>', '<( x  x)>'],
    },
  },
  {
    name: 'Ghost',
    emoji: '👻',
    rarity: 'legendary',
    color: '#94a3b8',
    frames: {
      idle:  [' (o o) ', '  (o o)', ' (o o) '],
      think: [' (? ?) ', '  (? ?)', ' (? ?) '],
      run:   ['~(o o)~', ' ~(o o)', '  ~(o)~'],
      happy: [' (^ ^) ', '  (^.^)', ' (^ ^) '],
      sleep: [' (- -) ', '  (- -)', ' (- -) '],
      error: [' (x x) ', '  (x x)', ' (x x) '],
    },
  },
]

const HATS: Record<string, string> = {
  none:    '',
  cap:     '^',
  crown:   '♛',
  wizard:  '⌂',
  party:   '彡',
  santa:   'υ',
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────
interface BuddyStats {
  chaos: number     // increases when bughunter / error mode active
  snark: number     // increases when advisor says WARN/FAIL
  vibe:  number     // increases on happy events
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────
interface BuddyState {
  speciesIndex: number
  hat: string
  stats: BuddyStats
}

const STORAGE_KEY = 'kodo_buddy'

function loadBuddyState(): BuddyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { speciesIndex: 0, hat: 'none', stats: { chaos: 0, snark: 0, vibe: 0 } }
}

function saveBuddyState(state: BuddyState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT PROPS
// ─────────────────────────────────────────────────────────────────────────────
interface BuddyWidgetProps {
  isLoading: boolean
  activeTool: string | null
  voiceListening: boolean
  hasMessages: boolean
  lastMessageRole?: 'user' | 'assistant' | null
  advisorVerdict?: string | null
}

export function BuddyWidget({
  isLoading,
  activeTool,
  voiceListening,
  hasMessages,
  lastMessageRole,
  advisorVerdict,
}: BuddyWidgetProps) {
  const [state, setState] = useState<BuddyState>(loadBuddyState)
  const [frame, setFrame] = useState(0)
  const [showPicker, setShowPicker] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const frameRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derive current mood from props
  const mood: Mood = (() => {
    if (!hasMessages) return 'sleep'
    if (activeTool === 'bash' || activeTool === 'powershell' || activeTool === 'repl')
      return 'run'
    if (isLoading) return 'think'
    if (voiceListening) return 'happy'
    if (advisorVerdict && (advisorVerdict.includes('FAIL') || advisorVerdict.includes('WARN')))
      return 'error'
    if (lastMessageRole === 'assistant') return 'happy'
    return 'idle'
  })()

  const species = SPECIES[state.speciesIndex]
  const hat = HATS[state.hat] || ''
  const frames = species.frames[mood]

  // Animate frames
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    const speed = mood === 'run' ? 150 : mood === 'think' ? 400 : mood === 'sleep' ? 1200 : 500
    timerRef.current = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % frames.length
      setFrame(frameRef.current)
    }, speed)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [mood, frames.length])

  // Update stats on events
  useEffect(() => {
    setState(prev => {
      const next = { ...prev, stats: { ...prev.stats } }
      if (activeTool === 'bash' || activeTool === 'powershell') {
        next.stats.chaos = Math.min(99, prev.stats.chaos + 1)
      }
      if (advisorVerdict?.includes('WARN') || advisorVerdict?.includes('FAIL')) {
        next.stats.snark = Math.min(99, prev.stats.snark + 2)
      }
      if (lastMessageRole === 'assistant' && !isLoading) {
        next.stats.vibe = Math.min(99, prev.stats.vibe + 1)
      }
      saveBuddyState(next)
      return next
    })
  }, [activeTool, advisorVerdict, lastMessageRole, isLoading])

  const currentFrame = frames[frame] || frames[0]
  const rarityColor = species.rarity === 'legendary' ? '#f5c842'
    : species.rarity === 'rare' ? '#a855f7' : 'var(--text-2)'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>

      {/* ── main buddy display ── */}
      <div
        onClick={() => { setShowPicker(!showPicker); setShowStats(false) }}
        title={`${species.name} (${species.rarity}) · click to customize`}
        style={{
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          userSelect: 'none',
          width: 64,
        }}
      >
        {/* hat */}
        <div style={{
          height: 12,
          fontSize: 9,
          lineHeight: '12px',
          color: species.color,
          textAlign: 'center',
          letterSpacing: 1,
        }}>
          {hat}
        </div>

        {/* ascii frame */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          lineHeight: 1.4,
          color: species.color,
          whiteSpace: 'pre',
          textAlign: 'center',
          minWidth: 64,
          transition: 'color 0.3s',
        }}>
          {currentFrame}
        </div>

        {/* mood label */}
        <div style={{
          fontSize: 8,
          color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          marginTop: 1,
        }}>
          {mood}
        </div>
      </div>

      {/* ── stats bar (click buddy to toggle) ── */}
      {showStats && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '6px 8px',
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
          zIndex: 100,
          minWidth: 100,
        }}>
          <div style={{ color: rarityColor, fontWeight: 600, marginBottom: 4 }}>
            {species.emoji} {species.name}
            <span style={{ color: 'var(--text-2)', fontWeight: 400, marginLeft: 4 }}>
              [{species.rarity}]
            </span>
          </div>
          <StatBar label="CHAOS" value={state.stats.chaos} color="#ef4444" />
          <StatBar label="SNARK" value={state.stats.snark} color="#f59e0b" />
          <StatBar label="VIBE " value={state.stats.vibe}  color="#22c55e" />
        </div>
      )}

      {/* ── species + hat picker ── */}
      {showPicker && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '8px',
          zIndex: 100,
          minWidth: 140,
        }}>
          {/* header */}
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-mono)',
            color: 'var(--text-2)', marginBottom: 6,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>buddy</span>
            <button
              onClick={(e) => { e.stopPropagation(); setShowPicker(false); setShowStats(true) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-2)', fontSize: 9, padding: '0 2px',
                fontFamily: 'var(--font-mono)',
              }}>
              stats →
            </button>
          </div>

          {/* species grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
            {SPECIES.map((s, i) => (
              <button
                key={s.name}
                onClick={(e) => {
                  e.stopPropagation()
                  setState(prev => {
                    const next = { ...prev, speciesIndex: i }
                    saveBuddyState(next)
                    return next
                  })
                }}
                style={{
                  background: state.speciesIndex === i ? 'var(--bg-2)' : 'none',
                  border: `1px solid ${state.speciesIndex === i ? s.color : 'var(--border)'}`,
                  borderRadius: 3,
                  cursor: 'pointer',
                  padding: '4px 6px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}>
                <span style={{ fontSize: 10 }}>{s.emoji}</span>
                <span style={{
                  fontSize: 8, fontFamily: 'var(--font-mono)',
                  color: s.rarity === 'legendary' ? '#f5c842'
                       : s.rarity === 'rare' ? '#a855f7' : 'var(--text-2)',
                }}>
                  {s.name}
                </span>
              </button>
            ))}
          </div>

          {/* hat row */}
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-mono)',
            color: 'var(--text-2)', marginBottom: 4,
          }}>
            hat
          </div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {Object.entries(HATS).map(([key, glyph]) => (
              <button
                key={key}
                onClick={(e) => {
                  e.stopPropagation()
                  setState(prev => {
                    const next = { ...prev, hat: key }
                    saveBuddyState(next)
                    return next
                  })
                }}
                title={key}
                style={{
                  background: state.hat === key ? 'var(--bg-2)' : 'none',
                  border: `1px solid ${state.hat === key ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 3,
                  cursor: 'pointer',
                  width: 22,
                  height: 22,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-1)',
                }}>
                {glyph || '∅'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── tiny stat bar ───────────────────────────────────────────────────────────
function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
      <span style={{ color: 'var(--text-2)', width: 34 }}>{label}</span>
      <div style={{
        width: 48, height: 4, background: 'var(--bg-2)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${value}%`, height: '100%',
          background: color, borderRadius: 2,
          transition: 'width 0.4s',
        }} />
      </div>
      <span style={{ color: 'var(--text-2)', width: 20, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}
