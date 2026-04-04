import { MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import { NotificationCenter } from './components/NotificationCenter'
import { EditorPanel } from './components/EditorPanel'
import { useChatStore } from './store/chatStore'
import { THEME_KEYS, THEME_TONES, ThemeKey } from './store/chatStore'
import { requestUiNotificationPermission } from './lib/notifications'

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'kodo_sidebar_collapsed'
const THEME_STORAGE_KEY = 'kodo_theme'

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorWidthPercent, setEditorWidthPercent] = useState(40)
  const rootRef = useRef<HTMLDivElement>(null)
  const theme = useChatStore((state) => state.theme)
  const setTheme = useChatStore((state) => state.setTheme)

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)
    if (saved === '1') {
      setSidebarCollapsed(true)
    }
    void requestUiNotificationPermission()
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (saved && (THEME_KEYS as readonly string[]).includes(saved)) {
      setTheme(saved as ThemeKey)
      return
    }

    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    setTheme(prefersLight ? 'light' : 'dark')
  }, [setTheme])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = THEME_TONES[theme]
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const handler = () => {
      setSidebarCollapsed((prev) => !prev)
    }
    window.addEventListener('kodo:toggle-sidebar', handler)
    return () => {
      window.removeEventListener('kodo:toggle-sidebar', handler)
    }
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev)
  }

  const toggleEditor = () => {
    setEditorOpen((prev) => !prev)
  }

  const startResizeEditor = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const root = rootRef.current
    if (!root) return

    const onMove = (moveEvent: MouseEvent) => {
      const rect = root.getBoundingClientRect()
      const rightPanePx = rect.right - moveEvent.clientX
      const next = (rightPanePx / rect.width) * 100
      const clamped = Math.max(26, Math.min(60, next))
      setEditorWidthPercent(clamped)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-0)',
      position: 'relative',
    }} ref={rootRef}>
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', height: '100%' }}>
        <div style={{ width: editorOpen ? `${100 - editorWidthPercent}%` : '100%', minWidth: 0 }}>
          <ChatWindow editorOpen={editorOpen} onToggleEditor={toggleEditor} />
        </div>

        {editorOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={startResizeEditor}
              style={{
                width: 6,
                cursor: 'col-resize',
                background: 'var(--bg-2)',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
              }}
            />
            <EditorPanel widthPercent={editorWidthPercent} />
          </>
        )}
      </div>

      <NotificationCenter />
    </div>
  )
}
