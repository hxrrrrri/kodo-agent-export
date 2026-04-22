import {
  useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import {
  Monitor, Tablet, Smartphone, Download, RefreshCw,
  Upload, Send, Trash2, Eye, Code, File as FileIcon,
  ExternalLink, Wand2, SplitSquareHorizontal, Maximize2,
  Minimize2, ChevronRight, ChevronDown, RotateCcw, Copy,
  MessageSquare, Share2, Package, Printer, Save,
  Folder, FolderOpen, Loader, ArrowLeft, Square, CheckSquare,
  StopCircle, Pencil, Plus, Clock,
} from 'lucide-react'
import { buildApiHeaders } from '../lib/api'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import JSZip from 'jszip'
import VisualWebEditorArtifact, { VisualEditorSourcePayload } from './VisualWebEditorArtifact'

const API = '/api/chat'
export const DESIGN_STUDIO_STORAGE_KEY = 'kodo.design-studio.state.v1'
const MAX_PERSISTED_MESSAGES = 40
const MAX_PERSISTED_HISTORY = 20
const MAX_PERSISTED_MESSAGE_FILE_CHARS = 200000

// ─── Types ──────────────────────────────────────────────────────────────────

type DeviceMode = 'desktop' | 'tablet' | 'mobile'
type ViewMode = 'preview' | 'code' | 'split' | 'editor'
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

interface DesignSystemConfig {
  brandName: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  fontFamily: string
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full'
  style: 'minimal' | 'material' | 'glassmorphism' | 'neumorphism' | 'brutalist'
  customRules: string
}

interface DesignProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
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
}

interface ProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  fileNames: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 11) }

function isHtmlLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase()
  return normalized === 'html' || normalized === 'htm'
}

function isHtmlFileName(fileName: string): boolean {
  const normalized = normalizeDesignPath(fileName).toLowerCase()
  return normalized.endsWith('.html') || normalized.endsWith('.htm')
}

function normalizeMalformedHtml(content: string): string {
  return content
    .replace(/<<(?=\s*[a-zA-Z!/])/g, '<')
    .replace(/<!DOCTYPEDOCTYPE/gi, '<!DOCTYPE')
    .replace(/<(?!\/)([a-zA-Z][a-zA-Z0-9-]{1,})(\1)(?=(?:\s|>|\/))/g, '<$1')
    .replace(/<\/(?:([a-zA-Z][a-zA-Z0-9-]{1,})(\1))(?=\s*>)/g, '</$1')
    .replace(/<(?!\/)(a|p|i|b|u|s|q)\1(?=(?:\s|>|\/))/gi, '<$1')
    .replace(/<\/(a|p|i|b|u|s|q)\1(?=\s*>)/gi, '</$1')
    .replace(/<(?!\/)hh([1-6])(?=(?:\s|>|\/))/gi, '<h$1')
    .replace(/<\/hh([1-6])(?=\s*>)/gi, '</h$1')
}

function sanitizeDesignFileContent(name: string, language: string, content: string): string {
  if (!isHtmlLanguage(language) && !isHtmlFileName(name)) {
    return content
  }
  return normalizeMalformedHtml(content)
}

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
  const sanitizedContent = sanitizeDesignFileContent(name, language, content)
  return { id, name, language, content: sanitizedContent }
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
    const viewMode: ViewMode = parsed.viewMode === 'code' || parsed.viewMode === 'split' || parsed.viewMode === 'editor'
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
    const viewMode: ViewMode = parsed.viewMode === 'preview' || parsed.viewMode === 'code' || parsed.viewMode === 'split' || parsed.viewMode === 'editor'
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

const KNOWN_FENCE_LANGS = new Set<string>(Object.keys(LANG_EXT))

const FILE_ICONS: Record<string, string> = {
  html: '🌐', css: '🎨', js: '⚡', ts: '🔷', jsx: '⚛', tsx: '⚛',
  json: '{}', svg: '🖼', md: '📝', py: '🐍', sh: '⚙',
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || '📄'
}

export function extractFiles(content: string): DesignFile[] {
  const re = /```([^\n`]*)\n([\s\S]*?)```/g
  const files: DesignFile[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  let idx = 0

  while ((m = re.exec(content)) !== null) {
    const info = (m[1] || '').trim()
    const code = m[2] || ''
    if (!code.trim()) continue

    const tokens = info.split(/\s+/).filter(Boolean)
    const firstToken = (tokens[0] || '').toLowerCase()
    const hasKnownLang = firstToken ? KNOWN_FENCE_LANGS.has(firstToken) : false

    let lang = hasKnownLang ? firstToken : ''
    let name = ''

    if (hasKnownLang && tokens.length > 1) {
      name = tokens.slice(1).join(' ').trim()
    } else if (!hasKnownLang && tokens.length === 1) {
      const maybePath = normalizeDesignPath(tokens[0])
      if (maybePath && /\.\w+$/.test(maybePath)) {
        name = maybePath
      }
    }

    if (!name && !lang) continue

    if (!name) {
      idx += 1
      const ext = LANG_EXT[lang] || lang || 'txt'
      name = `file-${idx}.${ext}`
    }

    name = normalizeDesignPath(name) || name
    if (!lang) {
      lang = inferLanguageFromFileName(name)
    }

    if (!name) {
      idx += 1
      name = `file-${idx}.txt`
    }

    const sanitizedCode = sanitizeDesignFileContent(name, lang, code)
    const dedupeKey = name.toLowerCase()
    if (seen.has(dedupeKey)) {
      const existing = files.find(f => f.name.toLowerCase() === dedupeKey)
      if (existing) existing.content = sanitizedCode
    } else {
      seen.add(dedupeKey)
      files.push({ id: genId(), name, language: lang, content: sanitizedCode })
    }
  }

  // Fallback: treat raw HTML (no code fence) as index.html
  if (files.length === 0) {
    const trimmed = content.trim()
    const sanitized = sanitizeDesignFileContent('index.html', 'html', trimmed)
    const lower = sanitized.toLowerCase()
    if (lower.startsWith('<!doctype') || lower.startsWith('<html')) {
      files.push({ id: genId(), name: 'index.html', language: 'html', content: sanitized })
    }
  }

  return files
}

function buildPreviewHtml(files: DesignFile[]): string {
  const htmlFile = files.find(f => f.language === 'html' || f.name.endsWith('.html'))
  const cssFiles = files.filter(f => (f.language === 'css' || f.name.endsWith('.css')) && f !== htmlFile)
  const jsFiles = files.filter(f => ['javascript', 'js', 'jsx'].includes(f.language) || f.name.match(/\.(js|jsx)$/))

  if (htmlFile) {
    let html = sanitizeDesignFileContent(htmlFile.name, htmlFile.language, htmlFile.content)
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

function normalizePlanItemText(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupePlanItems(items: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const item of items) {
    const cleaned = normalizePlanItemText(item)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(cleaned)
  }
  return deduped
}

export function extractPlanItemsFromAssistant(content: string): string[] {
  const sectionMatch = content.match(/(?:^|\n)(?:#{1,4}\s*)?(?:plan|build plan|todo|to-do|tasks?|implementation plan|roadmap)\s*:?\s*\n([\s\S]*?)(?=\n#{1,6}\s+\S|\n```|$)/i)

  const parseListLines = (value: string): string[] => value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(?:(?:-\s*)?\[[ xX]\]\s+|\d+[.)]\s+|[-*+]\s+)/.test(line))
    .map((line) => line.replace(/^(?:(?:-\s*)?\[[ xX]\]\s+|\d+[.)]\s+|[-*+]\s+)/, '').trim())
    .filter((line) => line.length >= 3)

  let items = sectionMatch ? parseListLines(sectionMatch[1]) : []
  if (items.length === 0) {
    const listLines = parseListLines(content)
    if (listLines.length >= 2) items = listLines
  }

  return dedupePlanItems(items).slice(0, 8)
}

