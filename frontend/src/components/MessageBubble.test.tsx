import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { MessageBubble } from './MessageBubble'

const baseMsg = {
  id: 'msg-1',
  role: 'assistant' as const,
  content: 'Hello world test',
  timestamp: Date.now(),
}

describe('MessageBubble', () => {
  it('renders message content', () => {
    render(<MessageBubble message={baseMsg} searchQuery="" />)
    expect(screen.getByText(/Hello world test/i)).toBeTruthy()
  })

  it('shows a bottom copy action for assistant responses', () => {
    render(<MessageBubble message={baseMsg} searchQuery="" />)
    expect(screen.getByRole('button', { name: /copy response/i })).toBeTruthy()
  })

  it('renders dynamic usage metrics at the bottom of assistant messages', () => {
    const usageMsg = {
      ...baseMsg,
      usage: {
        input_tokens: 1234,
        output_tokens: 567,
        input_cache_read_tokens: 890,
        input_cache_write_tokens: 12,
        model: 'gpt-5',
      },
    }

    render(<MessageBubble message={usageMsg} searchQuery="" />)

    expect(screen.getByText(/↑ 1,234 tokens/)).toBeTruthy()
    expect(screen.getByText(/↓ 567 tokens/)).toBeTruthy()
    expect(screen.getByText(/Cache read 890/i)).toBeTruthy()
    expect(screen.getByText(/Cache write 12/i)).toBeTruthy()
    expect(screen.getByText(/gpt-5/i)).toBeTruthy()
  })

  it('renders user message with correct role styling', () => {
    const userMsg = { ...baseMsg, role: 'user' as const, content: 'User says hi' }
    render(<MessageBubble message={userMsg} searchQuery="" />)
    expect(screen.getByText(/User says hi/i)).toBeTruthy()
  })

  it('does not crash with empty content', () => {
    const emptyMsg = { ...baseMsg, content: '' }
    expect(() => render(<MessageBubble message={emptyMsg} searchQuery="" />)).not.toThrow()
  })

  it('shows copy/edit/retry actions for user messages and wires handlers', () => {
    const userMsg = { ...baseMsg, role: 'user' as const, content: 'retry this prompt' }
    const onEditUserPrompt = (content: string) => content
    const onRetryUserPrompt = (content: string) => content

    const editSpy = vi.fn(onEditUserPrompt)
    const retrySpy = vi.fn(onRetryUserPrompt)

    render(
      <MessageBubble
        message={userMsg}
        searchQuery=""
        onEditUserPrompt={editSpy}
        onRetryUserPrompt={retrySpy}
      />, 
    )

    expect(screen.getByTitle(/copy prompt/i)).toBeTruthy()
    const editButton = screen.getByTitle(/edit prompt/i)
    const retryButton = screen.getByTitle(/retry prompt/i)

    fireEvent.click(editButton)
    fireEvent.click(retryButton)

    expect(editSpy).toHaveBeenCalledWith('retry this prompt')
    expect(retrySpy).toHaveBeenCalledWith('retry this prompt')
  })

  it('keeps inline code readable without block-level copy boxes', () => {
    const inlineMsg = { ...baseMsg, content: 'hello im ravi (`=` good boy)' }
    render(<MessageBubble message={inlineMsg} searchQuery="" />)

    expect(screen.getByText(/hello im ravi/i)).toBeTruthy()
    expect(screen.getByText(/good boy/i)).toBeTruthy()
    expect(screen.queryByText('COPY')).toBeNull()
  })
})
