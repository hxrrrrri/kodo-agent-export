import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Copy, Zap } from 'lucide-react'

function estimateTokens(text: string): number {
  if (!text.trim()) return 0
  return Math.round(text.trim().split(/\s+/).length * 1.35)
}

type Tier = 'the best' | 'great' | 'good' | 'intermediate' | 'basic'

interface Method {
  id: string
  label: string
  tier: Tier
  shortDesc: string
  longDesc: string
  compress: (input: string) => string
}

const TIER_COLORS: Record<Tier, { bg: string; color: string }> = {
  'the best': { bg: '#EAF3DE', color: '#27500A' },
  great: { bg: '#E1F5EE', color: '#085041' },
  good: { bg: '#E6F1FB', color: '#0C447C' },
  intermediate: { bg: '#FAEEDA', color: '#633806' },
  basic: { bg: '#F1EFE8', color: '#5F5E5A' },
}

function stripFiller(text: string): string {
  return text
    .replace(/please\s+/gi, '')
    .replace(/I want you to\s*/gi, '')
    .replace(/carefully\s+/gi, '')
    .replace(/make sure (?:you |that |)/gi, '')
    .replace(/\s+and\s+also\s+/gi, ' ')
    .replace(/\s+also\s+/gi, ' ')
    .replace(/\s+that\s+/gi, ' ')
    .replace(/called\s+/gi, '')
    .replace(/the file\s+/gi, 'file ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractFile(text: string): string {
  return text.match(/file(?:s?)?\s+(?:called\s+)?([a-zA-Z0-9_./-]+)/i)?.[1] ?? ''
}

function extractFocus(text: string): string[] {
  const focus: string[] = []
  if (/bug|issue|problem/i.test(text)) focus.push('bugs')
  if (/error.?handl/i.test(text)) focus.push('error-handling')
  if (/auth/i.test(text)) focus.push('auth')
  if (/test/i.test(text) && !/don.?t break|preserve/i.test(text)) focus.push('tests')
  if (/perf|slow|optim/i.test(text)) focus.push('performance')
  if (/secur|vuln/i.test(text)) focus.push('security')
  return focus
}

function extractConstraints(text: string): string[] {
  const constraints: string[] = []
  if (/don.?t break|preserve.*test|no.*break.*test/i.test(text)) constraints.push('preserve-tests')
  if (/don.?t creat|no new file/i.test(text)) constraints.push('no-new-files')
  if (/don.?t refactor|no refactor/i.test(text)) constraints.push('no-refactor')
  if (/backward.compat/i.test(text)) constraints.push('backward-compatible')
  return constraints
}

const METHODS: Method[] = [
  {
    id: 'default',
    label: 'Default (no compression)',
    tier: 'basic',
    shortDesc: 'Keeps your prompt unchanged. 0% reduction.',
    longDesc: 'Uses your original prompt exactly as-is with no compression transforms. Best when you want full phrasing preserved.',
    compress(text) {
      return text
    },
  },
  {
    id: 'hybrid',
    label: 'Hybrid (XML + imperative stripping)',
    tier: 'the best',
    shortDesc: 'XML structure + filler removal. 70-85% reduction. Used in production AI pipelines.',
    longDesc: 'Strips all filler words first (please, carefully, make sure, also...), then wraps the remaining intent in semantic XML tags that Claude reads natively. Best of both worlds - maximum compression with zero meaning loss.',
    compress(text) {
      const stripped = stripFiller(text)
      const file = extractFile(stripped)
      const focus = extractFocus(stripped)
      const constraints = extractConstraints(stripped)
      const task = /fix/i.test(stripped)
        ? 'fix'
        : /add|implement/i.test(stripped)
          ? 'implement'
          : /audit|check|review/i.test(stripped)
            ? 'audit'
            : 'review'
      let output = `<task>${task}</task>\n`
      if (file) output += `<file>${file}</file>\n`
      if (focus.length) output += `<focus>${focus.join(', ')}</focus>\n`
      if (constraints.length) output += `<constraints>${constraints.join('; ')}</constraints>\n`
      output += '<o>diff-only</o>'
      return output
    },
  },
  {
    id: 'xml',
    label: 'XML schema compression',
    tier: 'the best',
    shortDesc: 'Semantic XML tags only. 65-80% reduction. Claude reads XML natively.',
    longDesc: "Wraps every instruction in semantic XML tags - <task>, <file>, <focus>, <constraints>, <o> (output format). No prose stripping needed - the tags themselves carry the structure. Claude's training heavily weights XML-tagged content.",
    compress(text) {
      const file = extractFile(text)
      const focus = extractFocus(text)
      const constraints = extractConstraints(text)
      const task = /fix/i.test(text) ? 'fix' : /add|implement/i.test(text) ? 'implement' : 'audit'
      let output = `<task>${task}</task>\n`
      if (file) output += `<file>${file}</file>\n`
      if (focus.length) output += `<focus>${focus.join(', ')}</focus>\n`
      if (constraints.length) output += `<constraints>${constraints.join('; ')}</constraints>\n`
      output += '<o>changes-only</o>'
      return output
    },
  },
  {
    id: 'diff',
    label: 'Diff / surgical edit format',
    tier: 'great',
    shortDesc: 'FILE: / LINE: / CHANGE: format. Eliminates file pastes. 90%+ for large files.',
    longDesc: 'Specifies code changes as structured diff entries instead of pasting full files. A 2781-line file paste costs ~3700 tokens. The same change as FILE:/LINE:/CHANGE: costs 8 tokens. The biggest single token saving available.',
    compress(text) {
      const file = extractFile(text) || 'target.py'
      const action = /fix/i.test(text) ? 'fix bug' : /add/i.test(text) ? 'add feature' : 'audit and improve'
      const focus = extractFocus(text)
      const constraints = extractConstraints(text)
      return `FILE: ${file}\nSECTION: ${focus.length ? `${focus.join(', ')} function` : 'target function'}\nACTION: ${action}\n${constraints.length ? `CONSTRAINT: ${constraints.join(', ')}\n` : ''}OUTPUT: minimal diff only`
    },
  },
  {
    id: 'kv',
    label: 'Key-value pairs (KV)',
    tier: 'great',
    shortDesc: 'Bare key: value lines. ~60% reduction. Fast to write by hand.',
    longDesc: 'Converts all prose into bare key: value lines. No sentences, no connectives, no filler. Each concept on its own line. Especially good for task configuration and agent settings.',
    compress(text) {
      const lines: string[] = []
      const file = extractFile(text)
      if (file) lines.push(`file: ${file}`)
      const focus = extractFocus(text)
      if (focus.length) lines.push(`focus: ${focus.join(', ')}`)
      const constraints = extractConstraints(text)
      if (constraints.length) lines.push(`constraints: ${constraints.join(', ')}`)
      const task = /fix/i.test(text) ? 'fix' : /add|implement/i.test(text) ? 'implement' : 'audit'
      lines.unshift(`task: ${task}`)
      lines.push('output: changes-only')
      return lines.join('\n')
    },
  },
  {
    id: 'imperative',
    label: 'Imperative stripping',
    tier: 'good',
    shortDesc: 'Removes all filler words only. 20-40% reduction. Zero-effort preprocessing.',
    longDesc: 'Removes "please", "carefully", "I want you to", "make sure", "also", and all connective filler. Claude ignores politeness tokens entirely - they are pure waste. Quick to apply, always safe to combine with other methods.',
    compress: stripFiller,
  },
  {
    id: 'structured',
    label: 'Structured bullets',
    tier: 'intermediate',
    shortDesc: 'Task header + numbered bullets. 30-50% reduction. Human-readable.',
    longDesc: 'Converts prose into a task header followed by numbered constraint bullets. Less powerful than XML but keeps the prompt human-readable. Good when you need to share the prompt with a team.',
    compress(text) {
      const file = extractFile(text) || 'target.py'
      const bullets: string[] = []
      const focus = extractFocus(text)
      if (focus.includes('auth')) bullets.push('Audit the authentication function')
      if (focus.includes('bugs')) bullets.push('Identify all bugs')
      if (focus.includes('error-handling')) bullets.push('Verify error handling completeness')
      if (focus.includes('security')) bullets.push('Check for security vulnerabilities')
      const constraints = extractConstraints(text)
      if (constraints.includes('preserve-tests')) bullets.push('Preserve all existing tests')
      if (!bullets.length) bullets.push('Review and improve the code')
      bullets.push('Output: changes only, no prose explanation')
      return `task: review ${file}\n\n${bullets.map((bullet, index) => `${index + 1}. ${bullet}`).join('\n')}`
    },
  },
  {
    id: 'alias',
    label: 'Session alias shorthand',
    tier: 'basic',
    shortDesc: 'Define abbreviations once, use throughout. Compounds over long sessions.',
    longDesc: 'Define shorthand aliases at session start (BE=backend/, FE=frontend/, CW=ChatWindow.tsx, PT=pytest command), then use them for all follow-up messages. Saves tokens progressively - the longer the session, the bigger the saving.',
    compress(text) {
      const aliases: Record<string, string> = {
        'main.py': 'MP',
        'backend/': 'BE',
        'frontend/src/': 'FE',
        authentication: 'auth',
        'error handling': 'err-hdl',
        'existing tests': 'tests',
        changes: 'delta',
        function: 'fn',
        implement: 'impl',
      }

      let header = '# session aliases\n'
      const used: string[] = []
      let compressed = text
      for (const [key, value] of Object.entries(aliases)) {
        if (text.toLowerCase().includes(key.toLowerCase())) {
          used.push(`${value}=${key}`)
          compressed = compressed.replace(new RegExp(key, 'gi'), value)
        }
      }
      compressed = stripFiller(compressed)
      if (!used.length) return stripFiller(text)
      return `${header}${used.join('  ')}\n\n${compressed}`
    },
  },
]

interface Props {
  onUsePrompt?: (compressed: string) => void
}

export function PromptCompressorPanel({ onUsePrompt }: Props) {
  const [input, setInput] = useState('')
  const [methodId, setMethodId] = useState('default')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)

  const method = METHODS.find((candidate) => candidate.id === methodId) ?? METHODS[0]
  const tierStyle = TIER_COLORS[method.tier]

  const inTokens = estimateTokens(input)
  const outTokens = estimateTokens(output)
  const saved = Math.max(0, inTokens - outTokens)
  const pct = inTokens > 0 ? Math.round((saved / inTokens) * 100) : 0

  const run = useCallback(() => {
    if (!input.trim()) return
    setOutput(method.compress(input))
  }, [input, method])

  useEffect(() => {
    if (!input.trim()) {
      setOutput('')
      return
    }
    setOutput(method.compress(input))
  }, [input, method])

  const copy = () => {
    if (!output) return
    navigator.clipboard.writeText(output).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const useInChat = () => {
    if (output && onUsePrompt) onUsePrompt(output)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
            <select
              value={methodId}
              onChange={(event) => setMethodId(event.target.value)}
              style={{
                width: '100%',
                padding: '7px 32px 7px 10px',
                fontSize: 13,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--bg-1)',
                color: 'var(--text-1)',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              {METHODS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--text-2)',
              }}
            />
          </div>

          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 3,
              letterSpacing: '.04em',
              background: tierStyle.bg,
              color: tierStyle.color,
              flexShrink: 0,
            }}
          >
            {method.tier}
          </span>

          <button
            type="button"
            onClick={run}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--accent)',
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Zap size={13} />
            Compress
          </button>
        </div>

        <div
          style={{
            fontSize: 11,
            color: 'var(--text-2)',
            lineHeight: 1.55,
            padding: '7px 12px',
            background: 'var(--bg-2)',
            borderRadius: 'var(--radius)',
            borderLeft: `2px solid ${tierStyle.color}`,
          }}
        >
          {method.longDesc}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Input</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>~{inTokens} tokens</span>
          </div>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste your prompt here..."
            style={{
              height: 160,
              resize: 'vertical',
              padding: 10,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-1)',
              color: 'var(--text-1)',
              lineHeight: 1.6,
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Compressed</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {output && (
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: '#27500A',
                    background: '#EAF3DE',
                    padding: '1px 6px',
                    borderRadius: 3,
                  }}
                >
                  -{pct}% ({saved} tokens saved)
                </span>
              )}
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>~{outTokens} tokens</span>
            </div>
          </div>
          <textarea
            value={output}
            readOnly
            placeholder="Compressed output appears here..."
            style={{
              height: 160,
              resize: 'vertical',
              padding: 10,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-2)',
              color: 'var(--text-1)',
              lineHeight: 1.6,
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={copy}
          disabled={!output}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            fontSize: 12,
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'none',
            color: 'var(--text-2)',
            cursor: output ? 'pointer' : 'not-allowed',
            opacity: output ? 1 : 0.5,
          }}
        >
          <Copy size={12} />
          {copied ? 'Copied!' : 'Copy'}
        </button>

        {onUsePrompt && (
          <button
            type="button"
            onClick={useInChat}
            disabled={!output}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--accent)',
              background: 'none',
              color: 'var(--accent)',
              cursor: output ? 'pointer' : 'not-allowed',
              opacity: output ? 1 : 0.5,
            }}
          >
            Use in chat
          </button>
        )}

        {output && inTokens > 0 && (
          <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                flex: 1,
                height: 6,
                background: 'var(--bg-2)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, pct)}%`,
                  height: '100%',
                  background: pct >= 60 ? '#639922' : pct >= 30 ? '#1D9E75' : '#378ADD',
                  borderRadius: 3,
                  transition: 'width 0.4s',
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{pct}% saved</span>
          </div>
        )}
      </div>
    </div>
  )
}
