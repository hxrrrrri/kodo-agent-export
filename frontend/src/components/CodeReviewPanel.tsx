import { CSSProperties, useState } from 'react'
import { Play, Send } from 'lucide-react'
import { buildApiHeaders, parseApiError } from '../lib/api'

interface CodeReviewPanelProps {
  sessionId: string | null
  projectDir: string
}

export function CodeReviewPanel({ sessionId, projectDir }: CodeReviewPanelProps) {
  const [baseBranch, setBaseBranch] = useState('main')
  const [branch, setBranch] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState('')

  const runCodeReview = async () => {
    const trimmedBranch = branch.trim()
    if (!trimmedBranch) {
      setError('Branch name is required.')
      return
    }

    setRunning(true)
    setError('')
    setReview('')
    try {
      const response = await fetch('/api/chat/code-review', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          session_id: sessionId,
          branch: trimmedBranch,
          base_branch: baseBranch.trim() || 'main',
          project_dir: projectDir || null,
        }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      const data = await response.json()
      setReview(String(data.review || 'No review content returned.'))
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '10px 10px 12px', display: 'grid', gap: 8 }}>
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--bg-2)',
        padding: 8,
        display: 'grid',
        gap: 6,
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-0)' }}>AI Code Review</div>
        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
          Generates a risk-first review for a git branch diff.
        </div>
      </div>

      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Base branch</span>
        <input
          type="text"
          value={baseBranch}
          onChange={(event) => setBaseBranch(event.target.value)}
          placeholder="main"
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Review branch</span>
        <input
          type="text"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          placeholder="feature/my-branch"
          style={inputStyle}
        />
      </label>

      <button
        type="button"
        onClick={() => void runCodeReview()}
        disabled={running}
        style={buttonStyle}
      >
        <Play size={12} /> {running ? 'Running review...' : 'Run Review'}
      </button>

      <textarea
        value={review}
        onChange={(event) => setReview(event.target.value)}
        placeholder="Review output appears here"
        rows={14}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 220, fontFamily: 'var(--font-mono)' }}
      />

      <button
        type="button"
        disabled={!review.trim()}
        onClick={() => {
          window.dispatchEvent(new CustomEvent('kodo:insert-prompt', { detail: { text: review } }))
        }}
        style={buttonStyle}
      >
        <Send size={12} /> Insert In Chat
      </button>

      {error && <div style={{ fontSize: 11, color: 'var(--red)' }}>{error}</div>}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  color: 'var(--text-0)',
  borderRadius: 8,
  padding: '7px 9px',
  fontSize: 12,
  outline: 'none',
}

const buttonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-3)',
  color: 'var(--text-1)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '7px 8px',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
}
