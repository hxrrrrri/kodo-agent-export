import {
  useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import {
  X, Monitor, Tablet, Smartphone, Download, RefreshCw,
  Upload, Send, Trash2, Eye, Code, File as FileIcon,
  ExternalLink, Wand2, SplitSquareHorizontal, Maximize2,
  Minimize2, ChevronRight, ChevronDown, RotateCcw, Copy,
  Folder, FolderOpen, Loader,
} from 'lucide-react'
import { buildApiHeaders } from '../lib/api'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

const API = '/api/chat'
export const DESIGN_STUDIO_STORAGE_KEY = 'kodo.design-studio.state.v1'
const MAX_PERSISTED_MESSAGES = 40
const MAX_PERSISTED_HISTORY = 20

// ─── Types ──────────────────────────────────────────────────────────────────

type DeviceMode = 'desktop' | 'tablet' | 'mobile'
type ViewMode = 'preview' | 'code' | 'split'

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: '100%', tablet: '768px', mobile: '390px',
}

const DEVICE_HEIGHTS: Record<DeviceMode, string | number> = {
  desktop: '100%', tablet: 700, mobile: 760,
}

export interface DesignFile {
  id: string
  name: string
  language: string
  content: string
}

interface DesignMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  files?: DesignFile[]
}

interface UploadedAsset {
  id: string
  name: string
  size: number
  type: string
  dataUrl: string
}

interface HistoryEntry {
  files: DesignFile[]
  timestamp: number
}

interface PersistedDesignStudioState {
  messages: DesignMessage[]
  files: DesignFile[]
  selectedFileId: string | null
  history: HistoryEntry[]
  device: DeviceMode
  viewMode: ViewMode
  fileTreeW: number
  chatW: number
  splitCodeW: number
  fileTreeOpen: boolean
  expandedFolders: Record<string, boolean>
  updatedAt: number
}

export interface DesignFileTreeNode {
  type: 'folder' | 'file'
  name: string
  path: string
  file?: DesignFile
  children?: DesignFileTreeNode[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 11) }

function toDesignFile(value: unknown): DesignFile | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<DesignFile>
  const name = typeof candidate.name === 'string' ? normalizeDesignPath(candidate.name) : ''
  const content = typeof candidate.content === 'string' ? candidate.content : ''
  if (!name || !content.trim()) return null
  const language = typeof candidate.language === 'string' && candidate.language.trim()
    ? candidate.language
    : (name.split('.').pop() || 'text')
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : genId()
  return { id, name, language, content }
}

function toDesignMessage(value: unknown): DesignMessage | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<DesignMessage>
  const role = candidate.role === 'assistant' || candidate.role === 'user' ? candidate.role : null
  const content = typeof candidate.content === 'string' ? candidate.content : ''
  if (!role) return null
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : genId()
  const files = Array.isArray(candidate.files)
    ? candidate.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
    : undefined
  return {
    id,
    role,
    content,
    isStreaming: false,
    files: files && files.length > 0 ? files : undefined,
  }
}

function clampWidth(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function loadPersistedDesignStudioState(): PersistedDesignStudioState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DESIGN_STUDIO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedDesignStudioState>
    if (!parsed || typeof parsed !== 'object') return null

    const files = Array.isArray(parsed.files)
      ? parsed.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
      : []
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.map(toDesignMessage).filter((m): m is DesignMessage => m !== null)
      : []
    const history = Array.isArray(parsed.history)
      ? parsed.history
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Partial<HistoryEntry>
          const rowFiles = Array.isArray(row.files)
            ? row.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
            : []
          if (rowFiles.length === 0) return null
          const timestamp = typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)
            ? row.timestamp
            : Date.now()
          return { files: rowFiles, timestamp }
        })
        .filter((entry): entry is HistoryEntry => entry !== null)
      : []

    const selectedFileId = typeof parsed.selectedFileId === 'string' ? parsed.selectedFileId : null
    const selectedExists = selectedFileId ? files.some((f) => f.id === selectedFileId) : false
    const normalizedSelected = selectedExists ? selectedFileId : (files[0]?.id ?? null)

    const device: DeviceMode = parsed.device === 'tablet' || parsed.device === 'mobile' ? parsed.device : 'desktop'
    const viewMode: ViewMode = parsed.viewMode === 'preview' || parsed.viewMode === 'code' || parsed.viewMode === 'split'
      ? parsed.viewMode
      : 'preview'
    const expandedFolders = (() => {
      if (!parsed.expandedFolders || typeof parsed.expandedFolders !== 'object') return {}
      const output: Record<string, boolean> = {}
      for (const [key, value] of Object.entries(parsed.expandedFolders)) {
        if (typeof value === 'boolean') output[key] = value
      }
      return output
    })()

    return {
      messages: messages.slice(-MAX_PERSISTED_MESSAGES),
      files,
      selectedFileId: normalizedSelected,
      history: history.slice(-MAX_PERSISTED_HISTORY),
      device,
      viewMode,
      fileTreeW: clampWidth(parsed.fileTreeW, 140, 420, 200),
      chatW: clampWidth(parsed.chatW, 260, 560, 340),
      splitCodeW: clampWidth(parsed.splitCodeW, 25, 75, 50),
      fileTreeOpen: typeof parsed.fileTreeOpen === 'boolean' ? parsed.fileTreeOpen : true,
      expandedFolders,
      updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

function normalizeDesignPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim()
}

