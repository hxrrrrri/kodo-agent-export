import { useCallback, useMemo, useRef } from 'react'
import {
  ArtifactItem,
  ArtifactRef,
  AdvisorReview,
  PreviewItem,
  TodoItem,
  useChatStore,
  Checkpoint,
  CommandDefinition,
  ImageAttachment,
  Message,
  ModeOption,
  PermissionChallenge,
  ToolCall,
} from '../store/chatStore'
import { buildApiHeaders, parseApiError } from '../lib/api'
import { parseArtifacts } from '../lib/artifacts/parser'
import { pushUiNotification } from '../lib/notifications'

const API = '/api/chat'

function genId() {
  return Math.random().toString(36).slice(2, 11)
}

type StreamEventHandlers = {
  onToolStart?: (event: Record<string, unknown>) => void
  onToolOutput?: (line: string, event: Record<string, unknown>) => void
  onToolResult?: (event: Record<string, unknown>) => void
  onText?: (content: string, event: Record<string, unknown>) => void
  onDone?: (usage: Message['usage'] | undefined, event: Record<string, unknown>) => void
  onError?: (message: string, event: Record<string, unknown>) => void
  onMeta?: (event: Record<string, unknown>) => void
}

type SendMessageOptions = {
  silent?: boolean
}

const FALLBACK_MODE_KEYS = ['execute', 'plan', 'debug', 'review', 'coordinator', 'bughunter', 'ultraplan']

function normalizeClientMode(mode: string | null | undefined, availableModes: ModeOption[]): string {
  const fallback = availableModes.find((item) => item.is_default)?.key || 'execute'
  const key = String(mode || '').trim().toLowerCase()
  if (!key) {
    return fallback
  }

  const allowed = new Set([
    ...FALLBACK_MODE_KEYS,
    ...availableModes.map((item) => String(item.key || '').trim().toLowerCase()).filter(Boolean),
  ])

  return allowed.has(key) ? key : fallback
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const typed = block as { type?: unknown; text?: unknown }
    if (String(typed.type || '').toLowerCase() !== 'text') continue
    if (typeof typed.text === 'string' && typed.text.trim()) {
      parts.push(typed.text)
    }
  }
  return parts.join('\n').trim()
}

function extractImageAttachment(content: unknown): ImageAttachment | undefined {
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const typed = block as { type?: unknown; source?: unknown }
    if (String(typed.type || '').toLowerCase() !== 'image') continue
    const source = typed.source
    if (!source || typeof source !== 'object') continue
    const normalized = source as { type?: unknown; url?: unknown; data?: unknown; media_type?: unknown }
    const sourceType = String(normalized.type || '').toLowerCase()
    if (sourceType === 'url' && typeof normalized.url === 'string') {
      return { url: normalized.url }
    }
    if (sourceType === 'base64' && typeof normalized.data === 'string') {
      return {
        data: normalized.data,
        media_type: typeof normalized.media_type === 'string' ? normalized.media_type : 'image/png',
      }
    }
  }
  return undefined
}

function asFiniteNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const fromIso = Date.parse(value)
    if (Number.isFinite(fromIso)) {
      return fromIso
    }
    const fromNumeric = Number(value)
    if (Number.isFinite(fromNumeric)) {
      return fromNumeric
    }
  }
  return Date.now()
}

function normalizeUsage(value: unknown): Message['usage'] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>

  const hasUsageField = (
    raw.input_tokens !== undefined
    || raw.output_tokens !== undefined
    || raw.model !== undefined
    || raw.input_cache_read_tokens !== undefined
    || raw.input_cache_write_tokens !== undefined
  )
  if (!hasUsageField) return undefined

  const usage: Message['usage'] = {
    input_tokens: asFiniteNumber(raw.input_tokens),
    output_tokens: asFiniteNumber(raw.output_tokens),
    model: String(raw.model || '').trim() || 'unknown',
  }

  const cacheRead = asFiniteNumber(raw.input_cache_read_tokens)
  const cacheWrite = asFiniteNumber(raw.input_cache_write_tokens)
  if (cacheRead > 0) {
    usage.input_cache_read_tokens = cacheRead
  }
  if (cacheWrite > 0) {
    usage.input_cache_write_tokens = cacheWrite
  }
  return usage
}

const CATEGORY_KEYWORDS: Array<[TodoItem['category'], string[]]> = [
  ['fix', ['fix', 'bug', 'patch', 'repair', 'resolve', 'correct']],
  ['test', ['test', 'verify', 'validate', 'check', 'spec', 'assert', 'coverage']],
  ['deploy', ['deploy', 'release', 'publish', 'ship', 'push', 'launch']],
  ['docs', ['document', 'docs', 'readme', 'comment', 'annotate', 'write']],
  ['design', ['design', 'architect', 'structure', 'plan', 'model', 'schema']],
  ['review', ['review', 'audit', 'inspect', 'analyse', 'analyze', 'assess']],
  ['analysis', ['analyse', 'analyze', 'investigate', 'explore', 'examine', 'understand', 'identify']],
  ['code', ['implement', 'build', 'create', 'add', 'refactor', 'update', 'modify', 'generate', 'code']],
]

