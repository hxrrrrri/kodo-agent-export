import { useEffect, useRef, useState } from 'react'
import { KodoLogoMark } from './KodoLogoMark'

const THINKING_LABELS = [
  'Thinking...',
  'Reasoning deeply...',
  'Analyzing context...',
  'Flabbergasting...',
  'Processing...',
  'Crunching tokens...',
  'Connecting the dots...',
  'Reading the code...',
  'Strategizing...',
  'Hatching a plan...',
  'Going deep...',
  'Cooking something up...',
  'Almost there...',
  'Synthesizing...',
  'On it...',
  'Contemplating...',
  'Assembling thoughts...',
  'Diving in...',
  'Mapping it out...',
  'Brewing ideas...',
]

const TOOL_LABELS: Record<string, string[]> = {
  bash: ['Running shell...', 'Executing command...', 'Shell at work...'],
  powershell: ['Running PowerShell...', 'Executing script...'],
  repl: ['Running code...', 'Evaluating...', 'Crunching results...'],
  file_read: ['Reading file...', 'Scanning file...', 'Loading content...'],
  file_write: ['Writing file...', 'Saving changes...', 'Updating file...'],
  file_edit: ['Editing file...', 'Applying patch...', 'Modifying code...'],
  web_search: ['Searching the web...', 'Fetching results...', 'Browsing...'],
  web_fetch: ['Fetching page...', 'Loading URL...'],
  grep: ['Searching codebase...', 'Pattern matching...', 'Scanning files...'],
  glob: ['Globbing files...', 'Finding files...'],
  git_run: ['Running git...', 'Querying repo...'],
  database_query: ['Querying database...', 'Fetching rows...'],
  image_gen: ['Generating image...', 'Drawing pixels...', 'Imagining...'],
  screenshot: ['Taking screenshot...', 'Capturing page...'],
  crg_build_graph: ['Building code graph...', 'Parsing source...'],
  crg_semantic_search: ['Searching codebase...', 'Semantic scan...'],
  crg_get_architecture: ['Analyzing architecture...', 'Mapping modules...'],
  send_email: ['Sending email...', 'Delivering message...'],
}

function pickLabel(labels: string[], seed: number): string {
  return labels[seed % labels.length]
}

type Props = {
  activeTool: string | null
}

export function KodoThinkingIndicator({ activeTool }: Props) {
  const [labelIndex, setLabelIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seedRef = useRef(0)

  // Cycle label every 2.2s with a quick fade between
  useEffect(() => {
    setLabelIndex(0)
    seedRef.current = 0
    setVisible(true)

    intervalRef.current = setInterval(() => {
      // fade out, swap, fade in
      setVisible(false)
      setTimeout(() => {
        seedRef.current += 1
        setLabelIndex(seedRef.current)
        setVisible(true)
      }, 280)
    }, 2400)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeTool])

  // Determine displayed label
  const label = (() => {
    if (activeTool) {
      const key = activeTool.toLowerCase()
      const toolLabels = TOOL_LABELS[key]
      if (toolLabels) return pickLabel(toolLabels, labelIndex)
      const name = activeTool.replace(/_/g, ' ')
      return `Running ${name}...`
    }
    return THINKING_LABELS[labelIndex % THINKING_LABELS.length]
  })()

  const isToolActive = Boolean(activeTool)
  const orbitColor = isToolActive ? 'var(--yellow)' : 'var(--accent)'
  const logoColor = isToolActive ? 'var(--yellow)' : 'var(--logo-primary)'
  const glowColor = isToolActive
    ? 'rgba(255,215,0,0.55)'
    : 'rgba(255,122,47,0.5)'
  const glowColor2 = isToolActive
    ? 'rgba(255,215,0,0.18)'
    : 'rgba(255,77,33,0.2)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '4px 0 10px',
        margin: '2px 0 8px',
        animation: 'fadeIn 0.22s ease',
      }}
    >
      {/* ── Orbit ring + logo ── */}
      <div
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Outer glow ring (CSS animation via className) */}
        <div
          className="kodo-orbit-ring"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `1.5px solid ${orbitColor}`,
            opacity: 0.3,
          }}
        />

        {/* Spinning arc */}
        <div
          className="kodo-spin-arc"
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: orbitColor,
            borderRightColor: orbitColor,
          }}
        />

        {/* Slow counter-spin arc (secondary) */}
        <div
          className="kodo-spin-arc-reverse"
          style={{
            position: 'absolute',
            inset: 3,
            borderRadius: '50%',
            border: '1.5px solid transparent',
            borderBottomColor: isToolActive ? 'var(--yellow)' : 'var(--accent)',
            opacity: 0.55,
          }}
        />

        {/* Orbit dot */}
        <div
          className="kodo-orbit-dot"
          style={{
            position: 'absolute',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: orbitColor,
            boxShadow: `0 0 6px 2px ${glowColor}`,
            top: '50%',
            left: '50%',
            marginTop: -2.5,
            marginLeft: -2.5,
            transformOrigin: '2.5px 2.5px',
          }}
        />

        {/* Center logo */}
        <div
          className="kodo-logo-pulse"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            filter: `drop-shadow(0 0 5px ${glowColor2})`,
          }}
        >
          <KodoLogoMark size={18} color={logoColor} decorative />
        </div>
      </div>

      {/* ── Cycling label ── */}
      <span
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: isToolActive ? 'var(--yellow)' : 'var(--text-1)',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-3px)',
          transition: 'opacity 0.28s ease, transform 0.28s ease',
          minWidth: 170,
        }}
      >
        {label}
      </span>

      {/* ── Trailing dots ── */}
      <span className="thinking-dots">
        <span /><span /><span />
      </span>
    </div>
  )
}
