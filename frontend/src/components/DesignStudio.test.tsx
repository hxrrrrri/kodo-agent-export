import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import {
  DESIGN_STUDIO_STORAGE_KEY,
  DesignStudio,
  buildDesignSystemPrompt,
  buildKodoDesignModePrompt,
  buildPromptPlanItems,
  buildHandoffPrompt,
  buildChatMessagePayload,
  buildDesignFileTree,
  decodeDesignSharePayload,
  encodeDesignSharePayload,
  extractPlanItemsFromAssistant,
  extractFiles,
} from './DesignStudio'

function makeJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeSseResponse(events: Array<Record<string, unknown>>): Response {
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

  it('extracts filename-only fenced blocks and infers language', () => {
    const content = [
      '```pinterest-clone/index.html',
      '<!doctype html><html><body>Pins</body></html>',
      '```',
      '```pinterest-clone/styles.css',
      '.grid { display: grid; }',
      '```',
    ].join('\n')

    const files = extractFiles(content)
    expect(files.map((file) => file.name)).toEqual([
      'pinterest-clone/index.html',
      'pinterest-clone/styles.css',
    ])
    expect(files.map((file) => file.language)).toEqual(['html', 'css'])
  })

  it('repairs malformed doubled html tags from generated output', () => {
    const content = [
      '```html index.html',
      '<<!DOCTYPE html>',
      '<<htmlhtml lang="en">',
      '<<bodybody>',
      '<<hh1>Recovered</h1>',
      '</body>',
      '</html>',
      '```',
    ].join('\n')

    const files = extractFiles(content)
    expect(files).toHaveLength(1)
    expect(files[0].language).toBe('html')
    expect(files[0].content).toContain('<!DOCTYPE html>')
    expect(files[0].content).toContain('<html lang="en">')
    expect(files[0].content).toContain('<body>')
    expect(files[0].content).toContain('<h1>Recovered</h1>')
    expect(files[0].content).not.toContain('<<')
    expect(files[0].content).not.toContain('<htmlhtml')
  })

  it('detects malformed raw html fallback and normalizes it', () => {
    const raw = [
      '<<!DOCTYPE html>',
      '<<htmlhtml>',
      '<<bodybody>',
      '<<pp>Hello</p>',
      '</body>',
      '</html>',
    ].join('\n')

    const files = extractFiles(raw)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('index.html')
    expect(files[0].language).toBe('html')
    expect(files[0].content).toContain('<p>Hello</p>')
    expect(files[0].content).not.toContain('<<')
  })

  it('extracts plan items from flexible assistant plan formats', () => {
    const assistant = [
      '### TODO',
      '- [ ] Build the sticky top navigation',
      '- [ ] Implement responsive masonry card grid',
      '- [ ] Add hover states and keyboard focus styles',
      '',
      '```html index.html',
      '<html></html>',
      '```',
    ].join('\n')

    expect(extractPlanItemsFromAssistant(assistant)).toEqual([
      'Build the sticky top navigation',
      'Implement responsive masonry card grid',
      'Add hover states and keyboard focus styles',
    ])
  })

  it('builds a professional prompt-driven fallback plan', () => {
    const prompt = 'Create a Pinterest clone homepage with masonry cards, search bar, and profile chips'
    const plan = buildPromptPlanItems(prompt)

    expect(plan.length).toBeGreaterThanOrEqual(4)
    expect(plan[0]).toMatch(/Understand goals and constraints/i)
    expect(plan.join('\n')).toMatch(/Pinterest clone homepage/i)
  })

  it('extracts Kodo artifact fences as previewable design files', () => {
    const content = [
      '```artifact type=html id=ops-dashboard title="Ops Dashboard" version=1',
      '<!doctype html><html><body><main>Dashboard</main></body></html>',
      '```',
    ].join('\n')

    const files = extractFiles(content)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('index.html')
    expect(files[0].language).toBe('html')
    expect(files[0].content).toContain('Dashboard')
  })

  it('promotes plain html fences without filenames to index.html', () => {
    const content = [
      '## Plan',
      '1. Build the dashboard shell',
      '',
      '```html',
      '<!doctype html><html><body><main>Previewable</main></body></html>',
      '```',
    ].join('\n')

    const files = extractFiles(content)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('index.html')
    expect(files[0].language).toBe('html')
    expect(files[0].content).toContain('Previewable')
  })

  it('promotes unlabeled fenced html to index.html instead of response text', () => {
    const content = [
      '## Plan',
      '1. Build the dashboard shell',
      '',
      '```',
      '<!doctype html><html><body><main>Unlabeled</main></body></html>',
      '```',
    ].join('\n')

    const files = extractFiles(content)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('index.html')
    expect(files[0].language).toBe('html')
    expect(files[0].content).toContain('Unlabeled')
  })

  it('recovers an unclosed html fence as index.html', () => {
    const content = [
      '```html',
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head><style>body { background: #050510; color: white; }</style></head>',
      '<body><main>Still previewable while incomplete</main>',
    ].join('\n')

    const files = extractFiles(content)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('index.html')
    expect(files[0].language).toBe('html')
    expect(files[0].content).toContain('Still previewable')
    expect(files[0].content).not.toContain('```html')
  })

  it('recovers an unclosed blank fence with a leading filename line', () => {
    const content = [
      '## Plan',
      '- [ ] Build the page',
      '',
      '```',
      'index.html',
      '<!DOCTYPE html>',
      '<html><body><main>Filename line removed</main>',
    ].join('\n')

    const files = extractFiles(content)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('index.html')
    expect(files[0].language).toBe('html')
    expect(files[0].content).toContain('Filename line removed')
    expect(files[0].content).not.toContain('index.html\n')
  })

  it('extracts raw html documents even when the response includes a plan first', () => {
    const content = [
      '## Plan',
      '1. Build the dashboard shell',
      '',
      '<!doctype html><html><body><main>Raw document</main></body></html>',
    ].join('\n')

    const files = extractFiles(content)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('index.html')
    expect(files[0].language).toBe('html')
    expect(files[0].content).toContain('Raw document')
    expect(files[0].content).not.toContain('## Plan')
  })

  it('builds mode-specific design intelligence prompts', () => {
    const appPrompt = buildKodoDesignModePrompt('app')

    expect(appPrompt).toContain('Kodo Design Mode: App Prototype')
    expect(appPrompt).toMatch(/clickable app prototype/i)
    expect(appPrompt).toMatch(/Avoid AI-looking defaults/i)
  })

  it('builds advanced design-system prompts with fidelity and preset context', () => {
    const prompt = buildDesignSystemPrompt({
      brandName: 'Acme',
      presetId: 'claude',
      fidelity: 'production',
      direction: 'editorial-monocle',
      surface: 'saas-landing',
      motion: 'subtle',
      deviceFrame: 'browser-chrome',
      audience: 'developer founders',
      scale: 'landing page plus pricing',
      brandAssets: 'logo.svg and product screenshot',
      primaryColor: '#c96442',
      secondaryColor: '#141413',
      accentColor: '#c96442',
      fontFamily: 'Georgia, serif',
      borderRadius: 'md',
      style: 'minimal',
      customRules: 'No fake metrics.',
    })

    expect(prompt).toContain('Fidelity: production')
    expect(prompt).toContain('Claude')
    expect(prompt).toContain('Editorial Monocle')
    expect(prompt).toContain('developer founders')
  })

  it('keeps response-format instructions before selected-theme context', () => {
    const payload = buildChatMessagePayload(
      ['Kodo Creative Brief and Design System:\n- Design system preset: Coinbase'],
      'RESPONSE FORMAT - follow this exactly:\n',
      'Generate a landing page',
    )

    expect(payload.indexOf('RESPONSE FORMAT')).toBeLessThan(payload.indexOf('Kodo Creative Brief'))
    expect(payload).toContain('Generate a landing page')
  })

  it('encodes and decodes share payloads', () => {
    const payload = {
      version: 1,
      files: [
        { id: 'a', name: 'src/index.html', language: 'html', content: '<html></html>' },
      ],
      selectedFileId: 'a',
      viewMode: 'preview' as const,
      device: 'desktop' as const,
      inlineComments: [
        { id: 'c1', text: 'Move this card up', xPct: 42, yPct: 33, createdAt: Date.now(), resolved: false },
      ],
      shareAccess: 'comment' as const,
    }

    const encoded = encodeDesignSharePayload(payload)
    const decoded = decodeDesignSharePayload(encoded)

    expect(decoded).not.toBeNull()
    expect(decoded?.files[0].name).toBe('src/index.html')
    expect(decoded?.inlineComments[0].text).toContain('Move this card up')
    expect(decoded?.shareAccess).toBe('comment')
  })

  it('builds handoff prompt with fenced files', () => {
    const prompt = buildHandoffPrompt([
      { id: '1', name: 'index.html', language: 'html', content: '<main>Hello</main>' },
      { id: '2', name: 'styles.css', language: 'css', content: 'main { color: red; }' },
    ])

    expect(prompt).toContain('Implement this generated design')
    expect(prompt).toContain('```html index.html')
    expect(prompt).toContain('```css styles.css')
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

    const createFirstDesignButton = screen.queryByRole('button', { name: /Create your first design/i })
    if (createFirstDesignButton) {
      fireEvent.click(createFirstDesignButton)
    }

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

  it('sends after creating a project with a selected design system', async () => {
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ session_id: 'design-session-selected-system' }))
      .mockResolvedValueOnce(
        makeSseResponse([
          {
            type: 'text',
            content: [
              '## Plan',
              '1. Build selected-system landing page',
              '',
              '```html index.html',
              '<!doctype html><html><body><h1>Selected system</h1></body></html>',
              '```',
            ].join('\n'),
          },
        ]),
      )

    render(<DesignStudio onClose={() => {}} />)

    fireEvent.change(screen.getByDisplayValue(/AI & LLM \/ Claude/i), {
      target: { value: 'coinbase' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Create your first design/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByPlaceholderText(/Describe your design/i), {
      target: { value: 'Generate a crypto landing page' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/chat/send'))
    expect(sendCall).toBeTruthy()
    const body = JSON.parse(String(sendCall?.[1]?.body || '{}'))
    expect(body.message).toContain('Coinbase')
    expect(body.message).toContain('Generate a crypto landing page')
    expect(body.artifact_mode).toBe(false)
    expect(body.disable_tools).toBe(true)
  })

  it('compacts oversized selected design-system prompts before sending', async () => {
    storage['kodo.user.design.systems.v1'] = JSON.stringify([
      {
        id: 'user-long-theme',
        label: 'Huge Imported Theme',
        category: 'My Design Systems',
        colors: ['#ffffff', '#f8fafc', '#111827', '#64748b', '#2563eb'],
        displayFont: 'Inter, system-ui, sans-serif',
        bodyFont: 'Inter, system-ui, sans-serif',
        summary: 'Imported theme with a very large extracted ruleset.',
        prompt: `Use this imported theme. ${'token rule '.repeat(3000)}`,
        isUserDefined: true,
        createdAt: Date.now(),
      },
    ])

    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ session_id: 'design-session-long-system' }))
      .mockResolvedValueOnce(
        makeSseResponse([
          {
            type: 'text',
            content: [
              '## Plan',
              '1. Build imported-system page',
              '',
              '```html index.html',
              '<!doctype html><html><body><h1>Imported system</h1></body></html>',
              '```',
            ].join('\n'),
          },
        ]),
      )

    render(<DesignStudio onClose={() => {}} />)

    fireEvent.change(screen.getByDisplayValue(/AI & LLM \/ Claude/i), {
      target: { value: 'user-long-theme' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Create your first design/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByPlaceholderText(/Describe your design/i), {
      target: { value: 'Generate a website using the imported theme' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/chat/send'))
    expect(sendCall).toBeTruthy()
    const body = JSON.parse(String(sendCall?.[1]?.body || '{}'))
    expect(body.message.length).toBeLessThanOrEqual(7600)
    expect(body.message).toContain('Huge Imported Theme')
    expect(body.message).toContain('Generate a website using the imported theme')
  })

  it('shows streamed model errors instead of leaving an empty assistant response', async () => {
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ session_id: 'design-session-error' }))
      .mockResolvedValueOnce(
        makeSseResponse([
          { type: 'meta', session_id: 'design-session-error' },
          {
            type: 'todo_plan',
            todos: [
              { id: 'step-1', title: 'Understand the requested outcome', status: 'in_progress' },
            ],
          },
          { type: 'error', message: 'MODEL is not configured' },
        ]),
      )

    render(<DesignStudio onClose={() => {}} />)
    const createFirstDesignButton = screen.queryByRole('button', { name: /Create your first design/i })
    if (createFirstDesignButton) {
      fireEvent.click(createFirstDesignButton)
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByPlaceholderText(/Describe your design/i), {
      target: { value: 'Build a landing page' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }))

    await screen.findAllByText(/MODEL is not configured/i)
  })

  it('warns when the model returns a plan without generated code files', async () => {
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ session_id: 'design-session-plan-only' }))
      .mockResolvedValueOnce(
        makeSseResponse([
          {
            type: 'text',
            content: [
              '## Plan',
              '1. Define the layout',
              '2. Build the dashboard cards',
              '3. Add responsive states',
            ].join('\n'),
          },
        ]),
      )

    render(<DesignStudio onClose={() => {}} />)
    const createFirstDesignButton = screen.queryByRole('button', { name: /Create your first design/i })
    if (createFirstDesignButton) {
      fireEvent.click(createFirstDesignButton)
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByPlaceholderText(/Describe your design/i), {
      target: { value: 'Build a dashboard' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }))

    await screen.findByText(/returned text but no website\/app code files/i)
  })

  it('shows files from file_write tool events when assistant text has no fenced code', async () => {
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ session_id: 'design-session-tool-1' }))
      .mockResolvedValueOnce(
        makeSseResponse([
          {
            type: 'tool_start',
            tool: 'file_write',
            input: {
              path: 'index.html',
              content: '<!doctype html><html><body><h1>From tool</h1></body></html>',
            },
          },
          {
            type: 'text',
            content: 'Done. Website generated and saved to index.html',
          },
          {
            type: 'done',
            usage: { input_tokens: 1, output_tokens: 1, model: 'ollama' },
          },
        ]),
      )

    render(<DesignStudio onClose={() => {}} />)
    const createFirstDesignButton = screen.queryByRole('button', { name: /Create your first design/i })
    if (createFirstDesignButton) {
      fireEvent.click(createFirstDesignButton)
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByPlaceholderText(/Describe your design/i), {
      target: { value: 'Build a website' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }))

    await screen.findByText('index.html')
    expect(screen.queryByText('response.txt')).not.toBeInTheDocument()
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

    const restoredProject = screen.queryByText('Restored Project')
    if (restoredProject) {
      fireEvent.click(restoredProject)
    } else {
      const existingDesign = screen.queryByText('My First Design')
      if (existingDesign) {
        fireEvent.click(existingDesign)
      }
    }

    await screen.findByText('src')
    await screen.findByText('index.html')
    expect(screen.queryByText('Generating...')).not.toBeInTheDocument()
  })

  it('restores files from a selected generation in the project sessions tab', async () => {
    const now = Date.now()
    storage['kodo.ds.projects.v1'] = JSON.stringify([
      {
        id: 'proj-1',
        name: 'Demo Project',
        createdAt: now - 2000,
        updatedAt: now - 1000,
        fileNames: ['src/two.html'],
      },
    ])

    storage['kodo.ds.p.proj-1'] = JSON.stringify({
      id: 'proj-1',
      name: 'Demo Project',
      createdAt: now - 2000,
      updatedAt: now - 1000,
      messages: [
        { id: 'u1', role: 'user', content: 'Build first layout' },
        {
          id: 'a1',
          role: 'assistant',
          content: 'Generated first layout',
          files: [{ id: 'f1', name: 'src/one.html', language: 'html', content: '<html><body>One</body></html>' }],
        },
        { id: 'u2', role: 'user', content: 'Build second layout' },
        {
          id: 'a2',
          role: 'assistant',
          content: 'Generated second layout',
          files: [{ id: 'f2', name: 'src/two.html', language: 'html', content: '<html><body>Two</body></html>' }],
        },
      ],
      files: [{ id: 'f2', name: 'src/two.html', language: 'html', content: '<html><body>Two</body></html>' }],
      selectedFileId: 'f2',
      history: [],
      inlineComments: [],
      projectContext: '',
      shareAccess: 'edit',
      device: 'desktop',
      viewMode: 'code',
      fileTreeW: 200,
      chatW: 340,
      splitCodeW: 50,
      fileTreeOpen: true,
      expandedFolders: { src: true },
    })

    fetchMock.mockResolvedValueOnce(makeJsonResponse({ session_id: 'design-session-existing-project' }))

    render(<DesignStudio onClose={() => {}} />)

    fireEvent.click(screen.getByText('Demo Project'))

    await screen.findByText('src')
    await screen.findByText('two.html')

    fireEvent.click(screen.getByRole('button', { name: /SESSIONS/i }))
    fireEvent.click(screen.getAllByText(/Build first layout/i)[0])

    await screen.findByText('one.html')
  })
})
