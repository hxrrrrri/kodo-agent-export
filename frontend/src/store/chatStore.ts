import { create } from 'zustand'
import { ArtifactRef, ArtifactV2 } from '../lib/artifacts/types'

export type { ArtifactV2, ArtifactRef } from '../lib/artifacts/types'

export const THEME_KEYS = [
  'dark',
  'claude',
  'light',
  'ocean',
  'forest',
  'midnight',
  'rose',
  'sunrise',
  'nord',
  'mono',
  'glass',
  'fusion',
] as const

export type ThemeKey = (typeof THEME_KEYS)[number]

export const THEME_TONES: Record<ThemeKey, 'dark' | 'light'> = {
  dark: 'dark',
  claude: 'dark',
  light: 'light',
  ocean: 'dark',
  forest: 'dark',
  midnight: 'dark',
  rose: 'light',
  sunrise: 'light',
  nord: 'light',
  mono: 'dark',
  glass: 'dark',
  fusion: 'dark',
}

export const THEME_OPTIONS: Array<{
  key: ThemeKey
  label: string
  description: string
}> = [
  { key: 'dark', label: 'Ember Night', description: 'Warm contrast for focused coding.' },
  { key: 'claude', label: 'Claude', description: 'Anthropic-inspired warm dark mode with editorial typography.' },
  { key: 'light', label: 'Warm Paper', description: 'Soft daylight palette with clean readability.' },
  { key: 'ocean', label: 'Ocean Deep', description: 'Teal and cyan with calm dark surfaces.' },
  { key: 'forest', label: 'Forest Signal', description: 'Green-led theme with earthy depth.' },
  { key: 'midnight', label: 'Midnight Indigo', description: 'Cool indigo tones with crisp accents.' },
  { key: 'rose', label: 'Rose Quartz', description: 'Balanced light theme with subtle rose highlights.' },
  { key: 'sunrise', label: 'Sunrise Coral', description: 'Bright warm palette for daytime work.' },
  { key: 'nord', label: 'Arctic Nord', description: 'Blue-gray minimal theme with high clarity.' },
  { key: 'mono', label: 'Monochrome Slate', description: 'Neutral grayscale with restrained accents.' },
  { key: 'glass', label: 'Glassy Aurora', description: 'Premium glassmorphism with layered depth.' },
  { key: 'fusion', label: 'Fusion', description: 'DVSY editorial dark × Nothing OS × Apple Glassmorphism.' },
]

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ToolCall {
  tool: string
  input: Record<string, unknown>
  tool_use_id?: string
  output?: string
  streamLines?: string[]
  success?: boolean
  approved?: boolean
  metadata?: Record<string, unknown>
}

export interface ImageAttachment {
  url?: string
  data?: string
  media_type?: string
}

export interface AdvisorReview {
  score?: number
  summary?: string
  strengths?: string[]
  risks?: string[]
  next_steps?: string[]
  mode?: string
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  id: string
  title: string
  status: TodoStatus
  detail?: string
  tool?: string
  category?: 'analysis' | 'code' | 'test' | 'docs' | 'deploy' | 'design' | 'review' | 'fix' | 'plan'
}

export interface ArtifactItem {
  id: string
  title: string
  language: string
  content: string
  filename?: string
}

export interface PreviewItem {
  id: string
  url: string
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  imageAttachment?: ImageAttachment
  advisorReview?: AdvisorReview
  toolCalls?: ToolCall[]
  todoItems?: TodoItem[]
  artifacts?: ArtifactItem[]
  artifactRefs?: ArtifactRef[]
  previews?: PreviewItem[]
  isStreaming?: boolean
  usage?: {
    input_tokens: number
    output_tokens: number
    model: string
    input_cache_read_tokens?: number
    input_cache_write_tokens?: number
  }
  timestamp: number
}

export interface Session {
  session_id: string
  title: string
  updated_at: string
  message_count: number
  mode?: string
  starred?: boolean
}

export interface UsageSummary {
  window_days: number
  events_count: number
  totals: {
    input_tokens: number
    output_tokens: number
    input_cache_read_tokens?: number
    input_cache_write_tokens?: number
    cost_usd_total?: number
    estimated_cost_usd: number
  }
  by_model: Record<
    string,
    {
      input_tokens: number
      output_tokens: number
      input_cache_read_tokens?: number
      input_cache_write_tokens?: number
      cost_usd_total?: number
      estimated_cost_usd: number
    }
  >
}

export interface CommandDefinition {
  name: string
  description: string
}

export interface ModeOption {
  key: string
  title: string
  summary: string
  is_default: boolean
}

export interface PermissionChallenge {
  challenge_id: string
  session_id: string
  tool_name: string
  input_preview: string
  tool_description: string
  status: string
  created_at: string
  decided_at?: string | null
}

export interface Checkpoint {
  checkpoint_id: string
  label?: string | null
  message_count: number
  created_at: string
}

interface ChatState {
  sessionId: string | null
  sessions: Session[]
  messages: Message[]
  input: string
  isLoading: boolean
  error: string | null
  projectDir: string
  usageSummary: UsageSummary | null
  permissionChallenges: PermissionChallenge[]
  checkpoints: Checkpoint[]
  sessionMode: string
  availableModes: ModeOption[]
  commands: CommandDefinition[]
  theme: ThemeKey
  artifactModeEnabled: boolean
  searchQuery: string
  messageSearchQuery: string
  selectedArtifact: ArtifactItem | null
  designStudioOpen: boolean
  // sessionArtifacts[id] is an ordered list of versions (oldest first) for that artifact id.
  sessionArtifacts: Record<string, ArtifactV2[]>
  selectedArtifactV2: { id: string; version: number } | null

