import { useEffect, useRef, useState } from 'react'
import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  lines: string[]
  isRunning: boolean
  themeMode: 'dark' | 'light'
  cwdHint?: string
  onRunCommand: (command: string) => Promise<{ cwd?: string } | void> | { cwd?: string } | void
  onClose: () => void
}

const MIN_TERMINAL_HEIGHT = 190
const MAX_TERMINAL_HEIGHT_RATIO = 0.72

function normalizeCwd(value?: string): string {
  const text = String(value || '').trim()
  return text || 'workspace root'
}

function promptText(cwd: string): string {
  return `PS ${cwd}> `
}

function terminalTheme(mode: 'dark' | 'light') {
  if (mode === 'light') {
    return {
      background: '#f7f6f2',
      foreground: '#1f1c17',
      cursor: '#cf3b00',
      selectionBackground: 'rgba(207, 59, 0, 0.18)',
    }
  }

  return {
    background: '#0a0a0b',
    foreground: '#a8a8b8',
    cursor: '#ff4d21',
    selectionBackground: 'rgba(255, 77, 33, 0.2)',
  }
}

export function TerminalPanel({
  lines,
  isRunning,
  themeMode,
  cwdHint,
  onRunCommand,
  onClose,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const renderedLinesRef = useRef(0)
  const resizeStartYRef = useRef(0)
  const resizeStartHeightRef = useRef(250)
  const runningRef = useRef(isRunning)
  const inputBufferRef = useRef('')
  const commandHistoryRef = useRef<string[]>([])
  const historyCursorRef = useRef(-1)
  const currentCwdRef = useRef(normalizeCwd(cwdHint))
  const [fallback, setFallback] = useState(false)
  const [fallbackCommand, setFallbackCommand] = useState('')
  const [panelHeight, setPanelHeight] = useState(250)
  const [isResizing, setIsResizing] = useState(false)
  const [showGuide, setShowGuide] = useState(true)

  useEffect(() => {
    runningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    currentCwdRef.current = normalizeCwd(cwdHint)
  }, [cwdHint])

  useEffect(() => {
    let cancelled = false
    let removeResize: (() => void) | null = null
    let removePasteListener: (() => void) | null = null
    let dataSubscription: { dispose: () => void } | null = null

    const init = async () => {
      if (!containerRef.current || termRef.current) return
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ])
        if (cancelled || !containerRef.current) return

        const term = new Terminal({
          theme: terminalTheme(themeMode),
          fontSize: 12,
          fontFamily: 'JetBrains Mono, Fira Code, monospace',
          cursorBlink: isRunning,
          disableStdin: false,
          scrollback: 1000,
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(containerRef.current)
        fit.fit()

        const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)

        const copySelection = () => {
          const selection = term.getSelection()
          if (!selection) return false
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            void navigator.clipboard.writeText(selection).catch(() => {
              // Ignore clipboard write failures (browser permissions/policy).
            })
          }
          return true
        }

        const pasteClipboard = async () => {
          if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
            try {
              const text = await navigator.clipboard.readText()
              if (text) {
                term.paste(text)
              }
            } catch {
              // Ignore clipboard read failures (browser permissions/policy).
            }
          }
        }

        term.attachCustomKeyEventHandler((event) => {
          const key = event.key.toLowerCase()
          const modifier = isMac ? event.metaKey : event.ctrlKey

          if (modifier && key === 'c') {
            if (copySelection()) {
              event.preventDefault()
              return false
            }
            return true
          }

          if (modifier && key === 'v') {
            event.preventDefault()
            void pasteClipboard()
            return false
          }

          if (modifier && key === 'insert') {
            if (copySelection()) {
              event.preventDefault()
              return false
            }
            return true
          }

          if (event.shiftKey && key === 'insert') {
            event.preventDefault()
            void pasteClipboard()
            return false
          }

          return true
        })

        const onPaste = (event: ClipboardEvent) => {
          const text = event.clipboardData?.getData('text') || ''
          if (!text) return
          event.preventDefault()
          term.paste(text)
        }

        containerRef.current.addEventListener('paste', onPaste)
        removePasteListener = () => {
          containerRef.current?.removeEventListener('paste', onPaste)
        }

        const writePrompt = () => {
          term.write(promptText(currentCwdRef.current))
        }

        const clearCurrentInput = () => {
          while (inputBufferRef.current.length > 0) {
            term.write('\b \b')
            inputBufferRef.current = inputBufferRef.current.slice(0, -1)
          }
        }

        const replaceCurrentInput = (next: string) => {
          clearCurrentInput()
          inputBufferRef.current = next
          if (next) {
            term.write(next)
          }
        }

        const executeTypedCommand = async (typed: string) => {
          const command = typed.trim()
          term.write('\r\n')

          if (!command) {
            inputBufferRef.current = ''
            historyCursorRef.current = -1
            writePrompt()
            return
          }

          const history = commandHistoryRef.current
          if (history.length === 0 || history[history.length - 1] !== command) {
            history.push(command)
            if (history.length > 60) {
              history.shift()
            }
          }
          historyCursorRef.current = -1
          runningRef.current = true

          try {
            const result = await Promise.resolve(onRunCommand(command))
            if (result && typeof result === 'object' && typeof result.cwd === 'string' && result.cwd.trim()) {
              currentCwdRef.current = result.cwd.trim()
            }
          } catch (error) {
            term.writeln(`[error] ${String(error)}`)
          } finally {
            inputBufferRef.current = ''
            runningRef.current = false
            writePrompt()
            try {
              fit.fit()
            } catch {
              // Ignore transient resize races.
            }
          }
        }

        dataSubscription = term.onData((data) => {
          if (runningRef.current) {
            return
          }

          if (data === '\r') {
            void executeTypedCommand(inputBufferRef.current)
            return
          }

          if (data === '\u007f') {
            if (inputBufferRef.current.length > 0) {
              inputBufferRef.current = inputBufferRef.current.slice(0, -1)
              term.write('\b \b')
            }
            return
          }

          if (data === '\u0003') {
            inputBufferRef.current = ''
            historyCursorRef.current = -1
            term.write('^C\r\n')
            writePrompt()
            return
          }

          if (data === '\x1b[A') {
            const history = commandHistoryRef.current
            if (history.length === 0) return

            if (historyCursorRef.current < history.length - 1) {
              historyCursorRef.current += 1
            }
            const value = history[history.length - 1 - historyCursorRef.current] || ''
            replaceCurrentInput(value)
            return
          }

          if (data === '\x1b[B') {
            const history = commandHistoryRef.current
            if (history.length === 0) return

            if (historyCursorRef.current > 0) {
              historyCursorRef.current -= 1
              const value = history[history.length - 1 - historyCursorRef.current] || ''
              replaceCurrentInput(value)
            } else {
              historyCursorRef.current = -1
              replaceCurrentInput('')
            }
            return
          }

          if (data.startsWith('\x1b')) {
            return
          }

          const printable = Array.from(data)
            .filter((char) => char >= ' ' && char !== '\u007f')
            .join('')

          if (!printable) {
            return
          }

          inputBufferRef.current += printable
          term.write(printable)
        })

        term.writeln('KODO terminal ready. Type a command and press Enter.')
        writePrompt()
        term.focus()

        const onResize = () => {
          try {
            fit.fit()
          } catch {
            // Ignore layout races while resizing.
          }
        }
        window.addEventListener('resize', onResize)
        removeResize = () => window.removeEventListener('resize', onResize)

        termRef.current = term
        fitRef.current = fit
      } catch {
        setFallback(true)
      }
    }

    void init()

    return () => {
      cancelled = true
      if (removeResize) removeResize()
      if (removePasteListener) removePasteListener()
      if (dataSubscription) dataSubscription.dispose()
      if (termRef.current) {
        termRef.current.dispose()
        termRef.current = null
      }
      fitRef.current = null
      renderedLinesRef.current = 0
    }
  }, [])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.cursorBlink = isRunning
  }, [isRunning])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.theme = terminalTheme(themeMode)
  }, [themeMode])

  useEffect(() => {
    if (!termRef.current) return
    try {
      fitRef.current?.fit()
    } catch {
      // Ignore transient layout races.
    }
  }, [lines.length, isRunning, panelHeight, showGuide])

  useEffect(() => {
    if (!isResizing) return

    const onMouseMove = (event: MouseEvent) => {
      const delta = resizeStartYRef.current - event.clientY
      const maxHeight = Math.max(MIN_TERMINAL_HEIGHT, Math.floor(window.innerHeight * MAX_TERMINAL_HEIGHT_RATIO))
      const next = Math.max(MIN_TERMINAL_HEIGHT, Math.min(maxHeight, resizeStartHeightRef.current + delta))
      setPanelHeight(next)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizing])

  useEffect(() => {
    if (!termRef.current) return

    const term = termRef.current
    if (lines.length < renderedLinesRef.current) {
      term.clear()
      term.reset()
      renderedLinesRef.current = 0
      term.writeln('KODO terminal reset.')
      term.write(promptText(currentCwdRef.current))
    }

    for (let idx = renderedLinesRef.current; idx < lines.length; idx += 1) {
      term.writeln(lines[idx])
    }
    renderedLinesRef.current = lines.length
  }, [lines])

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: themeMode === 'light' ? 'var(--bg-0)' : '#0a0a0b',
        flexShrink: 0,
        height: panelHeight,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div
        onMouseDown={(event) => {
          event.preventDefault()
          resizeStartYRef.current = event.clientY
          resizeStartHeightRef.current = panelHeight
          setIsResizing(true)
        }}
        title="Drag to resize terminal"
        aria-label="Resize terminal"
        style={{
          height: 7,
          borderBottom: '1px solid var(--border)',
          background: isResizing ? 'var(--accent-dim)' : 'var(--bg-1)',
          cursor: 'ns-resize',
          flexShrink: 0,
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-1)',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
          TERMINAL {isRunning ? '● RUNNING' : '○ DONE'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
          INTERACTIVE POWERSHELL
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowGuide((prev) => !prev)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            padding: '2px 7px',
          }}
        >
          {showGuide ? 'HIDE GUIDE' : 'SHOW GUIDE'}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </div>

      {showGuide && (
        <div
          style={{
            padding: '6px 10px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-2)',
            display: 'grid',
            gap: 3,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-1)' }}>
            Type a PowerShell command below and press Enter to run it in this workspace.
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
            Productivity tip: keep this panel open, run short commands, then paste key error lines into chat for faster fixes.
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
            Copy/paste: Ctrl/Cmd+C copies selection, Ctrl/Cmd+V pastes into the prompt.
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
            {cwdHint ? `Current directory: ${cwdHint}` : 'Current directory: workspace root'}
          </div>
        </div>
      )}

      {fallback ? (
        <>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-1)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {lines.join('\n') || '(no terminal output yet - run a command below)'}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              const next = fallbackCommand.trim()
              if (!next || isRunning) return
              void Promise.resolve(onRunCommand(next))
              setFallbackCommand('')
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 10px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-1)',
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>PS&gt;</span>
            <input
              type="text"
              value={fallbackCommand}
              onChange={(event) => setFallbackCommand(event.target.value)}
              placeholder="Type command"
              disabled={isRunning}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-0)',
                padding: '6px 8px',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={isRunning || !fallbackCommand.trim()}
              style={{
                border: '1px solid var(--border)',
                background: isRunning || !fallbackCommand.trim() ? 'var(--bg-2)' : 'var(--accent-dim)',
                color: isRunning || !fallbackCommand.trim() ? 'var(--text-2)' : 'var(--accent)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                cursor: isRunning || !fallbackCommand.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              RUN
            </button>
          </form>
        </>
      ) : (
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: 'hidden' }}
          onClick={() => termRef.current?.focus()}
        />
      )}
    </div>
  )
}