function getFolderPathChain(filePath: string): string[] {
  const normalized = normalizeDesignPath(filePath)
  if (!normalized) return []
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return []

  const folders: string[] = []
  for (let i = 0; i < parts.length - 1; i += 1) {
    folders.push(parts.slice(0, i + 1).join('/'))
  }
  return folders
}

function compareTreeNodes(a: DesignFileTreeNode, b: DesignFileTreeNode): number {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function buildDesignFileTree(files: DesignFile[]): DesignFileTreeNode[] {
  const root: DesignFileTreeNode = { type: 'folder', name: '', path: '', children: [] }

  for (const rawFile of files) {
    const normalizedName = normalizeDesignPath(rawFile.name) || rawFile.name
    const file = { ...rawFile, name: normalizedName }
    const parts = normalizedName.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let cursor = root
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      const isLeaf = i === parts.length - 1
      const nextPath = cursor.path ? `${cursor.path}/${part}` : part
      if (!cursor.children) cursor.children = []

      if (isLeaf) {
        const existingFile = cursor.children.find(
          (node) => node.type === 'file' && node.path === nextPath,
        )
        if (existingFile) {
          existingFile.file = file
          existingFile.name = part
        } else {
          cursor.children.push({ type: 'file', name: part, path: nextPath, file })
        }
        continue
      }

      let folder = cursor.children.find(
        (node) => node.type === 'folder' && node.path === nextPath,
      )
      if (!folder) {
        folder = { type: 'folder', name: part, path: nextPath, children: [] }
        cursor.children.push(folder)
      }
      cursor = folder
    }
  }

  const sortTree = (nodes: DesignFileTreeNode[]): DesignFileTreeNode[] =>
    [...nodes]
      .sort(compareTreeNodes)
      .map((node) => {
        if (node.type === 'folder' && node.children) {
          return { ...node, children: sortTree(node.children) }
        }
        return node
      })

  return sortTree(root.children || [])
}


const LANG_EXT: Record<string, string> = {
  html: 'html', css: 'css', javascript: 'js', js: 'js',
  typescript: 'ts', ts: 'ts', jsx: 'jsx', tsx: 'tsx',
  json: 'json', svg: 'svg', markdown: 'md', md: 'md',
  python: 'py', shell: 'sh', bash: 'sh',
}

const FILE_ICONS: Record<string, string> = {
  html: '🌐', css: '🎨', js: '⚡', ts: '🔷', jsx: '⚛', tsx: '⚛',
  json: '{}', svg: '🖼', md: '📝', py: '🐍', sh: '⚙',
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || '📄'
}