  setSessionId: (id: string | null) => void
  setSessions: (sessions: Session[]) => void
  setMessages: (messages: Message[]) => void
  setInput: (text: string) => void
  addMessage: (message: Message) => void
  updateLastMessage: (updater: (msg: Message) => Message) => void
  updateMessageById: (id: string, updater: (msg: Message) => Message) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setProjectDir: (dir: string) => void
  setUsageSummary: (summary: UsageSummary | null) => void
  setPermissionChallenges: (pending: PermissionChallenge[]) => void
  setCheckpoints: (items: Checkpoint[]) => void
  setSessionMode: (mode: string) => void
  setAvailableModes: (modes: ModeOption[]) => void
  setCommands: (commands: CommandDefinition[]) => void
  setTheme: (theme: ThemeKey) => void
  setArtifactModeEnabled: (enabled: boolean) => void
  setSearchQuery: (query: string) => void
  setMessageSearchQuery: (query: string) => void
  setSelectedArtifact: (artifact: ArtifactItem | null) => void
  setDesignStudioOpen: (open: boolean) => void
  clearMessages: () => void
  upsertSessionArtifact: (artifact: ArtifactV2) => void
  clearSessionArtifacts: () => void
  setSelectedArtifactV2: (ref: { id: string; version: number } | null) => void
  toggleSessionStar: (sessionId: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  sessions: [],
  messages: [],
  input: '',
  isLoading: false,
  error: null,
  projectDir: '',
  usageSummary: null,
  permissionChallenges: [],
  checkpoints: [],
  sessionMode: 'execute',
  availableModes: [],
  commands: [],
  theme: 'claude',
  artifactModeEnabled: true,
  searchQuery: '',
  messageSearchQuery: '',
  selectedArtifact: null,
  designStudioOpen: false,
  sessionArtifacts: {},
  selectedArtifactV2: null,

  setSessionId: (id) => set({ sessionId: id }),
  setSessions: (sessions) => {
    // Restore starred state from localStorage when sessions are loaded
    let starred: Set<string>
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('kodo:starred-sessions') : null
      starred = new Set(raw ? JSON.parse(raw) : [])
    } catch {
      starred = new Set()
    }
    const restored = starred.size > 0
      ? sessions.map((s) => starred.has(s.session_id) ? { ...s, starred: true } : s)
      : sessions
    set({ sessions: restored })
  },
  setMessages: (messages) => set({ messages }),
  setInput: (input) => {
    set({ input })
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('kodo:insert-prompt', { detail: { text: input } }))
    }
  },
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  updateLastMessage: (updater) =>
    set((s) => {
      const msgs = [...s.messages]
      if (msgs.length === 0) return s
      msgs[msgs.length - 1] = updater(msgs[msgs.length - 1])
      return { messages: msgs }
    }),
  updateMessageById: (id, updater) =>
    set((s) => {
      if (!id) return s
      const idx = s.messages.findIndex((msg) => msg.id === id)
      if (idx < 0) return s
      const msgs = [...s.messages]
      msgs[idx] = updater(msgs[idx])
      return { messages: msgs }
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setProjectDir: (projectDir) => set({ projectDir }),
  setUsageSummary: (usageSummary) => set({ usageSummary }),
  setPermissionChallenges: (permissionChallenges) => set({ permissionChallenges }),
  setCheckpoints: (checkpoints) => set({ checkpoints }),
  setSessionMode: (sessionMode) => set({ sessionMode }),
  setAvailableModes: (availableModes) => set({ availableModes }),
  setCommands: (commands) => set({ commands }),
  setTheme: (theme) => set({ theme }),
  setArtifactModeEnabled: (artifactModeEnabled) => set({ artifactModeEnabled }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setMessageSearchQuery: (messageSearchQuery) => set({ messageSearchQuery }),
  setSelectedArtifact: (selectedArtifact) => set({ selectedArtifact }),
  setDesignStudioOpen: (designStudioOpen) => set({ designStudioOpen }),
  clearMessages: () => set({ messages: [] }),
  upsertSessionArtifact: (artifact) =>
    set((s) => {
      const existing = s.sessionArtifacts[artifact.id] || []
      const filtered = existing.filter((v) => v.version !== artifact.version)
      const next = [...filtered, artifact].sort((a, b) => a.version - b.version)
      // LRU cap per artifact id at 50 versions.
      const capped = next.length > 50 ? next.slice(next.length - 50) : next
      return {
        sessionArtifacts: { ...s.sessionArtifacts, [artifact.id]: capped },
      }
    }),
  clearSessionArtifacts: () => set({ sessionArtifacts: {}, selectedArtifactV2: null }),
  setSelectedArtifactV2: (ref) => set({ selectedArtifactV2: ref }),
  toggleSessionStar: (sessionId) =>
    set((s) => {
      const sessions = s.sessions.map((sess) =>
        sess.session_id === sessionId ? { ...sess, starred: !sess.starred } : sess
      )
      // Persist starred IDs to localStorage
      try {
        const starredIds = sessions.filter((sess) => sess.starred).map((sess) => sess.session_id)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('kodo:starred-sessions', JSON.stringify(starredIds))
        }
      } catch { /* ignore */ }
      return { sessions }
    }),
}))
