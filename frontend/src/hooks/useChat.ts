import { useCallback, useMemo, useRef } from 'react'
import {
  useChatStore,
  Checkpoint,
  CommandDefinition,
  ImageAttachment,
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

type StreamEventHandlers = {
  onToolOutput?: (line: string, event: Record<string, unknown>) => void
  onToolResult?: (event: Record<string, unknown>) => void
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const typed = block as { type?: unknown; text?: unknown }
    if (String(typed.type || '').toLowerCase() !== 'text') continue
    if (typeof typed.text === 'string' && typed.text.trim()) {
      parts.push(typed.text)
    }
  }
  return parts.join('\n').trim()
}

function extractImageAttachment(content: unknown): ImageAttachment | undefined {
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const typed = block as { type?: unknown; source?: unknown }
    if (String(typed.type || '').toLowerCase() !== 'image') continue
    const source = typed.source
    if (!source || typeof source !== 'object') continue
    const normalized = source as { type?: unknown; url?: unknown; data?: unknown; media_type?: unknown }
    const sourceType = String(normalized.type || '').toLowerCase()
    if (sourceType === 'url' && typeof normalized.url === 'string') {
      return { url: normalized.url }
    }
    if (sourceType === 'base64' && typeof normalized.data === 'string') {
      return {
        data: normalized.data,
        media_type: typeof normalized.media_type === 'string' ? normalized.media_type : 'image/png',
      }
    }
  }
  return undefined
}

function buildStructuredContent(
  text: string,
  imageAttachment?: ImageAttachment,
  extraBlocks: Array<Record<string, unknown>> = [],
): string | Array<Record<string, unknown>> {
  const trimmed = text.trim()
  const hasImage = Boolean(imageAttachment && (imageAttachment.url || imageAttachment.data))
  const hasExtras = extraBlocks.length > 0
  if (!hasImage && !hasExtras) {
    return trimmed
  }

  const blocks: Array<Record<string, unknown>> = []
  if (trimmed) {
    blocks.push({ type: 'text', text: trimmed })
  }
  if (imageAttachment?.data) {
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageAttachment.media_type || 'image/png',
        data: imageAttachment.data,
      },
    })
  } else if (imageAttachment?.url) {
    blocks.push({
      type: 'image',
      source: {
        type: 'url',
        url: imageAttachment.url,
      },
    })
  }

  for (const block of extraBlocks) {
    if (!block || typeof block !== 'object') continue
    blocks.push(block)
  }

  return blocks
}

