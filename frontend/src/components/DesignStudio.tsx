import {
  useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import {
  X, Monitor, Tablet, Smartphone, Download, RefreshCw,
  Upload, Send, Trash2, Eye, Code, File as FileIcon,
  ExternalLink, Wand2, SplitSquareHorizontal, Maximize2,
  Minimize2, ChevronRight, ChevronDown, RotateCcw, Copy,
  MessageSquare, Share2, Package, Printer, Save,
  Folder, FolderOpen, Loader,
} from 'lucide-react'
import { buildApiHeaders } from '../lib/api'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import JSZip from 'jszip'

const API = '/api/chat'
export const DESIGN_STUDIO_STORAGE_KEY = 'kodo.design-studio.state.v1'
const MAX_PERSISTED_MESSAGES = 40
const MAX_PERSISTED_HISTORY = 20

// ─── Types ──────────────────────────────────────────────────────────────────

type DeviceMode = 'desktop' | 'tablet' | 'mobile'
type ViewMode = 'preview' | 'code' | 'split'
type ShareAccess = 'view' | 'comment' | 'edit'

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
  textContent?: string
}

interface HistoryEntry {
  files: DesignFile[]
  timestamp: number
  label?: string
}

interface InlineComment {
  id: string
  text: string
  xPct: number
  yPct: number
  createdAt: number
  resolved?: boolean
}

interface DesignSharePayload {
  version: number
  files: DesignFile[]
  selectedFileId: string | null
  viewMode: ViewMode
  device: DeviceMode
  inlineComments: InlineComment[]
  shareAccess: ShareAccess
}

interface PersistedDesignStudioState {
  messages: DesignMessage[]
  files: DesignFile[]
  selectedFileId: string | null
  history: HistoryEntry[]
  inlineComments: InlineComment[]
  projectContext: string
  shareAccess: ShareAccess
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

function toInlineComment(value: unknown): InlineComment | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<InlineComment>
  const text = typeof candidate.text === 'string' ? candidate.text.trim() : ''
  if (!text) return null

  const rawX = typeof candidate.xPct === 'number' ? candidate.xPct : Number(candidate.xPct)
  const rawY = typeof candidate.yPct === 'number' ? candidate.yPct : Number(candidate.yPct)
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : genId(),
    text,
    xPct: Math.max(0, Math.min(100, rawX)),
    yPct: Math.max(0, Math.min(100, rawY)),
    createdAt: typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
      ? candidate.createdAt
      : Date.now(),
    resolved: Boolean(candidate.resolved),
  }
}

function toBase64Url(value: string): string {
  const encoded = btoa(unescape(encodeURIComponent(value)))
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): string {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return decodeURIComponent(escape(atob(padded)))
}

export function buildHandoffPrompt(files: DesignFile[]): string {
  if (files.length === 0) return ''
  const sections = files.map((file) => {
    const language = (file.language || file.name.split('.').pop() || 'txt').toLowerCase()
    return ['```' + language + ' ' + file.name, file.content, '```'].join('\n')
  })
  return [
    'Implement this generated design in the workspace. Use these files exactly as the baseline and refine where needed:',
    ...sections,
  ].join('\n\n')
}

export function encodeDesignSharePayload(payload: DesignSharePayload): string {
  return toBase64Url(JSON.stringify(payload))
}

export function decodeDesignSharePayload(raw: string): DesignSharePayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as Partial<DesignSharePayload>
    const files = Array.isArray(parsed.files)
      ? parsed.files.map(toDesignFile).filter((row): row is DesignFile => row !== null)
      : []
    if (files.length === 0) return null

    const selectedFileId = typeof parsed.selectedFileId === 'string' ? parsed.selectedFileId : null
    const selectedExists = selectedFileId ? files.some((file) => file.id === selectedFileId) : false
    const shareAccess: ShareAccess = parsed.shareAccess === 'view' || parsed.shareAccess === 'comment'
      ? parsed.shareAccess
      : 'edit'
    const viewMode: ViewMode = parsed.viewMode === 'code' || parsed.viewMode === 'split'
      ? parsed.viewMode
      : 'preview'
    const device: DeviceMode = parsed.device === 'tablet' || parsed.device === 'mobile'
      ? parsed.device
      : 'desktop'
    const inlineComments = Array.isArray(parsed.inlineComments)
      ? parsed.inlineComments.map(toInlineComment).filter((row): row is InlineComment => row !== null)
      : []

    return {
      version: 1,
      files,
      selectedFileId: selectedExists ? selectedFileId : (files[0]?.id ?? null),
      viewMode,
      device,
      inlineComments,
      shareAccess,
    }
  } catch {
    return null
  }
}

