/**
 * SessionInsights — real-time analytics for the current conversation.
 *
 * Shows: message counts, tool usage frequency, token cost breakdown,
 * most-used files, dominant topics (extracted from message content),
 * response time patterns. Entirely client-side — no backend needed.
 */
import { useMemo } from 'react'
import { BarChart2, Clock, Code2, FileText, Zap } from 'lucide-react'
import { Message, useChatStore } from '../store/chatStore'

// ── Topic extractor ────────────────────────────────────────────────────────────

const TOPIC_PATTERNS: Array<{ label: string; patterns: string[] }> = [
  { label: 'React / Frontend', patterns: ['react', 'component', 'jsx', 'tsx', 'tailwind', 'css', 'html', 'frontend'] },
  { label: 'Python', patterns: ['python', 'def ', 'import ', 'pip', 'pytest', 'django', 'fastapi'] },
  { label: 'TypeScript', patterns: ['typescript', 'interface ', 'type ', 'tsx', ':string', ':number', 'zod'] },
  { label: 'Debugging', patterns: ['error', 'bug', 'fix', 'traceback', 'exception', 'undefined', 'null', 'crash'] },
  { label: 'Testing', patterns: ['test', 'spec', 'vitest', 'pytest', 'jest', 'assert', 'coverage'] },
  { label: 'Git / VCS', patterns: ['git ', 'commit', 'branch', 'merge', 'pull request', 'diff'] },
  { label: 'Database', patterns: ['sql', 'query', 'postgres', 'sqlite', 'schema', 'migration', 'database'] },
  { label: 'API / Backend', patterns: ['api', 'endpoint', 'fastapi', 'express', 'rest', 'graphql', 'request'] },
  { label: 'Architecture', patterns: ['architecture', 'design pattern', 'refactor', 'structure', 'module'] },
  { label: 'Documentation', patterns: ['readme', 'docs', 'document', 'comment', 'explain', 'summarize'] },
]

function extractTopics(messages: Message[]): Array<{ label: string; count: number }> {
  const combined = messages.map((m) => m.content.toLowerCase()).join(' ')
  return TOPIC_PATTERNS
    .map(({ label, patterns }) => ({
      label,
      count: patterns.reduce((sum, p) => {
        let n = 0, i = 0
        while ((i = combined.indexOf(p, i)) !== -1) { n++; i += p.length }
        return sum + n
      }, 0),
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

function extractTopFiles(messages: Message[]): string[] {
  const files = new Map<string, number>()
  const pathRe = /[\w./\\-]+\.(ts|tsx|py|js|jsx|json|md|css|html|yaml|yml|toml|go|rs|cpp|c|h)\b/g
  for (const m of messages) {
    for (const match of m.content.matchAll(pathRe)) {
      const f = match[0]
      files.set(f, (files.get(f) || 0) + 1)
    }
    for (const tc of m.toolCalls || []) {
      const inp = JSON.stringify(tc.input || {})
      for (const match of inp.matchAll(pathRe)) {
        const f = match[0]
        files.set(f, (files.get(f) || 0) + 2) // weight tool calls higher
      }
    }
  }
  return Array.from(files.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([f]) => f)
}

// ── MiniBar component ──────────────────────────────────────────────────────────

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text-1)' }}>{label}</span>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{value}</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SessionInsights() {
  const messages = useChatStore((s) => s.messages)

  const stats = useMemo(() => {
    const userMsgs = messages.filter((m) => m.role === 'user')
    const assistantMsgs = messages.filter((m) => m.role === 'assistant')

    // Token totals
    let totalIn = 0, totalOut = 0, totalCacheRead = 0, totalCost = 0
    for (const m of assistantMsgs) {
      if (m.usage) {
        totalIn += m.usage.input_tokens || 0
        totalOut += m.usage.output_tokens || 0
        totalCacheRead += m.usage.input_cache_read_tokens || 0
      }
    }
    // Rough cost estimate (Sonnet pricing)
    totalCost = (totalIn / 1e6) * 3 + (totalOut / 1e6) * 15

    // Tool usage
    const toolCounts = new Map<string, number>()
    for (const m of messages) {
      for (const tc of m.toolCalls || []) {
        toolCounts.set(tc.tool, (toolCounts.get(tc.tool) || 0) + 1)
      }
    }
    const topTools = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const totalTools = Array.from(toolCounts.values()).reduce((a, b) => a + b, 0)
    const avgResponseLen = assistantMsgs.length > 0
      ? Math.round(assistantMsgs.reduce((s, m) => s + m.content.length, 0) / assistantMsgs.length)
      : 0

    return {
      userCount: userMsgs.length,
      assistantCount: assistantMsgs.length,
      totalIn, totalOut, totalCacheRead, totalCost,
      topTools,
      totalTools,
      avgResponseLen,
      topics: extractTopics(messages),
      topFiles: extractTopFiles(messages),
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-2)', fontSize: 12 }}>
        Start a conversation to see insights.
      </div>
    )
  }

  const maxTool = stats.topTools[0]?.[1] || 1

  return (
    <div style={{ padding: '10px 14px', overflowY: 'auto', height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <BarChart2 size={13} color="var(--accent)" />
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.1em' }}>
          SESSION INSIGHTS
        </span>
      </div>

      {/* Message counts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'You', value: stats.userCount, color: 'var(--accent)' },
          { label: 'Kodo', value: stats.assistantCount, color: 'var(--blue)' },
          { label: 'Tools', value: stats.totalTools, color: 'var(--green)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 2, letterSpacing: '0.06em' }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Token usage */}
      <div style={{ marginBottom: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '0.08em', marginBottom: 8 }}>
          TOKEN USAGE
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: '↑ Input', value: stats.totalIn.toLocaleString(), color: 'var(--blue)' },
            { label: '↓ Output', value: stats.totalOut.toLocaleString(), color: 'var(--accent)' },
            { label: 'Cache hit', value: stats.totalCacheRead.toLocaleString(), color: 'var(--green)' },
            { label: 'Est. cost', value: `$${stats.totalCost.toFixed(4)}`, color: 'var(--yellow)' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: 'var(--text-2)' }}>{label}</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top tools */}
      {stats.topTools.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <Zap size={11} color="var(--yellow)" />
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '0.08em' }}>TOP TOOLS</span>
          </div>
          {stats.topTools.map(([tool, count]) => (
            <MiniBar key={tool} label={tool} value={count} max={maxTool} color="var(--yellow)" />
          ))}
        </div>
      )}

      {/* Topics */}
      {stats.topics.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <BarChart2 size={11} color="var(--blue)" />
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '0.08em' }}>CONVERSATION TOPICS</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {stats.topics.map(({ label, count }) => (
              <span key={label} style={{
                background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '3px 8px', fontSize: 10, color: 'var(--text-1)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {label}
                <span style={{ fontSize: 8, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top files */}
      {stats.topFiles.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <FileText size={11} color="var(--green)" />
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '0.08em' }}>MOST REFERENCED FILES</span>
          </div>
          {stats.topFiles.map((f) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <Code2 size={10} color="var(--text-2)" />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Avg response length */}
      {stats.avgResponseLen > 0 && (
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <Clock size={10} color="var(--text-2)" />
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '0.08em' }}>AVG RESPONSE LENGTH</span>
          </div>
          <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--text-0)' }}>
            {stats.avgResponseLen.toLocaleString()} chars
          </div>
        </div>
      )}
    </div>
  )
}
