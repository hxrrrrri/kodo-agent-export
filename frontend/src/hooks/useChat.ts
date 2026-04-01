import { useCallback, useRef } from 'react'
import { useChatStore, Message, ToolCall } from '../store/chatStore'
import { buildApiHeaders, parseApiError } from '../lib/api'

const API = '/api/chat'

function genId() {
  return Math.random().toString(36).slice(2, 11)
}

export function useChat() {
  const store = useChatStore()
  const abortRef = useRef<AbortController | null>(null)

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
    } catch (e) {
      console.error('Failed to load session', e)
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
      const response = await fetch(`${API}/send`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: content,
          session_id: sessionId,
          project_dir: store.projectDir || null,
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
      store.setLoading(false)
      store.updateLastMessage((msg) => ({ ...msg, isStreaming: false }))
      loadSessions()
      loadUsage()
    }
  }, [loadSessions, loadUsage, store])

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
        break
    }
  }

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
    store.setLoading(false)
    store.updateLastMessage((msg) => ({ ...msg, isStreaming: false }))
  }, [])

  return {
    ...store,
    sendMessage,
    loadSessions,
    loadSession,
    newSession,
    deleteSession,
    loadUsage,
    stopGeneration,
  }
}
