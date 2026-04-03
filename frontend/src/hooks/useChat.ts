import { useCallback, useRef } from 'react'
import {
  useChatStore,
  CommandDefinition,
  Message,
  ModeOption,
  PermissionChallenge,
  ToolCall,
} from '../store/chatStore'
import { buildApiHeaders, parseApiError } from '../lib/api'

const API = '/api/chat'

function genId() {
  return Math.random().toString(36).slice(2, 11)
}

export function useChat() {
  const store = useChatStore()
  const abortRef = useRef<AbortController | null>(null)

  const loadModes = useCallback(async () => {
    try {
      const res = await fetch(`${API}/modes`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      const modes = (data.modes || []) as ModeOption[]
      store.setAvailableModes(modes)
      if (!store.sessionMode) {
        store.setSessionMode((data.default_mode as string) || 'execute')
      }
    } catch (e) {
      console.error('Failed to load modes', e)
      store.setAvailableModes([])
    }
  }, [store])

  const loadCommands = useCallback(async () => {
    try {
      const res = await fetch(`${API}/commands`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      useChatStore.getState().setCommands((data.commands || []) as CommandDefinition[])
    } catch (e) {
      console.error('Failed to load commands', e)
      useChatStore.getState().setCommands([])
    }
  }, [])

  const loadPendingPermissions = useCallback(async (sessionId?: string | null) => {
    const sid = (sessionId ?? store.sessionId) || ''
    if (!sid) {
      store.setPermissionChallenges([])
      return
    }

    try {
      const res = await fetch(`${API}/permissions/pending?session_id=${encodeURIComponent(sid)}`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setPermissionChallenges((data.pending || []) as PermissionChallenge[])
    } catch (e) {
      console.error('Failed to load pending permissions', e)
    }
  }, [store])

  const respondPermission = useCallback(async (
    challengeId: string,
    approve: boolean,
    remember: boolean,
    sessionId?: string | null,
  ) => {
    try {
      const res = await fetch(`${API}/permissions/${encodeURIComponent(challengeId)}/decision`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ approve, remember }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadPendingPermissions(sessionId ?? store.sessionId)
    } catch (e) {
      console.error('Failed to submit permission decision', e)
      store.setError(String(e))
    }
  }, [loadPendingPermissions, store])

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch(`${API}/usage?days=7&limit=50`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setUsageSummary(data)
    } catch (e) {
      console.error('Failed to load usage summary', e)
      store.setUsageSummary(null)
    }
  }, [store])

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sessions`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setSessions(data.sessions || [])
      await loadUsage()
    } catch (e) {
      console.error('Failed to load sessions', e)
    }
  }, [loadUsage, store])

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API}/sessions/${sessionId}`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) return
      const data = await res.json()
      store.setSessionId(sessionId)

      // Convert raw history to display messages
      const messages: Message[] = data.messages
        .filter((m: { role: string }) => m.role !== 'system')
        .map((m: { role: string; content: string }) => ({
          id: genId(),
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : '',
          timestamp: Date.now(),
        }))
      store.setMessages(messages)
      const metadata = data.metadata as { mode?: string } | undefined
      const mode = metadata?.mode || 'execute'
      store.setSessionMode(mode)
    } catch (e) {
      console.error('Failed to load session', e)
    }
  }, [store])

  const setSessionMode = useCallback(async (mode: string, targetSessionId?: string | null) => {
    const normalized = mode.trim() || 'execute'
    store.setSessionMode(normalized)

    const sid = targetSessionId ?? store.sessionId
    if (!sid) return

    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sid)}/mode`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ mode: normalized }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setSessionMode((data.mode as string) || normalized)
    } catch (e) {
      console.error('Failed to set session mode', e)
      store.setError(String(e))
    }
  }, [store])

  const newSession = useCallback(async () => {
    try {
      const res = await fetch(`${API}/new-session`, {
        method: 'POST',
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setSessionId(data.session_id)
      store.setSessionMode('execute')
      store.clearMessages()
    } catch (e) {
      console.error('Failed to create session', e)
      store.setError(String(e))
    }
  }, [store])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadSessions()
      if (store.sessionId === sessionId) {
        store.setSessionId(null)
        store.clearMessages()
      }
    } catch (e) {
      console.error('Failed to delete session', e)
      store.setError(String(e))
    }
  }, [loadSessions, store])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || store.isLoading) return

    // Abort previous stream
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    store.setError(null)
    store.setLoading(true)

    // Add user message
    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    store.addMessage(userMsg)

    // Placeholder assistant message
    const assistantId = genId()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      toolCalls: [],
      timestamp: Date.now(),
    }
    store.addMessage(assistantMsg)

    let sessionId = store.sessionId
    let permissionPollTimer: ReturnType<typeof window.setInterval> | null = null
    if (!sessionId) {
      const res = await fetch(`${API}/new-session`, {
        method: 'POST',
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      sessionId = data.session_id
      store.setSessionId(sessionId!)
    }

    try {
      await loadPendingPermissions(sessionId)
      permissionPollTimer = window.setInterval(() => {
        void loadPendingPermissions(sessionId)
      }, 1000)

      const response = await fetch(`${API}/send`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: content,
          session_id: sessionId,
          project_dir: store.projectDir || null,
          mode: store.sessionMode || 'execute',
        }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          try {
            const event = JSON.parse(raw)
            handleEvent(event, assistantId)
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      store.setError(String(e))
      store.updateLastMessage((msg) => ({
        ...msg,
        isStreaming: false,
        content: msg.content || 'An error occurred.',
      }))
    } finally {
      if (permissionPollTimer !== null) {
        window.clearInterval(permissionPollTimer)
      }
      store.setLoading(false)
      store.updateLastMessage((msg) => ({ ...msg, isStreaming: false }))
      loadSessions()
      loadUsage()
      loadPendingPermissions(sessionId)
    }
  }, [loadPendingPermissions, loadSessions, loadUsage, store])

  function handleEvent(event: Record<string, unknown>, _assistantId: string) {
    switch (event.type) {
      case 'text':
        store.updateLastMessage((msg) => ({
          ...msg,
          content: msg.content + (event.content as string),
        }))
        break

      case 'tool_start': {
        const tc: ToolCall = {
          tool: event.tool as string,
          input: event.input as Record<string, unknown>,
          approved: event.approved as boolean,
        }
        store.updateLastMessage((msg) => ({
          ...msg,
          toolCalls: [...(msg.toolCalls || []), tc],
        }))
        break
      }

      case 'tool_result': {
        store.updateLastMessage((msg) => {
          const tcs = [...(msg.toolCalls || [])]
          // Update the last tool call with result
          const lastIdx = tcs.length - 1
          if (lastIdx >= 0) {
            tcs[lastIdx] = {
              ...tcs[lastIdx],
              output: event.output as string,
              success: event.success as boolean,
            }
          }
          return { ...msg, toolCalls: tcs }
        })
        break
      }

      case 'done':
        store.updateLastMessage((msg) => ({
          ...msg,
          isStreaming: false,
          usage: event.usage as Message['usage'],
        }))
        break

      case 'error':
        store.setError(event.message as string)
        store.updateLastMessage((msg) => ({
          ...msg,
          isStreaming: false,
          content: msg.content || `Error: ${event.message}`,
        }))
        break

      case 'meta':
        // Metadata event currently includes request/session identifiers.
        if (typeof event.mode === 'string' && event.mode.trim()) {
          store.setSessionMode(event.mode)
        }
        break

      case 'permission_request':
        // Reserved for future server-pushed permission events.
        void loadPendingPermissions(store.sessionId)
        break
    }
  }

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
    store.setLoading(false)
    store.updateLastMessage((msg) => ({ ...msg, isStreaming: false }))
    void loadPendingPermissions(store.sessionId)
  }, [loadPendingPermissions, store])

  return {
    ...store,
    sendMessage,
    loadCommands,
    loadModes,
    loadSessions,
    loadSession,
    setSessionMode,
    newSession,
    deleteSession,
    loadUsage,
    loadPendingPermissions,
    respondPermission,
    stopGeneration,
  }
}