export function buildPromptPlanItems(prompt: string): string[] {
  const cleanedPrompt = prompt.replace(/\s+/g, ' ').trim()
  if (!cleanedPrompt) return []

  const subjectMatch = cleanedPrompt.match(/\b(?:build|create|design|make|generate|develop|craft)\b\s+(.+?)(?:\b(?:with|using|for|that|including|where)\b|[.?!]|$)/i)
  const rawSubject = (subjectMatch?.[1] || cleanedPrompt)
    .replace(/^(a|an|the)\s+/i, '')
    .trim()
  const subject = rawSubject.length > 72 ? `${rawSubject.slice(0, 69).trim()}...` : rawSubject

  const featureSegment = (cleanedPrompt.match(/\b(?:with|including|plus|featuring)\b\s+(.+)$/i)?.[1] || '')
  const featureItems = dedupePlanItems(
    featureSegment
      .split(/,|\band\b/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4)
      .map((part) => part.replace(/[.]+$/, '')),
  ).slice(0, 2)

  const base = [
    `Understand goals and constraints for ${subject || 'the requested design'}`,
    `Build the core layout and semantic structure for ${subject || 'the page'}`,
    ...featureItems.map((item) => `Implement ${item}`),
    'Polish responsiveness, interactions, and accessibility',
    'Validate generated files and preview output before delivery',
  ]

  return dedupePlanItems(base).slice(0, 8)
}

function inferLanguageFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (!ext) return 'text'
  const byExt: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    md: 'markdown',
    yml: 'yaml',
  }
  return byExt[ext] || ext
}

function upsertDesignFileInMap(map: Map<string, DesignFile>, filePath: string, content: string): boolean {
  const normalizedPath = normalizeDesignPath(filePath)
  if (!normalizedPath || typeof content !== 'string') return false

  const key = normalizedPath.toLowerCase()
  const existing = map.get(key)
  const language = existing?.language || inferLanguageFromFileName(normalizedPath)
  map.set(key, {
    id: existing?.id || genId(),
    name: normalizedPath,
    language,
    // Keep raw tool content so subsequent file_edit old_str matching remains exact.
    content,
  })
  return true
}

function applyFileEditToMap(
  map: Map<string, DesignFile>,
  filePath: string,
  oldStr: string,
  newStr: string,
): boolean {
  const normalizedPath = normalizeDesignPath(filePath)
  if (!normalizedPath || !oldStr) return false

  const key = normalizedPath.toLowerCase()
  const existing = map.get(key)
  if (!existing || !existing.content.includes(oldStr)) return false

  map.set(key, {
    ...existing,
    content: existing.content.replace(oldStr, newStr),
  })
  return true
}

function applyToolStartEventToDesignFiles(
  event: unknown,
  map: Map<string, DesignFile>,
): boolean {
  if (!event || typeof event !== 'object') return false
  const payload = event as Record<string, unknown>
  if (String(payload.type || '').toLowerCase() !== 'tool_start') return false

  const toolName = String(payload.tool || '').toLowerCase().trim()
  const input = payload.input
  if (!input || typeof input !== 'object') return false
  const toolInput = input as Record<string, unknown>

  if (toolName === 'file_write') {
    const path = typeof toolInput.path === 'string' ? toolInput.path : ''
    const content = typeof toolInput.content === 'string' ? toolInput.content : ''
    if (!path) return false
    return upsertDesignFileInMap(map, path, content)
  }

  if (toolName === 'file_edit') {
    const path = typeof toolInput.path === 'string' ? toolInput.path : ''
    const oldStr = typeof toolInput.old_str === 'string' ? toolInput.old_str : ''
    const newStr = typeof toolInput.new_str === 'string' ? toolInput.new_str : ''
    if (!path) return false
    return applyFileEditToMap(map, path, oldStr, newStr)
  }

  return false
}


const STARTERS = [
  { icon: '🌐', label: 'Landing page', prompt: 'Build a stunning SaaS landing page with hero, features grid, pricing, and CTA — modern dark theme' },
  { icon: '📊', label: 'Dashboard', prompt: 'Create a responsive admin dashboard with sidebar nav, KPI cards, charts (use SVG), and dark mode' },
  { icon: '🛍', label: 'Product grid', prompt: 'Design a product card grid with hover animations, filters, and cart — e-commerce style' },
  { icon: '💼', label: 'Portfolio', prompt: 'Build a developer portfolio page with glassmorphism, animated hero, project cards, and contact form' },
  { icon: '💳', label: 'Pricing table', prompt: 'Create an animated pricing table with 3 tiers, feature comparison, toggle, highlighted plan' },
  { icon: '📝', label: 'Blog', prompt: 'Design a minimal blog layout with header, article cards, sidebar, and dark/light mode toggle' },
]

