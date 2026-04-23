import { useMemo } from 'react'
import { Message } from '../store/chatStore'

type Suggestion = { label: string; prompt: string; icon: string }

/** Derive 2-4 contextual suggestions from the last assistant message. */
function derivesuggestions(messages: Message[]): Suggestion[] {
  const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.content?.trim())
  if (!last) return []
  const content = last.content.toLowerCase()

  const hints: Suggestion[] = []

  // Code-related
  if (/```|function|class |def |const |import /.test(content)) {
    hints.push({ icon: '🧪', label: 'Write tests', prompt: 'Write comprehensive unit tests for the code above.' })
    hints.push({ icon: '🛡️', label: 'Add error handling', prompt: 'Add proper error handling and edge-case guards to the code above.' })
    if (/python|def |import /.test(content))
      hints.push({ icon: '⚡', label: 'Optimize performance', prompt: 'Optimize the Python code above for better performance and memory efficiency.' })
    if (/react|jsx|tsx|component/.test(content))
      hints.push({ icon: '🎨', label: 'Add Tailwind styling', prompt: 'Style the React component above using Tailwind CSS utility classes.' })
  }

  // Explanation / analysis
  if (/explain|because|therefore|means that|however/.test(content) && hints.length < 4) {
    hints.push({ icon: '📖', label: 'Summarize in bullet points', prompt: 'Summarize the key points above as a concise bullet list.' })
    hints.push({ icon: '🔍', label: 'Go deeper', prompt: 'Go deeper into the most complex aspect of what you just explained.' })
  }

  // Plan / steps
  if (/step [0-9]|first,|then,|finally,|1\.|2\./.test(content)) {
    hints.push({ icon: '🚀', label: 'Start implementing', prompt: 'Now implement step 1 from the plan above.' })
    hints.push({ icon: '⚠️', label: 'Identify risks', prompt: 'What are the biggest risks and failure points in the plan above?' })
  }

  // Bug / error
  if (/error|bug|fix|traceback|exception|undefined|null/.test(content)) {
    hints.push({ icon: '🧲', label: 'Reproduce the bug', prompt: 'Write a minimal reproducible test case for this bug.' })
    hints.push({ icon: '🩹', label: 'Apply the fix', prompt: 'Apply the fix described above and show the complete updated code.' })
  }

  // Generic fallback
  if (hints.length === 0) {
    hints.push({ icon: '➕', label: 'Continue', prompt: 'Continue from where you left off.' })
    hints.push({ icon: '❓', label: 'Explain further', prompt: 'Explain the most important part of your last response in simpler terms.' })
    hints.push({ icon: '🔄', label: 'Try a different approach', prompt: 'Try a completely different approach to the problem above.' })
  }

  return hints.slice(0, 4)
}

type Props = {
  messages: Message[]
  isLoading: boolean
  onSelect: (prompt: string) => void
}

export function SmartSuggestions({ messages, isLoading, onSelect }: Props) {
  const suggestions = useMemo(() => derivesuggestions(messages), [messages])

  const lastIsAssistant = messages.length > 0 && messages[messages.length - 1]?.role === 'assistant'
  if (!lastIsAssistant || isLoading || suggestions.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      padding: '0 32px 10px',
      animation: 'fadeIn 0.3s ease',
    }}>
      {suggestions.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onSelect(s.prompt)}
          title={s.prompt}
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            color: 'var(--text-1)',
            fontSize: 11,
            fontFamily: 'var(--font-sans)',
            padding: '5px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-3)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-1)'
          }}
        >
          <span>{s.icon}</span>
          {s.label}
        </button>
      ))}
    </div>
  )
}
