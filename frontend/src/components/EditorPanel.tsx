import { CSSProperties, ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { Download, Save, Upload } from 'lucide-react'

type FileHandleLike = {
  name?: string
  getFile?: () => Promise<File>
  createWritable?: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}

const STORAGE_KEY = 'kodo_editor_snapshot'

interface EditorPanelProps {
  widthPercent: number
}

export function EditorPanel({ widthPercent }: EditorPanelProps) {
  const [fileName, setFileName] = useState('untitled.txt')
  const [code, setCode] = useState('')
  const [originalCode, setOriginalCode] = useState('')
  const [status, setStatus] = useState('No file open')
  const [fileHandle, setFileHandle] = useState<FileHandleLike | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { fileName?: string; code?: string; originalCode?: string }
      if (typeof parsed.fileName === 'string') setFileName(parsed.fileName)
      if (typeof parsed.code === 'string') setCode(parsed.code)
      if (typeof parsed.originalCode === 'string') setOriginalCode(parsed.originalCode)
    } catch {
      // Ignore local storage parse issues.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ fileName, code, originalCode }))
  }, [fileName, code, originalCode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.ctrlKey || event.metaKey
      if (isMeta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveCurrentFile()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [code, fileHandle, fileName])

  const diffLines = useMemo(() => {
    const oldLines = originalCode.split(/\r?\n/)
    const newLines = code.split(/\r?\n/)
    const max = Math.max(oldLines.length, newLines.length)
    const rows: Array<{ type: 'same' | 'add' | 'remove'; line: string }> = []

    for (let index = 0; index < max; index += 1) {
      const before = oldLines[index]
      const after = newLines[index]
      if (before === after) continue
      if (before !== undefined) rows.push({ type: 'remove', line: before })
      if (after !== undefined) rows.push({ type: 'add', line: after })
    }

    return rows.slice(0, 120)
  }, [code, originalCode])

  const hasChanges = code !== originalCode

  const openFromPicker = async () => {
    const picker = (window as unknown as { showOpenFilePicker?: () => Promise<FileHandleLike[]> }).showOpenFilePicker
    if (!picker) {
      fileInputRef.current?.click()
      return
    }

    try {
      const [handle] = await picker()
      if (!handle?.getFile) return
      const file = await handle.getFile()
      const text = await file.text()
      setFileHandle(handle)
      setFileName(file.name || 'untitled.txt')
      setCode(text)
      setOriginalCode(text)
      setStatus(`Loaded ${file.name}`)
    } catch {
      setStatus('File open cancelled')
    }
  }

  const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setFileName(file.name)
    setCode(text)
    setOriginalCode(text)
    setFileHandle(null)
    setStatus(`Loaded ${file.name}`)
    event.target.value = ''
  }

  const saveCurrentFile = async () => {
    if (!hasChanges) {
      setStatus('No changes to save')
      return
    }

    if (fileHandle?.createWritable) {
      try {
        const writable = await fileHandle.createWritable()
        await writable.write(code)
        await writable.close()
        setOriginalCode(code)
        setStatus(`Saved ${fileName}`)
        return
      } catch {
        // Fall back to download path below.
      }
    }

    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
    setOriginalCode(code)
    setStatus(`Downloaded ${fileName}`)
  }

  return (
    <div style={{
      width: `${widthPercent}%`,
      minWidth: 320,
      maxWidth: '70%',
      borderLeft: '1px solid var(--border)',
      background: 'var(--bg-1)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{ minWidth: 0 }}>
          <div className="truncate" style={{ fontSize: 12, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>
            {fileName}
          </div>
          <div style={{ fontSize: 10, color: hasChanges ? 'var(--yellow)' : 'var(--text-2)' }}>
            {hasChanges ? 'Unsaved changes' : 'Saved'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => void openFromPicker()} style={iconButtonStyle} title="Open file">
            <Upload size={12} />
          </button>
          <button type="button" onClick={() => void saveCurrentFile()} style={iconButtonStyle} title="Save file">
            <Save size={12} />
          </button>
          <button type="button" onClick={() => {
            const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = fileName
            anchor.click()
            URL.revokeObjectURL(url)
          }} style={iconButtonStyle} title="Download copy">
            <Download size={12} />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(event) => {
          void onFileInputChange(event)
        }}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CodeMirror
          value={code}
          onChange={(value) => setCode(value)}
          theme={oneDark}
          extensions={resolveLanguageExtensions(fileName)}
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            autocompletion: true,
          }}
          style={{ height: '100%' }}
        />
      </div>

      <div style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-2)',
        padding: '8px 10px',
        display: 'grid',
        gap: 6,
        maxHeight: 180,
        overflow: 'auto',
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{status}</div>
        {diffLines.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-2)' }}>No diff preview</div>
        )}
        {diffLines.map((row, index) => (
          <div
            key={`${row.type}-${index}`}
            style={{
              fontSize: 10,
              color: row.type === 'add' ? 'var(--green)' : 'var(--red)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.35,
            }}
          >
            {row.type === 'add' ? '+' : '-'} {row.line}
          </div>
        ))}
      </div>
    </div>
  )
}

function resolveLanguageExtensions(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.jsx')) {
    return [javascript({ jsx: true, typescript: lower.endsWith('.ts') || lower.endsWith('.tsx') })]
  }
  if (lower.endsWith('.py')) return [python()]
  if (lower.endsWith('.md')) return [markdown()]
  if (lower.endsWith('.json')) return [json()]
  if (lower.endsWith('.html')) return [html()]
  if (lower.endsWith('.css')) return [css()]
  return []
}

const iconButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--bg-3)',
  color: 'var(--text-1)',
  borderRadius: 8,
  width: 28,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
