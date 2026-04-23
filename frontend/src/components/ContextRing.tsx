import { useMemo } from 'react'
import { Message } from '../store/chatStore'

type Props = {
  messages: Message[]
  budget: number
}

/** Circular progress ring showing context window usage. */
export function ContextRing({ messages, budget }: Props) {
  const used = useMemo(() => {
    // Sum output tokens as a proxy for total context consumed
    let total = 0
    for (const m of messages) {
      if (m.usage) {
        total += (m.usage.input_tokens || 0)
        total += (m.usage.output_tokens || 0)
      } else {
        // Rough estimate: 3 chars ≈ 1 token
        total += Math.ceil((m.content?.length || 0) / 3)
      }
    }
    return total
  }, [messages])

  const pct = Math.min(used / budget, 1)
  const r = 14
  const circumference = 2 * Math.PI * r
  const dash = circumference * (1 - pct)

  const color = pct < 0.6 ? 'var(--green, #2ecc71)' : pct < 0.85 ? 'var(--yellow, #f1c40f)' : 'var(--red, #e74c3c)'

  const label =
    used < 1000 ? `${used}` :
    used < 10000 ? `${(used / 1000).toFixed(1)}k` :
    `${Math.round(used / 1000)}k`

  const budgetLabel = budget >= 1000 ? `${Math.round(budget / 1000)}k` : String(budget)

  return (
    <div
      title={`Context: ${used.toLocaleString()} / ${budget.toLocaleString()} tokens (${Math.round(pct * 100)}%)`}
      style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'default' }}
    >
      <svg width={34} height={34} style={{ flexShrink: 0 }}>
        {/* Track */}
        <circle
          cx={17} cy={17} r={r}
          fill="none"
          stroke="var(--border, #333)"
          strokeWidth={3}
        />
        {/* Progress */}
        <circle
          cx={17} cy={17} r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={dash}
          strokeLinecap="round"
          transform="rotate(-90 17 17)"
          style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
        />
        {/* Label */}
        <text
          x={17} y={21}
          textAnchor="middle"
          fill={color}
          fontSize={7.5}
          fontFamily="var(--font-mono, monospace)"
          style={{ transition: 'fill 0.3s ease' }}
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', lineHeight: 1.3 }}>
        <div style={{ color }}>{label}</div>
        <div style={{ opacity: 0.6 }}>/{budgetLabel}</div>
      </div>
    </div>
  )
}