// ─── Project Storage ─────────────────────────────────────────────────────────

const DS_PROJECTS_INDEX = 'kodo.ds.projects.v1'
const dsProjectKey = (id: string) => `kodo.ds.p.${id}`

function listProjectSummaries(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(DS_PROJECTS_INDEX)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((s): s is ProjectSummary => Boolean(s?.id))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  } catch { return [] }
}

function saveProjectToStorage(project: DesignProject): void {
  try {
    const stripped: DesignProject = {
      ...project,
      updatedAt: Date.now(),
      messages: project.messages.slice(-MAX_PERSISTED_MESSAGES).map(m => ({
        ...m,
        isStreaming: false,
        files: m.files?.map(f => ({
          ...f,
          content: typeof f.content === 'string'
            ? f.content.slice(0, MAX_PERSISTED_MESSAGE_FILE_CHARS)
            : '',
        })),
      })),
      history: project.history.slice(-MAX_PERSISTED_HISTORY),
    }
    const key = dsProjectKey(project.id)
    localStorage.setItem(key, JSON.stringify(stripped))

    const summaries = listProjectSummaries().filter((s) => s.id !== project.id)
    const summary: ProjectSummary = {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: Date.now(),
      fileNames: project.files.map(f => f.name).slice(0, 5),
    }
    summaries.unshift(summary)
    localStorage.setItem(DS_PROJECTS_INDEX, JSON.stringify(summaries))
  } catch { /* quota — ignore */ }
}

function loadProjectFromStorage(id: string): DesignProject | null {
  try {
    const raw = localStorage.getItem(dsProjectKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DesignProject>

    const history = Array.isArray(parsed.history)
      ? parsed.history
        .map((entry): HistoryEntry | null => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Partial<HistoryEntry>
          const rowFiles = Array.isArray(row.files)
            ? row.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
            : []
          if (rowFiles.length === 0) return null
          return {
            files: rowFiles,
            timestamp: typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)
              ? row.timestamp
              : Date.now(),
            label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : undefined,
          }
        })
        .filter((row): row is HistoryEntry => row !== null)
      : []

    return {
      id: String(parsed.id || id),
      name: String(parsed.name || 'Untitled'),
      createdAt: Number(parsed.createdAt) || Date.now(),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
      messages: Array.isArray(parsed.messages)
        ? parsed.messages.map(toDesignMessage).filter((m): m is DesignMessage => m !== null)
        : [],
      files: Array.isArray(parsed.files)
        ? parsed.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
        : [],
      selectedFileId: typeof parsed.selectedFileId === 'string' ? parsed.selectedFileId : null,
      history,
      inlineComments: Array.isArray(parsed.inlineComments) ? parsed.inlineComments : [],
      projectContext: typeof parsed.projectContext === 'string' ? parsed.projectContext : '',
      shareAccess: parsed.shareAccess === 'view' || parsed.shareAccess === 'comment' ? parsed.shareAccess : 'edit',
      device: parsed.device === 'tablet' || parsed.device === 'mobile' ? parsed.device : 'desktop',
      viewMode: parsed.viewMode === 'code' || parsed.viewMode === 'split' || parsed.viewMode === 'editor' ? parsed.viewMode : 'preview',
      fileTreeW: clampWidth(parsed.fileTreeW, 140, 420, 200),
      chatW: clampWidth(parsed.chatW, 260, 560, 340),
      splitCodeW: clampWidth(parsed.splitCodeW, 25, 75, 50),
      fileTreeOpen: typeof parsed.fileTreeOpen === 'boolean' ? parsed.fileTreeOpen : true,
      expandedFolders: parsed.expandedFolders && typeof parsed.expandedFolders === 'object'
        ? parsed.expandedFolders as Record<string, boolean>
        : {},
    }
  } catch { return null }
}

function deleteProjectFromStorage(id: string): void {
  try {
    localStorage.removeItem(dsProjectKey(id))
    const summaries = listProjectSummaries().filter(s => s.id !== id)
    localStorage.setItem(DS_PROJECTS_INDEX, JSON.stringify(summaries))
  } catch { /* */ }
}

function renameProjectInStorage(id: string, name: string): void {
  try {
    const summaries = listProjectSummaries()
    const idx = summaries.findIndex(s => s.id === id)
    if (idx >= 0) { summaries[idx] = { ...summaries[idx], name }; localStorage.setItem(DS_PROJECTS_INDEX, JSON.stringify(summaries)) }
    const raw = localStorage.getItem(dsProjectKey(id))
    if (raw) {
      const parsed = JSON.parse(raw)
      localStorage.setItem(dsProjectKey(id), JSON.stringify({ ...parsed, name }))
    }
  } catch { /* */ }
}

function blankProject(name = 'New Design'): DesignProject {
  return {
    id: genId(), name, createdAt: Date.now(), updatedAt: Date.now(),
    messages: [], files: [], selectedFileId: null, history: [],
    inlineComments: [], projectContext: '', shareAccess: 'edit',
    device: 'desktop', viewMode: 'preview',
    fileTreeW: 200, chatW: 340, splitCodeW: 50, fileTreeOpen: true, expandedFolders: {},
  }
}

function migrateOldDesignData(): void {
  try {
    const raw = localStorage.getItem('kodo.design-studio.state.v1')
    if (!raw) return
    if (listProjectSummaries().length > 0) { localStorage.removeItem('kodo.design-studio.state.v1'); return }
    const persisted = loadPersistedDesignStudioState()
    if (!persisted || persisted.messages.length === 0) { localStorage.removeItem('kodo.design-studio.state.v1'); return }
    const project = blankProject('Restored Project')
    project.messages = persisted.messages
    project.files = persisted.files
    project.selectedFileId = persisted.selectedFileId
    project.history = persisted.history
    project.inlineComments = persisted.inlineComments
    project.projectContext = persisted.projectContext
    project.shareAccess = persisted.shareAccess
    saveProjectToStorage(project)
    localStorage.removeItem('kodo.design-studio.state.v1')
  } catch { /* */ }
}