export function extractFiles(content: string): DesignFile[] {
  // [^\S\n]+ = horizontal whitespace only (no newlines), so the optional filename
  // doesn't consume the newline that separates the lang tag from code content.
  const re = /```(\w+)(?:[^\S\n]+([^\n`]+))?\n([\s\S]*?)```/g
  const files: DesignFile[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  let idx = 0

  while ((m = re.exec(content)) !== null) {
    const lang = m[1].toLowerCase()
    if (!LANG_EXT[lang] && !['html', 'css', 'js', 'jsx', 'ts', 'tsx', 'svg', 'json'].includes(lang)) continue
    const ext = LANG_EXT[lang] || lang
    const rawName = (m[2] || '').trim()
    let name = rawName
    if (!name) {
      idx += 1
      name = `file-${idx}.${ext}`
    }
    name = normalizeDesignPath(name) || name
    const code = m[3] || ''
    if (!code.trim()) continue
    const dedupeKey = name.toLowerCase()
    if (seen.has(dedupeKey)) {
      const existing = files.find(f => f.name.toLowerCase() === dedupeKey)
      if (existing) existing.content = code
    } else {
      seen.add(dedupeKey)
      files.push({ id: genId(), name, language: lang, content: code })
    }
  }

  // Fallback: treat raw HTML (no code fence) as index.html
  if (files.length === 0) {
    const trimmed = content.trim()
    const lower = trimmed.toLowerCase()
    if (lower.startsWith('<!doctype') || lower.startsWith('<html')) {
      files.push({ id: genId(), name: 'index.html', language: 'html', content: trimmed })
    }
  }

  return files
}

function buildPreviewHtml(files: DesignFile[]): string {
  const htmlFile = files.find(f => f.language === 'html' || f.name.endsWith('.html'))
  const cssFiles = files.filter(f => (f.language === 'css' || f.name.endsWith('.css')) && f !== htmlFile)
  const jsFiles = files.filter(f => ['javascript', 'js', 'jsx'].includes(f.language) || f.name.match(/\.(js|jsx)$/))

  if (htmlFile) {
    let html = htmlFile.content
    // Inject external CSS/JS files
    const cssInject = cssFiles.map(f => `<style>/* ${f.name} */\n${f.content}</style>`).join('\n')
    const jsInject = jsFiles.map(f => `<script>/* ${f.name} */\n${f.content}</script>`).join('\n')
    html = html.replace('</head>', `${cssInject}\n</head>`)
    html = html.replace('</body>', `${jsInject}\n</body>`)
    return html
  }

  if (files.length === 1 && files[0].language === 'svg') {
    return `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff">${files[0].content}</body></html>`
  }

  // Wrap loose CSS/JS in an HTML shell
  const css = cssFiles.map(f => f.content).join('\n')
  const js = jsFiles.map(f => f.content).join('\n')
  return `<!DOCTYPE html><html><head><style>${css}</style></head><body>${js ? `<script>${js}</script>` : ''}</body></html>`
}

