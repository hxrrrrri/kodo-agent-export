import { create } from 'zustand'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ToolCall {
  tool: string
  input: Record<string, unknown>
  output?: string
  success?: boolean
  approved?: boolean
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  toolCalls?: ToolCall[]
  isStreaming?: boolean
  usage?: { input_tokens: number; output_tokens: number; model: string }
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
    estimated_cost_usd: number
  }
  by_model: Record<
    string,
    {
      input_tokens: number
      output_tokens: number
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

interface ChatState {
  sessionId: string | null
  sessions: Session[]
  messages: Message[]
  isLoading: boolean
  error: string | null
  projectDir: string
  usageSummary: UsageSummary | null
  permissionChallenges: PermissionChallenge[]
  sessionMode: string
  availableModes: ModeOption[]
  commands: CommandDefinition[]

  setSessionId: (id: string | null) => void
  setSessions: (sessions: Session[]) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateLastMessage: (updater: (msg: Message) => Message) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setProjectDir: (dir: string) => void
  setUsageSummary: (summary: UsageSummary | null) => void
  setPermissionChallenges: (pending: PermissionChallenge[]) => void
  setSessionMode: (mode: string) => void
  setAvailableModes: (modes: ModeOption[]) => void
  setCommands: (commands: CommandDefinition[]) => void
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
  sessionMode: 'execute',
  availableModes: [],
  commands: [],

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
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setProjectDir: (projectDir) => set({ projectDir }),
  setUsageSummary: (usageSummary) => set({ usageSummary }),
  setPermissionChallenges: (permissionChallenges) => set({ permissionChallenges }),
  setSessionMode: (sessionMode) => set({ sessionMode }),
  setAvailableModes: (availableModes) => set({ availableModes }),
  setCommands: (commands) => set({ commands }),
  clearMessages: () => set({ messages: [] }),
}))
