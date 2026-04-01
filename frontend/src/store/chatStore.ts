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

interface ChatState {
  sessionId: string | null
  sessions: Session[]
  messages: Message[]
  isLoading: boolean
  error: string | null
  projectDir: string
  usageSummary: UsageSummary | null

  setSessionId: (id: string | null) => void
  setSessions: (sessions: Session[]) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateLastMessage: (updater: (msg: Message) => Message) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setProjectDir: (dir: string) => void
  setUsageSummary: (summary: UsageSummary | null) => void
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
  clearMessages: () => set({ messages: [] }),
}))
