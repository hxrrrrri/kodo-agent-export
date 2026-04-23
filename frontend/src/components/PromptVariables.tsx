import { useEffect, useRef, useState } from 'react'

/** Extract unique {{variable}} names from a prompt string. */
export function extractVariables(text: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const [, name] of text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)) {
    if (!seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

/** Replace {{variable}} placeholders with provided values. */
export function applyVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_, name) => values[name] ?? `{{${name}}}`)
}

type Props = {
  prompt: string
  variables: string[]
  onApply: (resolved: string) => void
  onCancel: () => void
}

export function PromptVariablesModal({ prompt, variables, onApply, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(variables.map((v) => [v, '']))
  )
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => firstRef.current?.focus(), 40)
  }, [])

  const allFilled = variables.every((v) => values[v]?.trim())

  function handleSubmit() {
    if (!allFilled) return
    onApply(applyVariables(prompt, values))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border-bright)',
          borderRadius: 14,
          padding: 24,
          width: 420,
          maxWidth: '92vw',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', marginBottom: 4 }}>
            FILL VARIABLES
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Fill in the <code style={{ color: 'var(--accent)', fontSize: 11 }}>{'{{variable}}'}</code> placeholders before sending.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {variables.map((name, i) => (
            <div key={name}>
              <label style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 5 }}>
                {name}
              </label>
              <input
                ref={i === 0 ? firstRef : undefined}
                value={values[name] || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allFilled) handleSubmit()
                  if (e.key === 'Escape') onCancel()
                }}
                placeholder={`Enter ${name}…`}
                style={{
                  width: '100%',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-0)',
                  padding: '9px 12px',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>

        {/* Preview */}
        {allFilled && (
          <div style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 11,
            color: 'var(--text-1)',
            fontFamily: 'var(--font-mono)',
            marginBottom: 16,
            maxHeight: 80,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {applyVariables(prompt, values).slice(0, 280)}{prompt.length > 280 ? '…' : ''}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              borderRadius: 8,
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allFilled}
            style={{
              background: allFilled ? 'var(--accent)' : 'var(--bg-3)',
              border: 'none',
              color: allFilled ? '#fff' : 'var(--text-2)',
              borderRadius: 8,
              padding: '8px 20px',
              cursor: allFilled ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
            }}
          >
            SEND →
          </button>
        </div>
      </div>
    </div>
  )
}
