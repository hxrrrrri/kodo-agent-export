import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Plus, Trash2 } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { indentWithTab } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
import { buildApiHeaders, parseApiError } from '../lib/api'

type CellLanguage = 'python' | 'node'

type CellStatus = 'idle' | 'running' | 'done' | 'error'

interface Cell {
  id: string
  language: CellLanguage
  code: string
  output: string
  status: CellStatus
  executionCount: number
}

interface NotebookPanelProps {
  sessionId: string | null
  projectDir: string
}

const PANEL_HEIGHT = 360

function storageKey(sessionId: string | null): string {
  return `kodo_notebook_cells_${sessionId || 'default'}`
}

function createCell(language: CellLanguage): Cell {
  return {
    id: Math.random().toString(36).slice(2, 10),
    language,
    code: '',
    output: '',
    status: 'idle',
    executionCount: 0,
  }
}

export function NotebookPanel({ sessionId, projectDir }: NotebookPanelProps) {
  const [cells, setCells] = useState<Cell[]>([createCell('python')])
  const executionCounterRef = useRef(0)
  const [runningAll, setRunningAll] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(sessionId))
      if (!raw) {
        setCells([createCell('python')])
        executionCounterRef.current = 0
        return
      }
      const parsed = JSON.parse(raw) as Cell[]
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setCells([createCell('python')])
        executionCounterRef.current = 0
        return
      }
      setCells(parsed)
      executionCounterRef.current = parsed.reduce((max, cell) => Math.max(max, cell.executionCount), 0)
    } catch {
      setCells([createCell('python')])
      executionCounterRef.current = 0
    }
  }, [sessionId])

  useEffect(() => {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(cells))
  }, [cells, sessionId])

  const runningCount = useMemo(() => cells.filter((cell) => cell.status === 'running').length, [cells])
  const pythonExtensions = useMemo(() => [python(), keymap.of([indentWithTab])], [])
  const nodeExtensions = useMemo(() => [javascript({ jsx: true }), keymap.of([indentWithTab])], [])

  const setCellPatch = (cellId: string, patch: Partial<Cell>) => {
    setCells((prev) => prev.map((cell) => (cell.id === cellId ? { ...cell, ...patch } : cell)))
  }

  const runCell = async (cellId: string) => {
    const cell = cells.find((item) => item.id === cellId)
    if (!cell) return

    const code = cell.code.trim()
    if (!code) {
      setCellPatch(cellId, { status: 'error', output: 'Cell is empty.' })
      return
    }

    const executionCount = executionCounterRef.current + 1
    executionCounterRef.current = executionCount

    setCellPatch(cellId, {
      status: 'running',
      output: '',
      executionCount,
    })

    try {
      const response = await fetch('/api/chat/notebook/run', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          language: cell.language,
          code,
          session_id: sessionId,
          project_dir: projectDir || null,
        }),
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      const data = await response.json() as {
        success?: boolean
        output?: string
        error?: string
      }

      const output = String(data.output || '').trim() || '(no output)'
      const errorText = String(data.error || '').trim()
      const success = Boolean(data.success) && !errorText

      setCellPatch(cellId, {
        status: success ? 'done' : 'error',
        output: success ? output : `${errorText || 'Execution failed.'}\n${output}`.trim(),
      })
    } catch (error) {
      const message = String(error || '')
      let hint = ''
      if (message.includes('404')) {
        hint = 'Notebook runner endpoint not found. Restart backend and refresh the app.'
      } else if (message.includes('401') || message.includes('403')) {
        hint = 'Notebook run is unauthorized. Verify API auth token in the UI.'
      }

      setCellPatch(cellId, {
        status: 'error',
        output: hint ? `${hint}\n${message}` : message,
      })
    }
  }

  const runAll = async () => {
    if (runningAll) return
    setRunningAll(true)
    try {
      for (const cell of cells) {
        await runCell(cell.id)
      }
    } finally {
      setRunningAll(false)
    }
  }

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-1)',
        padding: '10px 12px',
        display: 'grid',
        gap: 8,
        maxHeight: PANEL_HEIGHT,
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setCells((prev) => [...prev, createCell('python')])}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-2)',
            color: 'var(--text-0)',
            borderRadius: 'var(--radius)',
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={12} /> PY CELL
        </button>

        <button
          type="button"
          onClick={() => setCells((prev) => [...prev, createCell('node')])}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-2)',
            color: 'var(--text-0)',
            borderRadius: 'var(--radius)',
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={12} /> NODE CELL
        </button>

        <button
          type="button"
          onClick={() => void runAll()}
          disabled={runningAll || runningCount > 0}
          style={{
            border: '1px solid var(--accent)',
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius)',
            padding: '4px 8px',
            fontSize: 11,
            cursor: runningAll || runningCount > 0 ? 'not-allowed' : 'pointer',
            opacity: runningAll || runningCount > 0 ? 0.6 : 1,
          }}
        >
          RUN ALL
        </button>

        <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
          REPL execution is direct (no agent round trip)
        </span>
      </div>

      {cells.map((cell, index) => (
        <div
          key={cell.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-2)',
            padding: 8,
            display: 'grid',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ minWidth: 24, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              [{cell.executionCount || ' '}]
            </span>
            <span style={{ color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              ⋮⋮
            </span>
            <span style={{ color: 'var(--text-1)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {cell.language.toUpperCase()} CELL {index + 1}
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => void runCell(cell.id)}
              disabled={cell.status === 'running' || runningAll}
              aria-label={`Run cell ${index + 1}`}
              style={{
                border: '1px solid var(--border)',
                background: 'var(--bg-3)',
                color: 'var(--text-1)',
                borderRadius: 'var(--radius)',
                width: 28,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: cell.status === 'running' || runningAll ? 'not-allowed' : 'pointer',
              }}
            >
              <Play size={12} />
            </button>
            <button
              type="button"
              onClick={() => setCells((prev) => prev.filter((item) => item.id !== cell.id))}
              aria-label={`Delete cell ${index + 1}`}
              style={{
                border: '1px solid var(--border)',
                background: 'var(--bg-3)',
                color: 'var(--text-1)',
                borderRadius: 'var(--radius)',
                width: 28,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>

          <div style={{ border: '1px solid var(--border-bright)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <CodeMirror
              value={cell.code}
              onChange={(value) => setCellPatch(cell.id, { code: value, status: 'idle' })}
              placeholder={`Write ${cell.language} code...`}
              theme={oneDark}
              height="220px"
              extensions={cell.language === 'python' ? pythonExtensions : nodeExtensions}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                autocompletion: true,
                bracketMatching: true,
                closeBrackets: true,
                indentOnInput: true,
              }}
            />
          </div>

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-0)',
              color: cell.status === 'error' ? 'var(--red)' : 'var(--text-1)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              overflowY: 'auto',
              maxHeight: 200,
              padding: 8,
            }}
          >
            {cell.status === 'running' ? 'Running...' : (cell.output || '(no output yet)')}
          </div>
        </div>
      ))}
    </div>
  )
}
