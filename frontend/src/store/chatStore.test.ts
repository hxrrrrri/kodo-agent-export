import { beforeEach, describe, expect, it } from 'vitest'

import { useChatStore } from './chatStore'

describe('chatStore', () => {
	beforeEach(() => {
		useChatStore.setState({
			messages: [],
			messageSearchQuery: '',
			theme: 'dark',
			checkpoints: [],
		})
	})

	it('setMessageSearchQuery updates messageSearchQuery', () => {
		useChatStore.getState().setMessageSearchQuery('hello')
		expect(useChatStore.getState().messageSearchQuery).toBe('hello')
	})

	it('setTheme switches among supported themes', () => {
		useChatStore.getState().setTheme('claude')
		expect(useChatStore.getState().theme).toBe('claude')
		useChatStore.getState().setTheme('dark')
		expect(useChatStore.getState().theme).toBe('dark')
	})

	it('addMessage appends to messages array', () => {
		const msg = {
			id: 'test-1',
			role: 'user' as const,
			content: 'hello',
			timestamp: Date.now(),
		}
		useChatStore.getState().addMessage(msg)
		expect(useChatStore.getState().messages).toHaveLength(1)
		expect(useChatStore.getState().messages[0].content).toBe('hello')
	})

	it('clearMessages empties messages array', () => {
		useChatStore.setState({
			messages: [{ id: '1', role: 'user', content: 'a', timestamp: 1 }],
		})
		useChatStore.getState().clearMessages()
		expect(useChatStore.getState().messages).toHaveLength(0)
	})

	it('updateLastMessage modifies only the last message', () => {
		useChatStore.setState({
			messages: [
				{ id: '1', role: 'user', content: 'first', timestamp: 1 },
				{ id: '2', role: 'assistant', content: 'second', timestamp: 2 },
			],
		})
		useChatStore.getState().updateLastMessage((m) => ({ ...m, content: 'updated' }))
		const msgs = useChatStore.getState().messages
		expect(msgs[0].content).toBe('first')
		expect(msgs[1].content).toBe('updated')
	})
})