// ─── Design System ───────────────────────────────────────────────────────────

const DS_DESIGN_SYSTEM_KEY = 'kodo.ds.designSystem.v1'

const DEFAULT_DESIGN_SYSTEM: DesignSystemConfig = {
  brandName: '', primaryColor: '#6366f1', secondaryColor: '#8b5cf6',
  accentColor: '#06b6d4', fontFamily: 'Inter, system-ui, sans-serif',
  borderRadius: 'md', style: 'minimal', customRules: '',
}

function loadDesignSystem(): DesignSystemConfig {
  try {
    const raw = localStorage.getItem(DS_DESIGN_SYSTEM_KEY)
    if (!raw) return { ...DEFAULT_DESIGN_SYSTEM }
    return { ...DEFAULT_DESIGN_SYSTEM, ...JSON.parse(raw) }
  } catch { return { ...DEFAULT_DESIGN_SYSTEM } }
}

function saveDesignSystem(ds: DesignSystemConfig): void {
  try { localStorage.setItem(DS_DESIGN_SYSTEM_KEY, JSON.stringify(ds)) } catch { /* */ }
}

function buildDesignSystemPrompt(ds: DesignSystemConfig): string {
  if (!ds.brandName && !ds.customRules && ds.primaryColor === DEFAULT_DESIGN_SYSTEM.primaryColor) return ''
  const lines: string[] = ['Design System:']
  if (ds.brandName) lines.push(`- Brand: ${ds.brandName}`)
  lines.push(`- Primary color: ${ds.primaryColor}`)
  lines.push(`- Secondary color: ${ds.secondaryColor}`)
  lines.push(`- Accent color: ${ds.accentColor}`)
  lines.push(`- Font: ${ds.fontFamily}`)
  const radii: Record<DesignSystemConfig['borderRadius'], string> = { none: '0px', sm: '4px', md: '8px', lg: '16px', full: '9999px' }
  lines.push(`- Border radius: ${radii[ds.borderRadius]}`)
  lines.push(`- Visual style: ${ds.style}`)
  if (ds.customRules) lines.push(`- Rules: ${ds.customRules}`)
  return lines.join('\n')
}

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

// ─── Project Picker ──────────────────────────────────────────────────────────

