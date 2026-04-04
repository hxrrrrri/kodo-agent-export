import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useChat } from './useChat'
import { useChatStore } from '../store/chatStore'

describe('useChat', () => {
  beforeEach(() => {
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
})