function summarizeAssistantContent(content: string): string {
  // Replace complete code blocks with a short badge; leave incomplete (streaming) ones as-is
  return content.replace(/```(\w+)(?:[^\S\n]+[^\n`]*)?\n[\s\S]*?```/g, (_, lang) => `[${lang.toUpperCase()} generated]`)
}

const STARTERS = [
  { icon: '🌐', label: 'Landing page', prompt: 'Build a stunning SaaS landing page with hero, features grid, pricing, and CTA — modern dark theme' },
  { icon: '📊', label: 'Dashboard', prompt: 'Create a responsive admin dashboard with sidebar nav, KPI cards, charts (use SVG), and dark mode' },
  { icon: '🛍', label: 'Product grid', prompt: 'Design a product card grid with hover animations, filters, and cart — e-commerce style' },
  { icon: '💼', label: 'Portfolio', prompt: 'Build a developer portfolio page with glassmorphism, animated hero, project cards, and contact form' },
  { icon: '💳', label: 'Pricing table', prompt: 'Create an animated pricing table with 3 tiers, feature comparison, toggle, highlighted plan' },
  { icon: '📝', label: 'Blog', prompt: 'Design a minimal blog layout with header, article cards, sidebar, and dark/light mode toggle' },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function DragHandle({ onDrag, handleId }: { onDrag: (delta: number) => void; handleId?: string }) {
  const dragging = useRef(false)
  const last = useRef(0)

  const onMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault()
    dragging.current = true
    last.current = e.clientX

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onDrag(ev.clientX - last.current)
      last.current = ev.clientX
    }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      data-handle={handleId}
      style={{
        width: 5, flexShrink: 0, cursor: 'col-resize',
        background: 'var(--border)', transition: 'background 120ms',
        zIndex: 1,
      }}
      onMouseEnter={e => { (e.target as HTMLDivElement).style.background = 'var(--accent)' }}
      onMouseLeave={e => { (e.target as HTMLDivElement).style.background = 'var(--border)' }}
    />
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = { onClose: () => void }

export function DesignStudio({ onClose }: Props) {
  // Panel widths (px)
  const containerRef = useRef<HTMLDivElement>(null)
  const [fileTreeW, setFileTreeW] = useState(200)
  const [chatW, setChatW] = useState(340)
  const [splitCodeW, setSplitCodeW] = useState(50)

  // Design state
  const [messages, setMessages] = useState<DesignMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [files, setFiles] = useState<DesignFile[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [assets, setAssets] = useState<UploadedAsset[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [fileTreeOpen, setFileTreeOpen] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const persisted = loadPersistedDesignStudioState()
    if (!persisted) {
      setHydrated(true)
      return
    }

    setMessages(persisted.messages)
    setFiles(persisted.files)
    setSelectedFileId(persisted.selectedFileId)
    setHistory(persisted.history)
    setDevice(persisted.device)
    setViewMode(persisted.viewMode)
    setFileTreeW(persisted.fileTreeW)
    setChatW(persisted.chatW)
    setSplitCodeW(persisted.splitCodeW)
    setFileTreeOpen(persisted.fileTreeOpen)
    setExpandedFolders(persisted.expandedFolders)

    if (persisted.files.length > 0) {
      setPreviewHtml(buildPreviewHtml(persisted.files))
      setRefreshKey((k) => k + 1)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return

    const persistedMessages = messages
      .slice(-MAX_PERSISTED_MESSAGES)
      .map((message) => ({
        ...message,
        isStreaming: false,
        files: message.files?.map((file) => ({ ...file })),
      }))

    const payload: PersistedDesignStudioState = {
      messages: persistedMessages,
      files,
      selectedFileId,
      history: history.slice(-MAX_PERSISTED_HISTORY),
      device,
      viewMode,
      fileTreeW,
      chatW,
      splitCodeW,
      fileTreeOpen,
      expandedFolders,
      updatedAt: Date.now(),
    }

    try {
      window.localStorage.setItem(DESIGN_STUDIO_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore persistence quota errors and continue the current session in memory.
    }
  }, [hydrated, messages, files, selectedFileId, history, device, viewMode, fileTreeW, chatW, splitCodeW, fileTreeOpen, expandedFolders])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Init session
  useEffect(() => {
    fetch(`${API}/new-session`, { method: 'POST', headers: buildApiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.session_id) setSessionId(String(d.session_id)) })
      .catch(() => { /* ignore */ })
    return () => { abortRef.current?.abort() }
  }, [])

  // Fullscreen API
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!previewContainerRef.current || typeof previewContainerRef.current.requestFullscreen !== 'function') return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void previewContainerRef.current.requestFullscreen()
    }
  }, [])

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    setError(null)
    setInput('')

    const isFirst = messagesRef.current.length === 0
    const prefix = isFirst
      ? 'You are a UI/UX design assistant. Output complete, self-contained HTML with embedded CSS and JS. Designs must be visually stunning, modern, and responsive. Put HTML in ```html filename.html blocks. You may also use separate ```css and ```js blocks with filenames. Never reference external files not in the response.\n\n'
      : ''
    const fullMsg = prefix + trimmed

    const uid = genId()
    const aid = genId()
    setMessages(prev => [
      ...prev,
      { id: uid, role: 'user', content: trimmed },
      { id: aid, role: 'assistant', content: '', isStreaming: true },
    ])
    setIsLoading(true)

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    let sid = sessionId
    if (!sid) {
      try {
        const r = await fetch(`${API}/new-session`, { method: 'POST', headers: buildApiHeaders() })
        if (r.ok) { const d = await r.json(); sid = String(d.session_id || ''); setSessionId(sid) }
      } catch { /* ignore */ }
    }

    try {
      const res = await fetch(`${API}/send`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session_id: sid, message: fullMsg, project_dir: null, mode: 'execute', artifact_mode: true }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`
        try { const d = await res.json(); detail = d.detail || detail } catch { /* */ }
        throw new Error(detail)
      }
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = '', acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const ev = JSON.parse(raw)
            if (ev.type === 'text') {
              acc += String(ev.content || '')
              setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: acc } : m))
            }
          } catch { /* */ }
        }
      }

      // Parse files and update preview after streaming completes
      const extracted = extractFiles(acc)
      if (extracted.length > 0) {
        setFiles(extracted)
        setSelectedFileId(extracted[0].id)
        const html = buildPreviewHtml(extracted)
        setPreviewHtml(html)
        setRefreshKey(k => k + 1)
        setHistory(prev => [...prev, { files: extracted, timestamp: Date.now() }])
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, files: extracted } : m))
      } else if (acc.trim()) {
        // No code blocks found — show raw response as a fallback text file so
        // the user can see what the model actually returned
        const fallback: DesignFile = { id: genId(), name: 'response.txt', language: 'text', content: acc }
        setFiles([fallback])
        setSelectedFileId(fallback.id)
        setViewMode('code')
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      const msg = String(e)
      setError(msg)
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `Error: ${msg}`, isStreaming: false } : m))
    } finally {
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, isStreaming: false } : m))
      setIsLoading(false)
    }
  }, [isLoading, sessionId])

  const restoreHistory = (entry: HistoryEntry) => {
    setFiles(entry.files)
    setSelectedFileId(entry.files[0]?.id ?? null)
    setPreviewHtml(buildPreviewHtml(entry.files))
    setRefreshKey(k => k + 1)
  }

  const handleAssetUpload = async (list: FileList | null) => {
    if (!list) return
    const next: UploadedAsset[] = []
    for (const f of Array.from(list)) {
      const dataUrl = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f)
      })
      next.push({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl })
    }
    setAssets(prev => [...prev, ...next])
  }

  const downloadFile = (f: DesignFile) => {
    const blob = new Blob([f.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = f.name; a.click()
    URL.revokeObjectURL(url)
  }

  const downloadAll = () => {
    if (previewHtml) {
      const blob = new Blob([previewHtml], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'design.html'; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const openInTab = () => {
    if (!previewHtml) return
    const blob = new Blob([previewHtml], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const copyCode = async () => {
    const sel = files.find(f => f.id === selectedFileId)
    if (!sel) return
    await navigator.clipboard.writeText(sel.content)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const selectedFile = files.find(f => f.id === selectedFileId) ?? files[0] ?? null
  const fileTree = useMemo(() => buildDesignFileTree(files), [files])

  useEffect(() => {
    if (!selectedFile) return
    const folderChain = getFolderPathChain(selectedFile.name)
    if (folderChain.length === 0) return
    setExpandedFolders((prev) => {
      const next = { ...prev }
      for (const path of folderChain) {
        next[path] = true
      }
      return next
    })
  }, [selectedFile])

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: prev[path] === false,
    }))
  }

  const handleSelectFile = (file: DesignFile) => {
    setSelectedFileId(file.id)
    if (viewMode === 'preview') setViewMode('code')
  }

  const handleSplitDrag = (delta: number) => {
    const container = splitContainerRef.current
    if (!container) return
    const deltaPercent = (delta / container.clientWidth) * 100
    setSplitCodeW((prev) => Math.max(25, Math.min(75, prev + deltaPercent)))
  }

  const renderTreeNodes = (nodes: DesignFileTreeNode[], depth = 0): JSX.Element[] => {
    const rowPaddingLeft = 10 + depth * 14
    return nodes.map((node) => {
      if (node.type === 'folder') {
        const isOpen = expandedFolders[node.path] !== false
        return (
          <div key={`folder-${node.path}`}>
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                width: '100%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: `4px 8px 4px ${rowPaddingLeft}px`,
                color: 'var(--text-2)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                textAlign: 'left',
              }}
              title={node.path}
            >
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {isOpen ? <FolderOpen size={12} /> : <Folder size={12} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            </button>
            {isOpen && node.children && renderTreeNodes(node.children, depth + 1)}
          </div>
        )
      }

      const file = node.file
      if (!file) return <div key={`file-${node.path}`} />
      return (
        <div
          key={file.id}
          onClick={() => handleSelectFile(file)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: `5px 10px 5px ${rowPaddingLeft + 14}px`, cursor: 'pointer',
            background: selectedFileId === file.id ? 'var(--bg-3)' : 'transparent',
            borderLeft: selectedFileId === file.id ? '2px solid var(--accent)' : '2px solid transparent',
            fontSize: 11, color: selectedFileId === file.id ? 'var(--text-0)' : 'var(--text-1)',
            fontFamily: 'var(--font-mono)',
          }}
          title={file.name}
        >
          <span style={{ fontSize: 13, flexShrink: 0 }}>{getFileIcon(file.name)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={e => { e.stopPropagation(); downloadFile(file) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 0, opacity: 0.6 }}
            title={`Download ${file.name}`}
          >
            <Download size={10} />
          </button>
        </div>
      )
    })
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const btn = (active: boolean, accent = false) => ({
    display: 'flex', alignItems: 'center' as const, gap: 4,
    padding: '3px 8px', borderRadius: 5,
    border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
    background: active ? (accent ? 'var(--accent)' : 'var(--bg-3)') : 'transparent',
    color: active ? (accent ? '#fff' : 'var(--text-0)') : 'var(--text-2)',
    fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
    whiteSpace: 'nowrap' as const, flexShrink: 0 as const,
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-0)', animation: 'fadeIn 0.15s ease',
    }} ref={containerRef}>

      {/* ══ TOP BAR ══════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 12px', height: 48,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)', flexShrink: 0,
      }}>
        <Wand2 size={15} color="var(--accent)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)', marginRight: 4 }}>Design Studio</span>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* View mode */}
        <button type="button" style={btn(viewMode === 'preview')} onClick={() => setViewMode('preview')}><Eye size={11} />Preview</button>
        <button type="button" style={btn(viewMode === 'code')} onClick={() => setViewMode('code')}><Code size={11} />Code</button>
        <button type="button" style={btn(viewMode === 'split')} onClick={() => setViewMode('split')}><SplitSquareHorizontal size={11} />Split</button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Device */}
        <button type="button" style={btn(device === 'desktop')} onClick={() => setDevice('desktop')} title="Desktop"><Monitor size={12} /></button>
        <button type="button" style={btn(device === 'tablet')} onClick={() => setDevice('tablet')} title="Tablet"><Tablet size={12} /></button>
        <button type="button" style={btn(device === 'mobile')} onClick={() => setDevice('mobile')} title="Mobile"><Smartphone size={12} /></button>

        {/* History */}
        {history.length > 1 && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>v{history.length}</span>
            <button type="button" style={btn(false)} onClick={() => restoreHistory(history[history.length - 2])} title="Undo to previous version">
              <RotateCcw size={11} />
            </button>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Actions */}
        {previewHtml && (
          <>
            <button type="button" style={btn(false)} onClick={() => setRefreshKey(k => k + 1)} title="Refresh"><RefreshCw size={12} /></button>
            <button type="button" style={btn(false)} onClick={openInTab} title="Open in new tab"><ExternalLink size={12} /></button>
            <button type="button" style={btn(false)} onClick={downloadAll} title="Download HTML"><Download size={12} /></button>
          </>
        )}
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button type="button" style={btn(false)} onClick={onClose} title="Close"><X size={14} /></button>
      </div>

      {/* ══ BODY ══════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* ── FILE TREE ─────────────────────────────────────────────────────── */}
        <div style={{
          width: fileTreeOpen ? fileTreeW : 36,
          minWidth: fileTreeOpen ? 140 : 36,
          flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-1)',
          transition: 'width 0.15s ease',
          overflow: 'hidden',
        }}>
          {/* Tree header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 8px', height: 36, borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <button type="button" onClick={() => setFileTreeOpen(o => !o)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-2)', display: 'flex', alignItems: 'center', padding: 2,
            }}>
              {fileTreeOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {fileTreeOpen && (
              <>
                <FolderOpen size={12} color="var(--accent)" />
                <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>FILES</span>
                <div style={{ flex: 1 }} />
                <button type="button" style={{ ...btn(false), padding: '2px 4px' }}
                  onClick={() => fileInputRef.current?.click()} title="Upload asset">
                  <Upload size={11} />
                </button>
              </>
            )}
          </div>

          {/* Generated files */}
          {fileTreeOpen && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {fileTree.length === 0 && (
                <div style={{ padding: '12px 12px', fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                  Generated files will appear here
                </div>
              )}
              {renderTreeNodes(fileTree)}

              {/* Uploaded assets */}
              {assets.length > 0 && (
                <>
                  <div style={{ padding: '8px 10px 4px', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                    ASSETS
                  </div>
                  {assets.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', fontSize: 11, color: 'var(--text-1)', fontFamily: 'var(--font-mono)',
                    }}>
                      <span style={{ fontSize: 13 }}>{a.type.startsWith('image/') ? '🖼' : '📎'}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <button type="button" onClick={() => setAssets(prev => prev.filter(x => x.id !== a.id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 0 }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* History */}
              {history.length > 0 && (
                <>
                  <div style={{ padding: '8px 10px 4px', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                    HISTORY
                  </div>
                  {[...history].reverse().map((h, i) => (
                    <div key={h.timestamp} onClick={() => restoreHistory(h)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', cursor: 'pointer', fontSize: 10,
                        color: i === 0 ? 'var(--accent)' : 'var(--text-2)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                      <RotateCcw size={10} />
                      v{history.length - i} — {new Date(h.timestamp).toLocaleTimeString()}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {fileTreeOpen && (
          <DragHandle handleId="file-tree" onDrag={d => setFileTreeW(w => Math.max(140, Math.min(420, w + d)))} />
        )}

        {/* ── CENTER: PREVIEW / CODE ─────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Center toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 10px', height: 36, borderBottom: '1px solid var(--border)',
            background: 'var(--bg-0)', flexShrink: 0,
          }}>
            {selectedFile && (
              <span style={{ fontSize: 11, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {getFileIcon(selectedFile.name)} {selectedFile.name}
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  · {selectedFile.content.split('\n').length} lines
                </span>
              </span>
            )}
            <div style={{ flex: 1 }} />
            {(viewMode === 'code' || viewMode === 'split') && selectedFile && (
              <button type="button" style={btn(copied)} onClick={copyCode} title="Copy code">
                <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            {(viewMode === 'preview' || viewMode === 'split') && previewHtml && (
              <button type="button" style={btn(isFullscreen)} onClick={toggleFullscreen} title="Toggle fullscreen">
                {isFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
            )}
          </div>

          {/* Content */}
          {!previewHtml && files.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-2)', gap: 10,
            }}>
              <Wand2 size={36} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 13, opacity: 0.6 }}>Preview will appear here</div>
              <div style={{ fontSize: 11, opacity: 0.35 }}>Describe your design in the chat →</div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {viewMode === 'split' ? (
                <div
                  ref={splitContainerRef}
                  style={{
                    height: '100%',
                    minHeight: 0,
                    display: 'flex',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    width: `${splitCodeW}%`,
                    minWidth: 240,
                    maxWidth: '75%',
                    overflow: 'auto',
                    flexShrink: 0,
                  }} data-pane="split-code">
                    {selectedFile ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={selectedFile.language || 'text'}
                        PreTag="div"
                        customStyle={{
                          margin: 0, borderRadius: 0, background: '#06060e',
                          fontSize: 12, padding: '14px 16px', minHeight: '100%', lineHeight: 1.65,
                        }}
                      >
                        {selectedFile.content}
                      </SyntaxHighlighter>
                    ) : (
                      <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 12 }}>Select a file</div>
                    )}
                  </div>

                  <DragHandle handleId="split" onDrag={handleSplitDrag} />

                  <div
                    ref={previewContainerRef}
                    data-pane="split-preview"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: device === 'desktop' ? 'stretch' : 'flex-start',
                      justifyContent: 'center',
                      background: device !== 'desktop' ? '#d8d8d8' : '#efefef',
                      overflow: 'auto',
                      padding: device !== 'desktop' ? '24px 16px' : 0,
                    }}
                  >
                    <iframe
                      key={`${refreshKey}-${device}-${viewMode}`}
                      srcDoc={previewHtml || ''}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                      style={{
                        width: DEVICE_WIDTHS[device],
                        height: DEVICE_HEIGHTS[device],
                        border: device !== 'desktop' ? '1px solid #bbb' : 'none',
                        borderRadius: device === 'mobile' ? 24 : device === 'tablet' ? 12 : 0,
                        background: '#fff',
                        boxShadow: device !== 'desktop' ? '0 16px 56px rgba(0,0,0,0.28)' : 'none',
                        transition: 'width 0.2s ease, border-radius 0.2s ease',
                        flexShrink: 0,
                      }}
                      title="Design Preview"
                    />
                  </div>
                </div>
              ) : viewMode === 'code' ? (
                <div style={{ height: '100%', overflow: 'auto' }}>
                  {selectedFile ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={selectedFile.language || 'text'}
                      PreTag="div"
                      customStyle={{
                        margin: 0, borderRadius: 0, background: '#06060e',
                        fontSize: 12, padding: '14px 16px', minHeight: '100%', lineHeight: 1.65,
                      }}
                    >
                      {selectedFile.content}
                    </SyntaxHighlighter>
                  ) : (
                    <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 12 }}>Select a file</div>
                  )}
                </div>
              ) : (
                <div
                  ref={previewContainerRef}
                  data-pane="preview"
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: device === 'desktop' ? 'stretch' : 'flex-start',
                    justifyContent: 'center',
                    background: device !== 'desktop' ? '#d8d8d8' : '#efefef',
                    overflow: 'auto',
                    padding: device !== 'desktop' ? '24px 16px' : 0,
                  }}
                >
                  <iframe
                    key={`${refreshKey}-${device}-${viewMode}`}
                    srcDoc={previewHtml || ''}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    style={{
                      width: DEVICE_WIDTHS[device],
                      height: DEVICE_HEIGHTS[device],
                      border: device !== 'desktop' ? '1px solid #bbb' : 'none',
                      borderRadius: device === 'mobile' ? 24 : device === 'tablet' ? 12 : 0,
                      background: '#fff',
                      boxShadow: device !== 'desktop' ? '0 16px 56px rgba(0,0,0,0.28)' : 'none',
                      transition: 'width 0.2s ease, border-radius 0.2s ease',
                      flexShrink: 0,
                    }}
                    title="Design Preview"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DragHandle handleId="chat" onDrag={d => setChatW(w => Math.max(260, Math.min(560, w - d)))} />

        {/* ── RIGHT: CHAT ────────────────────────────────────────────────────── */}
        <div style={{
          width: chatW, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-1)',
        }}>
          {/* Chat header */}
          <div style={{
            height: 36, display: 'flex', alignItems: 'center',
            padding: '0 12px', borderBottom: '1px solid var(--border)',
            gap: 6, flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>DESIGN CHAT</span>
            {isLoading && <Loader size={11} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {messages.length === 0 && (
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Quick starts</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {STARTERS.map(s => (
                    <button key={s.label} type="button" onClick={() => void sendMessage(s.prompt)}
                      style={{
                        textAlign: 'left', padding: '7px 9px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--bg-2)',
                        color: 'var(--text-1)', fontSize: 10, cursor: 'pointer', lineHeight: 1.4,
                      }}>
                      <div style={{ fontSize: 16, marginBottom: 3 }}>{s.icon}</div>
                      <div style={{ fontWeight: 500 }}>{s.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} style={{
                marginBottom: 10, display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '95%', padding: '7px 11px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-2)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-0)',
                  fontSize: 12, lineHeight: 1.55, wordBreak: 'break-word',
                }}>
                  {msg.role === 'assistant' && msg.isStreaming && !msg.content
                    ? <span style={{ color: 'var(--text-2)', fontStyle: 'italic' }}>Generating...</span>
                    : summarizeAssistantContent(msg.content)}
                </div>
                {msg.role === 'assistant' && msg.files && msg.files.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {msg.files.map(f => (
                      <button key={f.id} type="button"
                        onClick={() => { setSelectedFileId(f.id); setViewMode('code') }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '2px 7px', borderRadius: 4,
                          border: '1px solid var(--border)', background: 'var(--bg-3)',
                          color: 'var(--text-1)', fontSize: 10, cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                        }}>
                        {getFileIcon(f.name)} {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div style={{
                padding: '8px 10px', borderRadius: 8, marginBottom: 8,
                background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,80,80,0.25)',
                color: '#ff7070', fontSize: 11,
              }}>
                ⚠ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Assets strip */}
          {assets.length > 0 && (
            <div style={{
              borderTop: '1px solid var(--border)', padding: '6px 10px',
              display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0,
            }}>
              {assets.map(a => (
                <div key={a.id} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 2, flexShrink: 0, width: 52,
                }}>
                  {a.type.startsWith('image/') ? (
                    <img src={a.dataUrl} alt={a.name}
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, background: 'var(--bg-2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileIcon size={16} color="var(--text-2)" />
                    </div>
                  )}
                  <span style={{ fontSize: 9, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 52 }}>{a.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', flexShrink: 0 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input) }
              }}
              placeholder="Describe your design or request changes…"
              rows={3}
              style={{
                width: '100%', resize: 'none', background: 'var(--bg-2)',
                border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text-0)', fontSize: 12, padding: '7px 9px',
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                boxSizing: 'border-box', display: 'block',
              }}
            />
            <div style={{ display: 'flex', gap: 5, marginTop: 6, alignItems: 'center' }}>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                style={{ ...btn(false), fontSize: 10 }}>
                <Upload size={11} /> Asset
              </button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.css,.js,.json"
                style={{ display: 'none' }}
                onChange={e => void handleAssetUpload(e.target.files)} />
              <div style={{ flex: 1 }} />
              <button type="button"
                disabled={!input.trim() || isLoading}
                onClick={() => void sendMessage(input)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 14px', borderRadius: 7, border: 'none',
                  background: input.trim() && !isLoading ? 'var(--accent)' : 'var(--bg-3)',
                  color: input.trim() && !isLoading ? '#fff' : 'var(--text-2)',
                  fontSize: 12, cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  fontWeight: 500,
                }}>
                {isLoading ? <Loader size={12} /> : <Send size={12} />}
                {isLoading ? 'Generating…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