export function useChat() {
  const store = useChatStore()
  const abortRef = useRef<AbortController | null>(null)
  const activeAssistantIdRef = useRef<string | null>(null)

  const filteredMessages = useMemo(() => {
    const q = store.messageSearchQuery.trim().toLowerCase()
    if (!q) return store.messages
    return store.messages.filter((msg) => {
      const inContent = msg.content.toLowerCase().includes(q)
      const inTools = (msg.toolCalls || []).some((tc) => {
        let inputText = ''
        try {
          inputText = JSON.stringify(tc.input).toLowerCase()
        } catch {
          inputText = ''
        }
        return inputText.includes(q) || String(tc.output || '').toLowerCase().includes(q)
      })
      return inContent || inTools
    })
  }, [store.messages, store.messageSearchQuery])

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
    abortRef.current?.abort()
    activeAssistantIdRef.current = null
    store.setLoading(false)
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
        .map((m: { role: string; content: unknown }) => ({
          id: genId(),
          role: m.role as 'user' | 'assistant',
          content: extractTextContent(m.content),
          imageAttachment: extractImageAttachment(m.content),
          timestamp: Date.now(),
        }))
      store.setMessages(messages)
      const metadata = data.metadata as { mode?: string } | undefined
      const mode = metadata?.mode || 'execute'
      store.setSessionMode(mode)

      try {
        const checkpointsRes = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/checkpoints`, {
          headers: buildApiHeaders(),
        })
        if (checkpointsRes.ok) {
          const checkpointsData = await checkpointsRes.json()
          store.setCheckpoints((checkpointsData.checkpoints || []) as Checkpoint[])
        }
      } catch {
        store.setCheckpoints([])
      }
    } catch (e) {
      console.error('Failed to load session', e)
    }
  }, [store])

  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadSessions()
    } catch (e) {
      store.setError(String(e))
    }
  }, [loadSessions, store])

  const loadCheckpoints = useCallback(async (targetSessionId?: string | null) => {
    const sid = targetSessionId ?? store.sessionId
    if (!sid) {
      const current = useChatStore.getState().checkpoints
      if (current.length > 0) {
        store.setCheckpoints([])
      }
      return
    }

    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sid)}/checkpoints`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      const next = (data.checkpoints || []) as Checkpoint[]
      const current = useChatStore.getState().checkpoints
      const unchanged =
        current.length === next.length &&
        current.every((item, idx) => {
          const rhs = next[idx]
          return (
            item.checkpoint_id === rhs?.checkpoint_id &&
            item.label === rhs?.label &&
            item.message_count === rhs?.message_count &&
            item.created_at === rhs?.created_at
          )
        })

      if (!unchanged) {
        store.setCheckpoints(next)
      }
    } catch (e) {
      console.error('Failed to load checkpoints', e)
      const current = useChatStore.getState().checkpoints
      if (current.length > 0) {
        store.setCheckpoints([])
      }
    }
  }, [store])

  const createCheckpoint = useCallback(async (label?: string, targetSessionId?: string | null) => {
    const sid = targetSessionId ?? store.sessionId
    if (!sid) return
    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sid)}/checkpoint`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ label: label || null }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadCheckpoints(sid)
    } catch (e) {
      store.setError(String(e))
    }
  }, [loadCheckpoints, store])

  const restoreCheckpoint = useCallback(async (checkpointId: string, targetSessionId?: string | null) => {
    const sid = targetSessionId ?? store.sessionId
    if (!sid) return
    try {
      const res = await fetch(
        `${API}/sessions/${encodeURIComponent(sid)}/checkpoints/${encodeURIComponent(checkpointId)}/restore`,
        {
          method: 'POST',
          headers: buildApiHeaders(),
        },
      )
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadSession(sid)
      await loadCheckpoints(sid)
    } catch (e) {
      store.setError(String(e))
    }
  }, [loadCheckpoints, loadSession, store])

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
    abortRef.current?.abort()
    activeAssistantIdRef.current = null
    store.setLoading(false)
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
      store.setCheckpoints([])
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
        abortRef.current?.abort()
        activeAssistantIdRef.current = null
        store.setLoading(false)
        store.setSessionId(null)
        store.setCheckpoints([])
        store.clearMessages()
      }
    } catch (e) {
      console.error('Failed to delete session', e)
      store.setError(String(e))
    }
  }, [loadSessions, store])

  const sendMessage = useCallback(async (
    content: string,
    imageAttachment?: ImageAttachment,
    extraContentBlocks: Array<Record<string, unknown>> = [],
    eventHandlers?: StreamEventHandlers,
  ) => {
    if ((!content.trim() && !imageAttachment && extraContentBlocks.length === 0) || store.isLoading) return

    // Abort previous stream
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    store.setError(null)
    store.setLoading(true)

    // Add user message
    const attachmentSummary = extraContentBlocks
      .map((block) => {
        if (typeof block?.text === 'string') {
          return block.text.split('\n')[0]
        }
        return '[Attached file]'
      })
      .join('\n')

    const displayContent = content.trim() || attachmentSummary || (imageAttachment ? '[Attached image]' : '')

    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content: displayContent,
      imageAttachment,
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
    activeAssistantIdRef.current = assistantId

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
        body: JSON.stringify((() => {
          const structured = buildStructuredContent(content, imageAttachment, extraContentBlocks)
          const basePayload: Record<string, unknown> = {
            session_id: sessionId,
            project_dir: store.projectDir || null,
            mode: store.sessionMode || 'execute',
          }
          if (Array.isArray(structured)) {
            basePayload.content = structured
            basePayload.message = extractTextContent(structured)
          } else {
            basePayload.message = structured
          }
          if (imageAttachment && (imageAttachment.data || imageAttachment.url)) {
            basePayload.image_attachment = imageAttachment
          }
          return basePayload
        })()),
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
            handleEvent(event, assistantId, eventHandlers)
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      store.setError(String(e))
      if (assistantId) {
        store.updateMessageById(assistantId, (msg) => ({
          ...msg,
          isStreaming: false,
          content: msg.content || 'An error occurred.',
        }))
      }
    } finally {
      if (permissionPollTimer !== null) {
        window.clearInterval(permissionPollTimer)
      }
      store.setLoading(false)
      if (assistantId) {
        store.updateMessageById(assistantId, (msg) => ({ ...msg, isStreaming: false }))
      }
      if (activeAssistantIdRef.current === assistantId) {
        activeAssistantIdRef.current = null
      }
      loadSessions()
      loadUsage()
      loadCheckpoints(sessionId)
      loadPendingPermissions(sessionId)
    }
  }, [loadCheckpoints, loadPendingPermissions, loadSessions, loadUsage, store])

  function handleEvent(event: Record<string, unknown>, assistantId: string, eventHandlers?: StreamEventHandlers) {
    const toolUseId = typeof event.tool_use_id === 'string' ? event.tool_use_id : ''

    const resolveToolCallIndex = (toolCalls: ToolCall[]): number => {
      if (toolUseId) {
        const idx = toolCalls.findIndex((tc) => tc.tool_use_id === toolUseId)
        if (idx >= 0) return idx
      }
      return toolCalls.length - 1
    }

    switch (event.type) {
      case 'text':
        store.updateMessageById(assistantId, (msg) => ({
          ...msg,
          content: msg.content + (event.content as string),
        }))
        break

      case 'tool_start': {
        const tc: ToolCall = {
          tool: event.tool as string,
          input: event.input as Record<string, unknown>,
          approved: event.approved as boolean,
          tool_use_id: toolUseId || undefined,
          streamLines: [],
        }
        store.updateMessageById(assistantId, (msg) => ({
          ...msg,
          toolCalls: [...(msg.toolCalls || []), tc],
        }))
        break
      }

      case 'tool_output': {
        const line = String(event.line || '')
        if (!line) break
        store.updateMessageById(assistantId, (msg) => {
          const tcs = [...(msg.toolCalls || [])]
          const idx = resolveToolCallIndex(tcs)
          if (idx < 0) return msg
          const target = tcs[idx]
          tcs[idx] = {
            ...target,
            streamLines: [...(target.streamLines || []), line],
          }
          return { ...msg, toolCalls: tcs }
        })
        eventHandlers?.onToolOutput?.(line, event)
        break
      }

      case 'tool_result': {
        store.updateMessageById(assistantId, (msg) => {
          const tcs = [...(msg.toolCalls || [])]
          const idx = resolveToolCallIndex(tcs)
          if (idx >= 0) {
            tcs[idx] = {
              ...tcs[idx],
              tool_use_id: tcs[idx].tool_use_id || toolUseId || undefined,
              output: String(event.output || ''),
              success: event.success as boolean,
              metadata: (event.metadata as Record<string, unknown>) || undefined,
            }
          }
          return { ...msg, toolCalls: tcs }
        })
        eventHandlers?.onToolResult?.(event)
        break
      }

      case 'done':
        store.updateMessageById(assistantId, (msg) => ({
          ...msg,
          isStreaming: false,
          usage: event.usage as Message['usage'],
        }))
        break

      case 'error':
        store.setError(event.message as string)
        store.updateMessageById(assistantId, (msg) => ({
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
    const activeId = activeAssistantIdRef.current
    if (activeId) {
      store.updateMessageById(activeId, (msg) => ({ ...msg, isStreaming: false }))
      activeAssistantIdRef.current = null
    }
    void loadPendingPermissions(store.sessionId)
  }, [loadPendingPermissions, store])

  return {
    ...store,
    filteredMessages,
    messageSearchQuery: store.messageSearchQuery,
    setMessageSearchQuery: store.setMessageSearchQuery,
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
    loadCheckpoints,
    createCheckpoint,
    restoreCheckpoint,
    updateSessionTitle,
  }
}
