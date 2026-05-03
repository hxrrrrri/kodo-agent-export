import { useCallback, useEffect, useMemo, useRef, useState, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Send, Square, FolderOpen, Zap, ImagePlus, X, Search, Terminal as TerminalIcon, Paperclip, CircleAlert, BookOpen, Mic, Palette, Check, ChevronDown, ChevronUp, Download, GitCompare } from 'lucide-react'
import { CommandPalette, exportConversationAsMarkdown } from './CommandPalette'
import { extractVariables, PromptVariablesModal } from './PromptVariables'
import { SmartSuggestions } from './SmartSuggestions'
import { StatusBar } from './StatusBar'
import { DepthSelector, DepthMode, applyDepth } from './DepthSelector'
import { ThemeStudio as ThemeStudioChat } from './ThemeStudio'
import { ProjectBrief, applyProjectBrief } from './ProjectBrief'
import { ConferenceThread, ConferenceThreadData, ConferenceResult } from './ConferenceThread'
import { useChat } from '../hooks/useChat'
import { MessageBubble } from './MessageBubble'
import { CommandDefinition, THEME_OPTIONS, ThemeKey } from '../store/chatStore'
import { TerminalPanel } from './TerminalPanel'
import { NotebookPanel } from './NotebookPanel'
import { KodoLogoMark } from './KodoLogoMark'
import { CollabBar } from './CollabBar'
import { useCollabSession } from '../hooks/useCollabSession'
import { buildApiHeaders, parseApiError } from '../lib/api'
import { BuddyWidget } from './BuddyWidget'
import { KodoThinkingIndicator } from './kodothinkingindicator'

type ChatWindowProps = {
  editorOpen: boolean
  onToggleEditor: () => void
}

const CONTEXT_TOKEN_BUDGET = Number(import.meta.env.VITE_CONTEXT_TOKEN_BUDGET || 60000)
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_VISIBLE_ATTACHMENT_CHIPS = 8
const ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/zip,.zip,text/*,.py,.ts,.tsx,.js,.jsx,.md,.json,.yaml,.yml,.toml,.rs,.go,.java,.cpp,.c,.h'
const VOICE_SILENCE_STOP_MS = 5000
const VOICE_RESTART_DELAY_MS = 120

type PendingImage = {
  previewUrl: string
  data: string
  media_type: string
  name: string
  size: number
}

interface FileAttachment {
  name: string
  size: number
  type: string
  data: string
  isImage: boolean
  isZip: boolean
  previewUrl?: string
}

type SessionRecap = {
  session_id: string
  away_seconds: number
  away_label?: string
  summary: string
  highlights: string[]
}

type PromptTemplate = {
  name: string
  content: string
}

type SuggestionItem = CommandDefinition & {
  source: 'command' | 'prompt'
  promptName?: string
}

type HeaderHoverOptions = {
  active?: boolean
  activeBorder?: string
  activeColor?: string
  activeShadow?: string
  defaultColor?: string
  disabled?: boolean
}

const EXAMPLE_PROMPTS = [
  '/help',
  '/stop',
  '/cost 7',
  '/krawlx https://example.com',
  '/session',
  '/memory show',
  '/mode',
  '/tasks',
  '/agents',
  '/skills',
  '/mcp list',
  '/crg status',
  'List all Python files in the current directory',
  'Read the contents of README.md',
  'Run the tests and show me the results',
]

const KNOWN_ROOT_COMMANDS: CommandDefinition[] = [
  { name: '/help', description: 'Show available commands' },
  { name: '/cost', description: 'Show token and estimated cost usage' },
  { name: '/krawlx', description: 'Crawl a website via KrawlX secure crawler' },
  { name: '/firecrawl', description: 'Crawl a website with Firecrawl provider' },
  { name: '/crawlx', description: 'Alias for /krawlx' },
  { name: '/session', description: 'Inspect or manage sessions' },
  { name: '/memory', description: 'Read or write memory notes' },
  { name: '/mode', description: 'Inspect or set session mode' },
  { name: '/provider', description: 'Show or switch provider profiles' },
  { name: '/stop', description: 'Stop current generation immediately' },
  { name: '/doctor', description: 'Run runtime health checks' },
  { name: '/router', description: 'Inspect or set routing strategy' },
  { name: '/model', description: 'Inspect or override model' },
  { name: '/privacy', description: 'Show telemetry/privacy status' },
  { name: '/tasks', description: 'Manage background tasks' },
  { name: '/mcp', description: 'Manage MCP servers and tool calls' },
  { name: '/crg', description: 'Code review graph workflows' },
  { name: '/agents', description: 'Spawn and inspect sub-agents' },
  { name: '/skills', description: 'List and run bundled skills' },
  { name: '/search', description: 'Search the web with provider fallback' },
  { name: '/git', description: 'Run safe, read-only git command' },
  { name: '/checkpoint', description: 'Create/list/restore checkpoints' },
  { name: '/teleport', description: 'Quick-switch session mode' },
  { name: '/ultraplan', description: 'Generate high-fidelity execution plans' },
  { name: '/dream', description: 'Generate a bold next-iteration concept' },
  { name: '/advisor', description: 'Run strategic advisor-style review' },
  { name: '/bughunter', description: 'Trigger bug-hunting workflow' },
]

const FALLBACK_COMMANDS: CommandDefinition[] = [
  ...KNOWN_ROOT_COMMANDS,
  { name: '/krawlx <url>', description: 'Crawl a website via KrawlX secure crawler' },
  { name: '/firecrawl <url>', description: 'Crawl a website with Firecrawl provider' },
  { name: '/crawlx <url>', description: 'Alias for /krawlx' },
  { name: '/session', description: 'List recent sessions' },
  { name: '/session current', description: 'Show current session id' },
  { name: '/memory <text>', description: 'Append note to global memory' },
  { name: '/memory show', description: 'Show loaded memory context' },
  { name: '/checkpoint', description: 'Create checkpoint for current session' },
  { name: '/checkpoint list', description: 'List session checkpoints' },
  { name: '/checkpoint restore <id> --yes', description: 'Restore a session checkpoint' },
  { name: '/mode', description: 'Show current session mode' },
  { name: '/mode list', description: 'List available execution modes' },
  { name: '/mode set <name>', description: 'Set session execution mode' },
  { name: '/mode reset', description: 'Reset mode to default' },
  { name: '/provider', description: 'Show provider profiles and active provider' },
  { name: '/provider list', description: 'List saved provider profiles' },
  { name: '/provider set <name>', description: 'Activate provider profile' },
  { name: '/stop', description: 'Stop current response generation' },
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
  { name: '/crg status', description: 'Show CRG availability and graph stats' },
  { name: '/crg build [--full] [--postprocess full|minimal|none] [--repo <path>]', description: 'Build or update code graph' },
  { name: '/crg detect [base] [--detail standard|minimal] [--repo <path>]', description: 'Analyze changed files risk' },
  { name: '/crg impact [base] [--depth N] [--repo <path>]', description: 'Compute blast radius' },
  { name: '/crg review [base] [--depth N] [--repo <path>]', description: 'Build full review context bundle' },
  { name: '/crg query <pattern> <target> [--detail standard|minimal] [--repo <path>]', description: 'Run structural graph query' },
  { name: '/crg search <query> [--kind Kind] [--limit N] [--repo <path>]', description: 'Semantic/keyword graph search' },
  { name: '/crg arch [--repo <path>]', description: 'Architecture overview from graph' },
  { name: '/crg flows [--sort criticality|depth|node_count|name] [--limit N] [--repo <path>]', description: 'List critical execution flows' },
  { name: '/crg stats [--repo <path>]', description: 'Show graph node/edge stats' },
  { name: '/agents', description: 'List spawned sub-agents' },
  { name: '/agents spawn <goal>', description: 'Spawn sub-agent' },
  { name: '/agents get <agent_id>', description: 'Show sub-agent details' },
  { name: '/agents stop <agent_id>', description: 'Stop sub-agent' },
  { name: '/skills', description: 'List bundled skills' },
  { name: '/skills show <name>', description: 'Show skill content' },
  { name: '/skills run <name>', description: 'Run bundled skill immediately' },
  { name: '/teleport <mode>', description: 'Quick-switch session mode' },
  { name: '/ultraplan <goal>', description: 'Generate high-fidelity execution plan' },
  { name: '/dream [focus]', description: 'Generate a bold next-iteration concept' },
  { name: '/advisor [topic]', description: 'Run strategic advisor-style review' },
  { name: '/bughunter <issue>', description: 'Trigger bug-hunting workflow' },
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

function filterPaletteCommands(query: string, commands: CommandDefinition[]): CommandDefinition[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return commands
  return commands.filter((command) => {
    const name = command.name.toLowerCase()
    const description = (command.description || '').toLowerCase()
    return name.includes(normalized) || description.includes(normalized)
  })
}

function approximateTokens(value: string): number {
  if (!value.trim()) return 0
  return Math.max(1, Math.ceil(value.length / 4))
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Failed to read file'))
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function sniffImageMimeType(base64Data: string): string {
  try {
    const bytes = atob(base64Data.slice(0, 16))
    const b = (i: number) => bytes.charCodeAt(i)
    if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'image/jpeg'
    if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47) return 'image/png'
    if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return 'image/gif'
    if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46) return 'image/webp'
  } catch { /* ignore */ }
  return ''
}

