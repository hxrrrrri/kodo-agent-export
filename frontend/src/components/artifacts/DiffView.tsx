import { useMemo } from 'react'

type Props = {
  before: string
  after: string
  filename?: string
}

interface Line {
  type: 'same' | 'add' | 'remove'
  text: string
  beforeNo: number | null
  afterNo: number | null
}

/**
 * Minimal line-level LCS diff. No external dependency — sufficient for
 * artifact version comparison where files rarely exceed a few thousand lines.
 */
function diffLines(before: string, after: string): Line[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const lines: Line[] = []
  let i = 0
  let j = 0
  let aNo = 1
  let bNo = 1
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: 'same', text: a[i], beforeNo: aNo, afterNo: bNo })
      i += 1; j += 1; aNo += 1; bNo += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'remove', text: a[i], beforeNo: aNo, afterNo: null })
      i += 1; aNo += 1
    } else {
      lines.push({ type: 'add', text: b[j], beforeNo: null, afterNo: bNo })
      j += 1; bNo += 1
    }
  }
  while (i < n) { lines.push({ type: 'remove', text: a[i], beforeNo: aNo, afterNo: null }); i += 1; aNo += 1 }
  while (j < m) { lines.push({ type: 'add', text: b[j], beforeNo: null, afterNo: bNo }); j += 1; bNo += 1 }

  return lines
}

export function DiffView({ before, after, filename }: Props) {
  const lines = useMemo(() => diffLines(before, after), [before, after])

  return (
    <div style={{
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: 12,
      background: '#080810',
      color: '#c5c8d0',
      padding: '8px 0',
      overflow: 'auto',
      height: '100%',
    }}>
      {filename && (
        <div style={{
          padding: '4px 12px',
          color: '#8a8e99',
          fontSize: 10,
          letterSpacing: '0.08em',
          borderBottom: '1px solid #2a2a33',
        }}>
          {filename}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          {lines.map((line, idx) => {
            const bg = line.type === 'add' ? 'rgba(46, 160, 67, 0.12)' : line.type === 'remove' ? 'rgba(248, 81, 73, 0.12)' : 'transparent'
            const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
            const color = line.type === 'add' ? '#7ee787' : line.type === 'remove' ? '#ffa198' : 'inherit'
            return (
              <tr key={idx} style={{ background: bg }}>
                <td style={{ width: 36, textAlign: 'right', padding: '0 4px', color: '#555', userSelect: 'none' }}>{line.beforeNo ?? ''}</td>
                <td style={{ width: 36, textAlign: 'right', padding: '0 4px', color: '#555', userSelect: 'none' }}>{line.afterNo ?? ''}</td>
                <td style={{ width: 16, color: '#666', userSelect: 'none', textAlign: 'center' }}>{marker}</td>
                <td style={{ padding: '0 4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color }}>{line.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
