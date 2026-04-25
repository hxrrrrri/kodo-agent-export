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
 *  didn't use the artifact prefix but produced a full renderable document. */
function shouldPromoteToArtifact(lang: string, body: string): ArtifactType | null {
  const l = lang.toLowerCase().trim()
  const b = body.trim()
  if ((l === 'html' || l === 'html5') && /<!DOCTYPE|<html[\s>]/i.test(b)) return 'html'
  if (l === 'html' && b.length > 200) return 'html'
  if ((l === 'jsx' || l === 'tsx' || l === 'react') && /export\s+default\s+function/i.test(b)) return 'react'
  if (l === 'mermaid') return 'mermaid'
  if (l === 'dot' || l === 'graphviz') return 'dot'
  if (l === 'svg' && /<svg[\s>]/i.test(b)) return 'svg'
  return null
}

export function parseArtifacts(source: string): ParseResult {
  const text = String(source || '')
  if (!text.trim()) return { artifacts: [], streaming: false }

  FENCE_RE.lastIndex = 0
  const bundles = new Map<string, PartialBundle>()
  const singles: ArtifactV2[] = []
  let streaming = false
  let syntheticIndex = 0

  // Detect unclosed trailing fence: a ``` that opens but does not close.
  const lastOpen = text.lastIndexOf('```')
  if (lastOpen >= 0) {
    const after = text.slice(lastOpen + 3)
    const newline = after.indexOf('\n')
    if (newline >= 0) {
      const info = after.slice(0, newline)
      const body = after.slice(newline + 1)
      const attrs = parseInfoString(info)
      if (attrs.isArtifact && !body.includes('```')) {
        streaming = true
      }
      // Also detect streaming plain html/react fences from weak models
      if (!streaming && !attrs.isArtifact && shouldPromoteToArtifact(info, body) && !body.includes('```')) {
        streaming = true
      }
    }
  }

  let match: RegExpExecArray | null = null
  while ((match = FENCE_RE.exec(text)) !== null) {
    const info = match[1] || ''
    const body = match[2] || ''
    const attrs = parseInfoString(info)

    // Promote plain html/react/mermaid fences from weak models (Ollama etc.)
    // that didn't use the artifact prefix but produced a full renderable document.
    if (!attrs.isArtifact) {
      const promoted = shouldPromoteToArtifact(info, body)
      if (promoted && body.trim()) {
        syntheticIndex += 1
        const title = info.trim() || `${promoted}-${syntheticIndex}`
        const filename = defaultFilename(promoted)
        singles.push({
          id: `promoted-${promoted}-${syntheticIndex}`,
          type: promoted,
          title,
          version: 1,
          files: [{ path: filename, content: body, language: info.trim() || promoted }],
          entrypoint: filename,
          createdAt: Date.now(),
        })
      }
      continue
    }
    if (!body.trim()) continue

    // Legacy: synthesise a v2 artifact with type=code.
    if (attrs.legacy || (!attrs.type && !attrs.id)) {
      syntheticIndex += 1
      const filename = attrs.filename || `snippet-${syntheticIndex}.txt`
      const language = languageForFilename(filename) || 'text'
      singles.push({
        id: `legacy-${syntheticIndex}`,
        type: language === 'html' ? 'html' : 'code',
        title: filename,
        version: 1,
        files: [{ path: filename, content: body, language }],
        entrypoint: filename,
        createdAt: Date.now(),
      })
      continue
    }

    const type: ArtifactType = attrs.type || 'code'
    const id = attrs.id || slugify(attrs.title || `artifact-${syntheticIndex + 1}`, `artifact-${++syntheticIndex}`)
    const title = attrs.title || id
    const version = attrs.version || 1
    const filename = attrs.filename || defaultFilename(type)
    const language = languageForFilename(filename) || 'text'

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
      bundle.files.push({ path: filename, content: body, language })
      if (attrs.entrypoint || !bundle.entrypoint) {
        bundle.entrypoint = filename
      }
      continue
    }

    singles.push({
      id,
      type,
      title,
      version,
      files: [{ path: filename, content: body, language }],
      entrypoint: filename,
      createdAt: Date.now(),
    })
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
