import { create } from 'zustand'

export const THEME_KEYS = [
  'dark',
  'light',
  'ocean',
  'forest',
  'midnight',
  'rose',
  'sunrise',
  'nord',
  'mono',
  'glass',
] as const

export type ThemeKey = (typeof THEME_KEYS)[number]

export const THEME_TONES: Record<ThemeKey, 'dark' | 'light'> = {
  dark: 'dark',
  light: 'light',
  ocean: 'dark',
  forest: 'dark',
  midnight: 'dark',
  rose: 'light',
  sunrise: 'light',
  nord: 'light',
  mono: 'dark',
  glass: 'dark',
}

export const THEME_OPTIONS: Array<{
  key: ThemeKey
  label: string
  description: string
}> = [
  { key: 'dark', label: 'Ember Night', description: 'Warm contrast for focused coding.' },
  { key: 'light', label: 'Warm Paper', description: 'Soft daylight palette with clean readability.' },
  { key: 'ocean', label: 'Ocean Deep', description: 'Teal and cyan with calm dark surfaces.' },
  { key: 'forest', label: 'Forest Signal', description: 'Green-led theme with earthy depth.' },
  { key: 'midnight', label: 'Midnight Indigo', description: 'Cool indigo tones with crisp accents.' },
  { key: 'rose', label: 'Rose Quartz', description: 'Balanced light theme with subtle rose highlights.' },
  { key: 'sunrise', label: 'Sunrise Coral', description: 'Bright warm palette for daytime work.' },
  { key: 'nord', label: 'Arctic Nord', description: 'Blue-gray minimal theme with high clarity.' },
  { key: 'mono', label: 'Monochrome Slate', description: 'Neutral grayscale with restrained accents.' },
  { key: 'glass', label: 'Glassy Aurora', description: 'Premium glassmorphism with layered depth.' },
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

export interface Message {
  id: string
  role: MessageRole
  content: string
  imageAttachment?: ImageAttachment
  advisorReview?: AdvisorReview
  toolCalls?: ToolCall[]
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
  searchQuery: string
  messageSearchQuery: string

  setSessionId: (id: string | null) => void
  setSessions: (sessions: Session[]) => void
  setMessages: (messages: Message[]) => void
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
  setSearchQuery: (query: string) => void
  setMessageSearchQuery: (query: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  sessions: [],
  messages: [],
  isLoading: false,
  error: null,
  projectDir: '',
  usageSummary: null,
  permissionChallenges: [],
  checkpoints: [],
  sessionMode: 'execute',
  availableModes: [],
  commands: [],
  theme: 'dark',
  searchQuery: '',
  messageSearchQuery: '',

  setSessionId: (id) => set({ sessionId: id }),
  setSessions: (sessions) => set({ sessions }),
  setMessages: (messages) => set({ messages }),
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
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setMessageSearchQuery: (messageSearchQuery) => set({ messageSearchQuery }),
  clearMessages: () => set({ messages: [] }),
}))