function decodeBase64ToText(data: string): string {
  try {
    const binary = atob(data)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

const TAB_COMPLETIONS: Array<[string, string]> = [
  ['write a func', 'Write a function that '],
  ['write a test', 'Write unit tests for '],
  ['fix the', 'Fix the bug in '],
  ['explain', 'Explain how '],
  ['create a react', 'Create a React component that '],
  ['create a', 'Create a '],
  ['refactor', 'Refactor the following code to '],
  ['how do i', 'How do I '],
  ['what is', 'What is '],
  ['add', 'Add '],
  ['update', 'Update '],
  ['review', 'Review the following code:\n\n'],
  ['debug', 'Debug the following issue:\n\n'],
  ['optimize', 'Optimize the following code for '],
]

function getTabSuggestion(current: string): string | null {
  const lower = current.toLowerCase()
  for (const [prefix, full] of TAB_COMPLETIONS) {
    if (prefix.startsWith(lower) && full.toLowerCase() !== lower && full.toLowerCase() !== lower + ' ') {
      return full
    }
  }
  return null
}

function decodeBase64ToBytes(data: string): Uint8Array {
  const binary = atob(data)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}



// FloatingTodoPanel removed — todo plans are rendered inline in message bubbles via TodoPanel

export function ChatWindow({ editorOpen, onToggleEditor }: ChatWindowProps) {
  const {
    messages,
    filteredMessages,
    isLoading,
    error,
    commands,
    loadCommands,
    loadSession,
    loadSessions,
    loadUsage,
    sendMessage,
    stopGeneration,
    projectDir,
    setProjectDir,
    sessionId,
    setSessionId,
    sessionMode,
    availableModes,
    setSessionMode,
    permissionChallenges,
    respondPermission,
    messageSearchQuery,
    setMessageSearchQuery,
    theme,
    setTheme,
    clearMessages,
    checkpoints,
    createCheckpoint,
    restoreCheckpoint,
    newSession,
    runDream,
    forkSession,
  } = useChat()
  const [input, setInput] = useState('')
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [preEditInput, setPreEditInput] = useState('')
  const [showProjectInput, setShowProjectInput] = useState(false)
  const [contextBarCollapsed, setContextBarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('kodo:context-bar-collapsed') === '1' } catch { return false }
  })
  useEffect(() => {
    try { window.localStorage.setItem('kodo:context-bar-collapsed', contextBarCollapsed ? '1' : '0') } catch { /* ignore */ }
  }, [contextBarCollapsed])
  const [projectDirPicking, setProjectDirPicking] = useState(false)
  const [projectDirPickerError, setProjectDirPickerError] = useState('')
  const [permissionSubmitting, setPermissionSubmitting] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [actionPaletteOpen, setActionPaletteOpen] = useState(false)
  const [varModalPrompt, setVarModalPrompt] = useState<string | null>(null)
  const [varModalVars, setVarModalVars] = useState<string[]>([])
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [depthMode, setDepthMode] = useState<DepthMode>('balanced')
  const [themeStudioOpenChat, setThemeStudioOpenChat] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  const [conferenceMode, setConferenceMode] = useState(false)
  const [conferenceProviders, setConferenceProviders] = useState<Array<{name: string; big_model: string}>>([])
  const [conferenceModels, setConferenceModels] = useState<Record<string, string[]>>({})
  const [conferenceRunMode, setConferenceRunMode] = useState<'synthesis' | 'debate'>('synthesis')
  // Each slot: { provider, model, name }
  const [conferenceSlots, setConferenceSlots] = useState<Array<{provider: string; model: string; name: string}>>([])
  // Keep conferenceSelected for backward compat (array of provider names for display)
  const conferenceSelected = conferenceSlots.map((s) => s.provider)
  const [conferenceThread, setConferenceThread] = useState<ConferenceThreadData | null>(null)
  const conferenceAbortRef = useRef<AbortController | null>(null)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const promptHistoryRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  const draftBeforeHistoryRef = useRef<string>('')
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [terminalLines, setTerminalLines] = useState<string[]>([])
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalRunning, setTerminalRunning] = useState(false)
  const [showNotebook, setShowNotebook] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [dragOverlayVisible, setDragOverlayVisible] = useState(false)
  const [terminalCwd, setTerminalCwd] = useState('')
  const terminalCwdRef = useRef('')
  const messageListRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const paletteInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const dragDepthRef = useRef(0)
  const shouldAutoScrollRef = useRef(true)
  const previousMessageSearchRef = useRef('')
  const commandsRequestedRef = useRef(false)
  const speechRecognitionRef = useRef<any>(null)
  const voiceSilenceTimeoutRef = useRef<number | null>(null)
  const voiceSessionRef = useRef(0)
  const voiceShouldListenRef = useRef(false)
  const voiceBaseInputRef = useRef('')
  const voiceCommittedTranscriptRef = useRef('')
  const [voiceListening, setVoiceListening] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([])
  const [recapLoading, setRecapLoading] = useState(false)
  const [afkRecap, setAfkRecap] = useState<SessionRecap | null>(null)

  const lastMessageRole = messages.length > 0
    ? messages[messages.length - 1]?.role as 'user' | 'assistant' | null
    : null

  const lastAdvisorVerdict = messages.length > 0
    ? (messages[messages.length - 1] as any)?.advisorVerdict?.verdict ?? null
    : null



  const {
    observerMode,
    shareUrl,
    expiresAt,
    viewerCount,
    lastEventType,
    error: collabError,
    createShare,
    revokeShare,
  } = useCollabSession(sessionId)

  const activePermission = permissionChallenges.length > 0 ? permissionChallenges[0] : null

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth' })
  }, [messages, isLoading])

  // Load conference providers + models (including live Ollama)
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const [provRes, modRes] = await Promise.all([
          fetch('/api/conference/providers', { headers: buildApiHeaders() }),
          fetch('/api/conference/models', { headers: buildApiHeaders() }),
        ])
        const provData = provRes.ok ? await provRes.json() : null
        const modData = modRes.ok ? await modRes.json() : null

        if (provData?.providers) {
          const configured = provData.providers.filter((p: any) => p.configured)
          setConferenceProviders(configured)
          if (modData?.models) setConferenceModels(modData.models)

          // Default: first 2 configured providers, each with their big_model
          const slots = configured.slice(0, 2).map((p: any) => ({
            provider: p.name,
            model: (modData?.models?.[p.name]?.[0]) || p.big_model || '',
            name: `${p.name}/${(modData?.models?.[p.name]?.[0]) || p.big_model || ''}`,
          }))
          setConferenceSlots(slots)
        }
      } catch { /* ignore */ }
    }
    void loadProviders()
  }, [])

  // Draft auto-save: persist unsent input to localStorage
  useEffect(() => {
    const key = `kodo-draft-${sessionId || 'default'}`
    if (input.trim()) {
      localStorage.setItem(key, input)
    } else {
      localStorage.removeItem(key)
    }
  }, [input, sessionId])

  // Restore draft on session change
  useEffect(() => {
    const key = `kodo-draft-${sessionId || 'default'}`
    const saved = localStorage.getItem(key)
    if (saved && !input) {
      setInput(saved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    if (commandsRequestedRef.current) return
    commandsRequestedRef.current = true
    void loadCommands()
  }, [loadCommands])

  useEffect(() => {
    let cancelled = false

    const loadPromptTemplates = async () => {
      try {
        const response = await fetch('/api/prompts', {
          headers: buildApiHeaders(),
        })
        if (!response.ok) return
        const payload = await response.json()
        const rows = Array.isArray(payload.prompts) ? payload.prompts as PromptTemplate[] : []
        if (!cancelled) {
          setPromptTemplates(rows)
        }
      } catch {
        if (!cancelled) {
          setPromptTemplates([])
        }
      }
    }

    void loadPromptTemplates()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sharedSession = params.get('session_id') || ''
    if (!sharedSession) return
    if (sessionId && sessionId === sharedSession) return
    void loadSession(sharedSession)
  }, [loadSession, sessionId])

  useEffect(() => {
    if (!observerMode || !sessionId) return

    let refreshTimer: number | null = null
    const onCollabEvent = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer)
      }
      refreshTimer = window.setTimeout(() => {
        void loadSession(sessionId)
        refreshTimer = null
      }, 500)
    }

    window.addEventListener('kodo:collab-event', onCollabEvent as EventListener)
    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer)
      }
      window.removeEventListener('kodo:collab-event', onCollabEvent as EventListener)
    }
  }, [loadSession, observerMode, sessionId])

  const commandCatalog = commands.length > 0 ? commands : FALLBACK_COMMANDS
  const promptSuggestions = useMemo(() => {
    const token = leadingCommandToken(input)
    if (!token.startsWith('/')) return []
    const query = token.slice(1).toLowerCase()
    if (!query) return []

    return promptTemplates
      .filter((template) => template.name.toLowerCase().includes(query))
      .slice(0, 8)
      .map((template) => ({
        name: `/${template.name}`,
        description: `Prompt: ${template.content.split('\n')[0].slice(0, 70)}`,
        source: 'prompt' as const,
        promptName: template.name,
      }))
  }, [input, promptTemplates])

  const commandSuggestions = useMemo<SuggestionItem[]>(() => {
    const base = buildCommandSuggestions(input, commandCatalog).map((item) => ({
      ...item,
      source: 'command' as const,
    }))
    return [...promptSuggestions, ...base].slice(0, 8)
  }, [input, commandCatalog, promptSuggestions])
  const showCommandSuggestions = commandSuggestions.length > 0 && input.trimStart().startsWith('/') && !commandPaletteOpen
  const paletteCommands = useMemo(
    () => filterPaletteCommands(paletteQuery, commands.length > 0 ? commands : KNOWN_ROOT_COMMANDS),
    [paletteQuery, commands],
  )

  useEffect(() => {
    setActiveCommandIndex(0)
  }, [input, showCommandSuggestions])

  useEffect(() => {
    setPaletteIndex(0)
  }, [paletteQuery, commandPaletteOpen])

  useEffect(() => {
    setInput('')
    setIsEditingPrompt(false)
    setPreEditInput('')
    setPendingImage(null)
    setPendingFiles([])
    setAttachmentError('')
    setAttachmentUploading(false)
    setTerminalLines([])
    setShowTerminal(false)
    setTerminalRunning(false)
    setActiveTool(null)
    setThemeMenuOpen(false)
    setAfkRecap(null)
    dragDepthRef.current = 0
    setDragOverlayVisible(false)
    const resetCwd = projectDir || ''
    terminalCwdRef.current = resetCwd
    setTerminalCwd(resetCwd)
    setMessageSearchQuery('')
    setCommandPaletteOpen(false)
    setPaletteQuery('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [sessionId, setMessageSearchQuery])

  useEffect(() => {
    if (!terminalCwdRef.current && projectDir) {
      terminalCwdRef.current = projectDir
      setTerminalCwd(projectDir)
    }
  }, [projectDir])

  useEffect(() => {
    if (terminalCwdRef.current === 'workspace root') {
      const normalized = projectDir || ''
      terminalCwdRef.current = normalized
      setTerminalCwd(normalized)
    }
  }, [projectDir])

  useEffect(() => {
    if (!commandPaletteOpen) return
    requestAnimationFrame(() => {
      paletteInputRef.current?.focus()
    })
  }, [commandPaletteOpen])

  useEffect(() => {
    if (!commandPaletteOpen) return

    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!paletteRef.current) return
      if (paletteRef.current.contains(event.target as Node)) return
      setCommandPaletteOpen(false)
      setPaletteQuery('')
    }

    window.addEventListener('mousedown', onDocumentMouseDown)
    return () => window.removeEventListener('mousedown', onDocumentMouseDown)
  }, [commandPaletteOpen])

  useEffect(() => {
    if (!themeMenuOpen) return

    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!themeMenuRef.current) return
      if (themeMenuRef.current.contains(event.target as Node)) return
      setThemeMenuOpen(false)
    }

    window.addEventListener('mousedown', onDocumentMouseDown)
    return () => window.removeEventListener('mousedown', onDocumentMouseDown)
  }, [themeMenuOpen])

  useEffect(() => {
    if (!isEditingPrompt) return

    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!composerRef.current) return
      if (composerRef.current.contains(event.target as Node)) return

      const restore = preEditInput
      setIsEditingPrompt(false)
      setPreEditInput('')
      setInput(restore)
      requestAnimationFrame(() => {
        if (!textareaRef.current) return
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
      })
    }

    window.addEventListener('mousedown', onDocumentMouseDown)
    return () => window.removeEventListener('mousedown', onDocumentMouseDown)
  }, [isEditingPrompt, preEditInput])

  useEffect(() => {
    const previous = previousMessageSearchRef.current
    if (previous.trim() && !messageSearchQuery.trim()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    previousMessageSearchRef.current = messageSearchQuery
  }, [messageSearchQuery])

  useEffect(() => {
    if (messages.length === 0 && !isLoading) {
      setTerminalLines([])
      setShowTerminal(false)
      setTerminalRunning(false)
    }
  }, [messages.length, isLoading])

  useEffect(() => {
    const onInsertPrompt = (event: Event) => {
      const custom = event as CustomEvent<{ text?: string }>
      const text = String(custom.detail?.text || '').trim()
      if (!text) return
      setInput(text)
      requestAnimationFrame(() => {
        if (!textareaRef.current) return
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
        textareaRef.current.focus()
      })
    }

    const onReplayHighlight = (event: Event) => {
      const custom = event as CustomEvent<{ content?: string }>
      const text = String(custom.detail?.content || '').trim()
      if (!text) return
      setMessageSearchQuery(text.slice(0, 80))
    }

    window.addEventListener('kodo:insert-prompt', onInsertPrompt as EventListener)
    window.addEventListener('kodo:replay-highlight', onReplayHighlight as EventListener)
    return () => {
      window.removeEventListener('kodo:insert-prompt', onInsertPrompt as EventListener)
      window.removeEventListener('kodo:replay-highlight', onReplayHighlight as EventListener)
    }
  }, [setMessageSearchQuery])

  useEffect(() => {
    if (!observerMode) return
    setShowNotebook(false)
    setShowTerminal(false)
    setTerminalRunning(false)
  }, [observerMode])

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      const installEvent = event as any
      installEvent.preventDefault?.()
      setInstallPromptEvent(installEvent)
    }

    const onInstalled = () => {
      setInstallPromptEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const applyCommandSuggestion = async (suggestion: SuggestionItem) => {
    if (suggestion.source === 'prompt' && suggestion.promptName) {
      try {
        const response = await fetch(`/api/prompts/${encodeURIComponent(suggestion.promptName)}/render`, {
          method: 'POST',
          headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ variables: {} }),
        })
        if (response.ok) {
          const payload = await response.json()
          const rendered = String(payload.rendered || '').trim()
          if (rendered) {
            setInput(rendered)
            setActiveCommandIndex(0)
            requestAnimationFrame(() => {
              if (!textareaRef.current) return
              textareaRef.current.style.height = 'auto'
              textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
              textareaRef.current.focus()
              textareaRef.current.selectionStart = textareaRef.current.value.length
              textareaRef.current.selectionEnd = textareaRef.current.value.length
            })
            return
          }
        }
      } catch {
        // Fall through to template content insertion when render API fails.
      }

      const fallback = promptTemplates.find((item) => item.name === suggestion.promptName)
      if (fallback?.content) {
        setInput(fallback.content)
        setActiveCommandIndex(0)
        requestAnimationFrame(() => {
          if (!textareaRef.current) return
          textareaRef.current.style.height = 'auto'
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
          textareaRef.current.focus()
          textareaRef.current.selectionStart = textareaRef.current.value.length
          textareaRef.current.selectionEnd = textareaRef.current.value.length
        })
        return
      }
    }

    const next = `${suggestion.name}${suggestion.name.includes('<') ? '' : ' '}`
    setInput(next)
    setActiveCommandIndex(0)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
      textareaRef.current.selectionEnd = textareaRef.current.value.length
    })
  }

  const applyPaletteCommand = (name: string) => {
    const next = `${name}${name.includes('<') ? '' : ' '}`
    setInput(next)
    setCommandPaletteOpen(false)
    setPaletteQuery('')
    setPaletteIndex(0)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
      textareaRef.current.selectionEnd = textareaRef.current.value.length
    })
  }

  const attachmentTotalBytes = useMemo(
    () => pendingFiles.reduce((total, file) => total + file.size, 0) + (pendingImage?.size || 0),
    [pendingFiles, pendingImage],
  )

  const uploadZipAttachment = useCallback(async (file: FileAttachment, cwd: string) => {
    const form = new FormData()
    const bytes = decodeBase64ToBytes(file.data)
    const arrayBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(arrayBuffer).set(bytes)
    const blob = new Blob([arrayBuffer], { type: file.type || 'application/zip' })
    form.append('file', blob, file.name)
    form.append('project_dir', cwd)

    const response = await fetch('/api/chat/upload-zip', {
      method: 'POST',
      headers: buildApiHeaders(),
      body: form,
    })
    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }
    return response.json() as Promise<{ extracted?: string[] }>
  }, [])

  const getSendStreamHandlers = useCallback(() => ({
    onToolStart: (event: Record<string, unknown>) => {
      const tool = String(event.tool || '').trim()
      setActiveTool(tool || null)
    },
    onToolOutput: (line: string) => {
      setTerminalLines((prev) => [...prev, line])
      setTerminalRunning(true)
    },
    onToolResult: (event: Record<string, unknown>) => {
      setActiveTool(null)
      const toolName = String(event.tool || '').toLowerCase()
      if (toolName === 'bash' || toolName === 'powershell' || toolName === 'repl') {
        setTerminalRunning(false)
      }
    },
    onDone: () => {
      setActiveTool(null)
    },
    onError: () => {
      setActiveTool(null)
    },
  }), [])

  const focusComposerWithText = useCallback((value: string, shouldFocus = true) => {
    const next = String(value || '')
    setInput(next)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
      if (shouldFocus) {
        textareaRef.current.focus()
        textareaRef.current.selectionStart = textareaRef.current.value.length
        textareaRef.current.selectionEnd = textareaRef.current.value.length
      }
    })
  }, [])

  const cancelPromptEdit = useCallback((focusComposer = true) => {
    if (!isEditingPrompt) return
    const restore = preEditInput
    setIsEditingPrompt(false)
    setPreEditInput('')
    focusComposerWithText(restore, focusComposer)
  }, [focusComposerWithText, isEditingPrompt, preEditInput])

  const handleEditUserPrompt = useCallback((content: string) => {
    const text = String(content || '')
    if (!text.trim()) return
    if (!isEditingPrompt) {
      setPreEditInput(input)
    }
    setIsEditingPrompt(true)
    focusComposerWithText(text)
  }, [focusComposerWithText, input, isEditingPrompt])

  const handleRetryUserPrompt = useCallback((content: string) => {
    if (observerMode || isLoading || attachmentUploading) return
    const text = String(content || '').trim()
    if (!text) return
    sendMessage(text, undefined, [], getSendStreamHandlers())
  }, [attachmentUploading, getSendStreamHandlers, isLoading, observerMode, sendMessage])

  const CONFERENCE_COLORS: Record<string, string> = {
    openai: '#10a37f', gemini: '#4285f4', groq: '#f55036',
    deepseek: '#0066cc', ollama: '#9333ea', openrouter: '#7c3aed',
    'atomic-chat': '#0ea5e9', 'github-models': '#24292f', codex: '#3b82f6',
  }

  const runConference = useCallback(async (prompt: string) => {
    if (conferenceSlots.length < 2) return
    let activeSessionId = sessionId
    if (!activeSessionId) {
      const sessionRes = await fetch('/api/chat/new-session', {
        method: 'POST',
        headers: buildApiHeaders(),
      })
      if (!sessionRes.ok) throw new Error(await parseApiError(sessionRes))
      const sessionPayload = await sessionRes.json()
      activeSessionId = String(sessionPayload.session_id || '').trim()
      if (activeSessionId) {
        setSessionId(activeSessionId)
      }
    }

    const initialResults: ConferenceResult[] = conferenceSlots.map((slot, i) => ({
      participantId: i,
      name: slot.model ? `${slot.provider}/${slot.model.split(':')[0]}` : slot.provider,
      provider: slot.provider,
      color: CONFERENCE_COLORS[slot.provider] || '#888',
      text: '',
      done: false,
      error: null,
      started: false,
    }))

    setConferenceThread({
      prompt,
      mode: conferenceRunMode,
      results: initialResults,
      debateTurns: [],
      synthesis: '',
      synthesisStarted: false,
      synthesisDone: false,
      running: true,
    })

    const ctrl = new AbortController()
    conferenceAbortRef.current = ctrl

    try {
      const body = {
        prompt,
        session_id: activeSessionId || undefined,
        participants: conferenceSlots.map((slot, i) => ({
          provider: slot.provider,
          model: slot.model || undefined,
          name: initialResults[i].name,
        })),
        mode: conferenceRunMode,
        synthesize: true,
        debate_rounds: 2,
        max_tokens: 2048,
      }

      const res = await fetch('/api/conference/debate', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      if (!res.ok) throw new Error(`Conference failed: ${res.status}`)
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')

      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let ev: Record<string, unknown>
          try { ev = JSON.parse(line.slice(6)) } catch { continue }

          const type = ev.type as string
          const pid = ev.participant_id as number

          setConferenceThread((prev) => {
            if (!prev) return prev
            const results = [...prev.results]

            if (type === 'participant_start' && pid >= 0 && pid < results.length) {
              results[pid] = { ...results[pid], started: true }
              return { ...prev, results }
            }
            if (type === 'participant_text' && pid >= 0 && pid < results.length) {
              results[pid] = { ...results[pid], text: results[pid].text + (ev.content as string || '') }
              return { ...prev, results }
            }
            if (type === 'participant_done' && pid >= 0 && pid < results.length) {
              results[pid] = { ...results[pid], done: true }
              return { ...prev, results }
            }
            if (type === 'conference_error') {
              if (pid >= 0 && pid < results.length) {
                results[pid] = { ...results[pid], done: true, error: ev.message as string }
                return { ...prev, results }
              }
            }
            if (type === 'debate_turn_start') {
              const round = Number(ev.round || 1)
              const name = String(ev.name || results[pid]?.name || `round-${round}`)
              const provider = String(ev.provider || results[pid]?.provider || '')
              const turn: ConferenceResult = {
                participantId: prev.debateTurns?.length || 0,
                name: `R${round} ${name}`,
                provider,
                color: CONFERENCE_COLORS[provider] || '#888',
                text: '',
                done: false,
                error: null,
                started: true,
              }
              return { ...prev, debateTurns: [...(prev.debateTurns || []), turn] }
            }
            if (type === 'debate_turn_text') {
              const turns = [...(prev.debateTurns || [])]
              if (turns.length > 0) {
                const idx = turns.length - 1
                turns[idx] = { ...turns[idx], text: turns[idx].text + (ev.content as string || '') }
              }
              return { ...prev, debateTurns: turns }
            }
            if (type === 'debate_turn_done') {
              const turns = [...(prev.debateTurns || [])]
              if (turns.length > 0) {
                const idx = turns.length - 1
                turns[idx] = { ...turns[idx], done: true }
              }
              return { ...prev, debateTurns: turns }
            }
            if (type === 'synthesis_start') {
              return { ...prev, synthesisStarted: true }
            }
            if (type === 'synthesis_text') {
              return { ...prev, synthesis: prev.synthesis + (ev.content as string || '') }
            }
            if (type === 'conference_done') {
              void loadSessions()
              void loadUsage()
              return { ...prev, synthesisDone: true, running: false }
            }
            return prev
          })
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setConferenceThread((prev) => prev ? { ...prev, running: false } : prev)
      }
    }
  }, [conferenceRunMode, conferenceSlots, loadSessions, loadUsage, sessionId, setSessionId])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (msg === '/stop') {
      stopGeneration()
      setInput('')
      return
    }
    if (observerMode) return
    if ((!msg && !pendingImage && pendingFiles.length === 0) || isLoading || attachmentUploading) return

    // Smart Prompt Variables: intercept if {{variable}} placeholders detected
    if (msg) {
      const vars = extractVariables(msg)
      if (vars.length > 0) {
        setVarModalPrompt(msg)
        setVarModalVars(vars)
        return
      }
    }

    // Conference mode: route to multi-model debate
    if (conferenceMode && msg && conferenceSlots.length >= 2) {
      setInput('')
      setConferenceThread(null)
      setTimeout(() => void runConference(msg), 50)
      return
    }

    // Apply response depth + project brief
    const withDepth = msg ? applyDepth(msg, depthMode) : msg
    const finalMsg = withDepth ? applyProjectBrief(withDepth) : withDepth

    const imagePayload = pendingImage
      ? {
          data: pendingImage.data,
          media_type: pendingImage.media_type,
        }
      : undefined

    const attachmentBlocks: Array<Record<string, unknown>> = []
    setAttachmentError('')
    setAttachmentUploading(true)

    try {
      for (const file of pendingFiles) {
        if (file.isImage) {
          attachmentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.type || 'image/png',
              data: file.data,
            },
          })
          continue
        }

        if (file.isZip) {
          if (!projectDir.trim()) {
            setAttachmentError('Set project directory before sending .zip attachments')
            return
          }

          const payload = await uploadZipAttachment(file, projectDir.trim())
          const extractedCount = Array.isArray(payload.extracted) ? payload.extracted.length : 0
          attachmentBlocks.push({
            type: 'text',
            text: `[Uploaded zip: ${file.name}] extracted ${extractedCount} file(s) into ${projectDir.trim()}`,
          })
          continue
        }

        const decoded = decodeBase64ToText(file.data)
        attachmentBlocks.push({
          type: 'text',
          text: `[Attached: ${file.name}]\n\`\`\`\n${decoded}\n\`\`\``,
        })
      }

      setInput('')
      setIsEditingPrompt(false)
      setPreEditInput('')
      setPendingImage(null)
      setPendingFiles([])
      if (textareaRef.current) textareaRef.current.style.height = 'auto'

      // Save to prompt history (deduplicate, max 100)
      if (msg) {
        promptHistoryRef.current = [msg, ...promptHistoryRef.current.filter((h) => h !== msg)].slice(0, 100)
        historyIndexRef.current = -1
        draftBeforeHistoryRef.current = ''
      }

      // Force scroll to bottom whenever user sends a message
      shouldAutoScrollRef.current = true
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

      sendMessage(finalMsg, imagePayload, attachmentBlocks, getSendStreamHandlers())
    } catch (error) {
      setAttachmentError(String(error))
    } finally {
      setAttachmentUploading(false)
    }
  }, [attachmentUploading, conferenceMode, conferenceSlots, depthMode, getSendStreamHandlers, input, isLoading, observerMode, pendingFiles, pendingImage, projectDir, runConference, sendMessage, stopGeneration, uploadZipAttachment])

  const runTerminalCommand = useCallback(async (command: string): Promise<{ cwd?: string }> => {
    const trimmed = command.trim()
    const activeCwd = (terminalCwdRef.current || projectDir || '').trim()
    const requestCwd = activeCwd === 'workspace root' ? '' : activeCwd

    if (observerMode) {
      setTerminalLines((prev) => [...prev, '[terminal] observer mode is read-only'])
      return { cwd: requestCwd }
    }

    if (!trimmed) {
      return { cwd: requestCwd }
    }

    if (terminalRunning || isLoading) {
      setTerminalLines((prev) => [...prev, '[terminal] command already running, wait for completion'])
      return { cwd: requestCwd }
    }

    setShowTerminal(true)
    setTerminalRunning(true)
    setTerminalLines((prev) => [...prev, `> ${trimmed}`])

    let nextCwd = requestCwd

    const handleStreamEvent = (event: Record<string, unknown>) => {
      const type = String(event.type || '').toLowerCase()
      if (type === 'start') {
        const startedCwd = String(event.cwd || '').trim()
        if (startedCwd) nextCwd = startedCwd
        return
      }

      if (type === 'line') {
        const line = String(event.line || '')
        if (line) {
          setTerminalLines((prev) => [...prev, line])
        }
        return
      }

      if (type === 'done') {
        const doneCwd = String(event.cwd_after || '').trim()
        if (doneCwd) nextCwd = doneCwd

        if (event.success === false) {
          const errorText = String(event.error || '').trim()
          if (errorText) {
            setTerminalLines((prev) => [...prev, `[error] ${errorText}`])
          }
        }
      }
    }

    try {
      const response = await fetch('/api/chat/terminal/run', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          command: trimmed,
          cwd: requestCwd || undefined,
          timeout: 30,
        }),
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      if (!response.body) {
        throw new Error('Terminal stream unavailable')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const processSseLine = (line: string) => {
        if (!line.startsWith('data:')) return
        const raw = line.slice(5).trim()
        if (!raw) return
        try {
          handleStreamEvent(JSON.parse(raw) as Record<string, unknown>)
        } catch {
          // Ignore malformed stream events.
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          processSseLine(line.trimEnd())
        }
      }

      const tail = buffer.trim()
      if (tail) {
        processSseLine(tail)
      }
    } catch (error) {
      setTerminalLines((prev) => [...prev, `[error] ${String(error)}`])
    } finally {
      setTerminalRunning(false)
    }

    terminalCwdRef.current = nextCwd
    setTerminalCwd(nextCwd)
    return { cwd: nextCwd }
  }, [isLoading, observerMode, projectDir, terminalRunning])

  const fetchSessionRecap = useCallback(async (manual = false) => {
    if (!sessionId) return
    if (recapLoading) return

    setRecapLoading(true)
    try {
      const response = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/recap`, {
        headers: buildApiHeaders(),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      const payload = await response.json() as SessionRecap
      const awaySeconds = Number(payload.away_seconds || 0)
      if (manual || awaySeconds >= 300) {
        setAfkRecap(payload)
      }
    } catch {
      if (manual) {
        setAfkRecap({
          session_id: sessionId,
          away_seconds: 0,
          away_label: 'just now',
          summary: 'Recap is unavailable right now.',
          highlights: [],
        })
      }
    } finally {
      setRecapLoading(false)
    }
  }, [recapLoading, sessionId])

  useEffect(() => {
    if (!sessionId) return

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchSessionRecap(false)
      }
    }

    const handleFocus = () => {
      void fetchSessionRecap(false)
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchSessionRecap, sessionId])

  const terminalActive = showTerminal

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const isMeta = event.ctrlKey || event.metaKey
      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false)
          setPaletteQuery('')
          return
        }

        const textareaFocused = document.activeElement === textareaRef.current
        if (!textareaFocused) {
          textareaRef.current?.focus()
          return
        }

        if (!input.trim()) {
          setCommandPaletteOpen(true)
          setPaletteQuery('')
          setPaletteIndex(0)
        }
        return
      }
      if (isMeta && event.key === 'Enter' && !commandPaletteOpen) {
        event.preventDefault()
        if (observerMode) return
        void handleSend()
        return
      }

      // Ctrl/Cmd+L - Clear messages
      if (isMeta && event.key.toLowerCase() === 'l' && !observerMode) {
        event.preventDefault()
        if (window.confirm('Clear all messages in this session?')) {
          clearMessages()
        }
        return
      }

      // Ctrl/Cmd+S - Save checkpoint
      if (isMeta && event.key.toLowerCase() === 's' && !event.shiftKey && !observerMode) {
        event.preventDefault()
        void createCheckpoint(undefined, sessionId)
        return
      }

      // Ctrl/Cmd+Z - Restore latest checkpoint
      if (
        isMeta
        && event.key.toLowerCase() === 'z'
        && !event.shiftKey
        && document.activeElement !== textareaRef.current
        && !observerMode
      ) {
        event.preventDefault()
        const latest = checkpoints[0]
        if (latest && window.confirm(`Restore checkpoint "${latest.label || latest.checkpoint_id.slice(0, 8)}"?`)) {
          void restoreCheckpoint(latest.checkpoint_id, sessionId)
        }
        return
      }

      // Ctrl/Cmd+T - Toggle terminal
      if (isMeta && event.key.toLowerCase() === 't') {
        event.preventDefault()
        setShowTerminal((prev) => !prev)
        return
      }

      // Ctrl/Cmd+N - New session
      if (isMeta && event.key.toLowerCase() === 'n' && !observerMode) {
        event.preventDefault()
        void newSession()
        return
      }

      // Ctrl/Cmd+B - Toggle sidebar
      if (isMeta && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('kodo:toggle-sidebar'))
        return
      }

      // Ctrl/Cmd+Shift+K - Open action palette
      if (isMeta && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setActionPaletteOpen((prev) => !prev)
        return
      }

      // Ctrl/Cmd+Shift+F - Toggle focus mode
      if (isMeta && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setIsFocusMode((prev) => !prev)
        return
      }

      // Ctrl/Cmd+Shift+E - Export conversation
      if (isMeta && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        exportConversationAsMarkdown(messages, sessionId)
        return
      }

      if (event.key === 'Escape' && commandPaletteOpen) {
        event.preventDefault()
        setCommandPaletteOpen(false)
        setPaletteQuery('')
        return
      }
      if (event.key === '?' && !commandPaletteOpen) {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          return
        }
        event.preventDefault()
        setShowShortcuts((prev) => !prev)
        return
      }
      if (event.key === 'Escape' && isLoading) {
        event.preventDefault()
        stopGeneration()
      }
      if (event.key === 'Escape' && showShortcuts) {
        event.preventDefault()
        setShowShortcuts(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    checkpoints,
    clearMessages,
    commandPaletteOpen,
    createCheckpoint,
    handleSend,
    input,
    isLoading,
    messages,
    newSession,
    observerMode,
    restoreCheckpoint,
    sessionId,
    setShowTerminal,
    showShortcuts,
    stopGeneration,
  ])

  const handleMessagesScroll = () => {
    const container = messageListRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom < 80
  }

  const clearVoiceSilenceTimeout = useCallback(() => {
    if (voiceSilenceTimeoutRef.current !== null) {
      window.clearTimeout(voiceSilenceTimeoutRef.current)
      voiceSilenceTimeoutRef.current = null
    }
  }, [])

  const stopVoiceInput = useCallback(() => {
    voiceShouldListenRef.current = false
    clearVoiceSilenceTimeout()

    const activeRecognition = speechRecognitionRef.current
    speechRecognitionRef.current = null
    if (activeRecognition) {
      try {
        activeRecognition.stop()
      } catch {
        // Ignore stop errors from stale recognition instances.
      }
    }

    setVoiceListening(false)
  }, [clearVoiceSilenceTimeout])

  useEffect(() => {
    return () => {
      stopVoiceInput()
    }
  }, [stopVoiceInput])

  const startVoiceInput = useCallback(() => {
    if (observerMode) return

    if (voiceListening) {
      stopVoiceInput()
      return
    }

    const recognitionCtor = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition
      || (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).webkitSpeechRecognition

    if (!recognitionCtor) {
      window.alert('Voice input not supported in this browser.')
      return
    }

    const mergeVoiceText = (base: string, addition: string) => {
      const left = base.trimEnd()
      const right = addition.trim()
      if (!right) return left
      if (!left) return right
      return `${left} ${right}`
    }

    stopVoiceInput()
    voiceSessionRef.current += 1
    const sessionId = voiceSessionRef.current
    voiceShouldListenRef.current = true
    voiceBaseInputRef.current = input
    voiceCommittedTranscriptRef.current = ''

    const updateComposerHeight = () => {
      requestAnimationFrame(() => {
        if (!textareaRef.current) return
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
      })
    }

    const updateTranscriptInput = (currentTranscript: string) => {
      const combinedTranscript = mergeVoiceText(
        mergeVoiceText(voiceBaseInputRef.current, voiceCommittedTranscriptRef.current),
        currentTranscript,
      )
      setInput(combinedTranscript)
      updateComposerHeight()
    }

    const scheduleSilenceStop = () => {
      clearVoiceSilenceTimeout()
      voiceSilenceTimeoutRef.current = window.setTimeout(() => {
        if (!voiceShouldListenRef.current || voiceSessionRef.current !== sessionId) return
        stopVoiceInput()
      }, VOICE_SILENCE_STOP_MS)
    }

    const startRecognitionInstance = () => {
      if (!voiceShouldListenRef.current || voiceSessionRef.current !== sessionId) return

      const recognition = new recognitionCtor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      let latestInstanceTranscript = ''

      recognition.onstart = () => {
        if (voiceSessionRef.current !== sessionId) return
        setVoiceListening(true)
        scheduleSilenceStop()
      }

      recognition.onresult = (event: any) => {
        if (voiceSessionRef.current !== sessionId) return
        latestInstanceTranscript = Array.from(event.results || [])
          .map((item: any) => item?.[0]?.transcript || '')
          .join('')
        updateTranscriptInput(latestInstanceTranscript)
        scheduleSilenceStop()
      }

      recognition.onend = () => {
        if (voiceSessionRef.current !== sessionId) return

        if (latestInstanceTranscript.trim()) {
          voiceCommittedTranscriptRef.current = mergeVoiceText(
            voiceCommittedTranscriptRef.current,
            latestInstanceTranscript,
          )
        }

        if (!voiceShouldListenRef.current) {
          clearVoiceSilenceTimeout()
          setVoiceListening(false)
          return
        }

        window.setTimeout(() => {
          if (!voiceShouldListenRef.current || voiceSessionRef.current !== sessionId) return
          startRecognitionInstance()
        }, VOICE_RESTART_DELAY_MS)
      }

      recognition.onerror = () => {
        if (voiceSessionRef.current !== sessionId) return
        stopVoiceInput()
      }

      speechRecognitionRef.current = recognition
      recognition.start()
    }

    startRecognitionInstance()
  }, [clearVoiceSilenceTimeout, input, observerMode, setInput, stopVoiceInput, voiceListening])

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
      if (selected) {
        void applyCommandSuggestion(selected)
      }
      return
    }

    // Prompt history navigation: Up/Down when at single-line with no command suggestions
    if (!showCommandSuggestions && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const ta = e.currentTarget
      const atTop = ta.selectionStart === 0 || !ta.value.includes('\n')
      const atBottom = ta.selectionEnd === ta.value.length || !ta.value.includes('\n')
      const history = promptHistoryRef.current
      if (history.length === 0) return

      if (e.key === 'ArrowUp' && atTop) {
        e.preventDefault()
        if (historyIndexRef.current === -1) draftBeforeHistoryRef.current = input
        const nextIdx = Math.min(historyIndexRef.current + 1, history.length - 1)
        historyIndexRef.current = nextIdx
        setInput(history[nextIdx])
        return
      }
      if (e.key === 'ArrowDown' && atBottom && historyIndexRef.current >= 0) {
        e.preventDefault()
        const nextIdx = historyIndexRef.current - 1
        historyIndexRef.current = nextIdx
        setInput(nextIdx < 0 ? draftBeforeHistoryRef.current : history[nextIdx])
        return
      }
    }

    // Tab smart autocomplete — complete common prompt starters
    if (e.key === 'Tab' && !showCommandSuggestions && input.trim()) {
      const suggestion = getTabSuggestion(input)
      if (suggestion) {
        e.preventDefault()
        setInput(suggestion)
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = suggestion.length
          }
        })
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (observerMode) return
      void handleSend()
    }
  }

  const handlePaletteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (paletteCommands.length === 0) return
      setPaletteIndex((prev) => (prev + 1) % paletteCommands.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (paletteCommands.length === 0) return
      setPaletteIndex((prev) => (prev - 1 + paletteCommands.length) % paletteCommands.length)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const selected = paletteCommands[paletteIndex]
      if (selected) {
        applyPaletteCommand(selected.name)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setCommandPaletteOpen(false)
      setPaletteQuery('')
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const processPickedFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    const incomingBytes = files.reduce((total, file) => total + file.size, 0)
    if (attachmentTotalBytes + incomingBytes > MAX_ATTACHMENT_BYTES) {
      setAttachmentError('Total attachment size exceeds 10MB limit')
      return
    }

    let nextPrimaryImage = pendingImage
    const collected: FileAttachment[] = []

    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file)
        if (!dataUrl.startsWith('data:')) continue
        const [header, data] = dataUrl.split(',', 2)
        if (!header || !data) continue

        const browserMediaType = header.replace('data:', '').replace(';base64', '') || file.type || 'application/octet-stream'
        const sniffed = sniffImageMimeType(data)
        const mediaType = sniffed || browserMediaType
        const lowerName = file.name.toLowerCase()
        const isImage = mediaType.startsWith('image/')
        const isZip = lowerName.endsWith('.zip')

        if (isImage && !nextPrimaryImage) {
          nextPrimaryImage = {
            previewUrl: dataUrl,
            data,
            media_type: mediaType,
            name: file.name,
            size: file.size,
          }
          continue
        }

        collected.push({
          name: file.name,
          size: file.size,
          type: mediaType,
          data,
          isImage,
          isZip,
          previewUrl: isImage ? dataUrl : undefined,
        })
      }

      setPendingImage(nextPrimaryImage)
      setPendingFiles((prev) => [...prev, ...collected])
      setAttachmentError('')
    } catch {
      setAttachmentError('Failed to read one or more attachments')
    }
  }, [attachmentTotalBytes, pendingImage])

  const handleClipboardPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const fileItems: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          const name = file.name && file.name !== 'image.png'
            ? file.name
            : `screenshot-${Date.now()}.png`
          fileItems.push(new File([file], name, { type: file.type }))
        }
      }
    }
    if (fileItems.length > 0) {
      e.preventDefault()
      void processPickedFiles(fileItems)
    }
  }, [processPickedFiles])

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await processPickedFiles(files)

    e.target.value = ''
  }

  const handleThemeSelect = (nextTheme: ThemeKey) => {
    setTheme(nextTheme)
    setThemeMenuOpen(false)
  }

  const hasFilePayload = (event: React.DragEvent<HTMLElement>) => {
    return Array.from(event.dataTransfer?.types || []).includes('Files')
  }

  const handleChatDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (observerMode || !hasFilePayload(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    setDragOverlayVisible(true)
  }

  const handleChatDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (observerMode || !hasFilePayload(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    if (!dragOverlayVisible) {
      setDragOverlayVisible(true)
    }
  }

  const handleChatDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (observerMode) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setDragOverlayVisible(false)
    }
  }

  const handleChatDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (observerMode) return
    event.preventDefault()
    event.stopPropagation()
    const files = Array.from(event.dataTransfer.files || [])
    dragDepthRef.current = 0
    setDragOverlayVisible(false)
    void processPickedFiles(files)
  }

  const handlePermissionDecision = async (approve: boolean, remember: boolean) => {
    if (!activePermission || permissionSubmitting) return
    setPermissionSubmitting(true)
    await respondPermission(activePermission.challenge_id, approve, remember, sessionId)
    setPermissionSubmitting(false)
  }

  const pickProjectDirectory = useCallback(async () => {
    if (projectDirPicking) return
    setProjectDirPickerError('')
    setProjectDirPicking(true)
    try {
      const response = await fetch('/api/chat/project-dir/select', {
        method: 'POST',
        headers: buildApiHeaders(),
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      const payload = await response.json() as { project_dir?: string | null }
      const selected = typeof payload.project_dir === 'string' ? payload.project_dir.trim() : ''
      if (selected) {
        setProjectDir(selected)
        setShowProjectInput(false)
      }
    } catch (error) {
      setProjectDirPickerError(String(error))
      setShowProjectInput(true)
    } finally {
      setProjectDirPicking(false)
    }
  }, [projectDirPicking, setProjectDir])

  const isFreshChat = messages.length === 0 && !sessionId
  const isEmpty = messages.length === 0 && !input.trim() && isFreshChat
  const isMessageFilteringActive = messageSearchQuery.trim().length > 0

  const contextTokens = useMemo(() => {
    const messageTokens = messages.reduce((total, message) => total + approximateTokens(message.content), 0)
    return messageTokens
  }, [messages])
  const contextPercent = Math.min(100, Math.round((contextTokens / CONTEXT_TOKEN_BUDGET) * 100))
  const totalCacheReadTokens = useMemo(
    () => messages.reduce((total, message) => total + (message.usage?.input_cache_read_tokens || 0), 0),
    [messages],
  )
  const latestUsageModel = useMemo(() => {
    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      const model = messages[idx].usage?.model
      if (typeof model === 'string' && model.trim()) {
        return model
      }
    }
    return ''
  }, [messages])
  const showCacheSavings = totalCacheReadTokens > 0 && latestUsageModel.toLowerCase().includes('claude')
  const estimatedCacheSavings = (totalCacheReadTokens * (3.0 * 0.9)) / 1_000_000

  const modes = availableModes.length > 0
    ? availableModes
    : [
      { key: 'execute', title: 'Execute', summary: 'Balanced autonomous execution.', is_default: true },
      { key: 'plan', title: 'Plan', summary: 'Plan-first execution.', is_default: false },
      { key: 'debug', title: 'Debug', summary: 'Hypothesis-driven debugging.', is_default: false },
      { key: 'review', title: 'Review', summary: 'Risk-focused code review.', is_default: false },
      { key: 'coordinator', title: 'Coordinator', summary: 'Milestone-driven orchestration.', is_default: false },
      { key: 'bughunter', title: 'Bug Hunter', summary: 'Deep bug-hunting with validation.', is_default: false },
      { key: 'ultraplan', title: 'Ultra Plan', summary: 'High-fidelity implementation planning.', is_default: false },
    ]
  const activeMode = useMemo(() => {
    const normalized = (sessionMode || '').trim().toLowerCase()
    const fromState = modes.find((mode) => mode.key.toLowerCase() === normalized)
    if (fromState) return fromState
    return modes.find((mode) => mode.is_default) || modes[0]
  }, [modes, sessionMode])
  const totalAttachmentCount = pendingFiles.length + (pendingImage ? 1 : 0)
  const hiddenAttachmentCount = Math.max(0, totalAttachmentCount - MAX_VISIBLE_ATTACHMENT_CHIPS)
  const hasProjectDir = projectDir.trim().length > 0
  const activeTheme = useMemo(
    () => THEME_OPTIONS.find((option) => option.key === theme) || THEME_OPTIONS[0],
    [theme],
  )
  // Page up/down scroll button style
  const navScrollBtn: React.CSSProperties = {
    width: 32, height: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-2)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  }

  const selectedHeaderButtonStyle = {
    background: 'var(--accent-dim)',
    borderColor: 'var(--accent)',
    color: 'var(--text-0)',
    boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
  } as const

  const applyHeaderHover = (
    event: ReactMouseEvent<HTMLElement>,
    {
      active = false,
      activeBorder = 'var(--accent)',
      activeColor = 'var(--text-0)',
      activeShadow = 'inset 0 0 0 1px var(--accent-glow)',
      disabled = false,
    }: HeaderHoverOptions = {},
  ) => {
    if (disabled) return
    const target = event.currentTarget as HTMLElement
    target.style.borderColor = active ? activeBorder : 'var(--border-bright)'
    target.style.color = active ? activeColor : 'var(--text-0)'
    target.style.transform = 'translateY(-1px)'
    target.style.boxShadow = active ? activeShadow : '0 4px 12px rgba(0, 0, 0, 0.18)'
  }

  const resetHeaderHover = (
    event: ReactMouseEvent<HTMLElement>,
    {
      active = false,
      activeBorder = 'var(--accent)',
      activeColor = 'var(--text-0)',
      activeShadow = 'inset 0 0 0 1px var(--accent-glow)',
      defaultColor = 'var(--text-2)',
      disabled = false,
    }: HeaderHoverOptions = {},
  ) => {
    if (disabled) return
    const target = event.currentTarget as HTMLElement
    target.style.borderColor = active ? activeBorder : 'var(--border)'
    target.style.color = active ? activeColor : defaultColor
    target.style.transform = 'translateY(0)'
    target.style.boxShadow = active ? activeShadow : 'none'
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-0)',
        position: isFocusMode ? 'fixed' : 'relative',
        inset: isFocusMode ? 0 : undefined,
        zIndex: isFocusMode ? 9990 : undefined,
      }}
      onDragEnter={handleChatDragEnter}
      onDragOver={handleChatDragOver}
      onDragLeave={handleChatDragLeave}
      onDrop={handleChatDrop}
    >
      {/* Header — collapsible */}
      <div style={{
        padding: headerCollapsed ? '6px 16px' : '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-1)',
        gap: 10,
        flexWrap: headerCollapsed ? 'nowrap' : 'wrap',
        flexShrink: 0,
        transition: 'padding 0.2s ease',
        overflow: headerCollapsed ? 'hidden' : 'visible',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={14} color="var(--accent)" />
          <span style={{ fontSize: 12, color: 'var(--text-1)', letterSpacing: '0.05em' }}>
            {isLoading ? (
              <span style={{ color: 'var(--yellow)' }}>● RUNNING</span>
            ) : (
              <span style={{ color: 'var(--green)' }}>● READY</span>
            )}
          </span>
          {/* Search toggle */}
          <button
            type="button"
            onClick={() => setSearchVisible((v) => !v)}
            title="Toggle message search"
            style={{
              background: searchVisible ? 'var(--bg-3)' : 'none',
              border: `1px solid ${searchVisible ? 'var(--border-bright)' : 'var(--border)'}`,
              color: searchVisible ? 'var(--text-0)' : 'var(--text-2)',
              borderRadius: 6, padding: '3px 7px', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Search size={11} />
          </button>
        </div>

        {/* All other header buttons — wrap so full names always show */}
        <div className="kodo-header-buttons" style={{
          display: headerCollapsed ? 'none' : 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flex: 1,
        }}>

        <button
          onClick={() => {
            void pickProjectDirectory()
          }}
          title={hasProjectDir ? projectDir : 'Select project directory'}
          style={{
            background: hasProjectDir ? 'var(--accent-dim)' : 'none',
            border: hasProjectDir ? '1px solid var(--accent)' : '1px solid var(--border)',
            color: hasProjectDir ? 'var(--text-0)' : 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s',
            maxWidth: 320,
            transform: 'translateY(0)',
            outline: 'none',
            boxShadow: hasProjectDir ? 'inset 0 0 0 1px var(--accent-glow)' : 'none',
          }}
          onMouseEnter={e => {
            applyHeaderHover(e, {
              active: hasProjectDir,
            })
          }}
          onMouseLeave={e => {
            resetHeaderHover(e, {
              active: hasProjectDir,
            })
          }}
        >
          <FolderOpen size={12} />
          {projectDirPicking ? 'OPENING...' : (
            hasProjectDir
              ? <span className="truncate" style={{ maxWidth: 250 }}>{projectDir}</span>
              : 'SET PROJECT DIR'
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowProjectInput((prev) => !prev)}
          title="Manually set project path"
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
            transform: 'translateY(0)',
            outline: 'none',
            ...(showProjectInput ? selectedHeaderButtonStyle : {}),
          }}
          onMouseEnter={(e) => applyHeaderHover(e, { active: showProjectInput })}
          onMouseLeave={(e) => resetHeaderHover(e, { active: showProjectInput })}
        >
          PATH
        </button>

        <select
          value={activeMode?.key || 'execute'}
          onChange={(e) => {
            void setSessionMode(e.target.value, sessionId)
          }}
          title={`Session mode: ${activeMode?.title || 'Execute'} - ${activeMode?.summary || ''}`}
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-0)',
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

        {/* Multi-Model Conference toggle */}
        <button
          type="button"
          onClick={() => {
            setConferenceMode((v) => !v)
            setConferenceThread(null)
          }}
          title={conferenceMode ? 'Exit Multi-Model mode' : 'Multi-Model Conference — debate across models'}
          style={{
            background: conferenceMode ? 'var(--accent-dim)' : 'none',
            border: `1px solid ${conferenceMode ? 'var(--accent)' : 'var(--border)'}`,
            color: conferenceMode ? 'var(--accent)' : 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s',
          }}
        >
          <GitCompare size={11} />
          MULTI-MODEL
        </button>

        <button
          type="button"
          onClick={() => {
            void runDream()
          }}
          title="Generate a bold next-iteration concept"
          disabled={observerMode || isLoading}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: observerMode || isLoading ? 'not-allowed' : 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            transition: 'all 0.15s',
            transform: 'translateY(0)',
            outline: 'none',
            opacity: observerMode || isLoading ? 0.6 : 1,
          }}
          onMouseEnter={(e) => applyHeaderHover(e, { disabled: observerMode || isLoading })}
          onMouseLeave={(e) => resetHeaderHover(e, { disabled: observerMode || isLoading })}
        >
          DREAM
        </button>

        <button
          type="button"
          onClick={() => {
            void fetchSessionRecap(true)
          }}
          title="Show recap for current session"
          disabled={!sessionId || recapLoading}
          style={{
            background: afkRecap ? 'var(--accent-dim)' : 'none',
            border: `1px solid ${afkRecap ? 'var(--accent)' : 'var(--border)'}`,
            color: afkRecap ? 'var(--text-0)' : 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: !sessionId || recapLoading ? 'not-allowed' : 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            transition: 'all 0.15s',
            transform: 'translateY(0)',
            outline: 'none',
            opacity: !sessionId || recapLoading ? 0.6 : 1,
          }}
          onMouseEnter={(e) => applyHeaderHover(e, { active: Boolean(afkRecap), disabled: !sessionId || recapLoading })}
          onMouseLeave={(e) => resetHeaderHover(e, { active: Boolean(afkRecap), disabled: !sessionId || recapLoading })}
        >
          {recapLoading ? 'RECAP...' : 'RECAP'}
        </button>

        <button
          type="button"
          onClick={() => setShowNotebook((prev) => !prev)}
          title={showNotebook ? 'Hide notebook' : 'Show notebook'}
          disabled={observerMode}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: observerMode ? 'not-allowed' : 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: observerMode ? 0.6 : 1,
            transition: 'all 0.15s',
            transform: 'translateY(0)',
            outline: 'none',
            ...(showNotebook ? selectedHeaderButtonStyle : {}),
          }}
          onMouseEnter={(e) => applyHeaderHover(e, { active: showNotebook, disabled: observerMode })}
          onMouseLeave={(e) => resetHeaderHover(e, { active: showNotebook, disabled: observerMode })}
        >
          <BookOpen size={12} />
          NOTEBOOK
        </button>

        <button
          type="button"
          onClick={() => setShowTerminal((prev) => !prev)}
          title={terminalActive ? 'Terminal panel active' : 'Open terminal panel'}
          disabled={observerMode}
          style={{
            background: showTerminal ? 'var(--bg-3)' : 'none',
            border: '1px solid var(--border)',
            color: terminalActive ? 'var(--green)' : 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: observerMode ? 'not-allowed' : 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: observerMode ? 0.6 : 1,
            transition: 'all 0.15s',
            transform: 'translateY(0)',
            outline: 'none',
          }}
          onMouseEnter={(e) => applyHeaderHover(e, {
            active: terminalActive,
            activeBorder: 'var(--border)',
            activeColor: 'var(--green)',
            activeShadow: 'none',
            disabled: observerMode,
          })}
          onMouseLeave={(e) => resetHeaderHover(e, {
            active: terminalActive,
            activeBorder: 'var(--border)',
            activeColor: 'var(--green)',
            activeShadow: 'none',
            defaultColor: 'var(--text-2)',
            disabled: observerMode,
          })}
        >
          <TerminalIcon size={12} />
          TERMINAL
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: terminalActive ? 'var(--green)' : 'var(--text-2)',
            display: 'inline-block',
            animation: terminalActive ? 'terminal-dot-pulse 1.4s ease-in-out infinite' : 'none',
            boxShadow: terminalActive ? '0 0 8px var(--green-dim)' : 'none',
            willChange: 'opacity, transform, box-shadow',
          }} />
        </button>

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

        <button
          type="button"
          onClick={() => setShowShortcuts(true)}
          title="Keyboard shortcuts"
          style={{
            background: showShortcuts ? 'var(--bg-3)' : 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            transition: 'all 0.15s',
            transform: 'translateY(0)',
            outline: 'none',
          }}
          onMouseEnter={(e) => applyHeaderHover(e, {
            active: showShortcuts,
            activeBorder: 'var(--border)',
            activeColor: 'var(--text-2)',
            activeShadow: 'none',
          })}
          onMouseLeave={(e) => resetHeaderHover(e, {
            active: showShortcuts,
            activeBorder: 'var(--border)',
            activeColor: 'var(--text-2)',
            activeShadow: 'none',
          })}
        >
          SHORTCUTS
        </button>

        {/* Export dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => exportConversationAsMarkdown(messages, sessionId)}
            onContextMenu={(e) => {
              e.preventDefault()
              void import('../lib/snapshotExport').then(({ exportAsSnapshotHtml }) => {
                exportAsSnapshotHtml(messages, sessionId, sessionMode)
              })
            }}
            title="Left-click: Export as Markdown | Right-click: Export as HTML snapshot"
            disabled={messages.length === 0}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              padding: '4px 10px',
              borderRadius: 'var(--radius)',
              cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              opacity: messages.length === 0 ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (messages.length > 0) {
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
              }
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
            }}
          >
            <Download size={11} />
            EXPORT
          </button>
        </div>

        <div ref={themeMenuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setThemeMenuOpen((prev) => !prev)}
            title={`Theme: ${activeTheme.label}`}
            style={{
              background: themeMenuOpen ? 'var(--accent-dim)' : 'none',
              border: `1px solid ${themeMenuOpen ? 'var(--accent)' : 'var(--border)'}`,
              color: themeMenuOpen ? 'var(--text-0)' : 'var(--text-2)',
              padding: '4px 10px',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
              transform: 'translateY(0)',
              outline: 'none',
              boxShadow: themeMenuOpen ? 'inset 0 0 0 1px var(--accent-glow)' : 'none',
            }}
            onMouseEnter={(e) => applyHeaderHover(e, { active: themeMenuOpen })}
            onMouseLeave={(e) => resetHeaderHover(e, { active: themeMenuOpen })}
          >
            <Palette size={12} />
            THEME
          </button>

          {themeMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 260,
                maxHeight: 360,
                overflowY: 'auto',
                border: '1px solid var(--border-bright)',
                borderRadius: 10,
                background: 'var(--bg-1)',
                boxShadow: '0 16px 34px rgba(0, 0, 0, 0.36)',
                zIndex: 40,
                padding: 6,
                display: 'grid',
                gap: 4,
              }}
            >
              {THEME_OPTIONS.map((option) => {
                const selected = option.key === theme
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleThemeSelect(option.key)}
                    style={{
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent-dim)' : 'var(--bg-2)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      color: selected ? 'var(--text-0)' : 'var(--text-1)',
                      textAlign: 'left',
                      padding: '8px 10px',
                      display: 'grid',
                      gap: 3,
                      transition: 'all 0.14s ease',
                    }}
                    onMouseEnter={(event) => {
                      if (selected) return
                      event.currentTarget.style.borderColor = 'var(--border-bright)'
                      event.currentTarget.style.background = 'var(--bg-3)'
                    }}
                    onMouseLeave={(event) => {
                      if (selected) return
                      event.currentTarget.style.borderColor = 'var(--border)'
                      event.currentTarget.style.background = 'var(--bg-2)'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 11, color: selected ? 'var(--text-0)' : 'var(--text-0)', fontWeight: 600 }}>
                        {option.label}
                      </span>
                      {selected && <Check size={12} color="var(--accent)" />}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.3 }}>
                      {option.description}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleEditor}
          title={editorOpen ? 'Hide editor panel' : 'Show editor panel'}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            transition: 'all 0.15s',
            transform: 'translateY(0)',
            outline: 'none',
            ...(editorOpen ? selectedHeaderButtonStyle : {}),
          }}
          onMouseEnter={(e) => applyHeaderHover(e, { active: editorOpen })}
          onMouseLeave={(e) => resetHeaderHover(e, { active: editorOpen })}
        >
          EDITOR
        </button>

        {installPromptEvent && (
          <button
            type="button"
            onClick={() => {
              const promptEvent = installPromptEvent
              if (!promptEvent) return
              void promptEvent.prompt?.()
              setInstallPromptEvent(null)
            }}
            title="Install app"
            style={{
              background: 'var(--accent-dim)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              padding: '4px 10px',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            INSTALL APP
          </button>
        )}

        </div>{/* end collapsible buttons wrapper */}

        {/* Collapse header toggle — always visible */}
        <button
          type="button"
          onClick={() => setHeaderCollapsed((v) => !v)}
          title={headerCollapsed ? 'Expand header' : 'Collapse header for more space'}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            padding: '4px 8px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
          }}
        >
          {headerCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>

      {/* Search bar — collapsible, toggled by the search icon in header */}
      {searchVisible && (
        <div style={{
          padding: '8px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <Search size={13} color="var(--text-2)" />
          <input
            autoFocus
            type="text"
            placeholder="Search messages..."
            value={messageSearchQuery}
            onChange={(e) => setMessageSearchQuery(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              outline: 'none', color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: 12,
            }}
          />
          {messageSearchQuery.trim() && (
            <button type="button" onClick={() => setMessageSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}>
              <X size={13} />
            </button>
          )}
          <button type="button" onClick={() => { setSearchVisible(false); setMessageSearchQuery('') }} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 2 }}>
            <X size={13} />
          </button>
        </div>
      )}

      {dragOverlayVisible && !observerMode && (
        <div
          style={{
            position: 'absolute',
            inset: 10,
            border: '2px dashed var(--accent)',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--accent-dim) 60%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 45,
            pointerEvents: 'none',
            backdropFilter: 'blur(1px)',
            boxShadow: '0 0 0 1px var(--accent-glow) inset',
          }}
        >
          <div
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--accent)',
              borderRadius: 10,
              padding: '12px 16px',
              color: 'var(--text-0)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Drop files to attach
          </div>
        </div>
      )}

      {!contextBarCollapsed && (
        <CollabBar
          sessionId={sessionId}
          observerMode={observerMode}
          shareUrl={shareUrl}
          expiresAt={expiresAt}
          viewerCount={viewerCount}
          lastEventType={lastEventType}
          error={collabError}
          onShare={() => { void createShare() }}
          onRevoke={() => { void revokeShare() }}
        />
      )}

      {projectDirPickerError && (
        <div style={{
          padding: '8px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--red-dim)',
          color: 'var(--red)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
        }}>
          {projectDirPickerError}
        </div>
      )}

      <div style={{
        padding: contextBarCollapsed ? '4px 24px' : '8px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-2)',
        display: 'grid',
        gap: 5,
        transition: 'padding 0.18s ease',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          fontSize: 10,
          color: 'var(--text-2)',
          letterSpacing: '0.06em',
        }}>
          <span>CONTEXT WINDOW</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            {showCacheSavings && !contextBarCollapsed && (
              <span style={{ color: 'var(--text-2)' }}>
                Cache: saved ~${estimatedCacheSavings.toFixed(4)}
              </span>
            )}
            <span>{contextTokens.toLocaleString()} / {CONTEXT_TOKEN_BUDGET.toLocaleString()} TOK</span>
            <button
              type="button"
              onClick={() => setContextBarCollapsed((v) => !v)}
              title={contextBarCollapsed ? 'Expand context bar' : 'Collapse context bar'}
              aria-label="Toggle context bar"
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text-2)', cursor: 'pointer',
                padding: '1px 4px', display: 'flex', alignItems: 'center',
              }}
            >
              {contextBarCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
            </button>
          </div>
        </div>
        {!contextBarCollapsed && (
          <div style={{
            height: 6,
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--bg-0)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${contextPercent}%`,
              height: '100%',
              background: contextPercent > 85 ? 'var(--red)' : contextPercent > 65 ? 'var(--yellow)' : 'var(--accent)',
              transition: 'width 0.2s ease',
            }} />
          </div>
        )}
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

      {/* Match count for collapsible search */}
      {searchVisible && isMessageFilteringActive && (
        <div style={{ padding: '4px 24px', background: 'var(--bg-1)', fontSize: 11, color: 'var(--text-2)' }}>
          {filteredMessages.length} of {messages.length} messages match
        </div>
      )}

      {afkRecap && (
        <div
          style={{
            padding: '10px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-1)',
            display: 'grid',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.08em' }}>
              AFK RECAP {afkRecap.away_label ? `· away ${afkRecap.away_label}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setAfkRecap(null)}
              style={{
                border: '1px solid var(--border)',
                background: 'var(--bg-2)',
                color: 'var(--text-2)',
                borderRadius: 'var(--radius)',
                fontSize: 10,
                padding: '2px 6px',
                cursor: 'pointer',
              }}
            >
              Hide
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5 }}>
            {afkRecap.summary}
          </div>

          {afkRecap.highlights.length > 0 && (
            <div style={{ display: 'grid', gap: 4 }}>
              {afkRecap.highlights.slice(-3).map((item, index) => (
                <div key={`${item}-${index}`} style={{ fontSize: 11, color: 'var(--text-2)' }}>
                  - {item}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {commandPaletteOpen && (
        <div style={{ position: 'relative', minHeight: 300, zIndex: 100 }}>
          <div
            ref={paletteRef}
            style={{
              position: 'absolute',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              width: 'min(520px, 90vw)',
              background: 'var(--bg-1)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
              <input
                ref={paletteInputRef}
                type="text"
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="> type a command or /..."
                style={{
                  width: '100%',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-0)',
                  outline: 'none',
                  padding: '8px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              />
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {paletteCommands.length === 0 && (
                <div style={{ padding: '10px 12px', color: 'var(--text-2)', fontSize: 11 }}>
                  No matching commands.
                </div>
              )}

              {paletteCommands.map((command, idx) => {
                const selected = idx === paletteIndex
                return (
                  <button
                    key={`${command.name}-${idx}`}
                    type="button"
                    onMouseEnter={() => setPaletteIndex(idx)}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      applyPaletteCommand(command.name)
                    }}
                    style={{
                      width: '100%',
                      border: 'none',
                      borderBottom: idx === paletteCommands.length - 1 ? 'none' : '1px solid var(--border)',
                      background: selected ? 'var(--bg-3)' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: '8px 12px',
                      display: 'grid',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{command.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{command.description}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Project Brief */}
      <ProjectBrief open={briefOpen} onToggle={() => setBriefOpen((v) => !v)} />

      {/* Conference participant selector — slot-based with per-model dropdowns */}
      {conferenceMode && (
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          <GitCompare size={11} color="var(--accent)" />
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            MULTI-MODEL:
          </span>

          <div style={{
            display: 'inline-flex',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg-1)',
            overflow: 'hidden',
          }}>
            {[
              ['synthesis', 'SUMMARIZE'] as const,
              ['debate', 'DEBATE'] as const,
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setConferenceRunMode(mode)}
                style={{
                  border: 'none',
                  borderRight: mode === 'synthesis' ? '1px solid var(--border)' : 'none',
                  background: conferenceRunMode === mode ? 'var(--accent-dim)' : 'transparent',
                  color: conferenceRunMode === mode ? 'var(--accent)' : 'var(--text-2)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Slot cards */}
          {conferenceSlots.map((slot, idx) => {
            const COLORS: Record<string, string> = {
              openai: '#10a37f', gemini: '#4285f4', groq: '#f55036',
              deepseek: '#0066cc', ollama: '#9333ea', openrouter: '#7c3aed',
              'atomic-chat': '#0ea5e9', 'github-models': '#24292f', codex: '#3b82f6',
            }
            const color = COLORS[slot.provider] || '#888'
            const availableModels = conferenceModels[slot.provider] || []
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 3,
                border: `1px solid ${color}66`,
                borderRadius: 8, padding: '2px 4px 2px 8px',
                background: 'var(--bg-1)',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {/* Provider */}
                <select
                  value={slot.provider}
                  onChange={(e) => {
                    const prov = e.target.value
                    const firstModel = conferenceModels[prov]?.[0] || conferenceProviders.find((p) => p.name === prov)?.big_model || ''
                    setConferenceSlots((prev) => prev.map((s, i) => i === idx ? { ...s, provider: prov, model: firstModel, name: `${prov}/${firstModel}` } : s))
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-0)', fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', outline: 'none' }}
                >
                  {conferenceProviders.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
                {/* Model */}
                {availableModels.length > 1 && (
                  <>
                    <span style={{ color: 'var(--text-2)', fontSize: 9 }}>/</span>
                    <select
                      value={slot.model}
                      onChange={(e) => {
                        const m = e.target.value
                        setConferenceSlots((prev) => prev.map((s, i) => i === idx ? { ...s, model: m, name: `${s.provider}/${m.split(':')[0]}` } : s))
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-1)', fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', outline: 'none', maxWidth: 140 }}
                    >
                      {availableModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </>
                )}
                {conferenceSlots.length > 2 && (
                  <button type="button" onClick={() => setConferenceSlots((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: '0 2px', fontSize: 11, lineHeight: 1 }}>
                    ×
                  </button>
                )}
              </div>
            )
          })}

          {/* Add slot */}
          {conferenceSlots.length < 6 && (
            <button
              type="button"
              onClick={() => {
                const firstProv = conferenceProviders[0]
                if (!firstProv) return
                const firstModel = conferenceModels[firstProv.name]?.[0] || firstProv.big_model || ''
                setConferenceSlots((prev) => [...prev, { provider: firstProv.name, model: firstModel, name: `${firstProv.name}/${firstModel}` }])
              }}
              style={{
                background: 'var(--bg-2)', border: '1px dashed var(--border)',
                borderRadius: 8, padding: '3px 10px', cursor: 'pointer',
                color: 'var(--text-2)', fontSize: 10, fontFamily: 'var(--font-mono)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              + ADD
            </button>
          )}

          {conferenceSlots.length < 2 && (
            <span style={{ fontSize: 9, color: 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>Need 2+</span>
          )}

          <button
            type="button"
            onClick={() => { setConferenceMode(false); setConferenceThread(null) }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 2 }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 0',
      }}
        ref={messageListRef}
        aria-live="polite"
        aria-label="Chat messages"
        role="log"
        onScroll={handleMessagesScroll}
      >
        {/* Centered content wrapper */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px' }}>
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
              width: 70,
              height: 70,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
            }}>
              <KodoLogoMark size={66} decorative={false} title="KODO" />
            </div>
            <div style={{
              fontFamily: 'var(--font-kodo-brand)',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-1px',
              marginBottom: 8,
            }}>
              KODO AGENT
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
                  onClick={() => sendMessage(prompt, undefined, [], {
                    onToolStart: (event) => {
                      const tool = String(event.tool || '').trim()
                      setActiveTool(tool || null)
                    },
                    onToolResult: () => {
                      setActiveTool(null)
                    },
                    onDone: () => {
                      setActiveTool(null)
                    },
                    onError: () => {
                      setActiveTool(null)
                    },
                  })}
                  disabled={observerMode}
                  style={{
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius)',
                    cursor: observerMode ? 'not-allowed' : 'pointer',
                    opacity: observerMode ? 0.65 : 1,
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

        {filteredMessages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            messageIndex={idx}
            searchQuery={messageSearchQuery}
            onEditUserPrompt={handleEditUserPrompt}
            onRetryUserPrompt={handleRetryUserPrompt}
            disableUserRetry={observerMode || isLoading || attachmentUploading}
            onFork={(!observerMode && !isLoading && sessionId) ? (index) => {
              void forkSession(sessionId, index)
            } : undefined}
            onRunCode={!observerMode ? (code, lang) => {
              setShowTerminal(true)
              const prefix = ['python', 'py'].includes(lang) ? 'python3 -c ' : ''
              void runTerminalCommand(prefix ? `${prefix}${JSON.stringify(code)}` : code)
            } : undefined}
          />
        ))}

        {isMessageFilteringActive && filteredMessages.length === 0 && (
          <div style={{
            border: '1px dashed var(--border-bright)',
            borderRadius: 'var(--radius)',
            padding: '10px 12px',
            color: 'var(--text-1)',
            fontSize: 12,
            marginBottom: 14,
          }}>
            No message matches for "{messageSearchQuery.trim()}" in this session.
          </div>
        )}

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
            <CircleAlert size={12} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}

        {/* Conference thread — rendered after messages */}
        {conferenceThread && (
          <ConferenceThread data={conferenceThread} />
        )}

        {isLoading && (
          <KodoThinkingIndicator activeTool={activeTool} />
        )}

        <div ref={bottomRef} />
        </div>{/* end centered wrapper */}
      </div>

      {/* ── Scroll navigation (Claude-style page up/down + go-to-bottom) ── */}
      <div style={{
        position: 'absolute',
        right: 18,
        bottom: 120,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        zIndex: 20,
      }}>
        {/* Page Up */}
        <button
          type="button"
          title="Scroll to top (Page Up)"
          onClick={() => messageListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          style={navScrollBtn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        {/* Page Down / Go to bottom */}
        <button
          type="button"
          title="Scroll to bottom"
          onClick={() => {
            shouldAutoScrollRef.current = true
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          style={navScrollBtn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {showTerminal && (
        <TerminalPanel
          lines={terminalLines}
          isRunning={terminalRunning}
          themeMode={theme}
          cwdHint={terminalCwd || projectDir || 'workspace root'}
          onRunCommand={runTerminalCommand}
          onClose={() => setShowTerminal(false)}
        />
      )}

      {showNotebook && (
        <NotebookPanel
          sessionId={sessionId}
          projectDir={projectDir}
        />
      )}

      {/* Input area — floating centered card like Claude AI */}
      <div style={{
        padding: '8px 24px 16px',
        background: 'var(--bg-0)',
        flexShrink: 0,
      }}>
        {/* Centered wrapper */}
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          {/* Smart suggestions */}
          <div style={{ marginBottom: 4, padding: '0 0 0' }}>
            <SmartSuggestions
              messages={messages}
              isLoading={isLoading}
              onSelect={(prompt) => {
                setInput(prompt)
                setTimeout(() => textareaRef.current?.focus(), 50)
              }}
            />
          </div>
        </div>

        {/* Floating composer card — centered, max-width */}
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div ref={composerRef} style={{ position: 'relative' }}>
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
                    key={`${command.source}-${command.name}-${idx}`}
                    type="button"
                    onMouseEnter={() => setActiveCommandIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      void applyCommandSuggestion(command)
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
                    }}>
                      {command.description}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {(pendingImage || pendingFiles.length > 0) && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 8,
            }}>
              {pendingImage && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid var(--border-bright)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-3)',
                  padding: '4px 6px',
                  maxWidth: 210,
                }}>
                  <img
                    src={pendingImage.previewUrl}
                    alt={pendingImage.name}
                    style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover' }}
                  />
                  <span className="truncate" style={{ maxWidth: 140, fontSize: 10, color: 'var(--text-1)' }}>
                    {pendingImage.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingImage(null)}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {pendingFiles.slice(0, MAX_VISIBLE_ATTACHMENT_CHIPS - (pendingImage ? 1 : 0)).map((file, idx) => (
                <div key={`${file.name}-${idx}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-3)',
                  padding: '4px 6px',
                  maxWidth: 220,
                }}>
                  {file.isImage && file.previewUrl ? (
                    <img src={file.previewUrl} alt={file.name} style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover' }} />
                  ) : (
                    <Paperclip size={12} color="var(--text-2)" />
                  )}
                  <span className="truncate" style={{ maxWidth: 150, fontSize: 10, color: 'var(--text-1)' }}>
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== idx))}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {hiddenAttachmentCount > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-2)', alignSelf: 'center' }}>+{hiddenAttachmentCount} more</span>
              )}
            </div>
          )}

          {attachmentError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
              fontSize: 11,
              color: 'var(--red)',
            }}>
              <CircleAlert size={12} />
              {attachmentError}
            </div>
          )}

          {isEditingPrompt && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 8,
              border: '1px solid var(--accent)',
              background: 'var(--accent-dim)',
              borderRadius: 'var(--radius)',
              padding: '6px 8px 6px 10px',
              animation: 'fadeIn 0.15s ease',
            }}>
              <span style={{
                fontSize: 10,
                letterSpacing: '0.07em',
                color: 'var(--text-0)',
                fontFamily: 'var(--font-mono)',
              }}>
                EDITING PREVIOUS PROMPT
              </span>
              <button
                type="button"
                onClick={() => cancelPromptEdit()}
                title="Cancel editing"
                aria-label="Cancel editing"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  border: '1px solid var(--border-bright)',
                  background: 'var(--bg-1)',
                  color: 'var(--text-1)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.borderColor = 'var(--accent)'
                  event.currentTarget.style.color = 'var(--text-0)'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = 'var(--border-bright)'
                  event.currentTarget.style.color = 'var(--text-1)'
                }}
              >
                <X size={12} />
              </button>
            </div>
          )}

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: 'var(--bg-2)',
            border: `1px solid ${conferenceMode ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 14,
            padding: '10px 8px 10px 14px',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            cursor: 'text',
            minHeight: 52,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          }}
          onFocusCapture={e => {
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.28), 0 0 0 1px var(--accent-glow)'
          }}
          onBlurCapture={e => {
            ;(e.currentTarget as HTMLElement).style.borderColor = conferenceMode ? 'var(--accent)' : 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.18)'
          }}
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'INPUT') {
              textareaRef.current?.focus()
            }
          }}
        >
          <input
            ref={imageInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            onChange={handleFilePick}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            title="Attach files"
            disabled={observerMode}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius)',
              border: `1px solid ${totalAttachmentCount > 0 ? 'var(--accent)' : 'var(--border)'}`,
              background: totalAttachmentCount > 0 ? 'var(--accent-dim)' : 'var(--bg-3)',
              color: totalAttachmentCount > 0 ? 'var(--accent)' : 'var(--text-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: observerMode ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              opacity: observerMode ? 0.6 : 1,
            }}
          >
            <ImagePlus size={14} />
          </button>

          <button
            className={voiceListening ? 'recording-indicator' : undefined}
            type="button"
            onClick={startVoiceInput}
            title={voiceListening ? 'Listening...' : 'Voice input'}
            aria-label={voiceListening ? 'Listening for voice input' : 'Start voice input'}
            disabled={observerMode}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius)',
              border: `1px solid ${voiceListening ? 'var(--red)' : 'var(--border)'}`,
              background: voiceListening ? 'var(--red-dim)' : 'var(--bg-3)',
              color: voiceListening ? 'var(--red)' : 'var(--text-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: observerMode ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              boxShadow: voiceListening ? '0 0 10px var(--red-dim)' : 'none',
              opacity: observerMode ? 0.6 : 1,
            }}
          >
            <Mic size={14} />
          </button>

          {/* Response depth selector */}
          {!observerMode && (
            <DepthSelector value={depthMode} onChange={setDepthMode} />
          )}

          {/* ─── Buddy companion ─── */}
          <BuddyWidget
            isLoading={isLoading}
            activeTool={activeTool}
            voiceListening={voiceListening}
            hasMessages={messages.length > 0}
            lastMessageRole={lastMessageRole}
            advisorVerdict={lastAdvisorVerdict}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onPaste={handleClipboardPaste}
            placeholder="Ask KODO anything, attach files, or run /help"
            rows={1}
            disabled={observerMode}
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
              maxHeight: 140,
              overflowY: 'auto',
              padding: 0,
              margin: 0,
              display: 'block',
              alignSelf: 'center',
              width: '100%',
            }}
          />
          <button
            onClick={() => {
              if (isLoading) {
                stopGeneration()
                setTerminalRunning(false)
                return
              }
              void handleSend()
            }}
            disabled={observerMode || attachmentUploading || (!isLoading && !input.trim() && totalAttachmentCount === 0)}
            style={{
              background: isLoading
                ? 'var(--red-dim)'
                : attachmentUploading
                  ? 'var(--bg-3)'
                  : (input.trim() || totalAttachmentCount > 0)
                    ? 'var(--accent)'
                    : 'var(--bg-3)',
              border: isLoading ? '1px solid var(--red)' : 'none',
              color: isLoading
                ? 'var(--red)'
                : attachmentUploading
                  ? 'var(--text-2)'
                  : (input.trim() || totalAttachmentCount > 0)
                    ? '#0a0a0b'
                    : 'var(--text-2)',
              width: 36, height: 36,
              borderRadius: 'var(--radius)',
              cursor: (observerMode || attachmentUploading || (!isLoading && !input.trim() && totalAttachmentCount === 0)) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
              opacity: observerMode ? 0.65 : 1,
            }}
          >
            {isLoading ? <Square size={15} /> : <Send size={15} />}
          </button>
        </div>
        </div>
        <div style={{ fontSize: 10, color: observerMode ? 'var(--yellow)' : 'var(--text-2)', marginTop: 6, textAlign: 'center' }}>
          {observerMode
            ? 'Observer mode is active. This shared session is read-only.'
            : conferenceMode
              ? `Multi-Model Conference: ${conferenceSelected.join(' vs ')} — Cmd+Enter to debate`
              : 'Enter send · Shift+Enter newline · Tab autocomplete · Ctrl/Cmd+K commands'}
        </div>
        </div>{/* end centered wrapper */}
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
              Tool <strong>{activePermission?.tool_name}</strong> requested approval.
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
              {activePermission?.input_preview || '(no preview provided)'}
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

      {showShortcuts && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setShowShortcuts(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(520px, 96vw)',
              borderRadius: 10,
              border: '1px solid var(--border-bright)',
              background: 'var(--bg-1)',
              boxShadow: '0 14px 34px rgba(0,0,0,0.35)',
              padding: 14,
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--text-0)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Keyboard shortcuts
            </div>
            <ShortcutRow keys="Enter" action="Send message" />
            <ShortcutRow keys="Shift + Enter" action="New line in message" />
            <ShortcutRow keys="Ctrl/Cmd + K" action="Open command palette" />
            <ShortcutRow keys="Ctrl/Cmd + Enter" action="Send from anywhere" />
            <ShortcutRow keys="Ctrl/Cmd + L" action="Clear messages" />
            <ShortcutRow keys="Ctrl/Cmd + S" action="Save checkpoint" />
            <ShortcutRow keys="Ctrl/Cmd + Z" action="Restore last checkpoint" />
            <ShortcutRow keys="Ctrl/Cmd + T" action="Toggle terminal" />
            <ShortcutRow keys="Ctrl/Cmd + N" action="New session" />
            <ShortcutRow keys="Ctrl/Cmd + B" action="Toggle sidebar" />
            <ShortcutRow keys="?" action="Toggle this shortcuts help" />
            <ShortcutRow keys="Esc" action="Stop generation / close overlays" />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-2)',
                  color: 'var(--text-1)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Variables fill-in modal */}
      {varModalPrompt && (
        <PromptVariablesModal
          prompt={varModalPrompt}
          variables={varModalVars}
          onApply={(resolved) => {
            setVarModalPrompt(null)
            setVarModalVars([])
            setInput(resolved)
            // Immediately send after a tick so input state is updated
            setTimeout(() => {
              void (async () => {
                if (!observerMode && !isLoading) {
                  sendMessage(resolved, undefined, [], getSendStreamHandlers())
                  setInput('')
                }
              })()
            }, 0)
          }}
          onCancel={() => {
            setVarModalPrompt(null)
            setVarModalVars([])
          }}
        />
      )}

      {/* Status bar */}
      <StatusBar
        onOpenPalette={() => setActionPaletteOpen(true)}
        onOpenTheme={() => setThemeStudioOpenChat(true)}
        isFocusMode={isFocusMode}
        onToggleFocus={() => setIsFocusMode((v) => !v)}
      />

      {/* Action palette — Cmd+Shift+K */}
      <CommandPalette
        open={actionPaletteOpen}
        onClose={() => setActionPaletteOpen(false)}
      />

      {/* Theme Studio from chat */}
      {themeStudioOpenChat && (
        <ThemeStudioChat onClose={() => setThemeStudioOpenChat(false)} />
      )}
    </div>
  )
}

export default ChatWindow

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
      <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{keys}</span>
      <span style={{ color: 'var(--text-1)' }}>{action}</span>
    </div>
  )
}