function detectCategory(title: string): TodoItem['category'] | undefined {
  const lower = title.toLowerCase()
  for (const [cat, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return cat
  }
  return undefined
}

/** Tick the first `count` unchecked `- [ ]` boxes in markdown text to `- [x]`. */
function tickMdCheckboxes(text: string, count: number): string {
  let n = 0
  return text.replace(/- \[ \] /g, () => {
    n++
    return n <= count ? '- [x] ' : '- [ ] '
  })
}

function normalizeTodoItems(value: unknown): TodoItem[] | undefined {
  if (!Array.isArray(value)) return undefined

  const rows: TodoItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const title = String(raw.title || '').trim()
    if (!title) continue
    const id = String(raw.id || rows.length + 1)
    const statusRaw = String(raw.status || 'pending').toLowerCase()
    const status: TodoItem['status'] = statusRaw === 'completed'
      ? 'completed'
      : statusRaw === 'in_progress'
        ? 'in_progress'
        : 'pending'
    const detail = raw.detail ? String(raw.detail).trim() : undefined
    const tool = raw.tool ? String(raw.tool).trim() : undefined
    const category = (raw.category as TodoItem['category']) || detectCategory(title)
    rows.push({ id, title, status, detail, tool, category })
  }

  return rows.length > 0 ? rows : undefined
}

/**
 * Auto-extract a task plan from model text when no tool-generated todos exist.
 * Works for ALL models (Ollama, local, cloud) — looks for numbered lists or
 * checklist sections that look like implementation steps.
 * Only fires if response has 3+ steps (heavy task threshold).
 */
