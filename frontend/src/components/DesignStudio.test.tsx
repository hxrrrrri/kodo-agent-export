import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import {
  DESIGN_STUDIO_STORAGE_KEY,
  DesignStudio,
  buildDesignFileTree,
  extractFiles,
} from './DesignStudio'

function makeJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeSseResponse(events: Array<{ type: string; content: string }>): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        const line = `data: ${JSON.stringify(event)}\n`
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('DesignStudio helpers', () => {
  it('extracts code blocks with nested file paths and builds a folder tree', () => {
    const content = [
      '```html src/index.html',
      '<html><body>Hello</body></html>',
      '```',
      '```css src/styles/main.css',
      'body { color: red; }',
      '```',
      '```js src/main.js',
      'console.log("ok")',
      '```',
    ].join('\n')

    const files = extractFiles(content)
    expect(files.map((file) => file.name)).toEqual([
      'src/index.html',
      'src/styles/main.css',
      'src/main.js',
    ])

    const tree = buildDesignFileTree(files)
    expect(tree).toHaveLength(1)
    expect(tree[0].type).toBe('folder')
    expect(tree[0].name).toBe('src')

    const srcChildren = tree[0].children || []
    expect(srcChildren.some((node) => node.type === 'file' && node.name === 'index.html')).toBe(true)
    expect(srcChildren.some((node) => node.type === 'folder' && node.name === 'styles')).toBe(true)
  })
})

describe('DesignStudio smoke', () => {
  const fetchMock = vi.fn()
  const requestFullscreenMock = vi.fn().mockResolvedValue(undefined)
  let storage: Record<string, string>

  beforeEach(() => {
    storage = {}
    fetchMock.mockReset()
    requestFullscreenMock.mockClear()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => (key in storage ? storage[key] : null)),
        setItem: vi.fn((key: string, value: string) => { storage[key] = String(value) }),
        removeItem: vi.fn((key: string) => { delete storage[key] }),
        clear: vi.fn(() => {
          Object.keys(storage).forEach((key) => { delete storage[key] })
        }),
      },
    })
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreenMock,
    })
  })

  it('renders generated files as a nested tree and supports split resize + fullscreen', async () => {
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ session_id: 'design-session-1' }))
      .mockResolvedValueOnce(
        makeSseResponse([
          {
            type: 'text',
            content: [
              '```html src/index.html',
              '<!doctype html><html><body>Preview</body></html>',
              '```',
              '',
              '```css src/styles/main.css',
              'body { font-family: sans-serif; }',
              '```',
            ].join('\n'),
          },
        ]),
      )

    render(<DesignStudio onClose={() => {}} />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByPlaceholderText(/Describe your design/i), {
      target: { value: 'Create a simple app shell' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }))

    await screen.findByText('src')
    await screen.findByText('index.html')
    await screen.findByText('styles')

    fireEvent.click(screen.getByRole('button', { name: /^Split$/i }))

    const splitHandle = document.querySelector('[data-handle="split"]') as HTMLElement | null
    const splitCodePane = document.querySelector('[data-pane="split-code"]') as HTMLElement | null

    expect(splitHandle).not.toBeNull()
    expect(splitCodePane).not.toBeNull()

    const initialWidth = splitCodePane?.style.width || ''

    if (splitHandle) {
      fireEvent.mouseDown(splitHandle, { clientX: 420 })
      fireEvent.mouseMove(window, { clientX: 620 })
      fireEvent.mouseUp(window)
    }

    expect(splitCodePane?.style.width || '').not.toBe(initialWidth)

    fireEvent.click(screen.getByTitle('Toggle fullscreen'))
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1)
  })

  it('rehydrates generated files from persisted state on reload', async () => {
    storage[DESIGN_STUDIO_STORAGE_KEY] = JSON.stringify({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '```html src/index.html\n<html><body>Persisted</body></html>\n```',
          isStreaming: true,
          files: [
            { id: 'file-1', name: 'src/index.html', language: 'html', content: '<html><body>Persisted</body></html>' },
          ],
        },
      ],
      files: [
        { id: 'file-1', name: 'src/index.html', language: 'html', content: '<html><body>Persisted</body></html>' },
      ],
      selectedFileId: 'file-1',
      history: [
        {
          timestamp: Date.now() - 1000,
          files: [
            { id: 'file-1', name: 'src/index.html', language: 'html', content: '<html><body>Persisted</body></html>' },
          ],
        },
      ],
      device: 'desktop',
      viewMode: 'code',
      fileTreeW: 200,
      chatW: 340,
      splitCodeW: 50,
      fileTreeOpen: true,
      expandedFolders: { src: true },
      updatedAt: Date.now(),
    })

    fetchMock.mockResolvedValueOnce(makeJsonResponse({ session_id: 'design-session-2' }))

    render(<DesignStudio onClose={() => {}} />)

    await screen.findByText('src')
    await screen.findByText('index.html')
    expect(screen.queryByText('Generating...')).not.toBeInTheDocument()
  })
})
