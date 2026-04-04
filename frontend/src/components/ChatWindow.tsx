import { useCallback, useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react'
import { Send, Square, FolderOpen, Zap, ImagePlus, X, Search, Terminal as TerminalIcon, Paperclip, CircleAlert } from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { MessageBubble } from './MessageBubble'
import { CommandDefinition } from '../store/chatStore'
import { TerminalPanel } from './TerminalPanel'
import { buildApiHeaders, parseApiError } from '../lib/api'

const CONTEXT_TOKEN_BUDGET = Number(import.meta.env.VITE_CONTEXT_TOKEN_BUDGET || 60000)
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_VISIBLE_ATTACHMENT_CHIPS = 8
const ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/zip,.zip,text/*,.py,.ts,.tsx,.js,.jsx,.md,.json,.yaml,.yml,.toml,.rs,.go,.java,.cpp,.c,.h'

type PendingImage = {
  previewUrl: string
  data: string
  media_type: string
  name: string
  size: number
}

interface FileAttachment {
  name: string
  size: number
  type: string
  data: string
  isImage: boolean
  isZip: boolean
  previewUrl?: string
}

const EXAMPLE_PROMPTS = [
  '/help',
  '/cost 7',
  '/session',
  '/memory show',
  '/mode',
  '/tasks',
  '/agents',
  '/skills',
  '/mcp list',
  'List all Python files in the current directory',
  'Read the contents of README.md',
  'Run the tests and show me the results',
]

const KNOWN_ROOT_COMMANDS: CommandDefinition[] = [
  { name: '/help', description: 'Show available commands' },
  { name: '/cost', description: 'Show token and estimated cost usage' },
  { name: '/session', description: 'Inspect or manage sessions' },
  { name: '/memory', description: 'Read or write memory notes' },
  { name: '/mode', description: 'Inspect or set session mode' },
  { name: '/provider', description: 'Show or switch provider profiles' },
  { name: '/doctor', description: 'Run runtime health checks' },
  { name: '/router', description: 'Inspect or set routing strategy' },
  { name: '/model', description: 'Inspect or override model' },
  { name: '/privacy', description: 'Show telemetry/privacy status' },
  { name: '/tasks', description: 'Manage background tasks' },
  { name: '/mcp', description: 'Manage MCP servers and tool calls' },
  { name: '/agents', description: 'Spawn and inspect sub-agents' },
  { name: '/skills', description: 'List and run bundled skills' },
  { name: '/search', description: 'Search the web with provider fallback' },
  { name: '/git', description: 'Run safe, read-only git command' },
  { name: '/checkpoint', description: 'Create/list/restore checkpoints' },
]

const FALLBACK_COMMANDS: CommandDefinition[] = [
  ...KNOWN_ROOT_COMMANDS,
  { name: '/session', description: 'List recent sessions' },
  { name: '/session current', description: 'Show current session id' },
  { name: '/memory <text>', description: 'Append note to global memory' },
  { name: '/memory show', description: 'Show loaded memory context' },
  { name: '/checkpoint', description: 'Create checkpoint for current session' },
  { name: '/checkpoint list', description: 'List session checkpoints' },
  { name: '/checkpoint restore <id> --yes', description: 'Restore a session checkpoint' },
  { name: '/mode', description: 'Show current session mode' },
  { name: '/mode list', description: 'List available execution modes' },
  { name: '/mode set <name>', description: 'Set session execution mode' },
  { name: '/mode reset', description: 'Reset mode to default' },
  { name: '/provider', description: 'Show provider profiles and active provider' },
  { name: '/provider list', description: 'List saved provider profiles' },
  { name: '/provider set <name>', description: 'Activate provider profile' },
  { name: '/doctor', description: 'Run runtime health checks' },
  { name: '/doctor report', description: 'Run and save full doctor report' },
  { name: '/router', description: 'Show smart router status' },
  { name: '/router strategy <name>', description: 'Set smart router strategy' },
  { name: '/model', description: 'Show current model/provider' },
  { name: '/model set <model>', description: 'Override model for this session' },
  { name: '/privacy', description: 'Show no-telemetry mode status' },
  { name: '/tasks', description: 'List recent tasks' },
  { name: '/tasks create <prompt>', description: 'Create a background task' },
  { name: '/tasks get <task_id>', description: 'Show task status' },
  { name: '/tasks stop <task_id>', description: 'Stop a running task' },
  { name: '/mcp list', description: 'List MCP server entries' },
  { name: '/mcp add <name> <command> [args...]', description: 'Add MCP server entry' },
  { name: '/mcp remove <name>', description: 'Remove MCP server entry' },
  { name: '/mcp tools <name>', description: 'Show discovered/configured tools' },
  { name: '/mcp call <name> <tool> [json_args]', description: 'Execute MCP tool' },
  { name: '/agents', description: 'List spawned sub-agents' },
  { name: '/agents spawn <goal>', description: 'Spawn sub-agent' },
  { name: '/agents get <agent_id>', description: 'Show sub-agent details' },
  { name: '/agents stop <agent_id>', description: 'Stop sub-agent' },
  { name: '/skills', description: 'List bundled skills' },
  { name: '/skills show <name>', description: 'Show skill content' },
  { name: '/skills run <name>', description: 'Run bundled skill immediately' },
]

function leadingCommandToken(value: string): string {
  const trimmed = value.trimStart()
  if (!trimmed.startsWith('/')) return ''
  const first = trimmed.split(/\s+/, 1)[0]
  return first.toLowerCase()
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  let j = 0
  while (i < needle.length && j < haystack.length) {
    if (needle[i] === haystack[j]) i += 1
    j += 1
  }
  return i === needle.length
}

function levenshteinDistance(a: string, b: string, maxDistance = 3): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = 0; i < rows; i += 1) dp[i][0] = i
  for (let j = 0; j < cols; j += 1) dp[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    let rowMin = maxDistance + 1
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
      rowMin = Math.min(rowMin, dp[i][j])
    }
    if (rowMin > maxDistance) return maxDistance + 1
  }

  return dp[rows - 1][cols - 1]
}

function commandScore(query: string, commandName: string): number {
  if (!query.startsWith('/')) return -1
  const queryLower = query.toLowerCase()
  const nameLower = commandName.toLowerCase()
  const root = nameLower.split(/\s+/, 1)[0]

  if (queryLower === nameLower || queryLower === root) return 300
  if (root.startsWith(queryLower)) return 220 - (root.length - queryLower.length)
  if (nameLower.startsWith(queryLower)) return 200 - (nameLower.length - queryLower.length)
  if (root.includes(queryLower)) return 160
  if (isSubsequence(queryLower, root)) return 130

  const dist = levenshteinDistance(queryLower, root, 2)
  if (dist <= 2) return 120 - dist * 10

  return -1
}

function buildCommandSuggestions(input: string, commands: CommandDefinition[]): CommandDefinition[] {
  const token = leadingCommandToken(input)
  if (!token) return []

  const ranked = commands
    .map((command) => ({ command, score: commandScore(token, command.name) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.command.name.localeCompare(b.command.name)
    })

  return ranked.slice(0, 8).map((item) => item.command)
}

function filterPaletteCommands(query: string, commands: CommandDefinition[]): CommandDefinition[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return commands
  return commands.filter((command) => {
    const name = command.name.toLowerCase()
    const description = (command.description || '').toLowerCase()
    return name.includes(normalized) || description.includes(normalized)
  })
}

function approximateTokens(value: string): number {
  if (!value.trim()) return 0
  return Math.max(1, Math.ceil(value.length / 4))
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Failed to read file'))
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function decodeBase64ToText(data: string): string {
  try {
    const binary = atob(data)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

function decodeBase64ToBytes(data: string): Uint8Array {
  const binary = atob(data)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function ChatWindow() {
  const {
    messages,
    filteredMessages,
    isLoading,
    error,
    commands,
    loadCommands,
    sendMessage,
    stopGeneration,
    projectDir,
    setProjectDir,
    sessionId,
    sessionMode,
    availableModes,
    setSessionMode,
    permissionChallenges,
    respondPermission,
    messageSearchQuery,
    setMessageSearchQuery,
    theme,
  } = useChat()
  const [input, setInput] = useState('')
  const [showProjectInput, setShowProjectInput] = useState(false)
  const [permissionSubmitting, setPermissionSubmitting] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [terminalLines, setTerminalLines] = useState<string[]>([])
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalRunning, setTerminalRunning] = useState(false)
  const [terminalCwd, setTerminalCwd] = useState('')
  const terminalCwdRef = useRef('')
  const messageListRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const paletteInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const previousMessageSearchRef = useRef('')
  const commandsRequestedRef = useRef(false)

  const activePermission = permissionChallenges.length > 0 ? permissionChallenges[0] : null

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (commandsRequestedRef.current) return
    commandsRequestedRef.current = true
    void loadCommands()
  }, [loadCommands])

  const commandCatalog = commands.length > 0 ? commands : FALLBACK_COMMANDS
  const commandSuggestions = useMemo(() => buildCommandSuggestions(input, commandCatalog), [input, commandCatalog])
  const showCommandSuggestions = commandSuggestions.length > 0 && input.trimStart().startsWith('/') && !commandPaletteOpen
  const paletteCommands = useMemo(
    () => filterPaletteCommands(paletteQuery, commands.length > 0 ? commands : KNOWN_ROOT_COMMANDS),
    [paletteQuery, commands],
  )

  useEffect(() => {
    setActiveCommandIndex(0)
  }, [input, showCommandSuggestions])

  useEffect(() => {
    setPaletteIndex(0)
  }, [paletteQuery, commandPaletteOpen])

  useEffect(() => {
    setInput('')
    setPendingImage(null)
    setPendingFiles([])
    setAttachmentError('')
    setAttachmentUploading(false)
    setTerminalLines([])
    setShowTerminal(false)
    setTerminalRunning(false)
    const resetCwd = projectDir || ''
    terminalCwdRef.current = resetCwd
    setTerminalCwd(resetCwd)
    setMessageSearchQuery('')
    setCommandPaletteOpen(false)
    setPaletteQuery('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [sessionId, setMessageSearchQuery])

  useEffect(() => {
    if (!terminalCwdRef.current && projectDir) {
      terminalCwdRef.current = projectDir
      setTerminalCwd(projectDir)
    }
  }, [projectDir])

  useEffect(() => {
    if (terminalCwdRef.current === 'workspace root') {
      const normalized = projectDir || ''
      terminalCwdRef.current = normalized
      setTerminalCwd(normalized)
    }
  }, [projectDir])

  useEffect(() => {
    if (!commandPaletteOpen) return
    requestAnimationFrame(() => {
      paletteInputRef.current?.focus()
    })
  }, [commandPaletteOpen])

  useEffect(() => {
    if (!commandPaletteOpen) return

    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!paletteRef.current) return
      if (paletteRef.current.contains(event.target as Node)) return
      setCommandPaletteOpen(false)
      setPaletteQuery('')
    }

    window.addEventListener('mousedown', onDocumentMouseDown)
    return () => window.removeEventListener('mousedown', onDocumentMouseDown)
  }, [commandPaletteOpen])

  useEffect(() => {
    const previous = previousMessageSearchRef.current
    if (previous.trim() && !messageSearchQuery.trim()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    previousMessageSearchRef.current = messageSearchQuery
  }, [messageSearchQuery])

  useEffect(() => {
    if (messages.length === 0 && !isLoading) {
      setTerminalLines([])
      setShowTerminal(false)
      setTerminalRunning(false)
    }
  }, [messages.length, isLoading])

  const applyCommandSuggestion = (name: string) => {
    const next = `${name}${name.includes('<') ? '' : ' '}`
    setInput(next)
    setActiveCommandIndex(0)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
      textareaRef.current.selectionEnd = textareaRef.current.value.length
    })
  }

  const applyPaletteCommand = (name: string) => {
    const next = `${name}${name.includes('<') ? '' : ' '}`
    setInput(next)
    setCommandPaletteOpen(false)
    setPaletteQuery('')
    setPaletteIndex(0)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
      textareaRef.current.selectionEnd = textareaRef.current.value.length
    })
  }

  const attachmentTotalBytes = useMemo(
    () => pendingFiles.reduce((total, file) => total + file.size, 0) + (pendingImage?.size || 0),
    [pendingFiles, pendingImage],
  )

  const uploadZipAttachment = useCallback(async (file: FileAttachment, cwd: string) => {
    const form = new FormData()
    const bytes = decodeBase64ToBytes(file.data)
    const arrayBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(arrayBuffer).set(bytes)
    const blob = new Blob([arrayBuffer], { type: file.type || 'application/zip' })
    form.append('file', blob, file.name)
    form.append('project_dir', cwd)

    const response = await fetch('/api/chat/upload-zip', {
      method: 'POST',
      headers: buildApiHeaders(),
      body: form,
    })
    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }
    return response.json() as Promise<{ extracted?: string[] }>
  }, [])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if ((!msg && !pendingImage && pendingFiles.length === 0) || isLoading || attachmentUploading) return

    const imagePayload = pendingImage
      ? {
          url: pendingImage.previewUrl,
          data: pendingImage.data,
          media_type: pendingImage.media_type,
        }
      : undefined

    const attachmentBlocks: Array<Record<string, unknown>> = []
    setAttachmentError('')
    setAttachmentUploading(true)

    try {
      for (const file of pendingFiles) {
        if (file.isImage) {
          attachmentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.type || 'image/png',
              data: file.data,
            },
          })
          continue
        }

        if (file.isZip) {
          if (!projectDir.trim()) {
            setAttachmentError('Set project directory before sending .zip attachments')
            return
          }

          const payload = await uploadZipAttachment(file, projectDir.trim())
          const extractedCount = Array.isArray(payload.extracted) ? payload.extracted.length : 0
          attachmentBlocks.push({
            type: 'text',
            text: `[Uploaded zip: ${file.name}] extracted ${extractedCount} file(s) into ${projectDir.trim()}`,
          })
          continue
        }

        const decoded = decodeBase64ToText(file.data)
        attachmentBlocks.push({
          type: 'text',
          text: `[Attached: ${file.name}]\n\`\`\`\n${decoded}\n\`\`\``,
        })
      }

      setInput('')
      setPendingImage(null)
      setPendingFiles([])
      if (textareaRef.current) textareaRef.current.style.height = 'auto'

      sendMessage(msg, imagePayload, attachmentBlocks, {
        onToolOutput: (line) => {
          setTerminalLines((prev) => [...prev, line])
          setShowTerminal(true)
          setTerminalRunning(true)
        },
        onToolResult: (event) => {
          const toolName = String(event.tool || '').toLowerCase()
          if (toolName === 'bash' || toolName === 'powershell' || toolName === 'repl') {
            setTerminalRunning(false)
          }
        },
      })
    } catch (error) {
      setAttachmentError(String(error))
    } finally {
      setAttachmentUploading(false)
    }
  }, [attachmentUploading, input, isLoading, pendingFiles, pendingImage, projectDir, sendMessage, uploadZipAttachment])

  const runTerminalCommand = useCallback(async (command: string): Promise<{ cwd?: string }> => {
    const trimmed = command.trim()
    if (!trimmed) {
      return { cwd: terminalCwdRef.current || projectDir || '' }
    }
    if (terminalRunning) {
      setTerminalLines((prev) => [...prev, '[terminal] command already running, wait for completion'])
      return { cwd: terminalCwdRef.current || projectDir || '' }
    }

    let nextCwd = terminalCwdRef.current || projectDir || ''

    setShowTerminal(true)
    setTerminalRunning(true)

    try {
      const response = await fetch('/api/chat/terminal/run', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          command: trimmed,
          cwd: nextCwd || null,
          timeout: 60,
        }),
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      if (!response.body) {
        throw new Error('No terminal response body')
      }

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
            const event = JSON.parse(raw) as Record<string, unknown>
            if (event.type === 'start') {
              const startedCwd = String(event.cwd || '')
              if (startedCwd.trim()) {
                nextCwd = startedCwd.trim()
              }
              continue
            }

            if (event.type === 'line') {
              const outputLine = String(event.line || '')
              setTerminalLines((prev) => [...prev, outputLine])
              continue
            }

            if (event.type === 'done') {
              const success = Boolean(event.success)
              const error = String(event.error || '')
              const doneCwd = String(event.cwd_after || '')
              const metadata = (event.metadata && typeof event.metadata === 'object')
                ? event.metadata as Record<string, unknown>
                : {}
              const exitCode = typeof metadata.exit_code === 'number' ? metadata.exit_code : undefined

              if (doneCwd.trim()) {
                nextCwd = doneCwd.trim()
              }

              if (!success && error) {
                setTerminalLines((prev) => [...prev, `[error] ${error}`])
              }
              if (typeof exitCode === 'number' && exitCode !== 0) {
                setTerminalLines((prev) => [...prev, `[exit ${exitCode}]`])
              }
            }
          } catch {
            // Ignore malformed SSE event payloads.
          }
        }
      }

      if (buffer.startsWith('data: ')) {
        try {
          const event = JSON.parse(buffer.slice(6).trim()) as Record<string, unknown>
          if (event.type === 'line') {
            const outputLine = String(event.line || '')
            setTerminalLines((prev) => [...prev, outputLine])
          } else if (event.type === 'done') {
            const doneCwd = String(event.cwd_after || '')
            if (doneCwd.trim()) {
              nextCwd = doneCwd.trim()
            }
          }
        } catch {
          // Ignore trailing partial frame.
        }
      }
    } catch (error) {
      setTerminalLines((prev) => [...prev, `[error] ${String(error)}`])
    } finally {
      setTerminalRunning(false)
    }

    terminalCwdRef.current = nextCwd
    setTerminalCwd(nextCwd)
    return { cwd: nextCwd }
  }, [projectDir, terminalRunning])

  const terminalActive = showTerminal

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const isMeta = event.ctrlKey || event.metaKey
      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false)
          setPaletteQuery('')
          return
        }

        const textareaFocused = document.activeElement === textareaRef.current
        if (!textareaFocused) {
          textareaRef.current?.focus()
          return
        }

        if (!input.trim()) {
          setCommandPaletteOpen(true)
          setPaletteQuery('')
          setPaletteIndex(0)
        }
        return
      }
      if (isMeta && event.key === 'Enter' && !commandPaletteOpen) {
        event.preventDefault()
        void handleSend()
      }
      if (event.key === 'Escape' && commandPaletteOpen) {
        event.preventDefault()
        setCommandPaletteOpen(false)
        setPaletteQuery('')
        return
      }
      if (event.key === 'Escape' && isLoading) {
        event.preventDefault()
        stopGeneration()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteOpen, handleSend, input, isLoading, stopGeneration])

  const handleMessagesScroll = () => {
    const container = messageListRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom < 80
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandSuggestions && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const total = commandSuggestions.length
      setActiveCommandIndex((prev) => (prev + delta + total) % total)
      return
    }

    if (showCommandSuggestions && e.key === 'Tab') {
      e.preventDefault()
      const selected = commandSuggestions[activeCommandIndex]
      if (selected) applyCommandSuggestion(selected.name)
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handlePaletteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (paletteCommands.length === 0) return
      setPaletteIndex((prev) => (prev + 1) % paletteCommands.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (paletteCommands.length === 0) return
      setPaletteIndex((prev) => (prev - 1 + paletteCommands.length) % paletteCommands.length)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const selected = paletteCommands[paletteIndex]
      if (selected) {
        applyPaletteCommand(selected.name)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setCommandPaletteOpen(false)
      setPaletteQuery('')
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const incomingBytes = files.reduce((total, file) => total + file.size, 0)
    if (attachmentTotalBytes + incomingBytes > MAX_ATTACHMENT_BYTES) {
      setAttachmentError('Total attachment size exceeds 10MB limit')
      e.target.value = ''
      return
    }

    let nextPrimaryImage = pendingImage
    const collected: FileAttachment[] = []

    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file)
        if (!dataUrl.startsWith('data:')) continue
        const [header, data] = dataUrl.split(',', 2)
        if (!header || !data) continue

        const mediaType = header.replace('data:', '').replace(';base64', '') || file.type || 'application/octet-stream'
        const lowerName = file.name.toLowerCase()
        const isImage = mediaType.startsWith('image/')
        const isZip = lowerName.endsWith('.zip')

        if (isImage && !nextPrimaryImage) {
          nextPrimaryImage = {
            previewUrl: dataUrl,
            data,
            media_type: mediaType,
            name: file.name,
            size: file.size,
          }
          continue
        }

        collected.push({
          name: file.name,
          size: file.size,
          type: mediaType,
          data,
          isImage,
          isZip,
          previewUrl: isImage ? dataUrl : undefined,
        })
      }

      setPendingImage(nextPrimaryImage)
      setPendingFiles((prev) => [...prev, ...collected])
      setAttachmentError('')
    } catch {
      setAttachmentError('Failed to read one or more attachments')
    }

    e.target.value = ''
  }

  const handlePermissionDecision = async (approve: boolean, remember: boolean) => {
    if (!activePermission || permissionSubmitting) return
    setPermissionSubmitting(true)
    await respondPermission(activePermission.challenge_id, approve, remember, sessionId)
    setPermissionSubmitting(false)
  }

  const isEmpty = messages.length === 0
  const isMessageFilteringActive = messageSearchQuery.trim().length > 0

  const contextTokens = useMemo(() => {
    const messageTokens = messages.reduce((total, message) => total + approximateTokens(message.content), 0)
    return messageTokens
  }, [messages])
  const contextPercent = Math.min(100, Math.round((contextTokens / CONTEXT_TOKEN_BUDGET) * 100))
  const totalCacheReadTokens = useMemo(
    () => messages.reduce((total, message) => total + (message.usage?.input_cache_read_tokens || 0), 0),
    [messages],
  )
  const latestUsageModel = useMemo(() => {
    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      const model = messages[idx].usage?.model
      if (typeof model === 'string' && model.trim()) {
        return model
      }
    }
    return ''
  }, [messages])
  const showCacheSavings = totalCacheReadTokens > 0 && latestUsageModel.toLowerCase().includes('claude')
  const estimatedCacheSavings = (totalCacheReadTokens * (3.0 * 0.9)) / 1_000_000

  const modes = availableModes.length > 0
    ? availableModes
    : [
      { key: 'execute', title: 'Execute', summary: 'Balanced autonomous execution.', is_default: true },
      { key: 'plan', title: 'Plan', summary: 'Plan-first execution.', is_default: false },
      { key: 'debug', title: 'Debug', summary: 'Hypothesis-driven debugging.', is_default: false },
      { key: 'review', title: 'Review', summary: 'Risk-focused code review.', is_default: false },
    ]
  const totalAttachmentCount = pendingFiles.length + (pendingImage ? 1 : 0)
  const hiddenAttachmentCount = Math.max(0, totalAttachmentCount - MAX_VISIBLE_ATTACHMENT_CHIPS)

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg-0)',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-1)',
        gap: 10,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={14} color="var(--accent)" />
          <span style={{ fontSize: 12, color: 'var(--text-1)', letterSpacing: '0.05em' }}>
            {isLoading ? (
              <span style={{ color: 'var(--yellow)' }}>● AGENT RUNNING</span>
            ) : (
              <span style={{ color: 'var(--green)' }}>● READY</span>
            )}
          </span>
        </div>

        <button
          onClick={() => setShowProjectInput(!showProjectInput)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
          }}
        >
          <FolderOpen size={12} />
          {projectDir ? projectDir.split('/').pop() : 'SET PROJECT DIR'}
        </button>

        <select
          value={sessionMode || 'execute'}
          onChange={(e) => {
            void setSessionMode(e.target.value, sessionId)
          }}
          title="Session execution mode"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-1)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            minWidth: 110,
          }}
        >
          {modes.map((mode) => (
            <option key={mode.key} value={mode.key}>
              MODE: {mode.key.toUpperCase()}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setShowTerminal((prev) => !prev)}
          title={terminalActive ? 'Terminal panel active' : 'Open terminal panel'}
          style={{
            background: showTerminal ? 'var(--bg-3)' : 'none',
            border: '1px solid var(--border)',
            color: terminalActive ? 'var(--green)' : 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <TerminalIcon size={12} />
          TERMINAL
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: terminalActive ? 'var(--green)' : 'var(--text-2)',
            display: 'inline-block',
            animation: terminalActive ? 'terminal-dot-pulse 1.4s ease-in-out infinite' : 'none',
            boxShadow: terminalActive ? '0 0 8px var(--green-dim)' : 'none',
            willChange: 'opacity, transform, box-shadow',
          }} />
        </button>

        {/* GitHub Button */}
        <a
          href="https://github.com/hxrrrrri"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 98 96"
            fill="currentColor"
          >
            <path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 
            2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 
            4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 
            1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 
            5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 
            46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 
            13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 
            0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 
            11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 
            33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
          </svg>
          GITHUB
        </a>
      </div>

      <div style={{
        padding: '8px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-2)',
        display: 'grid',
        gap: 5,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          fontSize: 10,
          color: 'var(--text-2)',
          letterSpacing: '0.06em',
        }}>
          <span>CONTEXT WINDOW</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            {showCacheSavings && (
              <span style={{ color: 'var(--text-2)' }}>
                Cache: saved ~${estimatedCacheSavings.toFixed(4)}
              </span>
            )}
            <span>{contextTokens.toLocaleString()} / {CONTEXT_TOKEN_BUDGET.toLocaleString()} TOK</span>
          </div>
        </div>
        <div style={{
          height: 6,
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'var(--bg-0)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${contextPercent}%`,
            height: '100%',
            background: contextPercent > 85 ? 'var(--red)' : contextPercent > 65 ? 'var(--yellow)' : 'var(--accent)',
            transition: 'width 0.2s ease',
          }} />
        </div>
      </div>

      {/* Project dir input */}
      {showProjectInput && (
        <div style={{
          padding: '8px 24px',
          background: 'var(--bg-2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="/path/to/your/project"
            value={projectDir}
            onChange={e => setProjectDir(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-0)',
              border: '1px solid var(--border)',
              color: 'var(--text-0)',
              padding: '6px 10px',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
          />
          <button
            onClick={() => setShowProjectInput(false)}
            style={{
              background: 'var(--accent)',
              border: 'none',
              color: '#0a0a0b',
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            SET
          </button>
        </div>
      )}

      {messages.length > 0 && (
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-1)',
          display: 'grid',
          gap: 6,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-2)',
            padding: '6px 8px',
          }}>
            <Search size={13} color="var(--text-2)" />
            <input
              type="text"
              placeholder="Search messages..."
              value={messageSearchQuery}
              onChange={(event) => setMessageSearchQuery(event.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-0)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              }}
            />
            {messageSearchQuery.trim() && (
              <button
                type="button"
                onClick={() => setMessageSearchQuery('')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
                aria-label="Clear message search"
              >
                ×
              </button>
            )}
          </div>

          {isMessageFilteringActive && (
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
              {filteredMessages.length} of {messages.length} messages match
            </div>
          )}
        </div>
      )}

      {commandPaletteOpen && (
        <div style={{ position: 'relative', minHeight: 300, zIndex: 100 }}>
          <div
            ref={paletteRef}
            style={{
              position: 'absolute',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              width: 'min(520px, 90vw)',
              background: 'var(--bg-1)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
              <input
                ref={paletteInputRef}
                type="text"
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="> type a command or /..."
                style={{
                  width: '100%',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-0)',
                  outline: 'none',
                  padding: '8px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              />
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {paletteCommands.length === 0 && (
                <div style={{ padding: '10px 12px', color: 'var(--text-2)', fontSize: 11 }}>
                  No matching commands.
                </div>
              )}

              {paletteCommands.map((command, idx) => {
                const selected = idx === paletteIndex
                return (
                  <button
                    key={`${command.name}-${idx}`}
                    type="button"
                    onMouseEnter={() => setPaletteIndex(idx)}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      applyPaletteCommand(command.name)
                    }}
                    style={{
                      width: '100%',
                      border: 'none',
                      borderBottom: idx === paletteCommands.length - 1 ? 'none' : '1px solid var(--border)',
                      background: selected ? 'var(--bg-3)' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: '8px 12px',
                      display: 'grid',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{command.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{command.description}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
      }}
        ref={messageListRef}
        onScroll={handleMessagesScroll}
      >
        {isEmpty && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center',
            animation: 'fadeIn 0.4s ease',
          }}>
            <div style={{
              width: 64, height: 64,
              background: 'var(--accent)',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              fontSize: 28,
            }}>
              ⚡
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-1px',
              marginBottom: 8,
            }}>
              KŌDO AGENT
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 32 }}>
              Autonomous. Capable. Yours.
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              maxWidth: 540,
              width: '100%',
            }}>
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-1)'
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} searchQuery={messageSearchQuery} />
        ))}

        {isMessageFilteringActive && filteredMessages.length === 0 && (
          <div style={{
            border: '1px dashed var(--border-bright)',
            borderRadius: 'var(--radius)',
            padding: '10px 12px',
            color: 'var(--text-1)',
            fontSize: 12,
            marginBottom: 14,
          }}>
            No message matches for "{messageSearchQuery.trim()}" in this session.
          </div>
        )}

        {error && (
          <div style={{
            background: 'var(--red-dim)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--red)',
            marginBottom: 16,
          }}>
            ⚠ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {showTerminal && (
        <TerminalPanel
          lines={terminalLines}
          isRunning={terminalRunning}
          themeMode={theme}
          cwdHint={terminalCwd || projectDir || 'workspace root'}
          onRunCommand={runTerminalCommand}
          onClose={() => setShowTerminal(false)}
        />
      )}

      {/* Input area */}
      <div style={{
        padding: '12px 24px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-1)',
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative' }}>
          {showCommandSuggestions && (
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 'calc(100% + 8px)',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              zIndex: 20,
              maxHeight: 260,
              overflowY: 'auto',
            }}>
              {commandSuggestions.map((command, idx) => {
                const selected = idx === activeCommandIndex
                return (
                  <button
                    key={command.name}
                    type="button"
                    onMouseEnter={() => setActiveCommandIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      applyCommandSuggestion(command.name)
                    }}
                    style={{
                      width: '100%',
                      background: selected ? 'var(--bg-3)' : 'transparent',
                      border: 'none',
                      borderBottom: idx === commandSuggestions.length - 1 ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '9px 12px',
                      display: 'grid',
                      gap: 2,
                    }}
                  >
                    <span style={{
                      color: selected ? 'var(--accent)' : 'var(--text-0)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {command.name}
                    </span>
                    <span style={{
                      color: 'var(--text-2)',
                      fontSize: 10,
                    }}>
                      {command.description}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {(pendingImage || pendingFiles.length > 0) && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 8,
            }}>
              {pendingImage && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid var(--border-bright)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-3)',
                  padding: '4px 6px',
                  maxWidth: 210,
                }}>
                  <img
                    src={pendingImage.previewUrl}
                    alt={pendingImage.name}
                    style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover' }}
                  />
                  <span className="truncate" style={{ maxWidth: 140, fontSize: 10, color: 'var(--text-1)' }}>
                    📎 {pendingImage.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingImage(null)}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {pendingFiles.slice(0, MAX_VISIBLE_ATTACHMENT_CHIPS - (pendingImage ? 1 : 0)).map((file, idx) => (
                <div key={`${file.name}-${idx}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-3)',
                  padding: '4px 6px',
                  maxWidth: 220,
                }}>
                  {file.isImage && file.previewUrl ? (
                    <img src={file.previewUrl} alt={file.name} style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover' }} />
                  ) : (
                    <Paperclip size={12} color="var(--text-2)" />
                  )}
                  <span className="truncate" style={{ maxWidth: 150, fontSize: 10, color: 'var(--text-1)' }}>
                    📎 {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== idx))}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {hiddenAttachmentCount > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-2)', alignSelf: 'center' }}>+{hiddenAttachmentCount} more</span>
              )}
            </div>
          )}

          {attachmentError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
              fontSize: 11,
              color: 'var(--red)',
            }}>
              <CircleAlert size={12} />
              {attachmentError}
            </div>
          )}

        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '8px 8px 8px 14px',
          transition: 'border-color 0.15s',
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <input
            ref={imageInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            onChange={handleFilePick}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            title="Attach files"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius)',
              border: `1px solid ${totalAttachmentCount > 0 ? 'var(--accent)' : 'var(--border)'}`,
              background: totalAttachmentCount > 0 ? 'var(--accent-dim)' : 'var(--bg-3)',
              color: totalAttachmentCount > 0 ? 'var(--accent)' : 'var(--text-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ImagePlus size={14} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask KŌDO anything, attach files, or run /help"
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-0)',
              fontSize: 14,
              fontFamily: 'var(--font-mono)',
              resize: 'none',
              lineHeight: 1.6,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          />
          <button
            onClick={() => {
              if (isLoading) {
                stopGeneration()
                setTerminalRunning(false)
                return
              }
              void handleSend()
            }}
            disabled={attachmentUploading || (!isLoading && !input.trim() && totalAttachmentCount === 0)}
            style={{
              background: isLoading
                ? 'var(--red-dim)'
                : attachmentUploading
                  ? 'var(--bg-3)'
                  : (input.trim() || totalAttachmentCount > 0)
                    ? 'var(--accent)'
                    : 'var(--bg-3)',
              border: isLoading ? '1px solid var(--red)' : 'none',
              color: isLoading
                ? 'var(--red)'
                : attachmentUploading
                  ? 'var(--text-2)'
                  : (input.trim() || totalAttachmentCount > 0)
                    ? '#0a0a0b'
                    : 'var(--text-2)',
              width: 36, height: 36,
              borderRadius: 'var(--radius)',
              cursor: (attachmentUploading || (!isLoading && !input.trim() && totalAttachmentCount === 0)) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {isLoading ? <Square size={15} /> : <Send size={15} />}
          </button>
        </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 6, textAlign: 'center' }}>
          Enter send · Shift+Enter newline · Tab autocomplete · Ctrl/Cmd+K command palette · Esc stop generation
        </div>
      </div>

      {activePermission && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
          padding: 20,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 720,
            background: 'var(--bg-1)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 0 0 1px var(--border), 0 16px 45px rgba(0,0,0,0.35)',
            padding: 16,
            display: 'grid',
            gap: 12,
          }}>
            <div style={{
              fontSize: 12,
              color: 'var(--accent)',
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}>
              PERMISSION REQUIRED
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-0)' }}>
              Tool <strong>{activePermission?.tool_name}</strong> requested approval.
            </div>

            <div style={{
              fontSize: 12,
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-2)',
              padding: 10,
              maxHeight: 160,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {activePermission?.input_preview || '(no preview provided)'}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}>
              <button
                onClick={() => handlePermissionDecision(true, false)}
                disabled={permissionSubmitting}
                style={{
                  border: '1px solid var(--green)',
                  background: 'var(--green-dim)',
                  color: 'var(--green)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  cursor: permissionSubmitting ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                APPROVE ONCE
              </button>

              <button
                onClick={() => handlePermissionDecision(false, false)}
                disabled={permissionSubmitting}
                style={{
                  border: '1px solid var(--red)',
                  background: 'var(--red-dim)',
                  color: 'var(--red)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  cursor: permissionSubmitting ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                DENY ONCE
              </button>

              <button
                onClick={() => handlePermissionDecision(true, true)}
                disabled={permissionSubmitting}
                style={{
                  border: '1px solid var(--blue)',
                  background: 'var(--blue-dim)',
                  color: 'var(--blue)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  cursor: permissionSubmitting ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                APPROVE + REMEMBER
              </button>

              <button
                onClick={() => handlePermissionDecision(false, true)}
                disabled={permissionSubmitting}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-2)',
                  color: 'var(--text-1)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                  cursor: permissionSubmitting ? 'wait' : 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                DENY + REMEMBER
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