interface ProjectPickerProps {
  projects: ProjectSummary[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onCreate: () => void
  onClose: () => void
}

function ProjectPicker({ projects, onOpen, onDelete, onCreate, onClose }: ProjectPickerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1001,
      background: 'var(--bg-0)', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)', flexShrink: 0,
      }}>
        <button type="button" onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, padding: '4px 8px', borderRadius: 6 }}>
          <ArrowLeft size={14} /> Kodo
        </button>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <Wand2 size={18} color="var(--accent)" />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)' }}>Design Studio</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', border: 'none', borderRadius: 8,
            color: '#fff', fontSize: 12, fontWeight: 600, padding: '7px 16px', cursor: 'pointer',
          }}>
          <Plus size={14} /> New Design
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 32px' }}>
        {projects.length === 0 ? (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--text-2)' }}>
            <Wand2 size={56} style={{ opacity: 0.15 }} />
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Start your first design</div>
            <div style={{ fontSize: 13, opacity: 0.6, textAlign: 'center', maxWidth: 360 }}>
              Create websites, dashboards, and interactive prototypes by describing what you want.
            </div>
            <button type="button" onClick={onCreate}
              style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--accent)', border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px 28px', cursor: 'pointer',
              }}>
              <Plus size={16} /> Create your first design
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 16, fontWeight: 600 }}>
              YOUR PROJECTS — {projects.length}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}>
              {/* New Design card */}
              <button type="button" onClick={onCreate}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: 180, borderRadius: 12, border: '2px dashed var(--border)',
                  background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', gap: 8,
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)' }}
              >
                <Plus size={24} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>New Design</span>
              </button>

              {/* Project cards */}
              {projects.map(p => (
                <div
                  key={p.id}
                  style={{
                    borderRadius: 12, border: `2px solid ${hoveredId === p.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: 'var(--bg-1)', overflow: 'hidden', cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxShadow: hoveredId === p.id ? '0 4px 24px rgba(0,0,0,0.18)' : 'none',
                    display: 'flex', flexDirection: 'column',
                  }}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onOpen(p.id)}
                >
                  {/* Thumbnail */}
                  <div style={{
                    height: 120, background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg-3) 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Wand2 size={32} style={{ opacity: 0.2 }} color="var(--accent)" />
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '10px 12px', flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-0)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                      {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.fileNames.slice(0, 3).map(n => (
                        <span key={n} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                          {n}
                        </span>
                      ))}
                      {p.fileNames.length > 3 && (
                        <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>+{p.fileNames.length - 3}</span>
                      )}
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div style={{
                    padding: '6px 12px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'flex-end', gap: 4,
                    opacity: hoveredId === p.id ? 1 : 0, transition: 'opacity 0.15s',
                  }}>
                    {confirmDelete === p.id ? (
                      <>
                        <span style={{ fontSize: 10, color: '#ff7070', flex: 1, display: 'flex', alignItems: 'center' }}>Delete?</span>
                        <button type="button" onClick={e => { e.stopPropagation(); onDelete(p.id); setConfirmDelete(null) }}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', background: '#ff4040', color: '#fff', cursor: 'pointer' }}>
                          Yes
                        </button>
                        <button type="button" onClick={e => { e.stopPropagation(); setConfirmDelete(null) }}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer' }}>
                          No
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={e => { e.stopPropagation(); setConfirmDelete(p.id) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}>
                        <Trash2 size={11} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
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
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('New Design')
  const [projectCreatedAt, setProjectCreatedAt] = useState<number>(Date.now())
  const [allProjects, setAllProjects] = useState<ProjectSummary[]>([])
  const [leftPanelTab, setLeftPanelTab] = useState<'sessions' | 'files'>('files')
  const [isRenamingProject, setIsRenamingProject] = useState(false)
  const [projectRenameInput, setProjectRenameInput] = useState('')
  const [planItems, setPlanItems] = useState<{ id: string; text: string; done: boolean }[]>([])
  const [expandedArtifacts, setExpandedArtifacts] = useState<Record<string, boolean>>({})
  const [isEditingCode, setIsEditingCode] = useState(false)
  const [designSystem, setDesignSystem] = useState<DesignSystemConfig>(DEFAULT_DESIGN_SYSTEM)
  const [showDesignSystem, setShowDesignSystem] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const filesRef = useRef(files)
  filesRef.current = files

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Project callbacks ───────────────────────────────────────────────────────
  const applyProject = useCallback((project: DesignProject) => {
    setActiveProjectId(project.id)
    setProjectName(project.name)
    setProjectCreatedAt(project.createdAt)
    setMessages(project.messages)
    setFiles(project.files)
    setSelectedFileId(project.selectedFileId)
    setHistory(project.history)
    setInlineComments(project.inlineComments)
    setProjectContext(project.projectContext)
    setShareAccess(project.shareAccess)
    setDevice(project.device)
    setViewMode(project.viewMode)
    setFileTreeW(project.fileTreeW)
    setChatW(project.chatW)
    setSplitCodeW(project.splitCodeW)
    setFileTreeOpen(project.fileTreeOpen)
    setExpandedFolders(project.expandedFolders)
    setPlanItems([])
    setError(null)
    if (project.files.length > 0) setPreviewHtml(buildPreviewHtml(project.files))
    else setPreviewHtml(null)
  }, [])

  const handleOpenProject = useCallback((id: string) => {
    const project = loadProjectFromStorage(id)
    if (!project) return
    applyProject(project)
    setLeftPanelTab('files')
  }, [applyProject])

  const handleCreateProject = useCallback(() => {
    const project = blankProject()
    saveProjectToStorage(project)
    applyProject(project)
    setAllProjects(listProjectSummaries())
    setLeftPanelTab('files')
  }, [applyProject])

  const handleDeleteProject = useCallback((id: string) => {
    deleteProjectFromStorage(id)
    setAllProjects(listProjectSummaries())
    if (activeProjectId === id) {
      setActiveProjectId(null)
      setProjectName('New Design')
      setProjectCreatedAt(Date.now())
      setMessages([]); setFiles([]); setSelectedFileId(null)
      setHistory([]); setInlineComments([]); setProjectContext('')
      setPreviewHtml(null); setPlanItems([]); setError(null)
    }
  }, [activeProjectId])

  const handleRenameProject = useCallback((id: string, name: string) => {
    renameProjectInStorage(id, name)
    setAllProjects(listProjectSummaries())
    if (id === activeProjectId) setProjectName(name)
  }, [activeProjectId])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setDesignSystem(loadDesignSystem())
    const shared = typeof window !== 'undefined'
      ? readSharePayloadFromHash(window.location.hash)
      : null
    if (shared) {
      const project = blankProject('Shared Design')
      project.files = shared.files
      project.selectedFileId = shared.selectedFileId
      project.viewMode = shared.viewMode
      project.device = shared.device
      project.inlineComments = shared.inlineComments
      project.shareAccess = shared.shareAccess
      saveProjectToStorage(project)
      applyProject(project)
      setAllProjects(listProjectSummaries())
      setHydrated(true)
      return
    }
    migrateOldDesignData()
    const projects = listProjectSummaries()
    setAllProjects(projects)
    setHydrated(true)
    // Do NOT auto-open last project — show project picker instead
  }, [applyProject])

  useEffect(() => {
    if (shareAccess === 'view' && commentMode) {
      setCommentMode(false)
    }
  }, [shareAccess, commentMode])

  useEffect(() => {
    if (!hydrated || !activeProjectId) return
    const project: DesignProject = {
      id: activeProjectId, name: projectName,
      createdAt: projectCreatedAt, updatedAt: Date.now(),
      messages, files, selectedFileId, history, inlineComments,
      projectContext, shareAccess, device, viewMode,
      fileTreeW, chatW, splitCodeW, fileTreeOpen, expandedFolders,
    }
    saveProjectToStorage(project)
    setAllProjects(listProjectSummaries())
  }, [hydrated, activeProjectId, projectName, projectCreatedAt, messages, files, selectedFileId,
      history, inlineComments, projectContext, shareAccess, device, viewMode,
      fileTreeW, chatW, splitCodeW, fileTreeOpen, expandedFolders])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (files.length === 0) return
    const html = buildPreviewHtml(files)
    if (html !== previewHtml) {
      setPreviewHtml(html)
    }
  }, [files]) // intentionally omit previewHtml to avoid loop

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
      ? `You are Kodo Design Studio — an expert UI/UX engineer and visual designer. Your goal is to produce stunning, production-quality web designs.

RESPONSE FORMAT — follow this exactly:
## Plan
1. [Specific component or section you will build]
2. [Next component]
(3–8 items, each concrete and descriptive — e.g. "Sticky nav with logo, links, and CTA button")

Then output all code files immediately after the plan.

RULES:
- Output HTML in \`\`\`html index.html code blocks. Embed all CSS inside <style> tags and all JS inside <script> tags.
- You may also output separate \`\`\`css styles.css and \`\`\`js script.js blocks.
- Never reference external files that are not included in your response.
- Designs must be visually stunning, modern, pixel-perfect, and fully responsive.
- Use real placeholder content (no "Lorem ipsum"). Write realistic copy for the industry/use-case.
- Animations, micro-interactions, and gradients are encouraged.
- After the plan, output ONLY code blocks — no prose, no explanations, no commentary.
- Do NOT write markdown text between code blocks.

`
      : ''

    const contextSections: string[] = []
    if (projectContext.trim()) {
      contextSections.push(`Project context:\n${projectContext.trim()}`)
    }
    const dsPrompt = buildDesignSystemPrompt(designSystem)
    if (dsPrompt) contextSections.push(dsPrompt)

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
      const toolDerivedFiles = new Map<string, DesignFile>()
      for (const existingFile of filesRef.current) {
        const normalizedName = normalizeDesignPath(existingFile.name)
        if (!normalizedName) continue
        toolDerivedFiles.set(normalizedName.toLowerCase(), { ...existingFile, name: normalizedName })
      }
      let sawToolFileMutation = false

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
            if (applyToolStartEventToDesignFiles(ev, toolDerivedFiles)) {
              sawToolFileMutation = true
            }
            if (ev.type === 'text') {
              acc += String(ev.content || '')
              setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: acc } : m))
            }
          } catch { /* */ }
        }
      }

      const assistantPlan = extractPlanItemsFromAssistant(acc)
      const fallbackPlan = assistantPlan.length === 0 ? buildPromptPlanItems(trimmed) : []
      const resolvedPlan = assistantPlan.length > 0 ? assistantPlan : fallbackPlan
      if (resolvedPlan.length > 0) {
        setPlanItems(resolvedPlan.map((item) => ({ id: genId(), text: item, done: false })))
      }

      // Parse files and update preview after streaming completes
      const extracted = extractFiles(acc)
      const derivedFromTools = sawToolFileMutation
        ? Array.from(toolDerivedFiles.values())
          .map((file) => ({
            ...file,
            content: sanitizeDesignFileContent(file.name, file.language, file.content),
          }))
          .filter((file) => file.content.trim().length > 0)
        : []
      const resolvedFiles = extracted.length > 0 ? extracted : derivedFromTools

      if (resolvedFiles.length > 0) {
        const selected = resolvedFiles.find((file) => file.language === 'html' || file.name.endsWith('.html'))
          || resolvedFiles[0]

        setFiles(resolvedFiles)
        setSelectedFileId(selected.id)
        const html = buildPreviewHtml(resolvedFiles)
        setPreviewHtml(html)
        setRefreshKey(k => k + 1)
        setHistory(prev => [...prev, {
          files: resolvedFiles,
          timestamp: Date.now(),
          label: `Generation ${prev.length + 1}`,
        }])
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, files: resolvedFiles } : m))
        // Mark all plan items done when files are generated
        setPlanItems(prev => prev.map(item => ({ ...item, done: true })))
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
  }, [assets, designSystem, inlineComments, isLoading, projectContext, sessionId, shareAccess])

  const handleVisualEditorSourceChange = useCallback((payload: VisualEditorSourcePayload) => {
    // Strip injected harness script so it isn't double-injected on reload
    const cleanHtml = payload.html
      .replace(/<script[^>]*id="__veh"[\s\S]*?<\/script>/gi, '')
      .replace(/<div[^>]*id="__veo"[^>]*><\/div>/gi, '')
    const nextFiles: DesignFile[] = [
      { id: 'visual-editor-index', name: 'index.html', language: 'html', content: cleanHtml },
      { id: 'visual-editor-styles', name: 'styles.css', language: 'css', content: payload.css },
    ]

    setFiles(nextFiles)
    setSelectedFileId((prev) => (prev && nextFiles.some((file) => file.id === prev) ? prev : nextFiles[0].id))
    setPreviewHtml(cleanHtml)
  }, [])

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

  const cancelRequest = () => {
    abortRef.current?.abort()
    setIsLoading(false)
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false, content: m.content || '(Cancelled)' } : m,
    ))
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
  const sessionEntries = useMemo(() => {
    const messageEntries: Array<{ id: string; prompt: string; files: DesignFile[]; timestamp?: number }> = []

    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i]
      if (message.role !== 'assistant' || !Array.isArray(message.files) || message.files.length === 0) continue

      const filesForSession = message.files.filter((file) => file.content.trim().length > 0)
      if (filesForSession.length === 0) continue

      const previous = i > 0 ? messages[i - 1] : undefined
      const promptSource = previous?.role === 'user' ? previous.content : 'Generation'
      const prompt = promptSource.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Generation'

      messageEntries.push({
        id: `message-${message.id}`,
        prompt,
        files: filesForSession,
      })
    }

    if (messageEntries.length > 0) return messageEntries.reverse()

    return [...history]
      .reverse()
      .map((entry, idx) => ({
        id: `history-${entry.timestamp}-${idx}`,
        prompt: entry.label || `Generation ${history.length - idx}`,
        files: entry.files.filter((file) => file.content.trim().length > 0),
        timestamp: entry.timestamp,
      }))
      .filter((entry) => entry.files.length > 0)
  }, [messages, history])

  const handleCodeEdit = useCallback((content: string) => {
    if (!selectedFileId) return
    setFiles(prev => {
      const next = prev.map(f => f.id === selectedFileId ? { ...f, content } : f)
      const html = buildPreviewHtml(next)
      setPreviewHtml(html)
      setRefreshKey(k => k + 1)
      return next
    })
  }, [selectedFileId])

  const renderAssistantMessage = (msg: DesignMessage): JSX.Element => {
    const content = msg.content
    // During streaming with no content yet
    if (msg.isStreaming && !content) {
      return <span style={{ color: 'var(--text-2)', fontStyle: 'italic' }}>Generating...</span>
    }

    const parts: JSX.Element[] = []
    const re = /```([^\n`]*)\n([\s\S]*?)```/g
    let last = 0
    let match: RegExpExecArray | null
    let codeIndex = 0

    while ((match = re.exec(content)) !== null) {
      // Text before this code block
      const before = content.slice(last, match.index).trim()
      if (before) {
        parts.push(
          <span key={`text-${match.index}`} style={{ whiteSpace: 'pre-wrap', display: 'block', marginBottom: 6 }}>
            {before}
          </span>
        )
      }

      const info = match[1].trim()
      const code = match[2]
      const lineCount = code.split('\n').length
      // Infer filename from fence info
      const infoTokens = info.split(/\s+/)
      const lang = infoTokens[0] || 'text'
      const possibleName = infoTokens[1] || ''
      const fileName = possibleName && /\.\w+$/.test(possibleName) ? possibleName : `${lang || 'code'}.${LANG_EXT[lang] || lang || 'txt'}`
      const artifactKey = `${msg.id}-${codeIndex}`
      const isExpanded = expandedArtifacts[artifactKey] ?? false

      parts.push(
        <div key={artifactKey} style={{
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', marginBottom: 6,
        }}>
          <button
            type="button"
            onClick={() => setExpandedArtifacts(prev => ({ ...prev, [artifactKey]: !prev[artifactKey] }))}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--text-0)', fontSize: 11, fontFamily: 'var(--font-mono)',
            }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{getFileIcon(fileName)}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{fileName}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 10 }}>{lineCount} lines</span>
          </button>
          {isExpanded && (
            <div style={{ marginTop: 6, borderRadius: 4, overflow: 'hidden' }}>
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={lang || 'text'}
                PreTag="div"
                customStyle={{ margin: 0, borderRadius: 4, fontSize: 11, padding: '8px 10px', lineHeight: 1.6 }}
              >
                {code}
              </SyntaxHighlighter>
            </div>
          )}
        </div>
      )
      codeIndex++
      last = match.index + match[0].length
    }

    // Remaining text after last code block
    const tail = content.slice(last).trim()

    // During streaming: show animated label if there's an open/partial fence
    if (msg.isStreaming && tail.includes('```')) {
      const partialLangMatch = tail.match(/```([^\n`]*)/)
      const partialInfo = partialLangMatch ? partialLangMatch[1].trim() : ''
      const partialTokens = partialInfo.split(/\s+/)
      const partialName = partialTokens[1] && /\.\w+$/.test(partialTokens[1]) ? partialTokens[1] : (partialTokens[0] ? `${partialTokens[0]}.${LANG_EXT[partialTokens[0]] || partialTokens[0]}` : 'code')
      parts.push(
        <div key="streaming-artifact" style={{
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)',
        }}>
          <Loader size={11} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          Building {partialName}…
        </div>
      )
    } else if (tail) {
      parts.push(
        <span key="tail" style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{tail}</span>
      )
    }

    if (parts.length === 0) {
      return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
    }
    return <>{parts}</>
  }

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
    setIsEditingCode(false)
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

  // Show project picker when no active project
  if (!activeProjectId) {
    return (
      <ProjectPicker
        projects={allProjects}
        onOpen={handleOpenProject}
        onDelete={handleDeleteProject}
        onCreate={handleCreateProject}
        onClose={onClose}
      />
    )
  }

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
        <button
          type="button"
          onClick={() => setActiveProjectId(null)}
          title="Back to projects"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-2)',
            color: 'var(--text-1)', fontSize: 11,
            cursor: 'pointer', fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={12} /> Projects
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <Wand2 size={15} color="var(--accent)" />
        {/* Project name (inline rename) */}
        {isRenamingProject ? (
          <input
            autoFocus
            value={projectRenameInput}
            onChange={e => setProjectRenameInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const n = projectRenameInput.trim()
                if (n) { setProjectName(n); handleRenameProject(activeProjectId, n) }
                setIsRenamingProject(false)
              }
              if (e.key === 'Escape') setIsRenamingProject(false)
            }}
            onBlur={() => {
              const n = projectRenameInput.trim()
              if (n) { setProjectName(n); handleRenameProject(activeProjectId, n) }
              setIsRenamingProject(false)
            }}
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--accent)', borderRadius: 5,
              color: 'var(--text-0)', fontSize: 12, padding: '2px 8px', outline: 'none',
              fontWeight: 600, width: 160,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => { setProjectRenameInput(projectName); setIsRenamingProject(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5,
              border: 'none', background: 'transparent', color: 'var(--text-0)', fontSize: 12,
              cursor: 'pointer', fontWeight: 600, maxWidth: 200, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {projectName} <Pencil size={10} color="var(--text-2)" />
          </button>
        )}
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* View mode */}
        <button type="button" style={btn(viewMode === 'preview')} onClick={() => setViewMode('preview')}><Eye size={11} />Preview</button>
        <button type="button" style={btn(viewMode === 'code')} onClick={() => setViewMode('code')}><Code size={11} />Code</button>
        <button type="button" style={btn(viewMode === 'split')} onClick={() => setViewMode('split')}><SplitSquareHorizontal size={11} />Split</button>
        <button type="button" style={btn(viewMode === 'editor')} onClick={() => setViewMode('editor')}><Wand2 size={11} />Editor</button>
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
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button type="button" style={btn(showDesignSystem)} onClick={() => setShowDesignSystem(s => !s)} title="Design system">
          <Package size={11} />DS
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
                {/* Tab switcher */}
                <button type="button" onClick={() => setLeftPanelTab('sessions')} style={{
                  display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: 9,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  color: leftPanelTab === 'sessions' ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: leftPanelTab === 'sessions' ? 700 : 400,
                }}>
                  <Clock size={10} />SESSIONS
                </button>
                <button type="button" onClick={() => setLeftPanelTab('files')} style={{
                  display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: 9,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  color: leftPanelTab === 'files' ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: leftPanelTab === 'files' ? 700 : 400,
                }}>
                  <FolderOpen size={10} />FILES
                </button>
                <div style={{ flex: 1 }} />
                {leftPanelTab === 'files' && (
                  <button type="button" style={{ ...btn(false), padding: '2px 4px' }}
                    disabled={!canEdit}
                    onClick={() => fileInputRef.current?.click()} title="Upload asset">
                    <Upload size={11} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Design System panel */}
          {fileTreeOpen && showDesignSystem && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 8, fontWeight: 700 }}>DESIGN SYSTEM</div>
              {([
                { key: 'brandName', label: 'Brand name', type: 'text' },
                { key: 'primaryColor', label: 'Primary', type: 'color' },
                { key: 'secondaryColor', label: 'Secondary', type: 'color' },
                { key: 'accentColor', label: 'Accent', type: 'color' },
                { key: 'fontFamily', label: 'Font', type: 'text' },
              ] as { key: keyof DesignSystemConfig; label: string; type: string }[]).map(({ key, label, type }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{label}</div>
                  <input
                    type={type}
                    value={String(designSystem[key])}
                    onChange={e => {
                      const updated = { ...designSystem, [key]: e.target.value }
                      setDesignSystem(updated)
                      saveDesignSystem(updated)
                    }}
                    style={{
                      width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)',
                      borderRadius: 4, color: 'var(--text-0)', fontSize: 10,
                      padding: type === 'color' ? '1px 4px' : '3px 6px',
                      outline: 'none', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' as const,
                      height: type === 'color' ? 26 : 'auto',
                    }}
                  />
                </div>
              ))}
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Radius</div>
                <select
                  value={designSystem.borderRadius}
                  onChange={e => {
                    const updated = { ...designSystem, borderRadius: e.target.value as DesignSystemConfig['borderRadius'] }
                    setDesignSystem(updated); saveDesignSystem(updated)
                  }}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                >
                  {(['none', 'sm', 'md', 'lg', 'full'] as const).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Style</div>
                <select
                  value={designSystem.style}
                  onChange={e => {
                    const updated = { ...designSystem, style: e.target.value as DesignSystemConfig['style'] }
                    setDesignSystem(updated); saveDesignSystem(updated)
                  }}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                >
                  {(['minimal', 'material', 'glassmorphism', 'neumorphism', 'brutalist'] as const).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Custom rules</div>
                <textarea
                  value={designSystem.customRules}
                  onChange={e => {
                    const updated = { ...designSystem, customRules: e.target.value }
                    setDesignSystem(updated); saveDesignSystem(updated)
                  }}
                  rows={3}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)', resize: 'vertical', boxSizing: 'border-box' as const }}
                />
              </div>
              <button
                type="button"
                style={{ ...btn(false), fontSize: 9, padding: '2px 6px' }}
                onClick={() => { setDesignSystem({ ...DEFAULT_DESIGN_SYSTEM }); saveDesignSystem({ ...DEFAULT_DESIGN_SYSTEM }) }}
              >
                <Plus size={9} /> Reset
              </button>
            </div>
          )}

          {/* Sessions tab */}
          {fileTreeOpen && !showDesignSystem && leftPanelTab === 'sessions' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sessionEntries.map((entry) => {
                return (
                  <div key={entry.id}
                    onClick={() => {
                      if (entry.files.length > 0) {
                        const htmlFile = entry.files.find((file) => file.name.endsWith('.html'))
                        const selected = htmlFile || entry.files[0]
                        setFiles(entry.files)
                        setSelectedFileId(selected?.id ?? null)
                        setPreviewHtml(buildPreviewHtml(entry.files))
                        setRefreshKey((k) => k + 1)
                        setLeftPanelTab('files')
                      }
                    }}
                    style={{ padding: '8px 10px', cursor: 'pointer', borderLeft: '2px solid transparent', background: 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                      {entry.prompt}
                    </div>
                    {entry.timestamp && (
                      <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {entry.files.slice(0, 3).map(f => (
                        <span key={f.id} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-3)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
              {sessionEntries.length === 0 && (
                <div style={{ padding: '12px 10px', fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                  No generations yet
                </div>
              )}
            </div>
          )}

          {/* Generated files */}
          {fileTreeOpen && !showDesignSystem && leftPanelTab === 'files' && (
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
            {(viewMode === 'code' || viewMode === 'split') && selectedFile && canEdit && (
              <button type="button" style={btn(isEditingCode)} onClick={() => setIsEditingCode(e => !e)}>
                <Pencil size={11} />{isEditingCode ? 'Done' : 'Edit'}
              </button>
            )}
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
          {viewMode === 'editor' ? (
            <div style={{ flex: 1, minHeight: 0 }}>
              <VisualWebEditorArtifact
                html={selectedFile?.language === 'html' ? selectedFile.content : (previewHtml || '')}
                onSourceChange={handleVisualEditorSourceChange}
              />
            </div>
          ) : !previewHtml && files.length === 0 ? (
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
                    display: 'flex', flexDirection: 'column',
                  }} data-pane="split-code">
                    {selectedFile ? (
                      isEditingCode ? (
                        <textarea
                          value={selectedFile.content}
                          onChange={e => handleCodeEdit(e.target.value)}
                          spellCheck={false}
                          style={{
                            width: '100%', height: '100%', minHeight: '100%',
                            background: '#06060e', color: '#d4d4d4',
                            border: 'none', outline: 'none', resize: 'none',
                            fontFamily: 'var(--font-mono)', fontSize: 12,
                            lineHeight: 1.65, padding: '14px 16px',
                            boxSizing: 'border-box',
                          }}
                        />
                      ) : (
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
                      )
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
                <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {selectedFile ? (
                    isEditingCode ? (
                      <textarea
                        value={selectedFile.content}
                        onChange={e => handleCodeEdit(e.target.value)}
                        spellCheck={false}
                        style={{
                          width: '100%', height: '100%', minHeight: '100%',
                          background: '#06060e', color: '#d4d4d4',
                          border: 'none', outline: 'none', resize: 'none',
                          fontFamily: 'var(--font-mono)', fontSize: 12,
                          lineHeight: 1.65, padding: '14px 16px',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
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
                    )
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

            {/* Plan checklist card */}
            {planItems.length > 0 && (
              <div style={{
                marginBottom: 10, padding: '10px 12px', borderRadius: 10,
                background: 'var(--bg-2)', border: '1px solid var(--border)',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 8,
                }}>
                  BUILD PLAN
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {planItems.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPlanItems(prev => prev.map(p => p.id === item.id ? { ...p, done: !p.done } : p))}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 7,
                        background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left', padding: '2px 0',
                      }}
                    >
                      {item.done
                        ? <CheckSquare size={13} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                        : <Square size={13} color="var(--text-2)" style={{ flexShrink: 0, marginTop: 1 }} />}
                      <span style={{
                        fontSize: 11, lineHeight: 1.45,
                        color: item.done ? 'var(--text-2)' : 'var(--text-0)',
                        textDecoration: item.done ? 'line-through' : 'none',
                      }}>
                        {i + 1}. {item.text}
                      </span>
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
                  {msg.role === 'assistant'
                    ? renderAssistantMessage(msg)
                    : msg.content}
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
              {isLoading ? (
                <button
                  type="button"
                  onClick={cancelRequest}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 14px', borderRadius: 7, border: '1px solid rgba(255,80,80,0.4)',
                    background: 'rgba(255,60,60,0.08)',
                    color: '#ff6b6b',
                    fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  <StopCircle size={12} /> Cancel
                </button>
              ) : (
                <button type="button"
                  disabled={!input.trim() || !canEdit}
                  onClick={() => void sendMessage(input)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 14px', borderRadius: 7, border: 'none',
                    background: input.trim() && canEdit ? 'var(--accent)' : 'var(--bg-3)',
                    color: input.trim() && canEdit ? '#fff' : 'var(--text-2)',
                    fontSize: 12, cursor: input.trim() && canEdit ? 'pointer' : 'not-allowed',
                    fontWeight: 500,
                  }}>
                  <Send size={12} /> Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