function readSharePayloadFromHash(hashValue: string): DesignSharePayload | null {
  const hash = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const raw = params.get('designShare')
  if (!raw) return null
  return decodeDesignSharePayload(raw)
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
        .map((entry): HistoryEntry | null => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Partial<HistoryEntry>
          const rowFiles = Array.isArray(row.files)
            ? row.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
            : []
          if (rowFiles.length === 0) return null
          const timestamp = typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)
            ? row.timestamp
            : Date.now()
          const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : undefined
          return {
            files: rowFiles,
            timestamp,
            ...(label ? { label } : {}),
          }
        })
        .filter((entry): entry is HistoryEntry => entry !== null)
      : []
    const inlineComments = Array.isArray(parsed.inlineComments)
      ? parsed.inlineComments.map(toInlineComment).filter((entry): entry is InlineComment => entry !== null)
      : []

    const selectedFileId = typeof parsed.selectedFileId === 'string' ? parsed.selectedFileId : null
    const selectedExists = selectedFileId ? files.some((f) => f.id === selectedFileId) : false
    const normalizedSelected = selectedExists ? selectedFileId : (files[0]?.id ?? null)

    const device: DeviceMode = parsed.device === 'tablet' || parsed.device === 'mobile' ? parsed.device : 'desktop'
    const viewMode: ViewMode = parsed.viewMode === 'preview' || parsed.viewMode === 'code' || parsed.viewMode === 'split'
      ? parsed.viewMode
      : 'preview'
    const shareAccess: ShareAccess = parsed.shareAccess === 'view' || parsed.shareAccess === 'comment'
      ? parsed.shareAccess
      : 'edit'
    const projectContext = typeof parsed.projectContext === 'string' ? parsed.projectContext : ''
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
      inlineComments,
      projectContext,
      shareAccess,
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
  const [shareCopied, setShareCopied] = useState(false)
  const [fileTreeOpen, setFileTreeOpen] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [inlineComments, setInlineComments] = useState<InlineComment[]>([])
  const [commentMode, setCommentMode] = useState(false)
  const [projectContext, setProjectContext] = useState('')
  const [shareAccess, setShareAccess] = useState<ShareAccess>('edit')
  const [hydrated, setHydrated] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const shared = typeof window !== 'undefined'
      ? readSharePayloadFromHash(window.location.hash)
      : null
    if (shared) {
      setFiles(shared.files)
      setSelectedFileId(shared.selectedFileId)
      setViewMode(shared.viewMode)
      setDevice(shared.device)
      setInlineComments(shared.inlineComments)
      setShareAccess(shared.shareAccess)
      setPreviewHtml(buildPreviewHtml(shared.files))
      setRefreshKey((k) => k + 1)
      setHydrated(true)
      return
    }

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
    setInlineComments(persisted.inlineComments)
    setProjectContext(persisted.projectContext)
    setShareAccess(persisted.shareAccess)

    if (persisted.files.length > 0) {
      setPreviewHtml(buildPreviewHtml(persisted.files))
      setRefreshKey((k) => k + 1)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (shareAccess === 'view' && commentMode) {
      setCommentMode(false)
    }
  }, [shareAccess, commentMode])

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
      inlineComments,
      projectContext,
      shareAccess,
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
  }, [
    hydrated,
    messages,
    files,
    selectedFileId,
    history,
    inlineComments,
    projectContext,
    shareAccess,
    device,
    viewMode,
    fileTreeW,
    chatW,
    splitCodeW,
    fileTreeOpen,
    expandedFolders,
  ])

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
    if (shareAccess === 'view') {
      setError('This shared design is view-only. Switch access to edit to send changes.')
      return
    }
    setError(null)
    setInput('')

    const isFirst = messagesRef.current.length === 0
    const prefix = isFirst
      ? 'You are a UI/UX design assistant. Output complete, self-contained HTML with embedded CSS and JS. Designs must be visually stunning, modern, and responsive. Put HTML in ```html filename.html blocks. You may also use separate ```css and ```js blocks with filenames. Never reference external files not in the response.\n\n'
      : ''

    const contextSections: string[] = []
    if (projectContext.trim()) {
      contextSections.push(`Project context:\n${projectContext.trim()}`)
    }

    const textAssets = assets
      .filter((asset) => Boolean(asset.textContent && asset.textContent.trim()))
      .slice(0, 4)
    if (textAssets.length > 0) {
      const assetSummary = textAssets
        .map((asset) => `--- ${asset.name} ---\n${String(asset.textContent || '').slice(0, 5000)}`)
        .join('\n\n')
      contextSections.push(`Attached codebase and design context:\n${assetSummary}`)
    }

    const openComments = inlineComments
      .filter((comment) => !comment.resolved)
      .slice(-5)
    if (openComments.length > 0) {
      contextSections.push(
        'Open inline canvas comments:\n'
        + openComments
          .map((comment) => `- (${Math.round(comment.xPct)}%, ${Math.round(comment.yPct)}%) ${comment.text}`)
          .join('\n'),
      )
    }

    const fullMsg = [
      contextSections.length > 0 ? `${contextSections.join('\n\n')}\n\n` : '',
      prefix,
      trimmed,
    ].join('')

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
        setHistory(prev => [...prev, {
          files: extracted,
          timestamp: Date.now(),
          label: `Generation ${prev.length + 1}`,
        }])
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
  }, [assets, inlineComments, isLoading, projectContext, sessionId, shareAccess])

  const restoreHistory = (entry: HistoryEntry) => {
    setFiles(entry.files)
    setSelectedFileId(entry.files[0]?.id ?? null)
    setPreviewHtml(buildPreviewHtml(entry.files))
    setRefreshKey(k => k + 1)
  }

  const handleAssetUpload = async (list: FileList | null) => {
    if (!list) return
    const isTextLikeAsset = (file: File): boolean => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const textExt = new Set(['txt', 'md', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'py', 'sh', 'yaml', 'yml'])
      return textExt.has(ext) || file.type.startsWith('text/') || file.type.includes('json')
    }

    const next: UploadedAsset[] = []
    for (const f of Array.from(list)) {
      const dataUrl = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f)
      })
      let textContent: string | undefined
      if (isTextLikeAsset(f)) {
        try {
          textContent = (await f.text()).slice(0, 120000)
        } catch {
          textContent = undefined
        }
      }
      next.push({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl, textContent })
    }
    setAssets(prev => [...prev, ...next])
  }

  const saveRevision = () => {
    if (files.length === 0) return
    const suggested = `Revision ${history.length + 1}`
    const label = window.prompt('Revision name', suggested)?.trim() || suggested
    setHistory((prev) => [...prev, {
      files: files.map((file) => ({ ...file })),
      timestamp: Date.now(),
      label,
    }])
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

  const downloadZip = async () => {
    if (files.length === 0) return
    const zip = new JSZip()
    files.forEach((file) => {
      zip.file(file.name, file.content)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'design-bundle.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    const html = previewHtml || (files.length > 0 ? buildPreviewHtml(files) : '')
    if (!html.trim()) return

    const win = window.open('', '_blank')
    if (!win) return

    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    window.setTimeout(() => {
      win.print()
    }, 350)
  }

  const openInTab = () => {
    if (!previewHtml) return
    const blob = new Blob([previewHtml], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const copyShareLink = async () => {
    if (files.length === 0 || typeof window === 'undefined') return
    const payload: DesignSharePayload = {
      version: 1,
      files,
      selectedFileId,
      viewMode,
      device,
      inlineComments,
      shareAccess,
    }

    const url = new URL(window.location.href)
    const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '')
    params.set('designShare', encodeDesignSharePayload(payload))
    url.hash = params.toString()

    try {
      await navigator.clipboard.writeText(url.toString())
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      setError('Could not copy share link. Check clipboard permissions and try again.')
    }
  }

  const handoffToLocalAgent = () => {
    const prompt = buildHandoffPrompt(files)
    if (!prompt || typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('kodo:insert-prompt', { detail: { text: prompt } }))
    onClose()
  }

  const copyCode = async () => {
    const sel = files.find(f => f.id === selectedFileId)
    if (!sel) return
    await navigator.clipboard.writeText(sel.content)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const selectedFile = files.find(f => f.id === selectedFileId) ?? files[0] ?? null
  const canEdit = shareAccess === 'edit'
  const canComment = shareAccess !== 'view'
  const fileTree = useMemo(() => buildDesignFileTree(files), [files])

  const addInlineCommentAtPoint = (xPct: number, yPct: number) => {
    if (!canComment) return
    const text = window.prompt('Inline comment for this canvas area:')?.trim()
    if (!text) return
    setInlineComments((prev) => [...prev, {
      id: genId(),
      text,
      xPct: Math.max(0, Math.min(100, xPct)),
      yPct: Math.max(0, Math.min(100, yPct)),
      createdAt: Date.now(),
      resolved: false,
    }])
  }

  const handlePreviewCommentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!commentMode || !canComment) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const xPct = ((event.clientX - rect.left) / rect.width) * 100
    const yPct = ((event.clientY - rect.top) / rect.height) * 100
    addInlineCommentAtPoint(xPct, yPct)
  }

  const toggleInlineComment = (id: string) => {
    setInlineComments((prev) => prev.map((comment) => (
      comment.id === id ? { ...comment, resolved: !comment.resolved } : comment
    )))
  }

  const removeInlineComment = (id: string) => {
    setInlineComments((prev) => prev.filter((comment) => comment.id !== id))
  }

  const applyInlineComment = (comment: InlineComment) => {
    const prompt = `Apply this inline canvas comment at (${Math.round(comment.xPct)}%, ${Math.round(comment.yPct)}%): ${comment.text}`
    void sendMessage(prompt)
  }

  const requestVariations = () => {
    void sendMessage('Show 3 significantly different layout alternatives for the current design. Keep content goals intact and explain the tradeoffs briefly.')
  }

  const requestAccessibilityReview = () => {
    void sendMessage('Review the current design for accessibility issues (contrast, hierarchy, focus order, interactive targets, semantics) and then apply fixes directly in the generated files.')
  }

  const renderInlineCommentLayer = () => (
    <>
      <div
        onClick={handlePreviewCommentClick}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          cursor: commentMode && canComment ? 'crosshair' : 'default',
          pointerEvents: commentMode && canComment ? 'auto' : 'none',
          background: commentMode && canComment ? 'rgba(0,0,0,0.02)' : 'transparent',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
        {inlineComments.map((comment, idx) => (
          <button
            key={comment.id}
            type="button"
            title={comment.text}
            onClick={(event) => {
              event.stopPropagation()
              toggleInlineComment(comment.id)
            }}
            style={{
              position: 'absolute',
              left: `${comment.xPct}%`,
              top: `${comment.yPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 18,
              height: 18,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.95)',
              background: comment.resolved ? '#2f9a51' : '#ff9f1a',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {idx + 1}
          </button>
        ))}
      </div>
    </>
  )

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

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <select
          value={shareAccess}
          onChange={(event) => setShareAccess(event.target.value as ShareAccess)}
          title="Share access"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-1)',
            fontSize: 11,
            padding: '2px 8px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <option value="view">View-only</option>
          <option value="comment">Comment</option>
          <option value="edit">Edit</option>
        </select>
        <button
          type="button"
          style={btn(commentMode, true)}
          onClick={() => setCommentMode((prev) => !prev)}
          title="Inline comment mode"
          disabled={!canComment}
        >
          <MessageSquare size={11} />
          Comment
        </button>

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
        <button type="button" style={btn(false)} onClick={saveRevision} title="Save revision" disabled={!canEdit || files.length === 0}>
          <Save size={11} />
          Save revision
        </button>

        <div style={{ flex: 1 }} />

        {/* Actions */}
        {(previewHtml || files.length > 0) && (
          <>
            {previewHtml && (
              <>
                <button type="button" style={btn(false)} onClick={() => setRefreshKey(k => k + 1)} title="Refresh"><RefreshCw size={12} /></button>
                <button type="button" style={btn(false)} onClick={openInTab} title="Open in new tab"><ExternalLink size={12} /></button>
                <button type="button" style={btn(false)} onClick={downloadAll} title="Download HTML"><Download size={12} /></button>
              </>
            )}
            {files.length > 0 && (
              <>
                <button type="button" style={btn(false)} onClick={() => void downloadZip()} title="Download ZIP"><Package size={12} /></button>
                <button type="button" style={btn(false)} onClick={exportPdf} title="Export PDF"><Printer size={12} /></button>
                <button type="button" style={btn(shareCopied)} onClick={() => void copyShareLink()} title="Copy share link"><Share2 size={12} />{shareCopied ? 'Copied' : 'Share'}</button>
                <button type="button" style={btn(false)} onClick={handoffToLocalAgent} title="Handoff to local coding agent"><Send size={12} />Handoff</button>
              </>
            )}
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
                  disabled={!canEdit}
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
                      {h.label || `v${history.length - i}`} — {new Date(h.timestamp).toLocaleTimeString()}
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
                      position: 'relative',
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
                    {renderInlineCommentLayer()}
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
                    position: 'relative',
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
                  {renderInlineCommentLayer()}
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
            <div style={{ flex: 1 }} />
            <button type="button" style={{ ...btn(false), padding: '2px 6px', fontSize: 10 }} onClick={requestVariations} disabled={!canEdit || isLoading}>3 Variants</button>
            <button type="button" style={{ ...btn(false), padding: '2px 6px', fontSize: 10 }} onClick={requestAccessibilityReview} disabled={!canEdit || isLoading}>A11y pass</button>
            {isLoading && <Loader size={11} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>

          {inlineComments.length > 0 && (
            <div style={{
              borderBottom: '1px solid var(--border)',
              padding: '8px 10px',
              background: 'var(--bg-0)',
              maxHeight: 180,
              overflowY: 'auto',
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: 9,
                letterSpacing: '0.1em',
                color: 'var(--text-2)',
                fontFamily: 'var(--font-mono)',
                marginBottom: 6,
              }}>
                INLINE COMMENTS ({inlineComments.filter((row) => !row.resolved).length} open)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...inlineComments].slice(-6).map((comment) => (
                  <div key={comment.id} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '6px 8px',
                    background: comment.resolved ? 'var(--bg-2)' : 'var(--bg-1)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.45, marginBottom: 6 }}>
                      ({Math.round(comment.xPct)}%, {Math.round(comment.yPct)}%) {comment.text}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" style={{ ...btn(false), padding: '2px 6px', fontSize: 10 }} onClick={() => applyInlineComment(comment)} disabled={!canEdit || isLoading}>Apply</button>
                      <button type="button" style={{ ...btn(Boolean(comment.resolved)), padding: '2px 6px', fontSize: 10 }} onClick={() => toggleInlineComment(comment.id)}>{comment.resolved ? 'Reopen' : 'Done'}</button>
                      <button type="button" style={{ ...btn(false), padding: '2px 6px', fontSize: 10 }} onClick={() => removeInlineComment(comment.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              value={projectContext}
              onChange={e => setProjectContext(e.target.value)}
              placeholder="Project context (design system rules, codebase constraints, target users)..."
              rows={2}
              style={{
                width: '100%', resize: 'vertical', background: 'var(--bg-1)',
                border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text-1)', fontSize: 11, padding: '6px 8px',
                outline: 'none', fontFamily: 'var(--font-mono)', lineHeight: 1.4,
                boxSizing: 'border-box', display: 'block', marginBottom: 6,
              }}
            />
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
                disabled={!canEdit}
                style={{ ...btn(false), fontSize: 10 }}>
                <Upload size={11} /> Asset
              </button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.css,.js,.json,.html,.ts,.tsx,.jsx,.md,.txt,.py,.yaml,.yml"
                style={{ display: 'none' }}
                onChange={e => void handleAssetUpload(e.target.files)} />
              <div style={{ flex: 1 }} />
              <button type="button"
                disabled={!input.trim() || isLoading || !canEdit}
                onClick={() => void sendMessage(input)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 14px', borderRadius: 7, border: 'none',
                  background: input.trim() && !isLoading && canEdit ? 'var(--accent)' : 'var(--bg-3)',
                  color: input.trim() && !isLoading && canEdit ? '#fff' : 'var(--text-2)',
                  fontSize: 12, cursor: input.trim() && !isLoading && canEdit ? 'pointer' : 'not-allowed',
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
