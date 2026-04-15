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
  const [logoPhase, setLogoPhase] = useState(0) // 0..2 for subtle morph
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seedRef = useRef(0)

  // Cycle thinking label every 2.2s
  useEffect(() => {
    setLabelIndex(0)
    seedRef.current = 0

    intervalRef.current = setInterval(() => {
      seedRef.current += 1
      setLabelIndex(seedRef.current)
    }, 2200)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeTool])

  // Logo morph phase cycle (3 phases) every 600ms for gentle animation
  useEffect(() => {
    logoIntervalRef.current = setInterval(() => {
      setLogoPhase((prev) => (prev + 1) % 3)
    }, 600)
    return () => {
      if (logoIntervalRef.current) clearInterval(logoIntervalRef.current)
    }
  }, [])

  // Determine displayed label
  const label = (() => {
    if (activeTool) {
      const key = activeTool.toLowerCase()
      const toolLabels = TOOL_LABELS[key]
      if (toolLabels) return pickLabel(toolLabels, labelIndex)
      // Generic tool label
      const name = activeTool.replace(/_/g, ' ')
      return `Running ${name}...`
    }
    return THINKING_LABELS[labelIndex % THINKING_LABELS.length]
  })()

  // Logo opacity pulses gently across 3 phases
  const opacities = [0.65, 1, 0.8]
  const scales = [0.96, 1.04, 0.99]
  const logoOpacity = opacities[logoPhase]
  const logoScale = scales[logoPhase]

  // Accent color for logo — use CSS var so it adapts to theme
  const logoColor = activeTool ? 'var(--yellow)' : 'var(--logo-primary)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        margin: '4px 0 10px',
        borderRadius: 10,
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        width: 'fit-content',
        animation: 'fadeIn 0.22s ease',
        boxShadow: activeTool
          ? '0 0 0 1px var(--yellow-dim), 0 2px 12px rgba(0,0,0,0.18)'
          : '0 2px 12px rgba(0,0,0,0.14)',
      }}
    >
      {/* Animated Kodo logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          transition: 'opacity 0.55s ease, transform 0.55s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          filter: activeTool
            ? 'drop-shadow(0 0 6px rgba(255,215,0,0.45))'
            : 'drop-shadow(0 0 5px rgba(255,122,47,0.4))',
        }}
      >
        <KodoLogoMark size={20} color={logoColor} decorative />
      </div>

      {/* Cycling label */}
      <span
        key={label}
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: activeTool ? 'var(--yellow)' : 'var(--text-1)',
          letterSpacing: '0.04em',
          animation: 'thinkingLabelFade 0.3s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>

      {/* Animated dots */}
      <span className="thinking-dots">
        <span /><span /><span />
      </span>
    </div>
  )
}