function extractTodoPlanFromText(content: string): TodoItem[] | undefined {
  const text = String(content || '').trim()
  if (!text) return undefined

  // Look for a plan/steps/task section heading first, then fall back to a
  // numbered list anywhere in the text.
  const SECTION_RE = /(?:^|\n)#+\s*(?:plan|steps?|tasks?|implementation|todo|roadmap|approach)[:\s]*\n([\s\S]{20,600})/i
  const sectionMatch = SECTION_RE.exec(text)
  const searchIn = sectionMatch ? sectionMatch[1] : text

  // Match numbered list items: "1. ...", "1) ..."
  const NUMBERED_RE = /^\s*(\d+)[.)]\s+(.+)/gm
  // Match checkbox items: "- [ ] ...", "* [ ] ...", "- [x] ..."
  const CHECK_RE = /^\s*[-*]\s+\[[ xX]\]\s+(.+)/gm

  const items: TodoItem[] = []

  let m: RegExpExecArray | null
  NUMBERED_RE.lastIndex = 0
  while ((m = NUMBERED_RE.exec(searchIn)) !== null) {
    const title = m[2].trim().replace(/\*\*/g, '').replace(/`/g, '').slice(0, 120)
    if (title.length < 5) continue
    items.push({
      id: String(items.length + 1),
      title,
      status: 'pending',
      category: detectCategory(title),
    })
    if (items.length >= 12) break
  }

  // If no numbered items, try checkboxes
  if (items.length === 0) {
    CHECK_RE.lastIndex = 0
    while ((m = CHECK_RE.exec(searchIn)) !== null) {
      const title = m[1].trim().replace(/\*\*/g, '').slice(0, 120)
      if (title.length < 5) continue
      items.push({
        id: String(items.length + 1),
        title,
        status: 'pending',
        category: detectCategory(title),
      })
      if (items.length >= 12) break
    }
  }

  // Only return for heavy tasks (3+ steps)
  return items.length >= 3 ? items : undefined
}

function normalizeArtifactItems(value: unknown): ArtifactItem[] | undefined {
  if (!Array.isArray(value)) return undefined

  const rows: ArtifactItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const title = String(raw.title || '').trim()
    const content = String(raw.content || '')
    if (!title || !content.trim()) continue
    rows.push({
      id: String(raw.id || `artifact-${rows.length + 1}`),
      title,
      language: String(raw.language || 'text').trim() || 'text',
      content,
      filename: String(raw.filename || '').trim() || undefined,
    })
  }

  return rows.length > 0 ? rows : undefined
}

function normalizePreviewItems(value: unknown): PreviewItem[] | undefined {
  if (!Array.isArray(value)) return undefined

  const rows: PreviewItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const url = String(raw.url || '').trim()
    if (!url) continue
    rows.push({
      id: String(raw.id || `preview-${rows.length + 1}`),
      url,
    })
  }

  return rows.length > 0 ? rows : undefined
}

const PREVIEW_URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi
const EXCLUDED_PREVIEW_HOSTS = new Set([
  'oaidalleapiprodscus.blob.core.windows.net',
])

function trimDetectedUrl(value: string): string {
  return value.replace(/[),.;!?]+$/, '').trim()
}

function likelyPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (EXCLUDED_PREVIEW_HOSTS.has(host)) return false
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true
    if (/\.vercel\.app$/.test(host)) return true
    if (/\.netlify\.app$/.test(host)) return true
    if (/\.pages\.dev$/.test(host)) return true
    if (/\.onrender\.com$/.test(host)) return true
    if (/\.fly\.dev$/.test(host)) return true

    const port = parsed.port.trim()
    if (port === '3000' || port === '4173' || port === '5173' || port === '8080') return true

    return /preview|demo|app|site/i.test(parsed.pathname)
  } catch {
    return false
  }
}

function extractPreviews(content: string): PreviewItem[] | undefined {
  const text = String(content || '')
  if (!text.trim()) return undefined

  const matches = text.match(PREVIEW_URL_RE) || []
  const urls = Array.from(new Set(matches.map(trimDetectedUrl).filter((url) => likelyPreviewUrl(url))))
  if (urls.length === 0) return undefined

  return urls.slice(0, 3).map((url, index) => ({
    id: `preview-${index + 1}`,
    url,
  }))
}

const ARTIFACT_FENCE_RE = /```([^`\n]*)\n([\s\S]*?)```/g

const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  html: 'html',
  css: 'css',
  json: 'json',
  markdown: 'md',
  md: 'md',
  bash: 'sh',
  sh: 'sh',
  powershell: 'ps1',
  yaml: 'yml',
  yml: 'yml',
  toml: 'toml',
  sql: 'sql',
}

function inferLanguage(info: string): string {
  const parts = info.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'text'

  if (parts[0].toLowerCase() === 'artifact' && parts[1]) {
    return parts[1].toLowerCase()
  }

  if (parts[0].toLowerCase().startsWith('artifact:')) {
    return parts[1]?.toLowerCase() || 'text'
  }

  return parts[0].toLowerCase()
}

function inferFilename(info: string, language: string, index: number): string | undefined {
  const raw = info.trim()
  const fileMatch = raw.match(/(?:file|filename)=([^\s]+)/i)
  if (fileMatch?.[1]) {
    return fileMatch[1].trim()
  }

  const artifactMatch = raw.match(/^artifact(?::([^\s]+))?/i)
  if (artifactMatch?.[1]) {
    return artifactMatch[1].trim()
  }

  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2 && /[\\/]|\./.test(parts[1])) {
    return parts[1]
  }
  if (parts.length >= 3 && /[\\/]|\./.test(parts[2])) {
    return parts[2]
  }

  const ext = LANGUAGE_EXTENSION_MAP[language] || 'txt'
  return `artifact-${index}.${ext}`
}

/**
 * Pushes any v2 artifacts in the accumulated content into the session-artifact
 * store and returns the list of ArtifactRef pointers that should be attached
 * to the message. Running this on every streamed token is safe — the store
 * dedupes by (id, version) and only replaces when the body has changed.
 */
const persistedArtifacts = new Set<string>()

function persistArtifact(sessionId: string, artifact: {
  id: string
  type: string
  title: string
  version: number
  files: Array<{ path: string; content: string; language: string }>
  entrypoint?: string
}): void {
  const key = `${sessionId}:${artifact.id}:${artifact.version}`
  if (persistedArtifacts.has(key)) return
  persistedArtifacts.add(key)
  void fetch(`/api/artifacts/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      version: artifact.version,
      files: artifact.files,
      entrypoint: artifact.entrypoint,
    }),
  }).catch(() => {
    persistedArtifacts.delete(key)
  })
}

function ingestArtifactsV2(content: string, allowIncomplete = false): ArtifactRef[] {
  const { artifacts } = parseArtifacts(content, { allowIncomplete })
  if (artifacts.length === 0) return []
  const store = useChatStore.getState()
  const sessionId = store.sessionId || ''
  const refs: ArtifactRef[] = []
  for (const artifact of artifacts) {
    store.upsertSessionArtifact(artifact)
    refs.push({ id: artifact.id, version: artifact.version })
    if (sessionId) {
      persistArtifact(sessionId, artifact)
    }
  }
  return refs
}

function mergeArtifactRefs(existing: ArtifactRef[] | undefined, next: ArtifactRef[]): ArtifactRef[] | undefined {
  if ((!existing || existing.length === 0) && next.length === 0) return undefined
  const merged: ArtifactRef[] = []
  const seen = new Set<string>()
  for (const ref of [...(existing || []), ...next]) {
    const key = `${ref.id}:${ref.version}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(ref)
  }
  return merged.length > 0 ? merged : undefined
}

function extractArtifacts(content: string, artifactModeEnabled: boolean): ArtifactItem[] | undefined {
  const text = String(content || '')
  if (!text.trim()) return undefined

  ARTIFACT_FENCE_RE.lastIndex = 0
  const rows: ArtifactItem[] = []
  const dedupe = new Set<string>()

  let match: RegExpExecArray | null = null
  let index = 0
  while ((match = ARTIFACT_FENCE_RE.exec(text)) !== null) {
    index += 1
    const info = String(match[1] || '').trim()
    const code = String(match[2] || '')
    const isExplicitArtifact = /^artifact(?::|\b)/i.test(info)

    if (!artifactModeEnabled && !isExplicitArtifact) {
      continue
    }

    if (!code.trim()) continue

    const language = inferLanguage(info)
    const filename = inferFilename(info, language, index)
    const title = filename || `artifact-${index}`
    const key = `${title}\n${code}`
    if (dedupe.has(key)) continue
    dedupe.add(key)

    rows.push({
      id: `artifact-${rows.length + 1}`,
      title,
      language,
      content: code,
      filename,
    })
  }

  return rows.length > 0 ? rows : undefined
}

function normalizeToolCalls(value: unknown): ToolCall[] | undefined {
  if (!Array.isArray(value)) return undefined

  const rows: ToolCall[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>

    const rawInput = raw.input
    const input = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : {}

    const streamSource = Array.isArray(raw.streamLines)
      ? raw.streamLines
      : (Array.isArray(raw.stream_lines) ? raw.stream_lines : [])
    const streamLines = streamSource
      .map((line) => String(line || ''))
      .filter((line) => line.length > 0)

    const output = raw.output === undefined || raw.output === null ? undefined : String(raw.output)
    const toolName = String(raw.tool || '').trim()
    if (!toolName && !output && streamLines.length === 0) continue

    const metadata = raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined

    const entry: ToolCall = {
      tool: toolName || 'tool',
      input,
    }

    const toolUseId = String(raw.tool_use_id || raw.toolUseId || '').trim()
    if (toolUseId) {
      entry.tool_use_id = toolUseId
    }
    if (output !== undefined) {
      entry.output = output
    }
    if (typeof raw.success === 'boolean') {
      entry.success = raw.success
    }
    if (typeof raw.approved === 'boolean') {
      entry.approved = raw.approved
    }
    if (streamLines.length > 0) {
      entry.streamLines = streamLines
    }
    if (metadata) {
      entry.metadata = metadata
    }

    rows.push(entry)
  }

  return rows.length > 0 ? rows : undefined
}

function buildStructuredContent(
  text: string,
  imageAttachment?: ImageAttachment,
  extraBlocks: Array<Record<string, unknown>> = [],
): string | Array<Record<string, unknown>> {
  const trimmed = text.trim()
  const hasImage = Boolean(imageAttachment && (imageAttachment.url || imageAttachment.data))
  const hasExtras = extraBlocks.length > 0
  if (!hasImage && !hasExtras) {
    return trimmed
  }

  const blocks: Array<Record<string, unknown>> = []
  if (trimmed) {
    blocks.push({ type: 'text', text: trimmed })
  }
  if (imageAttachment?.data) {
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageAttachment.media_type || 'image/png',
        data: imageAttachment.data,
      },
    })
  } else if (imageAttachment?.url) {
    blocks.push({
      type: 'image',
      source: {
        type: 'url',
        url: imageAttachment.url,
      },
    })
  }

  for (const block of extraBlocks) {
    if (!block || typeof block !== 'object') continue
    blocks.push(block)
  }

  return blocks
}

