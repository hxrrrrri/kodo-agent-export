import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Cpu,
  FileText,
  Hammer,
  Maximize2,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { Session } from '../store/chatStore'
import { buildApiHeaders, parseApiError } from '../lib/api'
import { ProviderPanel } from './ProviderPanel'
import { AgentGraph, AgentNode } from './AgentGraph'
import { KodoLogoMark } from './KodoLogoMark'
import { ReplayPanel } from './ReplayPanel'
import { PromptLibraryPanel } from './PromptLibraryPanel'
import { SkillBuilderPanel } from './SkillBuilderPanel'
import { CodeReviewPanel } from './CodeReviewPanel'

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
}

type SidebarView = 'sessions' | 'providers' | 'agents' | 'usage' | 'prompts' | 'skills' | 'review'

type RuntimeTask = {
  task_id: string
  status?: string
}

type RuntimeAgent = {
  agent_id: string
  role?: string
  status?: string
  task_id?: string
}

type SessionReplayEvent = {
  event_index?: number
  event_type?: string
  content?: string
  tool_name?: string
}

function toGraphStatus(status: string | undefined): AgentNode['status'] {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'running') return 'running'
  if (normalized === 'completed' || normalized === 'done' || normalized === 'succeeded') return 'done'
  if (normalized === 'failed' || normalized === 'error' || normalized === 'cancelled') return 'error'
  return 'queued'
}

function shortId(value: string): string {
  const text = (value || '').trim()
  if (!text) return 'unknown'
  if (text.length <= 10) return text
  return text.slice(0, 10)
}

function summarizeReplayEvent(event: SessionReplayEvent): string {
  const eventType = String(event.event_type || '').toLowerCase()
  const toolName = String(event.tool_name || '').trim()
  const content = String(event.content || '').trim().replace(/\s+/g, ' ')
  const preview = content ? (content.length > 46 ? `${content.slice(0, 45)}…` : content) : ''

  if (eventType === 'tool_call') {
    return `tool:${toolName || 'call'}`
  }
  if (eventType === 'tool_result') {
    return `result:${toolName || 'tool'}`
  }
  if (eventType === 'assistant_text') {
    return `assistant: ${preview || 'response'}`
  }
  if (eventType === 'user_message') {
    return `user: ${preview || 'message'}`
  }

  const title = eventType || 'event'
  return preview ? `${title}: ${preview}` : title
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSearchTokens(query: string): string[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

  return Array.from(new Set(tokens)).sort((a, b) => b.length - a.length)
}

function renderHighlightedText(text: string, query: string): JSX.Element {
  const tokens = buildSearchTokens(query)
  if (tokens.length === 0) {
    return <>{text}</>
  }

  const tokenSet = new Set(tokens.map((token) => token.toLowerCase()))
  const pattern = new RegExp(`(${tokens.map((token) => escapeRegExp(token)).join('|')})`, 'ig')
  const parts = text.split(pattern)

  return (
    <>
      {parts.map((part, idx) => {
        if (tokenSet.has(part.toLowerCase())) {
          return (
            <mark
              key={`${part}-${idx}`}
              style={{
                background: 'var(--accent-dim)',
                color: 'var(--text-0)',
                border: '1px solid var(--accent)',
                padding: '0 2px',
                borderRadius: 3,
                boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
              }}
            >
              {part}
            </mark>
          )
        }

        return <span key={`${part}-${idx}`}>{part}</span>
      })}
    </>
  )
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAgentStatus(status: AgentNode['status']): string {
  if (status === 'running') return 'Running'
  if (status === 'done') return 'Done'
  if (status === 'error') return 'Error'
  return 'Queued'
}

function agentStatusTone(status: AgentNode['status']): { color: string; background: string } {
  if (status === 'running') return { color: 'var(--accent)', background: 'var(--accent-dim)' }
  if (status === 'done') return { color: 'var(--green)', background: 'var(--green-dim)' }
  if (status === 'error') return { color: 'var(--red)', background: 'var(--red-dim)' }
  return { color: 'var(--text-2)', background: 'var(--bg-3)' }
}

function AgentGlyphIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19L12 4L19 19"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 13.5H15.5" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" />
    </svg>
  )
}

function RailButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: JSX.Element
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
        background: active ? 'var(--bg-3)' : 'transparent',
        color: active ? 'var(--text-0)' : 'var(--text-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 140ms ease',
      }}
      onMouseEnter={(event) => {
        if (!active) {
          event.currentTarget.style.background = 'var(--bg-2)'
          event.currentTarget.style.color = 'var(--text-0)'
        }
      }}
      onMouseLeave={(event) => {
        if (!active) {
          event.currentTarget.style.background = 'transparent'
          event.currentTarget.style.color = 'var(--text-1)'
        }
      }}
    >
      {icon}
    </button>
  )
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const {
    sessions,
    sessionId,
    loadModes,
    loadSessions,
    loadSession,
    newSession,
    deleteSession,
    usageSummary,
    projectDir,
    searchQuery,
    setSearchQuery,
    theme,
    setTheme,
  } = useChat()

  const [activeView, setActiveView] = useState<SidebarView>('sessions')
  const [agentNodes, setAgentNodes] = useState<AgentNode[]>([])
  const [agentGraphError, setAgentGraphError] = useState<string | null>(null)
  const [agentGraphLastUpdatedAt, setAgentGraphLastUpdatedAt] = useState<string>('')
  const [agentGraphModalOpen, setAgentGraphModalOpen] = useState(false)
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const bootstrappedRef = useRef(false)

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true
    void loadModes()
    void loadSessions()
  }, [loadModes, loadSessions])

  useEffect(() => {
    if (activeView !== 'agents') return

    let cancelled = false

    const loadAgentGraph = async () => {
      if (!sessionId) {
        if (!cancelled) {
          setAgentNodes([])
          setAgentGraphError(null)
          setAgentGraphLastUpdatedAt('')
        }
        return
      }

      try {
        const sessionQuery = `&session_id=${encodeURIComponent(sessionId)}`
        const [tasksRes, agentsRes] = await Promise.all([
          fetch(`/api/chat/tasks?limit=50${sessionQuery}`, { headers: buildApiHeaders(), cache: 'no-store' }),
          fetch(`/api/chat/agents?limit=50${sessionQuery}`, { headers: buildApiHeaders(), cache: 'no-store' }),
        ])

        if (!tasksRes.ok) throw new Error(await parseApiError(tasksRes))
        if (!agentsRes.ok) throw new Error(await parseApiError(agentsRes))

        const tasksPayload = await tasksRes.json()
        const agentsPayload = await agentsRes.json()
        let tasks = (tasksPayload.tasks || []) as RuntimeTask[]
        let agents = (agentsPayload.agents || []) as RuntimeAgent[]
        const activeSession = sessions.find((item) => item.session_id === sessionId)

        const rootId = sessionId
        let replayNodes: AgentNode[] = []

        if (tasks.length === 0 && agents.length === 0) {
          try {
            const [globalTasksRes, globalAgentsRes] = await Promise.all([
              fetch('/api/chat/tasks?limit=20', { headers: buildApiHeaders(), cache: 'no-store' }),
              fetch('/api/chat/agents?limit=20', { headers: buildApiHeaders(), cache: 'no-store' }),
            ])
            if (globalTasksRes.ok && globalAgentsRes.ok) {
              const globalTasksPayload = await globalTasksRes.json()
              const globalAgentsPayload = await globalAgentsRes.json()
              const globalTasks = (globalTasksPayload.tasks || []) as RuntimeTask[]
              const globalAgents = (globalAgentsPayload.agents || []) as RuntimeAgent[]

              if (globalTasks.length > 0 || globalAgents.length > 0) {
                tasks = globalTasks.slice(0, 10)
                agents = globalAgents.slice(0, 14)
              }
            }
          } catch {
            // Ignore global fallback fetch failures.
          }
        }

        if (tasks.length === 0 && agents.length === 0) {
          try {
            const eventsRes = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/events`, {
              headers: buildApiHeaders(),
              cache: 'no-store',
            })
            if (eventsRes.ok) {
              const eventsPayload = await eventsRes.json()
              const events = Array.isArray(eventsPayload.events)
                ? (eventsPayload.events as SessionReplayEvent[])
                : []

              replayNodes = events
                .slice(-10)
                .map((event, idx) => {
                  const eventType = String(event.event_type || '').toLowerCase()
                  return {
                    id: `${rootId}-evt-${event.event_index ?? idx}-${idx}`,
                    type: 'agent' as const,
                    label: summarizeReplayEvent(event),
                    status: eventType === 'error' ? 'error' : 'done',
                    parentId: rootId,
                  }
                })
            }
          } catch {
            replayNodes = []
          }
        }

        const nodes: AgentNode[] = [
          {
            id: rootId,
            type: 'session',
            label: (activeSession?.title || '').trim() || `Session ${shortId(sessionId)}`,
            status: 'running',
          },
          ...tasks.map((task) => ({
            id: task.task_id,
            type: 'task' as const,
            label: `task:${shortId(task.task_id)}`,
            status: toGraphStatus(task.status),
            parentId: rootId,
          })),
          ...agents.map((agent) => ({
            id: agent.agent_id,
            type: 'agent' as const,
            label: `${agent.role || 'agent'}:${shortId(agent.agent_id)}`,
            status: toGraphStatus(agent.status),
            parentId: agent.task_id || sessionId,
          })),
          ...replayNodes,
        ]

        if (!cancelled) {
          setAgentNodes(nodes)
          setAgentGraphError(null)
          setAgentGraphLastUpdatedAt(new Date().toLocaleTimeString())
        }
      } catch (error) {
        if (!cancelled) {
          setAgentGraphError(String(error))
        }
      }
    }

    void loadAgentGraph()
    const timer = window.setInterval(() => {
      void loadAgentGraph()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeView, sessionId, sessions])

  useEffect(() => {
    if (activeView !== 'agents') {
      setAgentGraphModalOpen(false)
    }
  }, [activeView])

  useEffect(() => {
    if (!agentGraphModalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAgentGraphModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [agentGraphModalOpen])

  const visibleSessions = useMemo(() => {
    const tokens = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    if (tokens.length === 0) return sessions

    return sessions.filter((session) => {
      const title = (session.title || '').toLowerCase()
      const sessionKey = session.session_id.toLowerCase()
      return tokens.every((token) => title.includes(token) || sessionKey.includes(token))
    })
  }, [searchQuery, sessions])

  const agentSnapshot = useMemo(() => {
    const sessionsCount = agentNodes.filter((node) => node.type === 'session').length
    const tasksCount = agentNodes.filter((node) => node.type === 'task').length
    const agentsCount = agentNodes.filter((node) => node.type === 'agent').length
    const runningCount = agentNodes.filter((node) => node.status === 'running').length
    const doneCount = agentNodes.filter((node) => node.status === 'done').length
    const queuedCount = agentNodes.filter((node) => node.status === 'queued').length
    const errorCount = agentNodes.filter((node) => node.status === 'error').length

    const recentNodes = agentNodes
      .filter((node) => node.type !== 'session')
      .slice(0, 6)
      .map((node) => ({
        id: node.id,
        typeLabel: node.type === 'task' ? 'Task' : 'Agent',
        label: node.label,
        status: node.status,
      }))

    return {
      sessionsCount,
      tasksCount,
      agentsCount,
      runningCount,
      doneCount,
      queuedCount,
      errorCount,
      recentNodes,
    }
  }, [agentNodes])

  const usageCost = usageSummary?.totals.cost_usd_total ?? usageSummary?.totals.estimated_cost_usd ?? 0
  const usageInput = usageSummary?.totals.input_tokens ?? 0
  const usageOutput = usageSummary?.totals.output_tokens ?? 0
  const usageByModelRows = Object.entries(usageSummary?.by_model || {})

  const openSearch = () => {
    setActiveView('sessions')
    if (collapsed) onToggleCollapse()
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  const handleNewChat = async () => {
    await newSession()
    setActiveView('sessions')
    if (collapsed) onToggleCollapse()
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <aside
      style={{
        width: collapsed
          ? 'var(--sidebar-rail-width)'
          : 'calc(var(--sidebar-rail-width) + var(--sidebar-panel-width))',
        minWidth: collapsed
          ? 'var(--sidebar-rail-width)'
          : 'calc(var(--sidebar-rail-width) + var(--sidebar-panel-width))',
        transition: 'width 220ms ease, min-width 220ms ease',
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 'var(--sidebar-rail-width)',
          minWidth: 'var(--sidebar-rail-width)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          paddingTop: 8,
          paddingBottom: 10,
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-1) 90%, #000 10%), var(--bg-1))',
        }}
      >
        <RailButton
          icon={collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapse}
        />

        <div
          title="KODO"
          style={{
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <KodoLogoMark size={22} />
        </div>

        <div style={{ width: 18, height: 1, background: 'var(--border)' }} />

        <RailButton icon={<Plus size={15} />} label="New chat" onClick={() => void handleNewChat()} />
        <RailButton icon={<Search size={15} />} label="Search chats" onClick={openSearch} active={activeView === 'sessions'} />

        <div style={{ width: 18, height: 1, background: 'var(--border)' }} />

        <RailButton
          icon={<MessageSquare size={15} />}
          label="Sessions"
          onClick={() => {
            setActiveView('sessions')
            if (collapsed) onToggleCollapse()
          }}
          active={activeView === 'sessions'}
        />
        <RailButton
          icon={<Cpu size={15} />}
          label="Providers"
          onClick={() => {
            setActiveView('providers')
            if (collapsed) onToggleCollapse()
          }}
          active={activeView === 'providers'}
        />
        <RailButton
          icon={<AgentGlyphIcon size={15} />}
          label="Agents"
          onClick={() => {
            setActiveView('agents')
            if (collapsed) onToggleCollapse()
          }}
          active={activeView === 'agents'}
        />
        <RailButton
          icon={<Activity size={15} />}
          label="Usage"
          onClick={() => {
            setActiveView('usage')
            if (collapsed) onToggleCollapse()
          }}
          active={activeView === 'usage'}
        />
        <RailButton
          icon={<FileText size={15} />}
          label="Prompts"
          onClick={() => {
            setActiveView('prompts')
            if (collapsed) onToggleCollapse()
          }}
          active={activeView === 'prompts'}
        />
        <RailButton
          icon={<Hammer size={15} />}
          label="Skills"
          onClick={() => {
            setActiveView('skills')
            if (collapsed) onToggleCollapse()
          }}
          active={activeView === 'skills'}
        />

        <div style={{ flex: 1 }} />

        <RailButton
          icon={theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          label="Toggle theme"
          onClick={toggleTheme}
        />
      </div>

      <div
        style={{
          width: collapsed ? 0 : 'var(--sidebar-panel-width)',
          opacity: collapsed ? 0 : 1,
          transform: collapsed ? 'translateX(-10px)' : 'translateX(0)',
          pointerEvents: collapsed ? 'none' : 'auto',
          transition: 'opacity 150ms ease, transform 220ms ease, width 220ms ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-1) 94%, #000 6%), var(--bg-1))',
        }}
      >
        <div
          style={{
            height: 52,
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <KodoLogoMark size={20} />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: '-0.06em',
                lineHeight: 1,
                color: 'var(--text-0)',
              }}
            >
              KODO
            </div>
          </div>
          <button
            type="button"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            onClick={onToggleCollapse}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <div style={{ padding: '10px 14px 8px' }}>
          <button
            type="button"
            onClick={() => void handleNewChat()}
            style={{
              width: '100%',
              background: 'var(--accent-dim)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            <Plus size={14} /> NEW SESSION
          </button>
        </div>

        <div style={{ padding: '0 14px 8px', display: 'grid', gap: 2 }}>
          <PanelNav
            icon={<MessageSquare size={15} />}
            label="Sessions"
            active={activeView === 'sessions'}
            onClick={() => setActiveView('sessions')}
          />
          <PanelNav
            icon={<Cpu size={15} />}
            label="Providers"
            active={activeView === 'providers'}
            onClick={() => setActiveView('providers')}
          />
          <PanelNav
            icon={<AgentGlyphIcon size={15} />}
            label="Agents"
            active={activeView === 'agents'}
            onClick={() => setActiveView('agents')}
          />
          <PanelNav
            icon={<Activity size={15} />}
            label="Usage"
            active={activeView === 'usage'}
            onClick={() => setActiveView('usage')}
          />
          <PanelNav
            icon={<FileText size={15} />}
            label="Prompts"
            active={activeView === 'prompts'}
            onClick={() => setActiveView('prompts')}
          />
          <PanelNav
            icon={<Hammer size={15} />}
            label="Skills"
            active={activeView === 'skills'}
            onClick={() => setActiveView('skills')}
          />
          <PanelNav
            icon={<FileText size={15} />}
            label="Code Review"
            active={activeView === 'review'}
            onClick={() => setActiveView('review')}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {activeView === 'sessions' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '6px 14px 8px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>Search chats</div>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search chats"
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-0)',
                    borderRadius: 8,
                    padding: '7px 9px',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px' }}>
                {visibleSessions.length === 0 ? (
                  <div
                    style={{
                      margin: '6px 4px 0',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px dashed var(--border)',
                      color: 'var(--text-2)',
                      fontSize: 12,
                    }}
                  >
                    No sessions yet.
                  </div>
                ) : (
                  visibleSessions.map((session) => (
                    <SessionRow
                      key={session.session_id}
                      session={session}
                      active={session.session_id === sessionId}
                      searchQuery={searchQuery}
                      onSelect={() => loadSession(session.session_id)}
                      onReplay={() => setReplaySessionId(session.session_id)}
                      onDelete={() => deleteSession(session.session_id)}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {activeView === 'providers' && (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              <ProviderPanel />
            </div>
          )}

          {activeView === 'agents' && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '8px 10px 10px', display: 'grid', gap: 8 }}>
              {!sessionId && (
                <div
                  style={{
                    border: '1px dashed var(--border-bright)',
                    borderRadius: 10,
                    background: 'var(--bg-2)',
                    padding: '10px 12px',
                    color: 'var(--text-2)',
                    fontSize: 12,
                  }}
                >
                  Start a session to see the agent graph.
                </div>
              )}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--bg-2)',
                  padding: '8px 10px',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>What you are seeing</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                  This tab summarizes your active execution tree for the current session.
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                  Session is the root, tasks branch from the session, and agents branch from tasks.
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                  Status colors: running, done, queued, and error.
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  Auto-refresh: every 5s{agentGraphLastUpdatedAt ? ` • Updated ${agentGraphLastUpdatedAt}` : ''}
                </div>
              </div>
              {agentGraphError && (
                <div
                  style={{
                    border: '1px solid var(--red)',
                    borderRadius: 8,
                    background: 'var(--red-dim)',
                    color: 'var(--red)',
                    fontSize: 11,
                    padding: '8px 10px',
                  }}
                >
                  {agentGraphError}
                </div>
              )}

              <button
                type="button"
                onClick={() => setAgentGraphModalOpen(true)}
                disabled={!sessionId}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-2)',
                  borderRadius: 10,
                  padding: '10px 10px 9px',
                  margin: 0,
                  textAlign: 'left',
                  cursor: sessionId ? 'zoom-in' : 'not-allowed',
                  opacity: sessionId ? 1 : 0.6,
                  display: 'grid',
                  gap: 9,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: 'var(--text-0)',
                  }}
                >
                  <span>Execution snapshot</span>
                  <Maximize2 size={12} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                  <AgentMetric label="Sessions" value={agentSnapshot.sessionsCount} />
                  <AgentMetric label="Tasks" value={agentSnapshot.tasksCount} />
                  <AgentMetric label="Agents" value={agentSnapshot.agentsCount} />
                  <AgentMetric label="Running" value={agentSnapshot.runningCount} />
                  <AgentMetric label="Done" value={agentSnapshot.doneCount} />
                  <AgentMetric label="Queued" value={agentSnapshot.queuedCount} />
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 5 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Recent nodes</div>
                  {agentSnapshot.recentNodes.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>No active tasks or agents yet.</div>
                  )}
                  {agentSnapshot.recentNodes.map((node) => {
                    const tone = agentStatusTone(node.status)
                    return (
                      <div
                        key={node.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 6,
                          fontSize: 11,
                        }}
                      >
                        <div className="truncate" style={{ color: 'var(--text-1)' }}>
                          {node.typeLabel} • {node.label}
                        </div>
                        <span
                          style={{
                            color: tone.color,
                            background: tone.background,
                            borderRadius: 999,
                            padding: '2px 7px',
                            fontSize: 10,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatAgentStatus(node.status)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  Click to open the full relationship graph in the center modal.
                </div>

                {agentSnapshot.errorCount > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--red)' }}>
                    {agentSnapshot.errorCount} node{agentSnapshot.errorCount === 1 ? '' : 's'} in error state.
                  </div>
                )}
              </button>
            </div>
          )}

          {activeView === 'usage' && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '10px 10px 12px', display: 'grid', gap: 8 }}>
              <UsageCard label="Estimated cost (7D)" value={`$${usageCost.toFixed(4)}`} />
              <UsageCard label="Input tokens" value={usageInput.toLocaleString()} />
              <UsageCard label="Output tokens" value={usageOutput.toLocaleString()} />

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6 }}>By model</div>
                {usageByModelRows.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>No usage events yet.</div>
                )}
                {usageByModelRows.map(([model, row]) => {
                  const cost = row.cost_usd_total ?? row.estimated_cost_usd ?? 0
                  return (
                    <div
                      key={model}
                      style={{
                        fontSize: 11,
                        color: 'var(--text-1)',
                        borderTop: '1px solid var(--border)',
                        paddingTop: 6,
                        marginTop: 6,
                      }}
                    >
                      <div style={{ color: 'var(--text-0)', marginBottom: 2 }}>{model}</div>
                      <div>In {row.input_tokens.toLocaleString()} / Out {row.output_tokens.toLocaleString()}</div>
                      <div>${cost.toFixed(4)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeView === 'prompts' && (
            <PromptLibraryPanel />
          )}

          {activeView === 'skills' && (
            <SkillBuilderPanel />
          )}

          {activeView === 'review' && (
            <CodeReviewPanel sessionId={sessionId} projectDir={projectDir} />
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '9px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.06em' }}>
            POWERED BY KODO
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label="Toggle theme"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--bg-2)',
              color: 'var(--text-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      {agentGraphModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Agent graph modal"
          onClick={() => setAgentGraphModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'color-mix(in srgb, var(--bg-0) 72%, black)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(96vw, 1080px)',
              maxHeight: '90vh',
              borderRadius: 12,
              border: '1px solid var(--border-bright)',
              background: 'var(--bg-1)',
              boxShadow: '0 22px 56px rgba(0, 0, 0, 0.42)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'grid', gap: 2 }}>
                <div style={{
                  fontSize: 14,
                  color: 'var(--text-0)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  lineHeight: 1.3,
                  paddingBottom: 1,
                }}>
                  Agent Execution Graph
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                  Read flow top-to-bottom by status color and node type.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAgentGraphModalOpen(false)}
                aria-label="Close graph modal"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-2)',
                  color: 'var(--text-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: 14, overflow: 'auto' }}>
              <AgentGraph nodes={agentNodes} variant="modal" />
            </div>
          </div>
        </div>
      )}

      {replaySessionId && (
        <ReplayPanel
          sessionId={replaySessionId}
          onClose={() => setReplaySessionId(null)}
        />
      )}
    </aside>
  )
}

function PanelNav({
  icon,
  label,
  active,
  onClick,
}: {
  icon: JSX.Element
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
        background: active ? 'var(--bg-3)' : 'transparent',
        color: active ? 'var(--text-0)' : 'var(--text-1)',
        fontSize: 13,
        borderRadius: 8,
        cursor: 'pointer',
        padding: '7px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        textAlign: 'left',
      }}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.background = 'var(--bg-2)'
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.background = 'transparent'
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function SessionRow({
  session,
  active,
  searchQuery,
  onSelect,
  onReplay,
  onDelete,
}: {
  session: Session
  active: boolean
  searchQuery: string
  onSelect: () => void
  onReplay: () => void
  onDelete: () => void
}) {
  const normalizedSearch = searchQuery.trim()
  const hasSearch = normalizedSearch.length > 0
  const title = session.title || 'Untitled'

  return (
    <div
      style={{
        border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
        background: active ? 'var(--bg-3)' : 'transparent',
        borderRadius: 10,
        padding: '8px 9px',
        marginBottom: 2,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onClick={onSelect}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.background = 'var(--bg-2)'
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.background = 'transparent'
      }}
    >
      <MessageSquare size={13} color={active ? 'var(--text-0)' : 'var(--text-2)'} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="truncate" style={{ fontSize: 12, color: active ? 'var(--text-0)' : 'var(--text-1)' }}>
          {hasSearch ? renderHighlightedText(title, normalizedSearch) : title}
        </div>
        <div className="truncate" style={{ fontSize: 10, color: 'var(--text-2)' }}>
          {formatDate(session.updated_at)}
        </div>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onReplay()
        }}
        title="Replay session"
        aria-label="Replay session"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--text-2)',
          width: 20,
          height: 20,
          borderRadius: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RotateCcw size={12} />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        title="Delete session"
        aria-label="Delete session"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--text-2)',
          width: 20,
          height: 20,
          borderRadius: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function UsageCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--bg-2)',
        padding: '8px 10px',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-0)', marginTop: 2 }}>{value}</div>
    </div>
  )
}

function AgentMetric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-1)',
        padding: '6px 8px',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-0)', marginTop: 2 }}>{value.toLocaleString()}</div>
    </div>
  )
}
