import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChat } from './useChat'
import { useChatStore } from '../store/chatStore'

describe('useChat', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ modes: [], commands: [], sessions: [] }),
      body: null,
    }))

    useChatStore.setState({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'hello world',
          timestamp: 1,
        },
        {
          id: '2',
          role: 'assistant',
          content: 'tool response',
          toolCalls: [
            {
              tool: 'bash',
              input: { command: 'echo needle' },
              output: 'found needle in output',
            },
          ],
          timestamp: 2,
        },
      ],
      messageSearchQuery: '',
      isLoading: false,
      error: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns all messages when messageSearchQuery is empty', () => {
    const { result } = renderHook(() => useChat())
    expect(result.current.filteredMessages).toHaveLength(2)
  })

  it('filters messages by content and tool output', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.setMessageSearchQuery('needle')
    })

    expect(result.current.filteredMessages).toHaveLength(1)
    expect(result.current.filteredMessages[0].id).toBe('2')
  })

  it('exposes messageSearchQuery setter from store', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.setMessageSearchQuery('abc')
    })

    expect(result.current.messageSearchQuery).toBe('abc')
  })

  it('hydrates per-message usage and tool details when reloading a session', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/chat/sessions/session-usage-1/checkpoints')) {
        return {
          ok: true,
          json: async () => ({ checkpoints: [] }),
        }
      }
      if (url.includes('/api/chat/sessions/session-usage-1')) {
        return {
          ok: true,
          json: async () => ({
            session_id: 'session-usage-1',
            metadata: { mode: 'execute' },
            messages: [
              { role: 'user', content: 'hello', timestamp: '2026-01-01T10:00:00Z' },
              {
                role: 'assistant',
                content: 'done',
                timestamp: '2026-01-01T10:00:05Z',
                usage: {
                  input_tokens: 111,
                  output_tokens: 222,
                  input_cache_read_tokens: 3,
                  input_cache_write_tokens: 1,
                  model: 'gpt-test',
                },
                tool_calls: [
                  {
                    tool: 'bash',
                    input: { command: 'echo ok' },
                    output: 'ok',
                    success: true,
                    stream_lines: ['ok'],
                  },
                ],
              },
            ],
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({ modes: [], commands: [], sessions: [] }),
        body: null,
      }
    })

    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.loadSession('session-usage-1')
    })

    const messages = useChatStore.getState().messages
    expect(messages).toHaveLength(2)
    expect(messages[1].usage?.input_tokens).toBe(111)
    expect(messages[1].usage?.output_tokens).toBe(222)
    expect(messages[1].usage?.model).toBe('gpt-test')
    expect(messages[1].toolCalls?.[0]?.tool).toBe('bash')
    expect(messages[1].toolCalls?.[0]?.output).toBe('ok')
    expect(messages[1].toolCalls?.[0]?.streamLines?.[0]).toBe('ok')
  })
})
