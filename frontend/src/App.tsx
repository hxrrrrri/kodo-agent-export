import { useEffect, useState } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { ChatWindow } from './components/ChatWindow'

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'kodo_sidebar_collapsed'
const SIDEBAR_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)
    if (saved === '1') {
      setSidebarCollapsed(true)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

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
      <div style={{
        width: sidebarCollapsed ? 0 : 'var(--sidebar-width)',
        minWidth: sidebarCollapsed ? 0 : 'var(--sidebar-width)',
        flexShrink: 0,
        position: 'relative',
        transition: `width 320ms ${SIDEBAR_EASING}, min-width 320ms ${SIDEBAR_EASING}`,
      }}>
        <div style={{
          width: 'var(--sidebar-width)',
          height: '100%',
          transform: sidebarCollapsed ? 'translateX(calc(-1 * var(--sidebar-width) - 16px))' : 'translateX(0)',
          opacity: sidebarCollapsed ? 0 : 1,
          pointerEvents: sidebarCollapsed ? 'none' : 'auto',
          transition: `transform 320ms ${SIDEBAR_EASING}, opacity 180ms ease`,
        }}>
          <Sidebar onToggleCollapse={toggleSidebar} />
        </div>
      </div>

      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          style={{
            position: 'absolute',
            left: 10,
            top: 14,
            zIndex: 40,
            width: 32,
            height: 32,
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-bright)',
            background: 'color-mix(in srgb, var(--bg-1) 82%, transparent)',
            color: 'var(--text-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.24)',
            transition: 'all 160ms ease',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.borderColor = 'var(--accent)'
            event.currentTarget.style.color = 'var(--accent)'
            event.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.borderColor = 'var(--border-bright)'
            event.currentTarget.style.color = 'var(--text-1)'
            event.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <PanelLeftOpen size={15} />
        </button>
      )}

      <ChatWindow />
    </div>
  )
}