export function useChat() {
  const store = useChatStore()
  const abortRef = useRef<AbortController | null>(null)
  const activeAssistantIdRef = useRef<string | null>(null)
  const pendingPermissionCountRef = useRef(0)

  const filteredMessages = useMemo(() => {
    const tokens = store.messageSearchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    if (tokens.length === 0) return store.messages

    return store.messages.filter((msg) => {
      const contentText = msg.content.toLowerCase()
      let toolText = ''

      for (const tc of msg.toolCalls || []) {
        let inputText = ''
        try {
          inputText = JSON.stringify(tc.input).toLowerCase()
        } catch {
          inputText = ''
        }
        toolText += ` ${inputText} ${String(tc.output || '').toLowerCase()}`
      }

      return tokens.every((token) => contentText.includes(token) || toolText.includes(token))
    })
  }, [store.messages, store.messageSearchQuery])

  const loadModes = useCallback(async () => {
    try {
      const res = await fetch(`${API}/modes`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      const modes = (data.modes || []) as ModeOption[]
      store.setAvailableModes(modes)
      if (!store.sessionMode) {
        store.setSessionMode((data.default_mode as string) || 'execute')
      }
    } catch (e) {
      console.error('Failed to load modes', e)
      store.setAvailableModes([])
    }
  }, [store])

  const loadCommands = useCallback(async () => {
    try {
      const res = await fetch(`${API}/commands`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      useChatStore.getState().setCommands((data.commands || []) as CommandDefinition[])
    } catch (e) {
      console.error('Failed to load commands', e)
      useChatStore.getState().setCommands([])
    }
  }, [])

  const loadPendingPermissions = useCallback(async (sessionId?: string | null) => {
    const sid = (sessionId ?? store.sessionId) || ''
    if (!sid) {
      store.setPermissionChallenges([])
      pendingPermissionCountRef.current = 0
      return
    }

    try {
      const res = await fetch(`${API}/permissions/pending?session_id=${encodeURIComponent(sid)}`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      const pending = (data.pending || []) as PermissionChallenge[]
      store.setPermissionChallenges(pending)
      if (pending.length > pendingPermissionCountRef.current) {
        const newest = pending[0]
        const toolName = newest?.tool_name || 'Tool'
        pushUiNotification('Permission required', `${toolName} is waiting for approval.`, 'warning')
      }
      pendingPermissionCountRef.current = pending.length
    } catch (e) {
      console.error('Failed to load pending permissions', e)
    }
  }, [store])

  const respondPermission = useCallback(async (
    challengeId: string,
    approve: boolean,
    remember: boolean,
    sessionId?: string | null,
  ) => {
    try {
      const res = await fetch(`${API}/permissions/${encodeURIComponent(challengeId)}/decision`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ approve, remember }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadPendingPermissions(sessionId ?? store.sessionId)
    } catch (e) {
      console.error('Failed to submit permission decision', e)
      store.setError(String(e))
    }
  }, [loadPendingPermissions, store])

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch(`${API}/usage?days=7&limit=50`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setUsageSummary(data)
    } catch (e) {
      console.error('Failed to load usage summary', e)
      store.setUsageSummary(null)
    }
  }, [store])

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sessions`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setSessions(data.sessions || [])
      await loadUsage()
    } catch (e) {
      console.error('Failed to load sessions', e)
    }
  }, [loadUsage, store])

  const loadSession = useCallback(async (sessionId: string) => {
    abortRef.current?.abort()
    activeAssistantIdRef.current = null
    store.setLoading(false)
    try {
      const res = await fetch(`${API}/sessions/${sessionId}`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) return
      const data = await res.json()
      store.setSessionId(sessionId)

      // Convert raw history to display messages.
      const rawMessages: unknown[] = Array.isArray(data.messages) ? data.messages : []
      const messages: Message[] = rawMessages
        .filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .filter((item) => String(item.role || '').toLowerCase() !== 'system')
        .map((item) => {
          const role = String(item.role || '').toLowerCase() === 'user' ? 'user' : 'assistant'
          const content = extractTextContent(item.content)
          const artifactModeEnabled = useChatStore.getState().artifactModeEnabled
          const imageFromContent = extractImageAttachment(item.content)
          const directImage = item.image_attachment
          const imageFromDirectAttachment = (() => {
            if (!directImage || typeof directImage !== 'object') return undefined
            const typed = directImage as Record<string, unknown>
            const url = typeof typed.url === 'string' ? String(typed.url) : undefined
            const data = typeof typed.data === 'string' ? String(typed.data) : undefined
            const media_type = typeof typed.media_type === 'string' ? String(typed.media_type) : undefined
            if (!url && !data) return undefined
            return { url, data, media_type }
          })()
          const imageAttachment = imageFromContent || imageFromDirectAttachment

          return {
            id: genId(),
            role,
            content,
            imageAttachment,
            advisorReview: role === 'assistant' && item.advisor_review && typeof item.advisor_review === 'object'
              ? (item.advisor_review as AdvisorReview)
              : undefined,
            toolCalls: role === 'assistant' ? normalizeToolCalls(item.tool_calls) : undefined,
            todoItems: role === 'assistant'
              ? normalizeTodoItems(item.todo_items)
              : undefined,
            artifacts: role === 'assistant'
              ? (normalizeArtifactItems(item.artifacts) || extractArtifacts(content, artifactModeEnabled))
              : undefined,
            previews: role === 'assistant'
              ? (normalizePreviewItems(item.previews) || extractPreviews(content))
              : undefined,
            usage: role === 'assistant' ? normalizeUsage(item.usage) : undefined,
            timestamp: normalizeTimestamp(item.timestamp),
          }
        })
      // Re-ingest v2 artifacts from the loaded history so the version timeline is rebuilt.
      store.clearSessionArtifacts()
      for (const msg of messages) {
        if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
          const refs = ingestArtifactsV2(msg.content, true)
          if (refs.length > 0) {
            msg.artifactRefs = refs
          }
        }
      }
      store.setMessages(messages)
      const metadata = data.metadata as { mode?: string; project_dir?: string } | undefined
      const mode = normalizeClientMode(metadata?.mode || 'execute', useChatStore.getState().availableModes)
      store.setSessionMode(mode)
      const sessionProjectDir = String(metadata?.project_dir || '').trim()
      if (sessionProjectDir) {
        store.setProjectDir(sessionProjectDir)
      }

      try {
        const checkpointsRes = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/checkpoints`, {
          headers: buildApiHeaders(),
        })
        if (checkpointsRes.ok) {
          const checkpointsData = await checkpointsRes.json()
          store.setCheckpoints((checkpointsData.checkpoints || []) as Checkpoint[])
        }
      } catch {
        store.setCheckpoints([])
      }
    } catch (e) {
      console.error('Failed to load session', e)
    }
  }, [store])

  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadSessions()
    } catch (e) {
      store.setError(String(e))
    }
  }, [loadSessions, store])

  const loadCheckpoints = useCallback(async (targetSessionId?: string | null) => {
    const sid = targetSessionId ?? store.sessionId
    if (!sid) {
      const current = useChatStore.getState().checkpoints
      if (current.length > 0) {
        store.setCheckpoints([])
      }
      return
    }

    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sid)}/checkpoints`, {
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      const next = (data.checkpoints || []) as Checkpoint[]
      const current = useChatStore.getState().checkpoints
      const unchanged =
        current.length === next.length &&
        current.every((item, idx) => {
          const rhs = next[idx]
          return (
            item.checkpoint_id === rhs?.checkpoint_id &&
            item.label === rhs?.label &&
            item.message_count === rhs?.message_count &&
            item.created_at === rhs?.created_at
          )
        })

      if (!unchanged) {
        store.setCheckpoints(next)
      }
    } catch (e) {
      console.error('Failed to load checkpoints', e)
      const current = useChatStore.getState().checkpoints
      if (current.length > 0) {
        store.setCheckpoints([])
      }
    }
  }, [store])

  const createCheckpoint = useCallback(async (label?: string, targetSessionId?: string | null) => {
    const sid = targetSessionId ?? store.sessionId
    if (!sid) return
    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sid)}/checkpoint`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ label: label || null }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadCheckpoints(sid)
    } catch (e) {
      store.setError(String(e))
    }
  }, [loadCheckpoints, store])

  const restoreCheckpoint = useCallback(async (checkpointId: string, targetSessionId?: string | null) => {
    const sid = targetSessionId ?? store.sessionId
    if (!sid) return
    try {
      const res = await fetch(
        `${API}/sessions/${encodeURIComponent(sid)}/checkpoints/${encodeURIComponent(checkpointId)}/restore`,
        {
          method: 'POST',
          headers: buildApiHeaders(),
        },
      )
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadSession(sid)
      await loadCheckpoints(sid)
    } catch (e) {
      store.setError(String(e))
    }
  }, [loadCheckpoints, loadSession, store])

  const runDream = useCallback(async (focus?: string) => {
    if (store.isLoading) return

    abortRef.current?.abort()
    abortRef.current = null
    activeAssistantIdRef.current = null

    store.setError(null)
    store.setLoading(true)

    let sessionId = store.sessionId
    const assistantId = genId()
    store.addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
    })

    try {
      if (!sessionId) {
        const newSessionRes = await fetch(`${API}/new-session`, {
          method: 'POST',
          headers: buildApiHeaders(),
        })
        if (!newSessionRes.ok) {
          throw new Error(await parseApiError(newSessionRes))
        }
        const payload = await newSessionRes.json()
        sessionId = String(payload.session_id || '').trim()
        if (!sessionId) {
          throw new Error('Could not create a session for dream mode')
        }
        store.setSessionId(sessionId)
      }

      const res = await fetch(`${API}/dream`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          session_id: sessionId,
          project_dir: store.projectDir || null,
          focus: (focus || '').trim() || null,
        }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }

      const data = await res.json()
      const dreamText = String(data.dream || '').trim() || 'No dream output generated.'
      store.updateMessageById(assistantId, (msg) => ({
        ...msg,
        content: dreamText,
        isStreaming: false,
      }))

      await loadSessions()
      await loadUsage()
      if (sessionId) {
        await loadCheckpoints(sessionId)
      }
    } catch (e) {
      const message = String(e)
      store.setError(message)
      store.updateMessageById(assistantId, (msg) => ({
        ...msg,
        content: msg.content || `Error: ${message}`,
        isStreaming: false,
      }))
    } finally {
      store.setLoading(false)
    }
  }, [loadCheckpoints, loadSessions, loadUsage, store])

  const setSessionMode = useCallback(async (mode: string, targetSessionId?: string | null) => {
    const normalized = normalizeClientMode(mode, store.availableModes)
    store.setSessionMode(normalized)

    const sid = targetSessionId ?? store.sessionId
    if (!sid) return

    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sid)}/mode`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ mode: normalized }),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setSessionMode((data.mode as string) || normalized)
    } catch (e) {
      console.error('Failed to set session mode', e)
      store.setError(String(e))
    }
  }, [store])

  const newSession = useCallback(async () => {
    abortRef.current?.abort()
    activeAssistantIdRef.current = null
    store.setLoading(false)
    try {
      const res = await fetch(`${API}/new-session`, {
        method: 'POST',
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      const data = await res.json()
      store.setSessionId(data.session_id)
      store.setSessionMode('execute')
      store.setCheckpoints([])
      store.clearMessages()
      store.clearSessionArtifacts()
    } catch (e) {
      console.error('Failed to create session', e)
      store.setError(String(e))
    }
  }, [store])

  const forkSession = useCallback(async (sessionId: string, atIndex: number) => {
    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/fork`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ at_index: atIndex }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const data = await res.json()
      const newId = String(data.session_id || '')
      if (!newId) throw new Error('No session id returned')
      await loadSessions()
      await loadSession(newId)
      return newId
    } catch (e) {
      console.error('Failed to fork session', e)
      store.setError(String(e))
      return null
    }
  }, [loadSession, loadSessions, store])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: buildApiHeaders(),
      })
      if (!res.ok) {
        throw new Error(await parseApiError(res))
      }
      await loadSessions()
      if (store.sessionId === sessionId) {
        abortRef.current?.abort()
        activeAssistantIdRef.current = null
        store.setLoading(false)
        store.setSessionId(null)
        store.setCheckpoints([])
        store.clearMessages()
      }
    } catch (e) {
      console.error('Failed to delete session', e)
      store.setError(String(e))
    }
  }, [loadSessions, store])

  const sendMessage = useCallback(async (
    content: string,
    imageAttachment?: ImageAttachment,
    extraContentBlocks: Array<Record<string, unknown>> = [],
    eventHandlers?: StreamEventHandlers,
    options?: SendMessageOptions,
  ) => {
    if ((!content.trim() && !imageAttachment && extraContentBlocks.length === 0) || store.isLoading) return

    const silent = Boolean(options?.silent)

    // Abort previous stream
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    store.setError(null)
    store.setLoading(true)

    // Add user message
    const attachmentSummary = extraContentBlocks
      .map((block) => {
        if (typeof block?.text === 'string') {
          return block.text.split('\n')[0]
        }
        return '[Attached file]'
      })
      .join('\n')

    const displayContent = content.trim() || attachmentSummary || (imageAttachment ? '[Attached image]' : '')

    if (!silent) {
      const userMsg: Message = {
        id: genId(),
        role: 'user',
        content: displayContent,
        imageAttachment,
        timestamp: Date.now(),
      }
      store.addMessage(userMsg)
    }

    // Placeholder assistant message
    const assistantId = silent ? null : genId()
    if (assistantId) {
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        toolCalls: [],
        timestamp: Date.now(),
      }
      store.addMessage(assistantMsg)
      activeAssistantIdRef.current = assistantId
    }

    let sessionId = store.sessionId
    let permissionPollTimer: ReturnType<typeof window.setInterval> | null = null

    try {
      if (!sessionId) {
        const res = await fetch(`${API}/new-session`, {
          method: 'POST',
          headers: buildApiHeaders(),
        })
        if (!res.ok) {
          throw new Error(await parseApiError(res))
        }
        const data = await res.json()
        sessionId = data.session_id
        store.setSessionId(sessionId!)
      }

      await loadPendingPermissions(sessionId)
      permissionPollTimer = window.setInterval(() => {
        void loadPendingPermissions(sessionId)
      }, 1000)

      const response = await fetch(`${API}/send`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify((() => {
          const structured = buildStructuredContent(content, imageAttachment, extraContentBlocks)
          const basePayload: Record<string, unknown> = {
            session_id: sessionId,
            project_dir: store.projectDir || null,
            mode: normalizeClientMode(store.sessionMode || 'execute', store.availableModes),
            artifact_mode: Boolean(store.artifactModeEnabled),
          }
          if (Array.isArray(structured)) {
            basePayload.content = structured
            basePayload.message = extractTextContent(structured)
          } else {
            basePayload.message = structured
          }
          if (imageAttachment && (imageAttachment.data || imageAttachment.url)) {
            basePayload.image_attachment = imageAttachment
          }
          return basePayload
        })()),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          try {
            const event = JSON.parse(raw)
            handleEvent(event, assistantId, eventHandlers, silent)
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      store.setError(String(e))
      if (assistantId) {
        store.updateMessageById(assistantId, (msg) => ({
          ...msg,
          isStreaming: false,
          content: msg.content || 'An error occurred.',
        }))
      }
      eventHandlers?.onError?.(String(e), { type: 'error', message: String(e) })
    } finally {
      if (permissionPollTimer !== null) {
        window.clearInterval(permissionPollTimer)
      }
      store.setLoading(false)
      if (assistantId) {
        store.updateMessageById(assistantId, (msg) => ({ ...msg, isStreaming: false }))
      }
      if (assistantId && activeAssistantIdRef.current === assistantId) {
        activeAssistantIdRef.current = null
      }
      loadSessions()
      loadUsage()
      loadCheckpoints(sessionId)
      loadPendingPermissions(sessionId)
    }
  }, [loadCheckpoints, loadPendingPermissions, loadSessions, loadUsage, store])

  function handleEvent(
    event: Record<string, unknown>,
    assistantId: string | null,
    eventHandlers?: StreamEventHandlers,
    silent = false,
  ) {
    const toolUseId = typeof event.tool_use_id === 'string' ? event.tool_use_id : ''

    const resolveToolCallIndex = (toolCalls: ToolCall[]): number => {
      if (toolUseId) {
        const idx = toolCalls.findIndex((tc) => tc.tool_use_id === toolUseId)
        if (idx >= 0) return idx
      }
      return toolCalls.length - 1
    }

    switch (event.type) {
      case 'text':
        if (!silent && assistantId) {
          store.updateMessageById(assistantId, (msg) => {
            const next = msg.content + String(event.content || '')
            const artifactModeEnabled = useChatStore.getState().artifactModeEnabled
            const artifactRefs = ingestArtifactsV2(next)
            return {
              ...msg,
              content: next,
              artifacts: extractArtifacts(next, artifactModeEnabled),
              artifactRefs: artifactRefs.length > 0 ? artifactRefs : msg.artifactRefs,
              previews: extractPreviews(next),
            }
          })
        }
        eventHandlers?.onText?.(String(event.content || ''), event)
        break

      case 'tool_start': {
        const tc: ToolCall = {
          tool: event.tool as string,
          input: event.input as Record<string, unknown>,
          approved: event.approved as boolean,
          tool_use_id: toolUseId || undefined,
          streamLines: [],
        }
        if (!silent && assistantId) {
          store.updateMessageById(assistantId, (msg) => ({
            ...msg,
            toolCalls: [...(msg.toolCalls || []), tc],
          }))
        }
        eventHandlers?.onToolStart?.(event)
        break
      }

      case 'tool_output': {
        const line = String(event.line || '')
        if (!line) break
        if (!silent && assistantId) {
          store.updateMessageById(assistantId, (msg) => {
            const tcs = [...(msg.toolCalls || [])]
            const idx = resolveToolCallIndex(tcs)
            if (idx < 0) return msg
            const target = tcs[idx]
            tcs[idx] = {
              ...target,
              streamLines: [...(target.streamLines || []), line],
            }
            return { ...msg, toolCalls: tcs }
          })
        }
        eventHandlers?.onToolOutput?.(line, event)
        break
      }

      case 'tool_result': {
        if (!silent && assistantId) {
          store.updateMessageById(assistantId, (msg) => {
            const tcs = [...(msg.toolCalls || [])]
            const idx = resolveToolCallIndex(tcs)
            if (idx >= 0) {
              tcs[idx] = {
                ...tcs[idx],
                tool_use_id: tcs[idx].tool_use_id || toolUseId || undefined,
                output: String(event.output || ''),
                success: event.success as boolean,
                metadata: (event.metadata as Record<string, unknown>) || undefined,
              }
            }
            return { ...msg, toolCalls: tcs }
          })
        }
        eventHandlers?.onToolResult?.(event)
        break
      }

      case 'done':
        if (!silent && assistantId) {
          store.updateMessageById(assistantId, (msg) => {
            // Mark in-progress items done
            const finishedTodos = (msg.todoItems || []).map((item) => ({
              ...item,
              status: item.status === 'pending' ? 'completed' : item.status,
            }))
            // If no tool-generated todos, try to extract from response text
            const autoTodos = finishedTodos.length === 0
              ? extractTodoPlanFromText(msg.content)
              : undefined
            const resolvedTodos = finishedTodos.length > 0 ? finishedTodos : (autoTodos ?? finishedTodos)
            // Tick checkboxes matching the number of completed backend todos
            const completedCount = resolvedTodos.filter((t) => t.status === 'completed').length
            const doneContent = completedCount > 0
              ? tickMdCheckboxes(msg.content, completedCount)
              : msg.content
            const artifactModeEnabled = useChatStore.getState().artifactModeEnabled
            const finalArtifactRefs = ingestArtifactsV2(doneContent, true)
            return {
              ...msg,
              isStreaming: false,
              content: doneContent,
              usage: event.usage as Message['usage'],
              todoItems: resolvedTodos,
              artifacts: extractArtifacts(doneContent, artifactModeEnabled),
              artifactRefs: mergeArtifactRefs(msg.artifactRefs, finalArtifactRefs),
            }
          })
        }
        eventHandlers?.onDone?.(event.usage as Message['usage'] | undefined, event)
        if (!silent) {
          pushUiNotification('Task complete', 'Assistant response finished.', 'success')

          // Play completion chime when tab is in background.
          if (typeof document !== 'undefined' && document.hidden) {
            try {
              const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
              if (Ctx) {
                const ctx = new Ctx()
                const now = ctx.currentTime
                const freqs = [880, 1100]
                freqs.forEach((freq, i) => {
                  const offset = i * 0.14
                  const osc = ctx.createOscillator()
                  const gain = ctx.createGain()
                  osc.connect(gain)
                  gain.connect(ctx.destination)
                  osc.type = 'sine'
                  osc.frequency.setValueAtTime(freq, now + offset)
                  gain.gain.setValueAtTime(0.18, now + offset)
                  gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.35)
                  osc.start(now + offset)
                  osc.stop(now + offset + 0.35)
                })
                void ctx.close()
              }
            } catch {
              // AudioContext blocked; keep notification silent.
            }
          }
        }
        break

      case 'error':
        store.setError(event.message as string)
        if (!silent && assistantId) {
          store.updateMessageById(assistantId, (msg) => ({
            ...msg,
            isStreaming: false,
            content: msg.content || `Error: ${event.message}`,
          }))
        }
        eventHandlers?.onError?.(String(event.message || ''), event)
        if (!silent) {
          pushUiNotification('Agent error', String(event.message || 'Unknown error'), 'error')
        }
        break

      case 'meta':
        // Metadata event currently includes request/session identifiers.
        if (typeof event.mode === 'string' && event.mode.trim()) {
          const currentModes = useChatStore.getState().availableModes
          store.setSessionMode(normalizeClientMode(event.mode, currentModes))
        }
        eventHandlers?.onMeta?.(event)
        break

      case 'advisor_review':
        if (!silent && assistantId) {
          const rawReview = event.review
          const review = (rawReview && typeof rawReview === 'object') ? (rawReview as AdvisorReview) : undefined
          if (review) {
            store.updateMessageById(assistantId, (msg) => ({
              ...msg,
              advisorReview: review,
            }))
          }
        }
        break

      case 'todo_plan': {
        if (!silent && assistantId) {
          const todos = normalizeTodoItems(event.todos)
          if (todos && todos.length > 0) {
            store.updateMessageById(assistantId, (msg) => ({
              ...msg,
              todoItems: todos,
            }))
          }
        }
        break
      }

      case 'todo_update': {
        if (!silent && assistantId) {
          const todos = normalizeTodoItems(event.todos)
          if (todos && todos.length > 0) {
            const completedCount = todos.filter((t) => t.status === 'completed').length
            store.updateMessageById(assistantId, (msg) => {
              // Tick the first N checkboxes in the message content to match completed todos
              const updatedContent = completedCount > 0
                ? tickMdCheckboxes(msg.content, completedCount)
                : msg.content
              return { ...msg, todoItems: todos, content: updatedContent }
            })
          }
        }
        break
      }

      case 'permission_request':
        // Reserved for future server-pushed permission events.
        pushUiNotification('Permission required', 'A tool call requires your approval.', 'warning')
        void loadPendingPermissions(store.sessionId)
        break
    }
  }

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
    store.setLoading(false)
    const activeId = activeAssistantIdRef.current
    if (activeId) {
      store.updateMessageById(activeId, (msg) => ({ ...msg, isStreaming: false }))
      activeAssistantIdRef.current = null
    }
    void loadPendingPermissions(store.sessionId)
  }, [loadPendingPermissions, store])

  return {
    ...store,
    filteredMessages,
    messageSearchQuery: store.messageSearchQuery,
    setMessageSearchQuery: store.setMessageSearchQuery,
    sendMessage,
    loadCommands,
    loadModes,
    loadSessions,
    loadSession,
    setSessionMode,
    newSession,
    deleteSession,
    forkSession,
    loadUsage,
    loadPendingPermissions,
    respondPermission,
    stopGeneration,
    loadCheckpoints,
    createCheckpoint,
    restoreCheckpoint,
    runDream,
    updateSessionTitle,
  }
}
