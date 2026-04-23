import { MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react'
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
  Settings,
  Star,
  Sun,
  Trash2,
  X,
  Zap,
  Wand2,
} from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { Session, THEME_TONES, useChatStore } from '../store/chatStore'
import { buildApiHeaders, parseApiError } from '../lib/api'
import { ProviderPanel } from './ProviderPanel'
import { AgentGraph, AgentNode } from './AgentGraph'
import { KodoLogoMark } from './KodoLogoMark'
import { ReplayPanel } from './ReplayPanel'
import { PromptLibraryPanel } from './PromptLibraryPanel'
import { PromptCompressorPanel } from './PromptCompressorPanel'
import { SkillBuilderPanel } from './SkillBuilderPanel'
import { CodeReviewPanel } from './CodeReviewPanel'

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
}

type SidebarView = 'sessions' | 'providers' | 'agents' | 'usage' | 'prompts' | 'compressor' | 'skills' | 'crg' | 'review' | 'settings' | 'design'

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

type CronJob = {
  name: string
  cron_expr: string
  prompt: string
  project_dir?: string | null
  enabled?: boolean
  last_run?: string | null
  last_task_id?: string | null
}

type CronRun = {
  job_name?: string
  task_id?: string
  fired_at?: string
}

type SettingsPayload = Record<string, string>

type StoredApiKeys = {
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  GEMINI_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  GROQ_API_KEY?: string
  FIRECRAWL_API_KEY?: string
}

const API_KEY_STORAGE = 'kodo_api_keys'
const SETTINGS_REQUEST_TIMEOUT_MS = 10000
const SIDEBAR_PANEL_WIDTH_STORAGE_KEY = 'kodo_sidebar_panel_width'
const SIDEBAR_PANEL_DEFAULT_WIDTH = 238
const SIDEBAR_PANEL_MIN_WIDTH = 220
const SIDEBAR_PANEL_MAX_WIDTH = 560

function readStoredSidebarPanelWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_PANEL_DEFAULT_WIDTH

  const saved = Number.parseFloat(window.localStorage.getItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY) || '')
  if (Number.isFinite(saved) && saved > 0) return saved

  const fromCss = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--sidebar-panel-width').trim(),
  )
  if (Number.isFinite(fromCss) && fromCss > 0) return fromCss

  return SIDEBAR_PANEL_DEFAULT_WIDTH
}

function sidebarPanelMaxWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_PANEL_MAX_WIDTH
  return Math.max(
    SIDEBAR_PANEL_MIN_WIDTH + 40,
    Math.min(SIDEBAR_PANEL_MAX_WIDTH, Math.floor(window.innerWidth * 0.7)),
  )
}

