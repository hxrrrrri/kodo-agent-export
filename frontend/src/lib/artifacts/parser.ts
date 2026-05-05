import {
  ArtifactFile,
  ArtifactType,
  ArtifactV2,
  defaultFilename,
  isArtifactType,
  languageForFilename,
} from './types'

/**
 * Parses the kodo artifact protocol v2 from assistant text output.
 *
 * Provider-neutral: uses code fences with a structured info string so every
 * LLM (Claude, GPT-4, Gemini, DeepSeek, Llama via Ollama, Gemma) can produce
 * artifacts without relying on Anthropic tool-use or OpenAI function-calling.
 *
 * Info-string grammar:
 *   artifact type=<type> id=<id> title="<title>" version=<N> [filename=<f>] [bundle=true] [entrypoint=true]
 *
 * Also supports legacy v1 fences (`artifact`, `artifact:<lang>`) for backward
 * compat. Legacy fences emit a synthetic v2 artifact with type=code and
 * synthesised id/version.
 */

const FENCE_RE = /```([^`\n]*)\n([\s\S]*?)```/g

const KNOWN_LANGUAGES = new Set([
  'html',
  'html5',
  'htm',
  'jsx',
  'tsx',
  'react',
  'javascript',
  'js',
  'typescript',
  'ts',
  'svg',
  'mermaid',
  'mmd',
  'dot',
  'graphviz',
  'markdown',
  'md',
  'css',
  'text',
  'txt',
])

const RENDERABLE_FILENAME_RE = /^[\w@./\\ ()-]+\.(?:html?|jsx?|tsx?|svg|mmd|dot|gv|md|markdown)$/i

interface InfoAttrs {
  raw: string
  isArtifact: boolean
  legacy: boolean
  type?: ArtifactType
  id?: string
  title?: string
  version?: number
  filename?: string
  bundle?: boolean
  entrypoint?: boolean
}

interface GenericFenceInfo {
  language?: string
  filename?: string
}

interface NormalizedRenderable {
  type: ArtifactType
  content: string
  filename: string
  language: string
}

function parseInfoString(info: string): InfoAttrs {
  const trimmed = String(info || '').trim()
  if (!trimmed) {
    return { raw: '', isArtifact: false, legacy: false }
  }

  const firstToken = trimmed.split(/\s+/)[0].toLowerCase()
  const isArtifactKeyword = firstToken === 'artifact' || firstToken.startsWith('artifact:')
  if (!isArtifactKeyword) {
    return { raw: trimmed, isArtifact: false, legacy: false }
  }

  const attrs: InfoAttrs = { raw: trimmed, isArtifact: true, legacy: true }

  // Key=value tokenizer that respects quoted values and bare language tokens.
  const tokens: string[] = []
  let i = 0
  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === ' ' || ch === '\t') { i += 1; continue }

    if (ch === '"' || ch === "'") {
      // Shouldn't start a token with a quote; fallthrough to generic.
      tokens.push(readUntilSpace())
      continue
    }

    tokens.push(readToken())
  }

  function readToken(): string {
    let out = ''
    while (i < trimmed.length) {
      const ch = trimmed[i]
      if (ch === ' ' || ch === '\t') break
      if (ch === '=') {
        out += ch
        i += 1
        // After =, consume quoted or bare value.
        if (trimmed[i] === '"' || trimmed[i] === "'") {
          const quote = trimmed[i]
          i += 1
          while (i < trimmed.length && trimmed[i] !== quote) {
            if (trimmed[i] === '\\' && i + 1 < trimmed.length) {
              out += trimmed[i + 1]
              i += 2
              continue
            }
            out += trimmed[i]
            i += 1
          }
          if (i < trimmed.length) i += 1
        } else {
          while (i < trimmed.length && trimmed[i] !== ' ' && trimmed[i] !== '\t') {
            out += trimmed[i]
            i += 1
          }
        }
        break
      }
      out += ch
      i += 1
    }
    return out
  }

  function readUntilSpace(): string {
    let out = ''
    while (i < trimmed.length && trimmed[i] !== ' ' && trimmed[i] !== '\t') {
      out += trimmed[i]
      i += 1
    }
    return out
  }

  for (const token of tokens) {
    if (!token) continue
    const eq = token.indexOf('=')
    if (eq < 0) {
      // Bare token: could be the "artifact" keyword or a language tag in legacy form.
      const lower = token.toLowerCase()
      if (lower === 'artifact') continue
      if (lower.startsWith('artifact:')) {
        const lang = lower.slice('artifact:'.length)
        if (!attrs.filename && lang) {
          attrs.filename = `snippet.${lang}`
        }
        continue
      }
      // Treat as legacy language hint.
      if (!attrs.filename) {
        attrs.filename = `snippet.${lower}`
      }
      continue
    }

    const key = token.slice(0, eq).trim().toLowerCase()
    const value = token.slice(eq + 1).trim()

    if (!value) continue
    attrs.legacy = false

    switch (key) {
      case 'type': {
        const t = value.toLowerCase()
        if (isArtifactType(t)) attrs.type = t
        break
      }
      case 'id':
        attrs.id = value
        break
      case 'title':
        attrs.title = value
        break
      case 'version': {
        const n = parseInt(value, 10)
        if (Number.isFinite(n) && n > 0) attrs.version = n
        break
      }
      case 'filename':
      case 'file':
        attrs.filename = value
        break
      case 'bundle':
        attrs.bundle = value.toLowerCase() === 'true'
        break
      case 'entrypoint':
        attrs.entrypoint = value.toLowerCase() === 'true' || value.toLowerCase() === value
        break
      default:
        break
    }
  }

  return attrs
}

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
  return slug || fallback
}

function stripQuotes(input: string): string {
  return input.trim().replace(/^["'`]+/, '').replace(/["'`:]+$/, '')
}

function normalizeFilename(input: string): string | undefined {
  const value = stripQuotes(String(input || '')).replace(/\\/g, '/').replace(/^\.\//, '')
  if (!value || value.includes('\n') || value.includes('\r')) return undefined
  if (!RENDERABLE_FILENAME_RE.test(value)) return undefined
  return value
}

function parseGenericFenceInfo(info: string): GenericFenceInfo {
  const raw = String(info || '').trim()
  if (!raw) return {}

  const out: GenericFenceInfo = {}
  const fileMatch = raw.match(/(?:^|\s)(?:file|filename)=["']?([^"'\s]+)["']?/i)
  if (fileMatch?.[1]) {
    out.filename = normalizeFilename(fileMatch[1])
  }

  const tokens = raw.split(/\s+/).map(stripQuotes).filter(Boolean)
  for (const token of tokens) {
    if (!token || token.includes('=')) continue
    const lower = token.toLowerCase()
    if (!out.language && KNOWN_LANGUAGES.has(lower)) {
      out.language = lower
      continue
    }
    if (!out.filename) {
      out.filename = normalizeFilename(token)
    }
  }

  if (!out.language && out.filename) {
    out.language = languageForFilename(out.filename)
  }

  return out
}

function stripLeadingFilenameLine(body: string): { content: string; filename?: string } {
  const lines = String(body || '').replace(/^\uFEFF/, '').split(/\r?\n/)
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0)
  if (firstContentLine < 0) return { content: body }

  const filename = normalizeFilename(lines[firstContentLine].trim())
  if (!filename) return { content: body }

  const nextLines = [
    ...lines.slice(0, firstContentLine),
    ...lines.slice(firstContentLine + 1),
  ]
  return {
    content: nextLines.join('\n').trimStart(),
    filename,
  }
}

function normalizeLanguage(language: string | undefined): string {
  const lower = String(language || '').trim().toLowerCase()
  if (lower === 'html5' || lower === 'htm') return 'html'
  if (lower === 'react') return 'jsx'
  if (lower === 'mmd') return 'mermaid'
  if (lower === 'graphviz' || lower === 'gv') return 'dot'
  if (lower === 'markdown') return 'md'
  return lower
}

function typeFromFilename(filename: string | undefined): ArtifactType | null {
  if (!filename) return null
  const language = languageForFilename(filename)
  if (language === 'html') return 'html'
  if (language === 'jsx' || language === 'tsx') return 'react'
  if (language === 'svg') return 'svg'
  if (language === 'mermaid') return 'mermaid'
  if (language === 'dot') return 'dot'
  if (language === 'markdown') return 'markdown'
  return null
}

export interface ParseResult {
  artifacts: ArtifactV2[]
  /** True if the buffer ends inside an unclosed artifact fence (mid-stream). */
  streaming: boolean
}

interface PartialBundle {
  id: string
  type: ArtifactType
  title: string
  version: number
  files: ArtifactFile[]
  entrypoint?: string
}

/** Heuristic: promote plain html/react/mermaid/svg fences from weak models that
 *  didn't use the artifact prefix but produced a renderable document. */
function normalizeRenderableFence(info: string, body: string): NormalizedRenderable | null {
  const hints = parseGenericFenceInfo(info)
  const stripped = stripLeadingFilenameLine(body)
  const filename = stripped.filename || hints.filename
  const languageHint = normalizeLanguage(hints.language || (filename ? languageForFilename(filename) : ''))
  const b = stripped.content.trim()
  if (!b) return null

  let type: ArtifactType | null = typeFromFilename(filename)
  if (!type && /<!DOCTYPE|<html[\s>]/i.test(b)) type = 'html'
  if (!type && (languageHint === 'html') && (b.length > 160 || /<[a-z][\s\S]*>/i.test(b))) type = 'html'
  if (!type && /<svg[\s>]/i.test(b)) type = 'svg'
  if (!type && (languageHint === 'jsx' || languageHint === 'tsx' || languageHint === 'js')) {
    if (/export\s+default\s+(?:function|class|\w+)/i.test(b) || /function\s+App\s*\(/i.test(b) || /ReactDOM\.createRoot/i.test(b)) {
      type = 'react'
    }
  }
  if (!type && languageHint === 'mermaid') type = 'mermaid'
  if (!type && languageHint === 'dot') type = 'dot'

  if (!type) return null

  const finalFilename = filename || defaultFilename(type)
  const language = languageForFilename(finalFilename) || languageHint || type
  return {
    type,
    content: stripped.content,
    filename: finalFilename,
    language,
  }
}

function extractStandaloneRenderable(text: string): NormalizedRenderable | null {
  const value = String(text || '')
  if (!value.trim()) return null

  const doctypeIndex = value.search(/<!DOCTYPE|<html[\s>]/i)
  if (doctypeIndex >= 0) {
    const tail = value.slice(doctypeIndex)
    const close = tail.match(/<\/html\s*>/i)
    const content = close
      ? tail.slice(0, (close.index || 0) + close[0].length)
      : tail.trim()
    if (/<html[\s>]/i.test(content) && /<\/html\s*>/i.test(content)) {
      return {
        type: 'html',
        content,
        filename: 'index.html',
        language: 'html',
      }
    }
  }

  return null
}

export interface ParseOptions {
  /**
   * Salvage a final response that ended inside an unclosed renderable fence.
   * Keep this false while streaming to avoid rendering half-written documents.
   */
  allowIncomplete?: boolean
}

export function parseArtifacts(source: string, options: ParseOptions = {}): ParseResult {
  const text = String(source || '')
  if (!text.trim()) return { artifacts: [], streaming: false }

  FENCE_RE.lastIndex = 0
  const bundles = new Map<string, PartialBundle>()
  const singles: ArtifactV2[] = []
  let streaming = false
  let syntheticIndex = 0

  // Detect unclosed trailing fence: a ``` that opens but does not close.
  const lastOpen = text.lastIndexOf('```')
  let incompleteFence: { info: string; body: string } | null = null
  if (lastOpen >= 0) {
    const after = text.slice(lastOpen + 3)
    const newline = after.indexOf('\n')
    if (newline >= 0) {
      const info = after.slice(0, newline)
      const body = after.slice(newline + 1)
      const attrs = parseInfoString(info)
      if (attrs.isArtifact && !body.includes('```')) {
        streaming = true
        incompleteFence = { info, body }
      }
      // Also detect streaming plain html/react fences from weak models.
      if (!streaming && !attrs.isArtifact && normalizeRenderableFence(info, body) && !body.includes('```')) {
        streaming = true
        incompleteFence = { info, body }
      }
    }
  }

  const consumeFence = (info: string, body: string) => {
    const attrs = parseInfoString(info)

    // Promote plain html/react/mermaid fences from weak models (Ollama etc.)
    // that didn't use the artifact prefix but produced a full renderable document.
    if (!attrs.isArtifact) {
      const promoted = normalizeRenderableFence(info, body)
      if (promoted && promoted.content.trim()) {
        syntheticIndex += 1
        const title = promoted.filename || info.trim() || `${promoted.type}-${syntheticIndex}`
        singles.push({
          id: `promoted-${promoted.type}-${syntheticIndex}`,
          type: promoted.type,
          title,
          version: 1,
          files: [{ path: promoted.filename, content: promoted.content, language: promoted.language }],
          entrypoint: promoted.filename,
          createdAt: Date.now(),
        })
      }
      return
    }
    if (!body.trim()) return

    // Legacy: synthesise a v2 artifact with type=code.
    if (attrs.legacy || (!attrs.type && !attrs.id)) {
      syntheticIndex += 1
      const promoted = normalizeRenderableFence(attrs.filename || '', body)
      const filename = promoted?.filename || attrs.filename || `snippet-${syntheticIndex}.txt`
      const language = promoted?.language || languageForFilename(filename) || 'text'
      singles.push({
        id: `legacy-${syntheticIndex}`,
        type: promoted?.type || (language === 'html' ? 'html' : 'code'),
        title: filename,
        version: 1,
        files: [{ path: filename, content: promoted?.content || body, language }],
        entrypoint: filename,
        createdAt: Date.now(),
      })
      return
    }

    const type: ArtifactType = attrs.type || 'code'
    const id = attrs.id || slugify(attrs.title || `artifact-${syntheticIndex + 1}`, `artifact-${++syntheticIndex}`)
    const title = attrs.title || id
    const version = attrs.version || 1
    const stripped = stripLeadingFilenameLine(body)
    const filename = attrs.filename || stripped.filename || defaultFilename(type)
    const language = languageForFilename(filename) || 'text'
    const content = stripped.content

    if (attrs.bundle) {
      const bundleKey = `${id}:${version}`
      let bundle = bundles.get(bundleKey)
      if (!bundle) {
        bundle = {
          id,
          type,
          title,
          version,
          files: [],
          entrypoint: attrs.entrypoint ? filename : undefined,
        }
        bundles.set(bundleKey, bundle)
      }
      bundle.files.push({ path: filename, content, language })
      if (attrs.entrypoint || !bundle.entrypoint) {
        bundle.entrypoint = filename
      }
      return
    }

    singles.push({
      id,
      type,
      title,
      version,
      files: [{ path: filename, content, language }],
      entrypoint: filename,
      createdAt: Date.now(),
    })
  }

  let match: RegExpExecArray | null = null
  while ((match = FENCE_RE.exec(text)) !== null) {
    consumeFence(match[1] || '', match[2] || '')
  }

  if (options.allowIncomplete && incompleteFence) {
    consumeFence(incompleteFence.info, incompleteFence.body)
  }

  if (singles.length === 0 && bundles.size === 0 && options.allowIncomplete) {
    const standalone = extractStandaloneRenderable(text)
    if (standalone) {
      singles.push({
        id: 'promoted-html-1',
        type: standalone.type,
        title: standalone.filename,
        version: 1,
        files: [{ path: standalone.filename, content: standalone.content, language: standalone.language }],
        entrypoint: standalone.filename,
        createdAt: Date.now(),
      })
    }
  }

  const bundleArtifacts: ArtifactV2[] = Array.from(bundles.values()).map((b) => ({
    id: b.id,
    type: b.type,
    title: b.title,
    version: b.version,
    files: b.files,
    entrypoint: b.entrypoint || b.files[0]?.path,
    createdAt: Date.now(),
  }))

  return {
    artifacts: [...singles, ...bundleArtifacts],
    streaming,
  }
}
