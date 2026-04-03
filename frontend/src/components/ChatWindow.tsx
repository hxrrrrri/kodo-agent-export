import { useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react'
import { Send, Square, FolderOpen, Zap } from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { MessageBubble } from './MessageBubble'
import { CommandDefinition } from '../store/chatStore'

const EXAMPLE_PROMPTS = [
  '/help',
  '/cost 7',
  '/session',
  '/memory show',
  '/mode',
  '/tasks',
  '/agents',
  '/skills',
  '/mcp list',
  'List all Python files in the current directory',
  'Read the contents of README.md',
  'Run the tests and show me the results',
]

const FALLBACK_COMMANDS: CommandDefinition[] = [
  { name: '/help', description: 'Show available commands' },
  { name: '/cost [days]', description: 'Show token and estimated cost usage' },
  { name: '/session', description: 'List recent sessions' },
  { name: '/session current', description: 'Show current session id' },
  { name: '/memory <text>', description: 'Append note to global memory' },
  { name: '/memory show', description: 'Show loaded memory context' },
  { name: '/mode', description: 'Show current session mode' },
  { name: '/mode list', description: 'List available execution modes' },
  { name: '/mode set <name>', description: 'Set session execution mode' },
  { name: '/mode reset', description: 'Reset mode to default' },
  { name: '/provider', description: 'Show provider profiles and active provider' },
  { name: '/provider list', description: 'List saved provider profiles' },
  { name: '/provider set <name>', description: 'Activate provider profile' },
  { name: '/doctor', description: 'Run runtime health checks' },
  { name: '/doctor report', description: 'Run and save full doctor report' },
  { name: '/router', description: 'Show smart router status' },
  { name: '/router strategy <name>', description: 'Set smart router strategy' },
  { name: '/model', description: 'Show current model/provider' },
  { name: '/model set <model>', description: 'Override model for this session' },
  { name: '/privacy', description: 'Show no-telemetry mode status' },
  { name: '/tasks', description: 'List recent tasks' },
  { name: '/tasks create <prompt>', description: 'Create a background task' },
  { name: '/tasks get <task_id>', description: 'Show task status' },
  { name: '/tasks stop <task_id>', description: 'Stop a running task' },
  { name: '/mcp list', description: 'List MCP server entries' },
  { name: '/mcp add <name> <command> [args...]', description: 'Add MCP server entry' },
  { name: '/mcp remove <name>', description: 'Remove MCP server entry' },
  { name: '/mcp tools <name>', description: 'Show discovered/configured tools' },
  { name: '/mcp call <name> <tool> [json_args]', description: 'Execute MCP tool' },
  { name: '/agents', description: 'List spawned sub-agents' },
  { name: '/agents spawn <goal>', description: 'Spawn sub-agent' },
  { name: '/agents get <agent_id>', description: 'Show sub-agent details' },
  { name: '/agents stop <agent_id>', description: 'Stop sub-agent' },
  { name: '/skills', description: 'List bundled skills' },
  { name: '/skills show <name>', description: 'Show skill content' },
]

function leadingCommandToken(value: string): string {
  const trimmed = value.trimStart()
  if (!trimmed.startsWith('/')) return ''
  const first = trimmed.split(/\s+/, 1)[0]
  return first.toLowerCase()
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  let j = 0
  while (i < needle.length && j < haystack.length) {
    if (needle[i] === haystack[j]) i += 1
    j += 1
  }
  return i === needle.length
}

function levenshteinDistance(a: string, b: string, maxDistance = 3): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = 0; i < rows; i += 1) dp[i][0] = i
  for (let j = 0; j < cols; j += 1) dp[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    let rowMin = maxDistance + 1
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
      rowMin = Math.min(rowMin, dp[i][j])
    }
    if (rowMin > maxDistance) return maxDistance + 1
  }

  return dp[rows - 1][cols - 1]
}

function commandScore(query: string, commandName: string): number {
  if (!query.startsWith('/')) return -1
  const queryLower = query.toLowerCase()
  const nameLower = commandName.toLowerCase()
  const root = nameLower.split(/\s+/, 1)[0]

  if (queryLower === nameLower || queryLower === root) return 300
  if (root.startsWith(queryLower)) return 220 - (root.length - queryLower.length)
  if (nameLower.startsWith(queryLower)) return 200 - (nameLower.length - queryLower.length)
  if (root.includes(queryLower)) return 160
  if (isSubsequence(queryLower, root)) return 130

  const dist = levenshteinDistance(queryLower, root, 2)
  if (dist <= 2) return 120 - dist * 10

  return -1
}