function clampSidebarPanelWidth(width: number): number {
  return Math.max(SIDEBAR_PANEL_MIN_WIDTH, Math.min(sidebarPanelMaxWidth(), Math.round(width)))
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = SETTINGS_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
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

function GraphGlyphIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="6" r="2.2" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="19" cy="6" r="2.2" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="12" cy="18" r="2.2" stroke="currentColor" strokeWidth={1.8} />
      <path d="M7 7.6L10.4 15.8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M17 7.6L13.6 15.8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M7.4 6H16.6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const {
    sessions,
    sessionId,
    loadModes,
    loadSessions,
    loadUsage,
    loadSession,
    newSession,
    deleteSession,
    sendMessage,
    isLoading,
    usageSummary,
    projectDir,
    searchQuery,
    setSearchQuery,
    theme,
    setTheme,
  } = useChat()
  const toggleSessionStar = useChatStore((s) => s.toggleSessionStar)

  const [activeView, setActiveView] = useState<SidebarView>('sessions')
  const [showStarredOnly, setShowStarredOnly] = useState(false)
  const [agentNodes, setAgentNodes] = useState<AgentNode[]>([])
  const [agentGraphError, setAgentGraphError] = useState<string | null>(null)
  const [agentGraphLastUpdatedAt, setAgentGraphLastUpdatedAt] = useState<string>('')
  const [agentGraphModalOpen, setAgentGraphModalOpen] = useState(false)
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null)
  const [usageBreakdown, setUsageBreakdown] = useState<'model' | 'sessions'>('model')
  const [usageData, setUsageData] = useState<any | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState('')
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [cronRuns, setCronRuns] = useState<CronRun[]>([])
  const [cronEnabled, setCronEnabled] = useState(true)
  const [cronLoading, setCronLoading] = useState(false)
  const [cronError, setCronError] = useState('')
  const [cronName, setCronName] = useState('')
  const [cronExpr, setCronExpr] = useState('every_30_minutes')
  const [cronPrompt, setCronPrompt] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsData, setSettingsData] = useState<SettingsPayload>({})
  const [crgBase, setCrgBase] = useState('HEAD~1')
  const [crgPattern, setCrgPattern] = useState('callers_of')
  const [crgTarget, setCrgTarget] = useState('send_message')
  const [crgQuery, setCrgQuery] = useState('send_message')
  const [crgCustomCommand, setCrgCustomCommand] = useState('/crg status')
  const [crgRunning, setCrgRunning] = useState(false)
  const [crgLastCommand, setCrgLastCommand] = useState('')
  const [crgHelpOpen, setCrgHelpOpen] = useState(false)
  const [showApiKeys, setShowApiKeys] = useState(false)
  const [apiKeys, setApiKeys] = useState<StoredApiKeys>({})
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, 'idle' | 'ok' | 'error'>>({})
  const [sidebarPanelWidth, setSidebarPanelWidth] = useState<number>(() =>
    clampSidebarPanelWidth(readStoredSidebarPanelWidth()),
  )
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const bootstrappedRef = useRef(false)
  const sidebarResizeStartRef = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true
    void loadModes()
    void loadSessions()
  }, [loadModes, loadSessions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY, String(sidebarPanelWidth))
  }, [sidebarPanelWidth])

  useEffect(() => {
    const onResize = () => {
      setSidebarPanelWidth((prev) => clampSidebarPanelWidth(prev))
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (!sidebarResizing) return

    const onMouseMove = (event: MouseEvent) => {
      const start = sidebarResizeStartRef.current
      if (!start) return
      const delta = event.clientX - start.x
      setSidebarPanelWidth(clampSidebarPanelWidth(start.width + delta))
    }

    const onMouseUp = () => {
      sidebarResizeStartRef.current = null
      setSidebarResizing(false)
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [sidebarResizing])

  useEffect(() => {
    if (!collapsed) return
    sidebarResizeStartRef.current = null
    setSidebarResizing(false)
  }, [collapsed])

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

  useEffect(() => {
    if (!crgHelpOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCrgHelpOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [crgHelpOpen])

  const visibleSessions = useMemo(() => {
    const tokens = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    let filtered = sessions
    if (showStarredOnly) filtered = filtered.filter((s) => s.starred)
    if (tokens.length === 0) return filtered

    return filtered.filter((session) => {
      const title = (session.title || '').toLowerCase()
      const sessionKey = session.session_id.toLowerCase()
      return tokens.every((token) => title.includes(token) || sessionKey.includes(token))
    })
  }, [searchQuery, sessions, showStarredOnly])

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

  const readStoredApiKeys = () => {
    try {
      const raw = window.localStorage.getItem(API_KEY_STORAGE)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as StoredApiKeys) : {}
    } catch {
      return {}
    }
  }

  const saveStoredApiKeys = (next: StoredApiKeys) => {
    window.localStorage.setItem(API_KEY_STORAGE, JSON.stringify(next))
  }

  const loadUsageBreakdown = async () => {
    setUsageLoading(true)
    setUsageError('')
    try {
      const response = await fetch(`/api/chat/usage?days=7&limit=100&breakdown=${usageBreakdown}`, {
        headers: buildApiHeaders(),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      setUsageData(await response.json())
    } catch (error) {
      setUsageError(String(error))
      setUsageData(null)
    } finally {
      setUsageLoading(false)
    }
  }

  const loadCronData = async () => {
    setCronLoading(true)
    setCronError('')
    try {
      const [jobsResponse, runsResponse] = await Promise.all([
        fetch('/api/cron', { headers: buildApiHeaders() }),
        fetch('/api/cron/runs', { headers: buildApiHeaders() }),
      ])

      if (!jobsResponse.ok) {
        throw new Error(await parseApiError(jobsResponse))
      }
      const jobsPayload = await jobsResponse.json()
      setCronJobs(Array.isArray(jobsPayload.jobs) ? (jobsPayload.jobs as CronJob[]) : [])
      setCronEnabled(jobsPayload.enabled !== false)

      if (runsResponse.ok) {
        const runsPayload = await runsResponse.json()
        setCronRuns(Array.isArray(runsPayload.runs) ? (runsPayload.runs as CronRun[]) : [])
      } else {
        setCronRuns([])
      }
    } catch (error) {
      setCronError(String(error))
      setCronJobs([])
      setCronRuns([])
    } finally {
      setCronLoading(false)
    }
  }

  const saveCronJob = async () => {
    if (!cronName.trim() || !cronPrompt.trim()) {
      setCronError('Name and prompt are required.')
      return
    }

    setCronLoading(true)
    setCronError('')
    try {
      const response = await fetch('/api/cron', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: cronName.trim(),
          cron_expr: cronExpr,
          prompt: cronPrompt.trim(),
          enabled: true,
          project_dir: projectDir || null,
        }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      setCronName('')
      setCronPrompt('')
      await loadCronData()
    } catch (error) {
      setCronError(String(error))
    } finally {
      setCronLoading(false)
    }
  }

  const toggleCronJob = async (job: CronJob) => {
    setCronLoading(true)
    setCronError('')
    try {
      const response = await fetch('/api/cron', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...job,
          enabled: !job.enabled,
          project_dir: job.project_dir || null,
        }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      await loadCronData()
    } catch (error) {
      setCronError(String(error))
    } finally {
      setCronLoading(false)
    }
  }

  const removeCronJob = async (name: string) => {
    setCronLoading(true)
    setCronError('')
    try {
      const response = await fetch(`/api/cron/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: buildApiHeaders(),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      await loadCronData()
    } catch (error) {
      setCronError(String(error))
    } finally {
      setCronLoading(false)
    }
  }

  const loadSettings = async () => {
    setSettingsLoading(true)
    setSettingsError('')
    try {
      const response = await fetchWithTimeout('/api/settings', { headers: buildApiHeaders() })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      const payload = await response.json()
      setSettingsData((payload.settings || {}) as SettingsPayload)
    } catch (error) {
      setSettingsError(String(error))
      setSettingsData({})
    } finally {
      setSettingsLoading(false)
    }
  }

  const patchSettings = async () => {
    setSettingsSaving(true)
    setSettingsError('')
    try {
      const toBool = (value: string | undefined) => {
        return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
      }
      const response = await fetchWithTimeout('/api/settings', {
        method: 'PATCH',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          permission_mode: settingsData.permission_mode,
          router_mode: settingsData.router_mode,
          router_strategy: settingsData.router_strategy,
          max_tokens: Number(settingsData.max_tokens || 8192),
          max_context_messages: Number(settingsData.max_context_messages || 50),
          kodo_no_telemetry: toBool(settingsData.kodo_no_telemetry),
          kodo_enable_image_gen: toBool(settingsData.kodo_enable_image_gen),
          kodo_enable_tts: toBool(settingsData.kodo_enable_tts),
          kodo_enable_screenshot: toBool(settingsData.kodo_enable_screenshot),
          kodo_enable_email: toBool(settingsData.kodo_enable_email),
          kodo_enable_collab: toBool(settingsData.kodo_enable_collab),
          kodo_enable_cron: toBool(settingsData.kodo_enable_cron),
          kodo_enable_streaming_tools: toBool(settingsData.kodo_enable_streaming_tools),
          kodo_enable_prompt_cache: toBool(settingsData.kodo_enable_prompt_cache),
          kodo_enable_auto_title: toBool(settingsData.kodo_enable_auto_title),
          kodo_enable_caveman: toBool(settingsData.kodo_enable_caveman),
          kodo_enable_krawlx: toBool(settingsData.kodo_enable_krawlx),
        }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      await Promise.all([loadSettings(), loadUsage(), loadSessions()])
    } catch (error) {
      setSettingsError(String(error))
    } finally {
      setSettingsSaving(false)
    }
  }

  const testApiKey = async (envName: keyof StoredApiKeys) => {
    setApiKeyStatus((prev) => ({ ...prev, [envName]: 'idle' }))
    try {
      const response = await fetch('/api/providers/discover', { headers: buildApiHeaders() })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      const payload = await response.json()
      const keyStatus = (payload.key_status || {}) as Record<string, boolean>

      const map: Record<keyof StoredApiKeys, string> = {
        OPENAI_API_KEY: 'openai',
        ANTHROPIC_API_KEY: 'anthropic',
        GEMINI_API_KEY: 'gemini',
        DEEPSEEK_API_KEY: 'deepseek',
        GROQ_API_KEY: 'groq',
        FIRECRAWL_API_KEY: 'firecrawl',
      }
      setApiKeyStatus((prev) => ({
        ...prev,
        [envName]: keyStatus[map[envName]] ? 'ok' : 'error',
      }))
    } catch {
      setApiKeyStatus((prev) => ({ ...prev, [envName]: 'error' }))
    }
  }

  useEffect(() => {
    if (activeView === 'usage') {
      void loadUsageBreakdown()
    }
  }, [activeView, usageBreakdown])

  useEffect(() => {
    if (activeView === 'agents') {
      void loadCronData()
    }
  }, [activeView])

  useEffect(() => {
    if (activeView === 'settings') {
      setApiKeys(readStoredApiKeys())
      void loadSettings()
    }
  }, [activeView])

  useEffect(() => {
    if (activeView !== 'crg') {
      setCrgHelpOpen(false)
    }
  }, [activeView])

  const usageSource = usageData || usageSummary
  const usageCost = usageSource?.totals?.cost_usd_total ?? usageSource?.totals?.estimated_cost_usd ?? 0
  const usageInput = usageSource?.totals?.input_tokens ?? 0
  const usageOutput = usageSource?.totals?.output_tokens ?? 0
  const usageByModelRows = Object.entries((usageSource?.by_model || {}) as Record<string, any>)
  const usageBySessionRows = Object.entries((usageSource?.by_session || {}) as Record<string, any>)
  const normalizedCrgBase = crgBase.trim() || 'HEAD~1'
  const crgCommands = [
    { command: '/crg status', use: 'Check availability, active repo root, and graph health.', example: '/crg status' },
    { command: '/crg build [--full]', use: 'Build or refresh graph index (run first).', example: '/crg build --full' },
    { command: '/crg detect [base]', use: 'PR-style risk summary: risk score, priorities, test gaps.', example: '/crg detect HEAD~1' },
    { command: '/crg impact [base]', use: 'Blast radius: what files/functions/tests may be affected.', example: '/crg impact HEAD~1 --depth 2' },
    { command: '/crg review [base]', use: 'Richer review context bundle for changed code.', example: '/crg review HEAD~1 --depth 2' },
    { command: '/crg query <pattern> <target>', use: 'Structural lookup (callers, callees, tests, imports, file summary).', example: '/crg query callers_of send_message' },
    { command: '/crg search <query>', use: 'Semantic/keyword search over graph nodes.', example: '/crg search "auth token refresh"' },
    { command: '/crg arch', use: 'High-level architecture and module clustering.', example: '/crg arch' },
    { command: '/crg flows', use: 'Critical execution flows / call chains.', example: '/crg flows --sort criticality --limit 30' },
    { command: '/crg stats', use: 'Node/edge/file stats for graph coverage.', example: '/crg stats' },
  ]
  const crgScenarioGuides = [
    {
      title: 'First-time setup',
      steps: ['/crg status', '/crg build --full', '/crg arch', '/crg stats'],
      why: 'Confirms setup and creates baseline map of the codebase.',
    },
    {
      title: 'Before PR review',
      steps: ['/crg build', '/crg detect HEAD~1', '/crg review HEAD~1', '/crg query tests_for <changed_symbol>'],
      why: 'Finds risky areas quickly and highlights missing test coverage.',
    },
    {
      title: 'Before refactor',
      steps: ['/crg query callers_of <symbol>', '/crg query callees_of <symbol>', '/crg impact HEAD~1'],
      why: 'Shows dependencies first so refactors avoid hidden breakage.',
    },
    {
      title: 'When onboarding',
      steps: ['/crg arch', '/crg flows --sort criticality', '/crg search <domain term>'],
      why: 'Gives fast understanding of architecture and key execution paths.',
    },
  ]
  const crgBenefits = [
    'Reduces token usage by doing structural analysis locally and sending compact summaries to the model.',
    'Cuts context bloat by narrowing file reads to high-impact symbols instead of whole directories.',
    'Improves review quality with explicit risk/test-gap signals before writing or reviewing code.',
  ]

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

  const routeToSelf = () => {
    setActiveView('sessions')
    setAgentGraphModalOpen(false)
    setReplaySessionId(null)
    if (collapsed) onToggleCollapse()

    if (typeof window !== 'undefined' && (window.location.search || window.location.hash)) {
      const nextUrl = window.location.pathname || '/'
      window.history.replaceState({}, '', nextUrl)
    }
  }

  const toggleTheme = () => {
    setTheme(THEME_TONES[theme] === 'dark' ? 'light' : 'claude')
  }

  const insertCrgCommand = (command: string) => {
    const text = command.trim()
    if (!text) return
    useChatStore.getState().setInput(text)
  }

  const runCrgCommand = async (command: string) => {
    const text = command.trim()
    if (!text || isLoading || crgRunning) return
    setCrgRunning(true)
    setCrgLastCommand(text)
    try {
      await sendMessage(text)
    } finally {
      setCrgRunning(false)
    }
  }

  const startSidebarResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (collapsed || event.button !== 0) return
    event.preventDefault()
    sidebarResizeStartRef.current = {
      x: event.clientX,
      width: sidebarPanelWidth,
    }
    setSidebarResizing(true)
  }

  const isLightTheme = THEME_TONES[theme] === 'light'
  const expandedSidebarWidth = `calc(var(--sidebar-rail-width) + ${sidebarPanelWidth}px)`

  return (
    <aside
      style={{
        width: collapsed
          ? 'var(--sidebar-rail-width)'
          : expandedSidebarWidth,
        minWidth: collapsed
          ? 'var(--sidebar-rail-width)'
          : expandedSidebarWidth,
        transition: sidebarResizing ? 'none' : 'width 220ms ease, min-width 220ms ease',
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
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

        <button
          type="button"
          title="KODO home"
          aria-label="KODO home"
          onClick={routeToSelf}
          style={{
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'inherit',
            borderRadius: 8,
          }}
        >
          <KodoLogoMark size={22} />
        </button>

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
          icon={<Zap size={15} />}
          label="Prompt compressor"
          onClick={() => {
            setActiveView('compressor')
            if (collapsed) onToggleCollapse()
          }}
          active={activeView === 'compressor'}
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
        <RailButton
          icon={<GraphGlyphIcon size={15} />}
          label="Code graph"
          onClick={() => {
            setActiveView('crg')
            if (collapsed) onToggleCollapse()
          }}
          active={activeView === 'crg'}
        />

        <RailButton
          icon={<Wand2 size={15} />}
          label="Design Studio"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('kodo:open-design-studio'))
          }}
          active={false}
        />

        <div style={{ flex: 1 }} />

        <RailButton
          icon={isLightTheme ? <Moon size={15} /> : <Sun size={15} />}
          label="Toggle theme"
          onClick={toggleTheme}
        />
      </div>

      <div
        style={{
          width: collapsed ? 0 : `${sidebarPanelWidth}px`,
          minWidth: collapsed ? 0 : `${sidebarPanelWidth}px`,
          opacity: collapsed ? 0 : 1,
          transform: collapsed ? 'translateX(-10px)' : 'translateX(0)',
          pointerEvents: collapsed ? 'none' : 'auto',
          transition: sidebarResizing
            ? 'opacity 150ms ease, transform 220ms ease'
            : 'opacity 150ms ease, transform 220ms ease, width 220ms ease',
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
          <button
            type="button"
            onClick={routeToSelf}
            title="KODO home"
            aria-label="KODO home"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
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
                fontFamily: 'var(--font-kodo-brand)',
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: '-0.06em',
                lineHeight: 1,
                color: 'var(--text-0)',
              }}
            >
              KODO
            </div>
          </button>
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
              background: 'var(--bg-2)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-0)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              transition: 'all 140ms ease',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = 'var(--border-bright)'
              event.currentTarget.style.background = 'var(--bg-3)'
              event.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = 'var(--border-bright)'
              event.currentTarget.style.background = 'var(--bg-2)'
              event.currentTarget.style.transform = 'translateY(0)'
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
            icon={<Zap size={15} />}
            label="Compressor"
            active={activeView === 'compressor'}
            onClick={() => setActiveView('compressor')}
          />
          <PanelNav
            icon={<Hammer size={15} />}
            label="Skills"
            active={activeView === 'skills'}
            onClick={() => setActiveView('skills')}
          />
          <PanelNav
            icon={<GraphGlyphIcon size={15} />}
            label="Code Graph"
            active={activeView === 'crg'}
            onClick={() => setActiveView('crg')}
          />
          <PanelNav
            icon={<FileText size={15} />}
            label="Code Review"
            active={activeView === 'review'}
            onClick={() => setActiveView('review')}
          />
          <PanelNav
            icon={<Settings size={15} />}
            label="Settings"
            active={activeView === 'settings'}
            onClick={() => setActiveView('settings')}
          />
          <PanelNav
            icon={<Wand2 size={15} />}
            label="Design Studio"
            active={false}
            onClick={() => window.dispatchEvent(new CustomEvent('kodo:open-design-studio'))}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {activeView === 'sessions' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '6px 14px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Search chats</span>
                  <button
                    type="button"
                    onClick={() => setShowStarredOnly((v) => !v)}
                    title={showStarredOnly ? 'Show all sessions' : 'Show starred only'}
                    style={{
                      background: showStarredOnly ? 'var(--accent-dim)' : 'transparent',
                      border: `1px solid ${showStarredOnly ? 'var(--accent)' : 'var(--border)'}`,
                      color: showStarredOnly ? 'var(--yellow, #f1c40f)' : 'var(--text-2)',
                      borderRadius: 6,
                      padding: '2px 7px',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Star size={10} fill={showStarredOnly ? 'currentColor' : 'none'} />
                    STARRED
                  </button>
                </div>
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
                      onStar={() => toggleSessionStar(session.session_id)}
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

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Scheduled Jobs</div>
                  <button
                    type="button"
                    onClick={() => void loadCronData()}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      padding: '4px 7px',
                    }}
                  >
                    Refresh
                  </button>
                </div>

                {!cronEnabled && (
                  <div style={{ fontSize: 11, color: 'var(--yellow)' }}>
                    Cron scheduler is disabled (KODO_ENABLE_CRON=0).
                  </div>
                )}

                <div style={{ display: 'grid', gap: 6 }}>
                  <input
                    value={cronName}
                    onChange={(event) => setCronName(event.target.value)}
                    placeholder="Job name"
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                    }}
                  />
                  <select
                    value={cronExpr}
                    onChange={(event) => setCronExpr(event.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                    }}
                  >
                    <option value="every_5_minutes">every_5_minutes</option>
                    <option value="every_30_minutes">every_30_minutes</option>
                    <option value="every_1_hour">every_1_hour</option>
                    <option value="every_6_hours">every_6_hours</option>
                    <option value="daily_09:00">daily_09:00</option>
                  </select>
                  <textarea
                    value={cronPrompt}
                    onChange={(event) => setCronPrompt(event.target.value)}
                    placeholder="Prompt to run on schedule"
                    rows={3}
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                      resize: 'vertical',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void saveCronJob()}
                    disabled={cronLoading || !cronEnabled}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      cursor: cronLoading || !cronEnabled ? 'not-allowed' : 'pointer',
                      padding: '6px 8px',
                      opacity: cronLoading || !cronEnabled ? 0.6 : 1,
                    }}
                  >
                    New job
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 5 }}>
                  {cronJobs.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {cronLoading ? 'Loading jobs...' : 'No scheduled jobs yet.'}
                    </div>
                  )}
                  {cronJobs.map((job) => (
                    <div key={job.name} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-1)', padding: 7, display: 'grid', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-0)' }}>{job.name}</div>
                        <div style={{ fontSize: 10, color: job.enabled ? 'var(--green)' : 'var(--text-2)' }}>
                          {job.enabled ? 'enabled' : 'disabled'}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{job.cron_expr}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => void toggleCronJob(job)}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            background: 'var(--bg-3)',
                            color: 'var(--text-1)',
                            fontSize: 10,
                            cursor: 'pointer',
                            padding: '4px 6px',
                          }}
                        >
                          {job.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeCronJob(job.name)}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            background: 'var(--bg-3)',
                            color: 'var(--red)',
                            fontSize: 10,
                            cursor: 'pointer',
                            padding: '4px 6px',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Recent runs</div>
                  {cronRuns.length === 0 && <div style={{ fontSize: 10, color: 'var(--text-2)' }}>No runs yet.</div>}
                  {cronRuns.slice(0, 5).map((run, idx) => (
                    <div key={`${run.task_id || 'run'}-${idx}`} style={{ fontSize: 10, color: 'var(--text-1)' }}>
                      {(run.job_name || 'job')} - {(run.task_id || 'task')} - {run.fired_at ? formatDate(run.fired_at) : 'n/a'}
                    </div>
                  ))}
                </div>

                {cronError && <div style={{ fontSize: 11, color: 'var(--red)' }}>{cronError}</div>}
              </div>
            </div>
          )}

          {activeView === 'usage' && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '10px 10px 12px', display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setUsageBreakdown('model')}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: usageBreakdown === 'model' ? 'var(--bg-3)' : 'var(--bg-2)',
                    color: usageBreakdown === 'model' ? 'var(--text-0)' : 'var(--text-2)',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    padding: '5px 8px',
                  }}
                >
                  By model
                </button>
                <button
                  type="button"
                  onClick={() => setUsageBreakdown('sessions')}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: usageBreakdown === 'sessions' ? 'var(--bg-3)' : 'var(--bg-2)',
                    color: usageBreakdown === 'sessions' ? 'var(--text-0)' : 'var(--text-2)',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    padding: '5px 8px',
                  }}
                >
                  By session
                </button>
              </div>

              <UsageCard label="Estimated cost (7D)" value={`$${usageCost.toFixed(4)}`} />
              <UsageCard label="Input tokens" value={usageInput.toLocaleString()} />
              <UsageCard label="Output tokens" value={usageOutput.toLocaleString()} />

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6 }}>
                  {usageBreakdown === 'sessions' ? 'By session' : 'By model'}
                </div>

                {usageLoading && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Loading usage...</div>}
                {usageError && <div style={{ fontSize: 11, color: 'var(--red)' }}>{usageError}</div>}

                {usageBreakdown === 'model' && usageByModelRows.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>No usage events yet.</div>
                )}

                {usageBreakdown === 'model' && usageByModelRows.map(([model, row]) => {
                  const entry = row as Record<string, number>
                  const cost = Number(entry.cost_usd_total ?? entry.estimated_cost_usd ?? 0)
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
                      <div>
                        In {Number(entry.input_tokens || 0).toLocaleString()} / Out {Number(entry.output_tokens || 0).toLocaleString()}
                      </div>
                      <div>${cost.toFixed(4)}</div>
                    </div>
                  )
                })}

                {usageBreakdown === 'sessions' && usageBySessionRows.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>No session usage yet.</div>
                )}

                {usageBreakdown === 'sessions' && usageBySessionRows.map(([sid, row]) => {
                  const entry = row as Record<string, number>
                  const cost = Number(entry.cost_usd_total ?? entry.estimated_cost_usd ?? 0)
                  return (
                    <button
                      key={sid}
                      type="button"
                      onClick={() => {
                        if (!sid || sid === 'unknown') return
                        void loadSession(sid)
                        setActiveView('sessions')
                      }}
                      style={{
                        width: '100%',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-1)',
                        color: 'var(--text-1)',
                        textAlign: 'left',
                        cursor: sid === 'unknown' ? 'default' : 'pointer',
                        padding: '6px 8px',
                        display: 'grid',
                        gap: 2,
                        marginTop: 6,
                      }}
                    >
                      <span style={{ color: 'var(--text-0)', fontSize: 11 }}>{sid}</span>
                      <span style={{ fontSize: 10 }}>
                        In {Number(entry.input_tokens || 0).toLocaleString()} / Out {Number(entry.output_tokens || 0).toLocaleString()} - ${cost.toFixed(4)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeView === 'prompts' && (
            <PromptLibraryPanel />
          )}

          {activeView === 'compressor' && (
            <div style={{ height: '100%', minHeight: 0, padding: '0 12px 12px', overflowY: 'auto' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  padding: '12px 0 8px',
                }}
              >
                Prompt compressor
              </div>
              <PromptCompressorPanel
                onUsePrompt={(compressed) => {
                  useChatStore.getState().setInput(compressed)
                }}
              />
            </div>
          )}

          {activeView === 'skills' && (
            <SkillBuilderPanel />
          )}

          {activeView === 'crg' && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '10px 10px 12px', display: 'grid', gap: 8 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Code Review Graph</div>
                  <button
                    type="button"
                    onClick={() => setCrgHelpOpen(true)}
                    title="What is Code Review Graph?"
                    aria-label="Open Code Review Graph help"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-3)',
                      color: 'var(--text-1)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    ?
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                  Run CRG slash commands without typing. Results stream into the chat as tool calls.
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  Repo context: {projectDir?.trim() ? projectDir : 'Auto-detected by CRG'}
                </div>
                {crgLastCommand && (
                  <div style={{ fontSize: 10, color: 'var(--accent)' }}>
                    Last command: {crgLastCommand}
                  </div>
                )}
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Quick Actions</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand('/crg status')}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    Run status
                  </button>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand('/crg build')}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    Run build
                  </button>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand('/crg arch')}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    Run arch
                  </button>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand('/crg stats')}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    Run stats
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Change Review</div>
                <label style={{ display: 'grid', gap: 4, fontSize: 10, color: 'var(--text-2)' }}>
                  Base ref
                  <input
                    value={crgBase}
                    onChange={(event) => setCrgBase(event.target.value)}
                    placeholder="HEAD~1"
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                    }}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => insertCrgCommand(`/crg detect ${normalizedCrgBase}`)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-1)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      cursor: 'pointer',
                      padding: '6px 7px',
                    }}
                  >
                    Insert detect
                  </button>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand(`/crg detect ${normalizedCrgBase}`)}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    Run detect
                  </button>
                  <button
                    type="button"
                    onClick={() => insertCrgCommand(`/crg impact ${normalizedCrgBase}`)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-1)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      cursor: 'pointer',
                      padding: '6px 7px',
                    }}
                  >
                    Insert impact
                  </button>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand(`/crg review ${normalizedCrgBase}`)}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    Run review
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Structural Query</div>
                <select
                  value={crgPattern}
                  onChange={(event) => setCrgPattern(event.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-0)',
                    padding: '6px 8px',
                    fontSize: 11,
                  }}
                >
                  <option value="callers_of">callers_of</option>
                  <option value="callees_of">callees_of</option>
                  <option value="imports_of">imports_of</option>
                  <option value="importers_of">importers_of</option>
                  <option value="children_of">children_of</option>
                  <option value="tests_for">tests_for</option>
                  <option value="inheritors_of">inheritors_of</option>
                  <option value="file_summary">file_summary</option>
                </select>
                <input
                  value={crgTarget}
                  onChange={(event) => setCrgTarget(event.target.value)}
                  placeholder="symbol or file path"
                  style={{
                    width: '100%',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-0)',
                    padding: '6px 8px',
                    fontSize: 11,
                  }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => insertCrgCommand(`/crg query ${crgPattern} ${crgTarget || 'send_message'}`)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-1)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      cursor: 'pointer',
                      padding: '6px 7px',
                    }}
                  >
                    Insert query
                  </button>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand(`/crg query ${crgPattern} ${crgTarget || 'send_message'}`)}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    Run query
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Semantic Search + Custom Command</div>
                <input
                  value={crgQuery}
                  onChange={(event) => setCrgQuery(event.target.value)}
                  placeholder="search terms"
                  style={{
                    width: '100%',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-0)',
                    padding: '6px 8px',
                    fontSize: 11,
                  }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => insertCrgCommand(`/crg search ${crgQuery || 'send_message'}`)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-1)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      cursor: 'pointer',
                      padding: '6px 7px',
                    }}
                  >
                    Insert search
                  </button>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand(`/crg search ${crgQuery || 'send_message'}`)}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    Run search
                  </button>
                </div>
                <textarea
                  value={crgCustomCommand}
                  onChange={(event) => setCrgCustomCommand(event.target.value)}
                  rows={2}
                  placeholder="/crg status"
                  style={{
                    width: '100%',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-0)',
                    padding: '6px 8px',
                    fontSize: 11,
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => insertCrgCommand(crgCustomCommand)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-1)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      cursor: 'pointer',
                      padding: '6px 7px',
                    }}
                  >
                    Insert custom
                  </button>
                  <button
                    type="button"
                    onClick={() => void runCrgCommand(crgCustomCommand)}
                    disabled={isLoading || crgRunning}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-0)',
                      fontSize: 10,
                      cursor: isLoading || crgRunning ? 'not-allowed' : 'pointer',
                      padding: '6px 7px',
                      opacity: isLoading || crgRunning ? 0.6 : 1,
                    }}
                  >
                    {crgRunning ? 'Running...' : 'Run custom'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeView === 'review' && (
            <CodeReviewPanel sessionId={sessionId} projectDir={projectDir} />
          )}

          {activeView === 'settings' && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '10px 10px 12px', display: 'grid', gap: 8 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Feature flags</div>
                {[
                  ['kodo_enable_image_gen', 'Image generation'],
                  ['kodo_enable_tts', 'Text to speech'],
                  ['kodo_enable_screenshot', 'Screenshot tool'],
                  ['kodo_enable_email', 'Email tool'],
                  ['kodo_enable_collab', 'Collaboration'],
                  ['kodo_enable_cron', 'Cron scheduler'],
                  ['kodo_enable_streaming_tools', 'Streaming tools'],
                  ['kodo_enable_prompt_cache', 'Prompt cache'],
                  ['kodo_enable_auto_title', 'Auto title'],
                  ['kodo_enable_caveman', 'Caveman toolkit'],
                  ['kodo_enable_krawlx', 'KrawlX crawler'],
                  ['kodo_no_telemetry', 'Disable telemetry'],
                ].map(([key, label]) => {
                  const value = String(settingsData[key] || '').toLowerCase()
                  const enabled = ['1', 'true', 'yes', 'on'].includes(value)
                  return (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-1)' }}>
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => {
                          setSettingsData((prev) => ({ ...prev, [key]: event.target.checked ? '1' : '0' }))
                        }}
                      />
                    </label>
                  )
                })}
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 7 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Agent behavior</div>
                <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
                  Permission mode
                  <select
                    value={settingsData.permission_mode || 'ask'}
                    onChange={(event) => setSettingsData((prev) => ({ ...prev, permission_mode: event.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                    }}
                  >
                    <option value="ask">ask</option>
                    <option value="auto">auto</option>
                    <option value="yolo">yolo</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
                  Max tokens
                  <input
                    type="number"
                    value={settingsData.max_tokens || '8192'}
                    onChange={(event) => setSettingsData((prev) => ({ ...prev, max_tokens: event.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                    }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
                  Max context messages
                  <input
                    type="number"
                    value={settingsData.max_context_messages || '50'}
                    onChange={(event) => setSettingsData((prev) => ({ ...prev, max_context_messages: event.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                    }}
                  />
                </label>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 7 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Router</div>
                <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
                  Router mode
                  <select
                    value={settingsData.router_mode || 'fixed'}
                    onChange={(event) => setSettingsData((prev) => ({ ...prev, router_mode: event.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                    }}
                  >
                    <option value="fixed">fixed</option>
                    <option value="smart">smart</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
                  Router strategy
                  <select
                    value={settingsData.router_strategy || 'balanced'}
                    onChange={(event) => setSettingsData((prev) => ({ ...prev, router_strategy: event.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-0)',
                      padding: '6px 8px',
                      fontSize: 11,
                    }}
                  >
                    <option value="balanced">balanced</option>
                    <option value="speed">speed</option>
                    <option value="quality">quality</option>
                    <option value="cost">cost</option>
                  </select>
                </label>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 8, display: 'grid', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-0)' }}>API keys</div>
                  <button
                    type="button"
                    onClick={() => setShowApiKeys((prev) => !prev)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-3)',
                      color: 'var(--text-1)',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      padding: '4px 7px',
                    }}
                  >
                    {showApiKeys ? 'Hide' : 'Show'}
                  </button>
                </div>

                {([
                  ['OPENAI_API_KEY', 'OpenAI'],
                  ['ANTHROPIC_API_KEY', 'Anthropic'],
                  ['GEMINI_API_KEY', 'Gemini'],
                  ['DEEPSEEK_API_KEY', 'DeepSeek'],
                  ['GROQ_API_KEY', 'Groq'],
                  ['FIRECRAWL_API_KEY', 'Firecrawl'],
                ] as Array<[keyof StoredApiKeys, string]>).map(([key, label]) => (
                  <div key={key} style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type={showApiKeys ? 'text' : 'password'}
                        value={String(apiKeys[key] || '')}
                        onChange={(event) => setApiKeys((prev) => ({ ...prev, [key]: event.target.value }))}
                        placeholder={`Enter ${label} key`}
                        style={{
                          flex: 1,
                          background: 'var(--bg-1)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          color: 'var(--text-0)',
                          padding: '6px 8px',
                          fontSize: 11,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void testApiKey(key)}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          background: 'var(--bg-3)',
                          color: apiKeyStatus[key] === 'ok' ? 'var(--green)' : apiKeyStatus[key] === 'error' ? 'var(--red)' : 'var(--text-1)',
                          fontSize: 10,
                          cursor: 'pointer',
                          padding: '4px 7px',
                        }}
                      >
                        {apiKeyStatus[key] === 'ok' ? 'OK' : apiKeyStatus[key] === 'error' ? 'Fail' : 'Test'}
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => saveStoredApiKeys(apiKeys)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-3)',
                    color: 'var(--text-0)',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    padding: '6px 8px',
                  }}
                >
                  Save API keys locally
                </button>
              </div>

              <button
                type="button"
                onClick={() => void patchSettings()}
                disabled={settingsLoading || settingsSaving}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-3)',
                  color: 'var(--text-0)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  cursor: settingsLoading || settingsSaving ? 'not-allowed' : 'pointer',
                  padding: '7px 8px',
                  opacity: settingsLoading || settingsSaving ? 0.6 : 1,
                }}
              >
                {settingsSaving ? 'Saving...' : 'Save settings'}
              </button>

              {settingsError && <div style={{ fontSize: 11, color: 'var(--red)' }}>{settingsError}</div>}
            </div>
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
          <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.06em', fontFamily: 'var(--font-kodo-brand)' }}>
            POWERED BY KODO
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title={isLightTheme ? 'Switch to dark theme' : 'Switch to light theme'}
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
            {isLightTheme ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize sidebar"
          onMouseDown={startSidebarResize}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 8,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 55,
            background: sidebarResizing ? 'var(--accent-dim)' : 'transparent',
            borderLeft: sidebarResizing ? '1px solid var(--accent)' : '1px solid transparent',
          }}
        />
      )}

      {crgHelpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Code Review Graph help"
          onClick={() => setCrgHelpOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 62,
            background: 'color-mix(in srgb, var(--bg-0) 70%, black)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(96vw, 980px)',
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
                }}>
                  Code Review Graph Guide
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                  What it does, when to use each command, and how it saves tokens.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCrgHelpOpen(false)}
                aria-label="Close CRG help"
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

            <div style={{ padding: 14, overflow: 'auto', display: 'grid', gap: 10 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 10, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>What It Is</div>
                <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.45 }}>
                  CRG is a local structural code graph. It analyzes relationships (callers, callees, imports, tests, flows) so KODO can reason over concise graph facts instead of repeatedly sending large source chunks to the model.
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Commands + Examples</div>
                {crgCommands.map((item) => (
                  <div
                    key={item.command}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-1)',
                      padding: '7px 8px',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{item.command}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-1)' }}>{item.use}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>Example: {item.example}</div>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Scenario Playbooks (Order To Use)</div>
                {crgScenarioGuides.map((scenario) => (
                  <div
                    key={scenario.title}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg-1)',
                      padding: '7px 8px',
                      display: 'grid',
                      gap: 5,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-0)' }}>{scenario.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{scenario.why}</div>
                    <div style={{ display: 'grid', gap: 3 }}>
                      {scenario.steps.map((step, index) => (
                        <div key={`${scenario.title}-${step}-${index}`} style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                          {index + 1}. {step}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-2)', padding: 10, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Benefits</div>
                {crgBenefits.map((benefit, index) => (
                  <div key={`benefit-${index}`} style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.45 }}>
                    {index + 1}. {benefit}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
  onStar,
}: {
  session: Session
  active: boolean
  searchQuery: string
  onSelect: () => void
  onReplay: () => void
  onDelete: () => void
  onStar: () => void
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
          onStar()
        }}
        title={session.starred ? 'Unstar session' : 'Star session'}
        aria-label={session.starred ? 'Unstar' : 'Star'}
        style={{
          border: 'none',
          background: 'transparent',
          color: session.starred ? 'var(--yellow, #f1c40f)' : 'var(--text-2)',
          width: 20,
          height: 20,
          borderRadius: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Star size={12} fill={session.starred ? 'currentColor' : 'none'} />
      </button>
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
