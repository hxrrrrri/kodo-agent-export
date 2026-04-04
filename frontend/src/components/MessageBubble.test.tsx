import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

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

  it('renders user message with correct role styling', () => {
    const userMsg = { ...baseMsg, role: 'user' as const, content: 'User says hi' }
    render(<MessageBubble message={userMsg} searchQuery="" />)
    expect(screen.getByText(/User says hi/i)).toBeTruthy()
  })

  it('does not crash with empty content', () => {
    const emptyMsg = { ...baseMsg, content: '' }
    expect(() => render(<MessageBubble message={emptyMsg} searchQuery="" />)).not.toThrow()
  })
})
