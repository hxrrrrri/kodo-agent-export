import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatWindow } from './components/ChatWindow'
import { useChatStore } from './store/chatStore'

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'kodo_sidebar_collapsed'
const THEME_STORAGE_KEY = 'kodo_theme'

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const theme = useChatStore((state) => state.theme)
  const setTheme = useChatStore((state) => state.setTheme)

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)
    if (saved === '1') {
      setSidebarCollapsed(true)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved)
      return
    }

    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    setTheme(prefersLight ? 'light' : 'dark')
  }, [setTheme])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev)
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-0)',
      position: 'relative',
    }}>
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />

      <ChatWindow />
    </div>
  )
}
