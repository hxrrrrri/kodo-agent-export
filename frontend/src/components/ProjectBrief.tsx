/**
 * ProjectBrief — persistent context notes that get silently injected
 * into every message Kodo receives. Like a permanent system context:
 * "I'm using React 18, TypeScript strict, targeting Node 22."
 *
 * Stored in localStorage. Injected via a wrapper in useChat/handleSend.
 */
import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, X } from 'lucide-react'

const LS_KEY = 'kodo-project-brief-v1'

export function loadProjectBrief(): string {
  try { return localStorage.getItem(LS_KEY) || '' } catch { return '' }
}

export function saveProjectBrief(v: string) {
  try {
    if (v.trim()) localStorage.setItem(LS_KEY, v)
    else localStorage.removeItem(LS_KEY)
  } catch { /* ignore */ }
}

/** Wrap a user prompt with the brief if non-empty. */
export function applyProjectBrief(prompt: string): string {
  const brief = loadProjectBrief().trim()
  if (!brief) return prompt
  return `[Project context — always keep in mind:\n${brief}\n]\n\n${prompt}`
}

type Props = {
  open: boolean
  onToggle: () => void
}

export function ProjectBrief({ open, onToggle }: Props) {
  const [value, setValue] = useState(() => loadProjectBrief())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 40)
  }, [open])

  function handleChange(v: string) {
    setValue(v)
    saveProjectBrief(v)
  }

  const hasContent = value.trim().length > 0
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-1)',
      flexShrink: 0,
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 16px', background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--text-2)',
        }}
      >
        <BookOpen size={11} color={hasContent ? 'var(--accent)' : 'var(--text-2)'} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
          color: hasContent ? 'var(--accent)' : 'var(--text-2)',
        }}>
          PROJECT BRIEF
        </span>
        {hasContent && (
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', marginLeft: 2 }}>
            ({wordCount}w — injected into every message)
          </span>
        )}
        {!hasContent && (
          <span style={{ fontSize: 9, color: 'var(--text-2)' }}>
            — persistent context injected into every message
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-2)', display: 'flex' }}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 10px' }}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Write persistent context here — stack, constraints, conventions, team rules, project goals…
Example: React 18 + TypeScript strict mode. Backend FastAPI on Python 3.12. All DB access is read-only. We use Tailwind for styling. Deployment target: AWS Lambda."
            rows={4}
            style={{
              width: '100%', resize: 'vertical',
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-0)', fontSize: 12,
              padding: '8px 10px', outline: 'none',
              fontFamily: 'var(--font-sans)', lineHeight: 1.6,
              boxSizing: 'border-box',
              borderColor: hasContent ? 'var(--accent)' : 'var(--border)',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.target.style.borderColor = hasContent ? 'var(--accent)' : 'var(--border)' }}
          />
          {hasContent && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                Active — auto-prepended to every prompt
              </span>
              <button
                type="button"
                onClick={() => handleChange('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontFamily: 'var(--font-mono)' }}
              >
                <X size={9} /> CLEAR
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