function buildCommandSuggestions(input: string, commands: CommandDefinition[]): CommandDefinition[] {
  const token = leadingCommandToken(input)
  if (!token) return []

  const ranked = commands
    .map((command) => ({ command, score: commandScore(token, command.name) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.command.name.localeCompare(b.command.name)
    })

  return ranked.slice(0, 8).map((item) => item.command)
}

export function ChatWindow() {
  const {
    messages,
    isLoading,
    error,
    commands,
    loadCommands,
    sendMessage,
    stopGeneration,
    projectDir,
    setProjectDir,
    sessionId,
    sessionMode,
    availableModes,
    setSessionMode,
    permissionChallenges,
    respondPermission,
  } = useChat()
  const [input, setInput] = useState('')
  const [showProjectInput, setShowProjectInput] = useState(false)
  const [permissionSubmitting, setPermissionSubmitting] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const commandsRequestedRef = useRef(false)

  const activePermission = permissionChallenges.length > 0 ? permissionChallenges[0] : null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (commandsRequestedRef.current) return
    commandsRequestedRef.current = true
    void loadCommands()
  }, [loadCommands])

  const commandCatalog = commands.length > 0 ? commands : FALLBACK_COMMANDS
  const commandSuggestions = useMemo(() => buildCommandSuggestions(input, commandCatalog), [input, commandCatalog])
  const showCommandSuggestions = commandSuggestions.length > 0 && input.trimStart().startsWith('/')

  useEffect(() => {
    setActiveCommandIndex(0)
  }, [input, showCommandSuggestions])

  const applyCommandSuggestion = (name: string) => {
    const next = `${name}${name.includes('<') ? '' : ' '}`
    setInput(next)
    setActiveCommandIndex(0)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
      textareaRef.current.selectionEnd = textareaRef.current.value.length
    })
  }

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || isLoading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    sendMessage(msg)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandSuggestions && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const total = commandSuggestions.length
      setActiveCommandIndex((prev) => (prev + delta + total) % total)
      return
    }

    if (showCommandSuggestions && e.key === 'Tab') {
      e.preventDefault()
      const selected = commandSuggestions[activeCommandIndex]
      if (selected) applyCommandSuggestion(selected.name)
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  const handlePermissionDecision = async (approve: boolean, remember: boolean) => {
    if (!activePermission || permissionSubmitting) return
    setPermissionSubmitting(true)
    await respondPermission(activePermission.challenge_id, approve, remember, sessionId)
    setPermissionSubmitting(false)
  }

  const isEmpty = messages.length === 0
  const modes = availableModes.length > 0
    ? availableModes
    : [
      { key: 'execute', title: 'Execute', summary: 'Balanced autonomous execution.', is_default: true },
      { key: 'plan', title: 'Plan', summary: 'Plan-first execution.', is_default: false },
      { key: 'debug', title: 'Debug', summary: 'Hypothesis-driven debugging.', is_default: false },
      { key: 'review', title: 'Review', summary: 'Risk-focused code review.', is_default: false },
    ]

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg-0)',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={14} color="var(--accent)" />
          <span style={{ fontSize: 12, color: 'var(--text-1)', letterSpacing: '0.05em' }}>
            {isLoading ? (
              <span style={{ color: 'var(--yellow)' }}>● AGENT RUNNING</span>
            ) : (
              <span style={{ color: 'var(--green)' }}>● READY</span>
            )}
          </span>
        </div>

        <button
          onClick={() => setShowProjectInput(!showProjectInput)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
          }}
        >
          <FolderOpen size={12} />
          {projectDir ? projectDir.split('/').pop() : 'SET PROJECT DIR'}
        </button>

        <select
          value={sessionMode || 'execute'}
          onChange={(e) => {
            void setSessionMode(e.target.value, sessionId)
          }}
          title="Session execution mode"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-1)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            minWidth: 110,
          }}
        >
          {modes.map((mode) => (
            <option key={mode.key} value={mode.key}>
              MODE: {mode.key.toUpperCase()}
            </option>
          ))}
        </select>

        {/* GitHub Button */}
        <a
          href="https://github.com/hxrrrrri"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 98 96"
            fill="currentColor"
          >
            <path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 
            2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 
            4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 
            1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 
            5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 
            46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 
            13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 
            0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 
            11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 
            33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
          </svg>
          GITHUB
        </a>
      </div>

      {/* Project dir input */}
      {showProjectInput && (
        <div style={{
          padding: '8px 24px',
          background: 'var(--bg-2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="/path/to/your/project"
            value={projectDir}
            onChange={e => setProjectDir(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-0)',
              border: '1px solid var(--border)',
              color: 'var(--text-0)',
              padding: '6px 10px',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
          />
          <button
            onClick={() => setShowProjectInput(false)}
            style={{
              background: 'var(--accent)',
              border: 'none',
              color: '#0a0a0b',
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            SET
          </button>
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
      }}>
        {isEmpty && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center',
            animation: 'fadeIn 0.4s ease',
          }}>
            <div style={{
              width: 64, height: 64,
              background: 'var(--accent)',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              fontSize: 28,
            }}>
              ⚡
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-1px',
              marginBottom: 8,
            }}>
              KŌDO AGENT
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 32 }}>
              Autonomous. Capable. Yours.
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              maxWidth: 540,
              width: '100%',
            }}>
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-1)'
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {error && (
          <div style={{
            background: 'var(--red-dim)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--red)',
            marginBottom: 16,
          }}>
            ⚠ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 24px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-1)',
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative' }}>
          {showCommandSuggestions && (
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 'calc(100% + 8px)',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              zIndex: 20,
              maxHeight: 260,
              overflowY: 'auto',
            }}>
              {commandSuggestions.map((command, idx) => {
                const selected = idx === activeCommandIndex
                return (
                  <button
                    key={command.name}
                    type="button"
                    onMouseEnter={() => setActiveCommandIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      applyCommandSuggestion(command.name)
                    }}
                    style={{
                      width: '100%',
                      background: selected ? 'var(--bg-3)' : 'transparent',
                      border: 'none',
                      borderBottom: idx === commandSuggestions.length - 1 ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '9px 12px',
                      display: 'grid',
                      gap: 2,
                    }}
                  >
                    <span style={{
                      color: selected ? 'var(--accent)' : 'var(--text-0)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {command.name}
                    </span>
                    <span style={{
                      color: 'var(--text-2)',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {command.description}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '8px 8px 8px 14px',
          transition: 'border-color 0.15s',
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask KŌDO anything or run /help (Shift+Enter for newline)"
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-0)',
              fontSize: 14,
              fontFamily: 'var(--font-mono)',
              resize: 'none',
              lineHeight: 1.6,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          />
          <button
            onClick={isLoading ? stopGeneration : handleSend}
            disabled={!isLoading && !input.trim()}
            style={{
              background: isLoading ? 'var(--red-dim)' : input.trim() ? 'var(--accent)' : 'var(--bg-3)',
              border: isLoading ? '1px solid var(--red)' : 'none',
              color: isLoading ? 'var(--red)' : input.trim() ? '#0a0a0b' : 'var(--text-2)',
              width: 36, height: 36,
              borderRadius: 'var(--radius)',
              cursor: (!isLoading && !input.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {isLoading ? <Square size={15} /> : <Send size={15} />}
          </button>
        </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 6, textAlign: 'center' }}>
          ENTER to send · SHIFT+ENTER for newline · TAB to autocomplete command · try /help /tasks /agents /skills /mcp /cost
        </div>
      </div>

      {activePermission && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
          padding: 20,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 720,
            background: 'var(--bg-1)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 0 0 1px var(--border), 0 16px 45px rgba(0,0,0,0.35)',
            padding: 16,
            display: 'grid',
            gap: 12,
          }}>
            <div style={{
              fontSize: 12,
              color: 'var(--accent)',
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}>
              PERMISSION REQUIRED
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-0)' }}>
              Tool <strong>{activePermission.tool_name}</strong> requested approval.
            </div>

            <div style={{
              fontSize: 12,
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-2)',
              padding: 10,
              maxHeight: 160,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {activePermission.input_preview || '(no preview provided)'}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}>
              <button
                onClick={() => handlePermissionDecision(true, false)}
                disabled={permissionSubmitting}
                style={{
                  border: '1px solid var(--green)',
                  background: 'var(--green-dim)',
                  color: 'var(--green)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  cursor: permissionSubmitting ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                APPROVE ONCE
              </button>

              <button
                onClick={() => handlePermissionDecision(false, false)}
                disabled={permissionSubmitting}
                style={{
                  border: '1px solid var(--red)',
                  background: 'var(--red-dim)',
                  color: 'var(--red)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  cursor: permissionSubmitting ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                DENY ONCE
              </button>

              <button
                onClick={() => handlePermissionDecision(true, true)}
                disabled={permissionSubmitting}
                style={{
                  border: '1px solid var(--blue)',
                  background: 'var(--blue-dim)',
                  color: 'var(--blue)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  cursor: permissionSubmitting ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                APPROVE + REMEMBER
              </button>

              <button
                onClick={() => handlePermissionDecision(false, true)}
                disabled={permissionSubmitting}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-2)',
                  color: 'var(--text-1)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  cursor: permissionSubmitting ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                DENY + REMEMBER
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
