import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileText, Plus, RotateCcw, Search, Settings, Zap } from 'lucide-react'
import { Message, useChatStore } from '../store/chatStore'

export interface PaletteAction {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  shortcut?: string
  onRun: () => void
}

type Props = {
  open: boolean
  onClose: () => void
  extraActions?: PaletteAction[]
}

/** Download the current conversation as a Markdown file. */
export function exportConversationAsMarkdown(messages: Message[], sessionId: string | null): void {
  const lines: string[] = ['# Kodo Conversation Export\n']
  if (sessionId) lines.push(`**Session:** \`${sessionId}\`\n`)
  lines.push(`**Exported:** ${new Date().toLocaleString()}\n\n---\n`)

  for (const msg of messages) {
    if (msg.role === 'system') continue
    const heading = msg.role === 'user' ? '## You' : '## Kodo'
    lines.push(heading)
    if (msg.content.trim()) {
      // Strip <thinking> blocks from export
      const body = msg.content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trimStart()
      lines.push(body)
    }
    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        lines.push(`\n> **Tool:** \`${tc.tool}\``)
        if (tc.output) lines.push(`>\n> \`\`\`\n> ${tc.output.slice(0, 500)}\n> \`\`\``)
      }
    }
    lines.push('')
  }

  const content = lines.join('\n')
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kodo-${sessionId?.slice(0, 8) ?? 'export'}-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

export function CommandPalette({ open, onClose, extraActions = [] }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const messages = useChatStore((s) => s.messages)
  const sessionId = useChatStore((s) => s.sessionId)
  const sessions = useChatStore((s) => s.sessions)
  const availableModes = useChatStore((s) => s.availableModes)
  const setSessionMode = useChatStore((s) => s.setSessionMode)

  const baseActions: PaletteAction[] = useMemo(() => {
    const modeActions: PaletteAction[] = availableModes.map((m) => ({
      id: `mode-${m.key}`,
      label: `Switch to ${m.title} mode`,
      description: m.summary,
      icon: <Zap size={14} />,
      onRun: () => setSessionMode(m.key),
    }))

    return [
      {
        id: 'export-md',
        label: 'Export conversation as Markdown',
        description: 'Download current session as .md file',
        icon: <Download size={14} />,
        shortcut: '⇧⌘E',
        onRun: () => {
          exportConversationAsMarkdown(messages, sessionId)
          onClose()
        },
      },
      {
        id: 'new-session',
        label: 'New session',
        description: 'Start a fresh conversation',
        icon: <Plus size={14} />,
        shortcut: '⌘N',
        onRun: () => {
          window.dispatchEvent(new CustomEvent('kodo:new-session'))
          onClose()
        },
      },
      {
        id: 'session-list',
        label: 'Browse sessions',
        description: `${sessions.length} saved sessions`,
        icon: <FileText size={14} />,
        onRun: () => {
          window.dispatchEvent(new CustomEvent('kodo:open-sidebar'))
          onClose()
        },
      },
      ...modeActions,
      {
        id: 'settings',
        label: 'Open provider settings',
        description: 'Manage LLM providers and API keys',
        icon: <Settings size={14} />,
        onRun: () => {
          window.dispatchEvent(new CustomEvent('kodo:open-providers'))
          onClose()
        },
      },
      ...extraActions,
    ]
  }, [availableModes, messages, sessionId, sessions.length, extraActions, setSessionMode, onClose])

  const filtered = useMemo(() => {
    if (!query.trim()) return baseActions
    return baseActions.filter((a) =>
      fuzzyMatch(query, a.label) || (a.description && fuzzyMatch(query, a.description))
    )
  }, [query, baseActions])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  const run = useCallback((action: PaletteAction) => {
    action.onRun()
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        const action = filtered[selected]
        if (action) run(action)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, selected, run, onClose])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 540,
          maxWidth: '90vw',
          background: 'var(--bg-1)',
          border: '1px solid var(--border-bright)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <Search size={16} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions…"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-0)',
              fontSize: 15,
              fontFamily: 'var(--font-sans)',
            }}
          />
          <kbd style={{
            fontSize: 10,
            color: 'var(--text-2)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '2px 5px',
            fontFamily: 'var(--font-mono)',
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            maxHeight: 340,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-2)', textAlign: 'center' }}>
              No actions match "{query}"
            </div>
          ) : (
            filtered.map((action, i) => (
              <button
                key={action.id}
                type="button"
                onClick={() => run(action)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '9px 16px',
                  background: i === selected ? 'var(--accent-dim)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: i === selected ? 'var(--text-0)' : 'var(--text-1)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={() => setSelected(i)}
              >
                <span style={{ color: 'var(--accent)', flexShrink: 0, display: 'flex' }}>
                  {action.icon ?? <RotateCcw size={14} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, display: 'block' }}>{action.label}</span>
                  {action.description && (
                    <span style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginTop: 1 }}>
                      {action.description}
                    </span>
                  )}
                </span>
                {action.shortcut && (
                  <kbd style={{
                    fontSize: 10,
                    color: 'var(--text-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '2px 5px',
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                  }}>{action.shortcut}</kbd>
                )}
              </button>
            ))
          )}
        </div>

        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '6px 16px',
          fontSize: 10,
          color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          gap: 12,
        }}>
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
