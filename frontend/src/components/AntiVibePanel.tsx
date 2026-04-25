/**
 * AntiVibePanel — AI code learning and deep-dive analysis tool.
 *
 * Three modes:
 *  - Paste mode: paste code → static analysis + AI deep-dive
 *  - Git mode: pick recently changed files in project → analyze
 *  - Save: persist deep-dive markdown to <repo>/deep-dive/
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode,
  GitBranch,
  Loader,
  Maximize2,
  RefreshCw,
  Sparkles,
  Tag,
  X,
  Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildApiHeaders } from '../lib/api'
import { useChatStore } from '../store/chatStore'

const LANGUAGES = ['auto', 'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'cpp', 'css', 'html', 'sql', 'bash']

const EXAMPLE_PROMPTS = [
  { label: 'React hook', code: 'const [count, setCount] = useState(0)\nuseEffect(() => { document.title = `Count: ${count}` }, [count])' },
  { label: 'Async queue', code: 'async function processQueue(items, concurrency = 3) {\n  const results = []\n  const pool = []\n  for (const item of items) {\n    const p = processItem(item).then(r => results.push(r))\n    pool.push(p)\n    if (pool.length >= concurrency) await Promise.race(pool)\n  }\n  await Promise.all(pool)\n  return results\n}' },
]

interface StaticAnalysis {
  available: boolean
  filename?: string
  language?: string
  line_count?: number
  symbols?: Array<{ kind: string; name: string; line: number }>
  imports?: string[]
  exports?: string[]
  concepts?: string[]
  key_points?: string[]
  resources?: Array<{ title: string; url: string; description: string; score: number }>
  error?: string
}

interface AntiVibeStatus {
  cli_module_loaded: boolean
  configured_providers: string[]
  primary_provider: string | null
}

export function AntiVibePanel() {
  const projectDir = useChatStore((s) => s.projectDir)

  const [mode, setMode] = useState<'paste' | 'git' | 'full'>('full')
  const [code, setCode] = useState('')
  const [filename, setFilename] = useState('')
  const [language, setLanguage] = useState('auto')
  const [phase, setPhase] = useState('')
  const [running, setRunning] = useState(false)
  const [analysis, setAnalysis] = useState('')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [staticData, setStaticData] = useState<StaticAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultExpanded, setResultExpanded] = useState(true)
  const [staticExpanded, setStaticExpanded] = useState(true)
  const [status, setStatus] = useState<AntiVibeStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [popupOpen, setPopupOpen] = useState(false)

  // Git mode state
  const [gitFiles, setGitFiles] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [gitLoading, setGitLoading] = useState(false)
  const [gitSinceRef, setGitSinceRef] = useState('HEAD~1')

  // Full-scan state
  const [fullSinceRef, setFullSinceRef] = useState('HEAD~5')
  const [fullMaxFiles, setFullMaxFiles] = useState(15)
  const [includeUnchanged, setIncludeUnchanged] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ index: number; total: number; current: string } | null>(null)
  const [scanLog, setScanLog] = useState<Array<{ type: string; message: string; data?: any }>>([])

  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load status on mount
  useEffect(() => {
    fetch('/api/antivibe/status', { headers: buildApiHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setStatus(d) })
      .catch(() => {})
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setRunning(false)
  }, [])

  const loadGitFiles = useCallback(async () => {
    setGitLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/antivibe/git-diff', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ repo: projectDir || '', since_ref: gitSinceRef, limit: 50 }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`git-diff failed: ${res.status} ${t}`)
      }
      const data = await res.json() as { files: string[] }
      setGitFiles(data.files || [])
      setSelectedFiles(new Set())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGitLoading(false)
    }
  }, [projectDir, gitSinceRef])

  const runGitAnalysis = useCallback(async () => {
    if (selectedFiles.size === 0) {
      setError('Select at least one file')
      return
    }
    // Run static analysis on selected files; then send concatenated to AI
    setError(null)
    setRunning(true)
    setAnalysis('')
    setStaticData(null)
    setSaveMessage(null)

    try {
      const res = await fetch('/api/antivibe/static-analyze', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ paths: Array.from(selectedFiles) }),
      })
      if (!res.ok) throw new Error(`Static analysis failed: ${res.status}`)
      const data = await res.json() as { results: StaticAnalysis[] }
      const combined = (data.results || []).filter((r) => r.available)
      const allConcepts = Array.from(new Set(combined.flatMap((r) => r.concepts || [])))
      const allSymbols = combined.flatMap((r) => (r.symbols || []).map((s) => ({ ...s, file: r.filename || '' })))
      const allResources = Array.from(
        new Map(combined.flatMap((r) => r.resources || []).map((r) => [r.url, r])).values()
      ).sort((a, b) => b.score - a.score).slice(0, 8)
      setStaticData({
        available: true,
        line_count: combined.reduce((sum, r) => sum + (r.line_count || 0), 0),
        symbols: allSymbols.slice(0, 30),
        concepts: allConcepts,
        resources: allResources,
      })

      // Build a combined code string for AI analysis
      const selected = Array.from(selectedFiles).slice(0, 5)
      const codeBlocks: string[] = []
      for (const path of selected) {
        try {
          // Read file via static-analyze (already done above) — we don't get content back
          // So construct a lightweight "report" for AI
          const r = combined.find((x) => x.filename && path.endsWith(x.filename))
          if (r) {
            codeBlocks.push(`### ${path}\nLanguage: ${r.language}\nSymbols: ${(r.symbols || []).map((s) => `${s.kind} ${s.name}@L${s.line}`).join(', ')}\nConcepts: ${(r.concepts || []).join(', ')}`)
          }
        } catch { /* skip */ }
      }
      const summary = codeBlocks.join('\n\n')

      // Run LLM deep dive on the summary
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const aiRes = await fetch('/api/antivibe/analyze', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          code: summary || `[${selected.length} files in static analysis above]`,
          filename: 'multi-file-analysis',
          language: combined[0]?.language?.toLowerCase() || '',
          phase: phase || 'git-changes',
          stream: true,
          include_static: false,
        }),
        signal: ctrl.signal,
      })
      if (!aiRes.ok) throw new Error(`AI analysis failed: ${aiRes.status} ${await aiRes.text()}`)

      const reader = aiRes.body?.getReader()
      if (!reader) throw new Error('No response stream')
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
          let evt: Record<string, unknown>
          try { evt = JSON.parse(raw) } catch { continue }
          const type = evt.type as string
          if (type === 'start') {
            setModel(String(evt.model || ''))
            setProvider(String(evt.provider || ''))
          } else if (type === 'text') {
            setAnalysis((s) => s + String(evt.content || ''))
          } else if (type === 'error') {
            setError(String(evt.message || 'Unknown error'))
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }, [selectedFiles, phase])

  const runFullScan = useCallback(async () => {
    setError(null)
    setAnalysis('')
    setStaticData(null)
    setSaveMessage(null)
    setScanProgress(null)
    setScanLog([])
    setResultExpanded(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)

    try {
      const res = await fetch('/api/antivibe/full-scan', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          repo: projectDir || '',
          since_ref: fullSinceRef,
          max_files: fullMaxFiles,
          phase: phase.trim() || 'full-scan',
          auto_save: true,
          include_unchanged: includeUnchanged,
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Full scan failed: ${res.status} ${text}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')
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
          let evt: Record<string, any>
          try { evt = JSON.parse(raw) } catch { continue }
          const type = evt.type as string

          if (type === 'phase') {
            setScanLog((l) => [...l, { type: 'phase', message: String(evt.message || '') }])
          } else if (type === 'discovered') {
            setScanLog((l) => [...l, { type: 'discovered', message: `Found ${evt.count} files (${evt.source})` }])
          } else if (type === 'file_done') {
            setScanProgress({ index: Number(evt.index), total: Number(evt.total), current: String(evt.path) })
          } else if (type === 'file_error') {
            setScanLog((l) => [...l, { type: 'warning', message: `Skipped ${evt.path}: ${evt.message}` }])
          } else if (type === 'static_done') {
            setStaticData({
              available: true,
              line_count: evt.aggregate?.total_lines,
              symbols: evt.aggregate?.top_symbols,
              concepts: evt.aggregate?.all_concepts,
              resources: evt.aggregate?.resources,
            })
            setScanLog((l) => [...l, { type: 'success', message: `Static analysis: ${evt.aggregate?.files_analyzed} files, ${evt.aggregate?.symbol_count} symbols, ${(evt.aggregate?.all_concepts || []).length} concepts` }])
          } else if (type === 'ai_text') {
            setAnalysis((s) => s + String(evt.content || ''))
          } else if (type === 'saved') {
            setSaveMessage(`Saved → ${evt.filename}`)
            setScanLog((l) => [...l, { type: 'success', message: `Saved to ${evt.filename}` }])
          } else if (type === 'save_error') {
            setSaveMessage(`Save error: ${evt.message}`)
          } else if (type === 'done') {
            setScanLog((l) => [...l, { type: 'success', message: `Done — ${evt.files_analyzed} files analyzed` }])
          } else if (type === 'error') {
            setError(String(evt.message || 'Unknown error'))
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setRunning(false)
      setScanProgress(null)
    }
  }, [projectDir, fullSinceRef, fullMaxFiles, phase, includeUnchanged])

  const run = useCallback(async () => {
    if (!code.trim()) return
    setError(null)
    setAnalysis('')
    setModel('')
    setProvider('')
    setStaticData(null)
    setResultExpanded(true)
    setSaveMessage(null)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)

    try {
      const res = await fetch('/api/antivibe/analyze', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          code: code.trim(),
          filename: filename.trim() || 'code',
          language: language === 'auto' ? '' : language,
          phase: phase.trim(),
          stream: true,
          include_static: true,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Analysis failed: ${res.status} ${text}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

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
          let evt: Record<string, unknown>
          try { evt = JSON.parse(raw) } catch { continue }

          const type = evt.type as string
          if (type === 'start') {
            setModel(String(evt.model || ''))
            setProvider(String(evt.provider || ''))
          } else if (type === 'static') {
            setStaticData(evt.data as StaticAnalysis)
          } else if (type === 'text') {
            setAnalysis((s) => s + String(evt.content || ''))
          } else if (type === 'error') {
            setError(String(evt.message || 'Unknown error'))
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message)
      }
    } finally {
      setRunning(false)
    }
  }, [code, filename, language, phase])

  const saveDeepDive = useCallback(async () => {
    if (!analysis.trim()) return
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/antivibe/save-deep-dive', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          phase: phase.trim() || filename.trim() || 'analysis',
          content: `# Deep Dive: ${phase || filename || 'analysis'}\n\n_Generated by Kodo · AntiVibe · ${new Date().toISOString()}_\n_Provider: ${provider} · Model: ${model}_\n\n${analysis}`,
          repo: projectDir || '',
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`Save failed: ${res.status} ${t}`)
      }
      const data = await res.json() as { path: string; filename: string }
      setSaveMessage(`Saved → ${data.filename}`)
    } catch (e) {
      setSaveMessage(`Error: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }, [analysis, filename, model, phase, projectDir, provider])

  const toggleFile = (path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const noProvider = status && status.configured_providers.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <BookOpen size={14} color="var(--blue)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>
            ANTIVIBE
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            learn what AI wrote
          </span>
          {status && (
            <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'var(--font-mono)', color: status.cli_module_loaded ? 'var(--green)' : 'var(--yellow)' }}>
              {status.cli_module_loaded ? '● CLI' : '○ NO-CLI'}
            </span>
          )}
        </div>

        {noProvider && (
          <div style={{ marginBottom: 6, fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
            No AI provider configured. Add an API key in Providers.
          </div>
        )}

        {/* Mode toggle */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)', overflow: 'hidden', marginBottom: 8 }}>
          {(['full', 'paste', 'git'] as const).map((m, idx, arr) => (
            <button key={m} type="button" onClick={() => setMode(m)} disabled={running} style={{
              border: 'none', borderRight: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
              background: mode === m ? (m === 'full' ? 'var(--accent-dim)' : 'var(--blue-dim)') : 'transparent',
              color: mode === m ? (m === 'full' ? 'var(--accent)' : 'var(--blue)') : 'var(--text-2)',
              fontSize: 10, fontFamily: 'var(--font-mono)', padding: '5px 12px',
              cursor: running ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              fontWeight: m === 'full' ? 700 : 400,
            }}>
              {m === 'full' ? <Zap size={10} /> : m === 'paste' ? <FileCode size={10} /> : <GitBranch size={10} />}
              {m === 'full' ? 'FULL SCAN' : m.toUpperCase()}
            </button>
          ))}
        </div>

        {mode === 'full' && (
          <>
            <div style={{ marginBottom: 6, fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              repo: <span style={{ color: 'var(--text-1)' }}>{projectDir || '(current dir)'}</span>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                since:
                <input value={fullSinceRef} onChange={(e) => setFullSinceRef(e.target.value)} disabled={running}
                  placeholder="HEAD~5"
                  style={{ width: 80, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                max files:
                <input type="number" min="1" max="50" value={fullMaxFiles} onChange={(e) => setFullMaxFiles(Math.max(1, Math.min(50, parseInt(e.target.value) || 15)))} disabled={running}
                  style={{ width: 50, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeUnchanged} onChange={(e) => setIncludeUnchanged(e.target.checked)} disabled={running} style={{ accentColor: 'var(--accent)' }} />
                whole repo
              </label>
              <input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="phase tag (optional)" disabled={running}
                style={{ flex: 1, minWidth: 120, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '4px 8px', outline: 'none', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <button type="button" onClick={running ? stop : () => void runFullScan()}
              style={{
                width: '100%',
                background: running ? 'var(--red-dim)' : 'linear-gradient(90deg, var(--accent), var(--accent))',
                border: running ? '1px solid var(--red)' : 'none',
                color: running ? 'var(--red)' : '#000',
                borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                letterSpacing: '0.05em',
              }}>
              {running ? <><X size={13} /> STOP SCAN</> : <><Zap size={13} /> RUN FULL SCAN</>}
            </button>

            {scanProgress && (
              <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>Analyzing {scanProgress.index}/{scanProgress.total}</span>
                  <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{scanProgress.current}</span>
                </div>
                <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(scanProgress.index / scanProgress.total) * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
                </div>
              </div>
            )}

            {scanLog.length > 0 && (
              <div style={{ marginTop: 8, maxHeight: 100, overflowY: 'auto', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                {scanLog.slice(-12).map((entry, i) => (
                  <div key={i} style={{
                    color: entry.type === 'warning' ? 'var(--yellow)' : entry.type === 'success' ? 'var(--green)' : 'var(--text-1)',
                    marginBottom: 1,
                  }}>
                    <span style={{ color: 'var(--text-2)' }}>›</span> {entry.message}
                  </div>
                ))}
              </div>
            )}

            {saveMessage && (
              <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: saveMessage.startsWith('Save error') ? 'var(--red)' : 'var(--green)' }}>
                {saveMessage}
              </div>
            )}
          </>
        )}

        {mode === 'paste' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="filename.ts"
                disabled={running}
                style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '4px 8px', outline: 'none', fontFamily: 'var(--font-mono)' }}
              />
              <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={running}
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '4px 6px', outline: 'none', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="phase" disabled={running}
                style={{ width: 90, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '4px 8px', outline: 'none', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void run() } }}
              placeholder="Paste AI-generated code... (Cmd+Enter to analyze)"
              rows={8}
              disabled={running}
              style={{ width: '100%', resize: 'vertical', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-0)', fontSize: 11.5, padding: '8px 10px', outline: 'none', fontFamily: 'var(--font-mono)', lineHeight: 1.5, boxSizing: 'border-box' }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--blue)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
            />

            {!code && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {EXAMPLE_PROMPTS.map((eg) => (
                  <button key={eg.label} type="button" onClick={() => { setCode(eg.code); textareaRef.current?.focus() }}
                    style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 12, padding: '3px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', cursor: 'pointer' }}>
                    {eg.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={running ? stop : () => void run()}
                disabled={!running && !code.trim()}
                style={{
                  background: running ? 'var(--red-dim)' : 'var(--blue-dim)',
                  border: running ? '1px solid var(--red)' : '1px solid var(--blue)',
                  color: running ? 'var(--red)' : 'var(--blue)',
                  borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                  fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                {running ? <><X size={11} /> STOP</> : <><Sparkles size={11} /> DEEP DIVE</>}
              </button>
              {analysis && !running && (
                <button type="button" onClick={() => void saveDeepDive()} disabled={saving}
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Download size={10} /> {saving ? 'SAVING...' : 'SAVE'}
                </button>
              )}
              {model && (
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                  {provider} / {model}
                </span>
              )}
              {saveMessage && (
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: saveMessage.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                  {saveMessage}
                </span>
              )}
            </div>
          </>
        )}

        {mode === 'git' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>since:</span>
              <input value={gitSinceRef} onChange={(e) => setGitSinceRef(e.target.value)} disabled={gitLoading || running}
                placeholder="HEAD~1"
                style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '4px 8px', outline: 'none', fontFamily: 'var(--font-mono)' }}
              />
              <button type="button" onClick={() => void loadGitFiles()} disabled={gitLoading || running}
                style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={10} style={{ animation: gitLoading ? 'spin 1s linear infinite' : 'none' }} />
                LOAD
              </button>
            </div>

            <div style={{ marginBottom: 6, fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              repo: {projectDir || '(current dir)'}
            </div>

            {gitFiles.length > 0 && (
              <div style={{
                maxHeight: 180, overflowY: 'auto',
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg-2)', padding: 4,
              }}>
                {gitFiles.map((f) => {
                  const checked = selectedFiles.has(f)
                  const short = f.split(/[/\\]/).slice(-2).join('/')
                  return (
                    <label key={f} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 6px', cursor: 'pointer', fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: checked ? 'var(--blue)' : 'var(--text-1)',
                      background: checked ? 'var(--blue-dim)' : 'transparent',
                      borderRadius: 4,
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleFile(f)} style={{ accentColor: 'var(--blue)' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short}</span>
                    </label>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="phase name" disabled={running}
                style={{ flex: 1, minWidth: 100, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '4px 8px', outline: 'none', fontFamily: 'var(--font-mono)' }}
              />
              <button type="button" onClick={running ? stop : () => void runGitAnalysis()}
                disabled={!running && selectedFiles.size === 0}
                style={{
                  background: running ? 'var(--red-dim)' : 'var(--blue-dim)',
                  border: running ? '1px solid var(--red)' : '1px solid var(--blue)',
                  color: running ? 'var(--red)' : 'var(--blue)',
                  borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                  fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                {running ? <><X size={11} /> STOP</> : <><Sparkles size={11} /> ANALYZE {selectedFiles.size}</>}
              </button>
              {analysis && !running && (
                <button type="button" onClick={() => void saveDeepDive()} disabled={saving}
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Download size={10} /> {saving ? 'SAVING...' : 'SAVE'}
                </button>
              )}
            </div>
            {saveMessage && (
              <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: saveMessage.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                {saveMessage}
              </div>
            )}
          </>
        )}

        {error && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Scrollable content area — static analysis + deep dive share this space */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Static analysis section */}
      {staticData && staticData.available && (
        <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button type="button" onClick={() => setStaticExpanded((v) => !v)}
            style={{
              width: '100%', border: 'none', background: 'var(--bg-2)',
              color: 'var(--text-0)', padding: '7px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
            }}>
            {staticExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Tag size={11} color="var(--green)" />
            STATIC ANALYSIS
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-2)' }}>
              {staticData.symbols?.length || 0} symbols · {staticData.concepts?.length || 0} concepts
            </span>
          </button>
          {staticExpanded && (
            <div style={{ padding: '8px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', background: 'var(--bg-1)' }}>
              {staticData.concepts && staticData.concepts.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-2)' }}>concepts: </span>
                  {staticData.concepts.map((c) => (
                    <span key={c} style={{ display: 'inline-block', background: 'var(--green-dim)', color: 'var(--green)', borderRadius: 10, padding: '1px 8px', margin: '0 4px 4px 0', fontSize: 10 }}>{c}</span>
                  ))}
                </div>
              )}
              {staticData.symbols && staticData.symbols.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-2)' }}>symbols ({staticData.symbols.length}):</span>
                  <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 3 }}>
                    {staticData.symbols.slice(0, 12).map((s, i) => (
                      <span key={i} style={{ fontSize: 10, color: 'var(--text-1)' }}>
                        <span style={{ color: 'var(--text-2)' }}>{s.kind}</span> <span style={{ color: 'var(--accent)' }}>{s.name}</span>
                        <span style={{ color: 'var(--text-2)' }}>:L{s.line}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {staticData.resources && staticData.resources.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-2)' }}>resources:</span>
                  <ul style={{ margin: '4px 0 0 0', padding: '0 0 0 16px' }}>
                    {staticData.resources.slice(0, 5).map((r) => (
                      <li key={r.url} style={{ marginBottom: 2 }}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 10.5 }}>
                          {r.title}
                        </a>
                        <span style={{ color: 'var(--text-2)', fontSize: 10 }}> · {r.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Result area */}
      {(analysis || running) ? (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{
              width: '100%', background: 'var(--bg-2)',
              borderBottom: '1px solid var(--border)',
              padding: '7px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, fontFamily: 'var(--font-mono)', flexShrink: 0,
            }}>
            <button type="button" onClick={() => setResultExpanded((v) => !v)}
              style={{ border: 'none', background: 'none', color: 'var(--text-0)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0, fontSize: 11, fontFamily: 'var(--font-mono)', flex: 1 }}>
              {resultExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <BookOpen size={12} color="var(--blue)" />
              DEEP DIVE ANALYSIS
            </button>
            {running && <Loader size={10} color="var(--blue)" style={{ animation: 'spin 1s linear infinite' }} />}
            {analysis && !running && (
              <button type="button" onClick={() => setPopupOpen(true)} title="Open in full view"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text-1)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontFamily: 'var(--font-mono)' }}>
                <Maximize2 size={10} /> FULL VIEW
              </button>
            )}
          </div>

          {resultExpanded && (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-0)', lineHeight: 1.75 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2({ children }) {
                    return <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginTop: 20, marginBottom: 10 }}>{children}</h2>
                  },
                  h3({ children }) {
                    return <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-0)', marginTop: 14, marginBottom: 6 }}>{children}</h3>
                  },
                  strong({ children }) {
                    return <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>{children}</strong>
                  },
                  code({ children, ...props }: any) {
                    const inline = !props.className
                    if (inline) {
                      return <code style={{ background: 'var(--bg-3)', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{children}</code>
                    }
                    return (
                      <pre style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', overflowX: 'auto', margin: '8px 0' }}>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-0)' }}>{children}</code>
                      </pre>
                    )
                  },
                  li({ children }) { return <li style={{ marginBottom: 4 }}>{children}</li> },
                  p({ children }) { return <p style={{ marginBottom: 10 }}>{children}</p> },
                  a({ children, href }) {
                    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none' }}>{children}</a>
                  },
                  blockquote({ children }) {
                    return <blockquote style={{ borderLeft: '3px solid var(--blue)', paddingLeft: 12, margin: '8px 0', color: 'var(--text-1)', fontStyle: 'italic' }}>{children}</blockquote>
                  },
                }}
              >
                {analysis}
              </ReactMarkdown>
              {running && (
                <span style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--blue)', animation: 'blink 1s step-end infinite', marginLeft: 2, verticalAlign: 'middle' }} />
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, color: 'var(--text-2)' }}>
          <BookOpen size={40} style={{ opacity: 0.15 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>AntiVibe Deep Dive</div>
          <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.7, maxWidth: 320 }}>
            {mode === 'full'
              ? 'One-click: discovers files (git diff or whole repo), runs static analysis on all of them, generates a unified AI deep-dive, and saves the result to deep-dive/.'
              : mode === 'paste'
              ? 'Paste AI-generated code and hit DEEP DIVE. Get static analysis (symbols, concepts, resources) plus structured AI explanation.'
              : 'Pick recently changed files in your repo. AntiVibe runs static analysis on all of them then sends a combined deep-dive to the AI.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Symbols', 'Concepts', 'Resources', 'Quality score'].map((tag) => (
              <span key={tag} style={{ background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: 12, padding: '3px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      </div>{/* end scrollable content area */}

      {/* Fullscreen popup modal for deep dive analysis */}
      {popupOpen && analysis && (
        <div
          onClick={() => setPopupOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(860px, 96vw)', maxHeight: '92vh',
              background: 'var(--bg-1)', border: '1px solid var(--border-bright)',
              borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              background: 'var(--bg-2)', flexShrink: 0,
            }}>
              <BookOpen size={16} color="var(--blue)" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', flex: 1 }}>
                ANTIVIBE · DEEP DIVE
              </span>
              {model && (
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                  {provider} / {model}
                </span>
              )}
              <button
                type="button"
                onClick={() => setPopupOpen(false)}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '1px solid var(--border)', background: 'var(--bg-3)',
                  color: 'var(--text-1)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Modal body — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', fontSize: 14, color: 'var(--text-0)', lineHeight: 1.8 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2({ children }) {
                    return <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginTop: 28, marginBottom: 14 }}>{children}</h2>
                  },
                  h3({ children }) {
                    return <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)', marginTop: 18, marginBottom: 8 }}>{children}</h3>
                  },
                  strong({ children }) {
                    return <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>{children}</strong>
                  },
                  code({ children, ...props }: any) {
                    const inline = !props.className
                    if (inline) {
                      return <code style={{ background: 'var(--bg-3)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{children}</code>
                    }
                    return (
                      <pre style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', overflowX: 'auto', margin: '10px 0' }}>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-0)' }}>{children}</code>
                      </pre>
                    )
                  },
                  li({ children }) { return <li style={{ marginBottom: 6 }}>{children}</li> },
                  p({ children }) { return <p style={{ marginBottom: 12 }}>{children}</p> },
                  a({ children, href }) {
                    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none' }}>{children}</a>
                  },
                  blockquote({ children }) {
                    return <blockquote style={{ borderLeft: '3px solid var(--blue)', paddingLeft: 16, margin: '10px 0', color: 'var(--text-1)', fontStyle: 'italic' }}>{children}</blockquote>
                  },
                }}
              >
                {analysis}
              </ReactMarkdown>
            </div>

            {/* Modal footer */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderTop: '1px solid var(--border)',
              background: 'var(--bg-2)', flexShrink: 0,
            }}>
              <button type="button" onClick={() => void saveDeepDive()} disabled={saving}
                style={{ border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text-1)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Download size={12} /> {saving ? 'SAVING...' : 'SAVE TO DEEP-DIVE/'}
              </button>
              {saveMessage && (
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: saveMessage?.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                  {saveMessage}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setPopupOpen(false)}
                style={{ border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text-1)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
