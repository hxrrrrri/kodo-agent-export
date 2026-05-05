import { MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import { NotificationCenter } from './components/NotificationCenter'
import { EditorPanel } from './components/EditorPanel'
import { ArtifactSidePanel } from './components/ArtifactSidePanel'
import { ArtifactSidePanelV2 } from './components/artifacts/ArtifactSidePanelV2'
import { DesignStudio } from './components/DesignStudio'
import { OpenClawPanel } from './components/OpenClawPanel'
import { AntiVibePanel } from './components/AntiVibePanel'
import { HermesPanel } from './components/HermesPanel'
import { SkillsBrowserPanel } from './components/SkillsBrowserPanel'
import { useChatStore } from './store/chatStore'
import { THEME_KEYS, THEME_TONES, ThemeKey } from './store/chatStore'
import { requestUiNotificationPermission } from './lib/notifications'
import { SharedArtifactPage, parseSharedRoute } from './pages/SharedArtifactPage'

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'kodo_sidebar_collapsed'
const THEME_STORAGE_KEY = 'kodo_theme'

export default function App() {
  const sharedRoute = typeof window !== 'undefined' ? parseSharedRoute(window.location.href) : null
  if (sharedRoute) {
    return <SharedArtifactPage route={sharedRoute} />
  }

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [antivibeOpen, setAntivibeOpen] = useState(false)
  const [hermesOpen, setHermesOpen] = useState(false)
  const [skillsLibraryOpen, setSkillsLibraryOpen] = useState(false)
  const [editorWidthPercent, setEditorWidthPercent] = useState(40)
  const [antivibeWidthPercent, setAntivibeWidthPercent] = useState(42)
  const [hermesWidthPercent, setHermesWidthPercent] = useState(42)
  const [skillsLibraryWidthPercent, setSkillsLibraryWidthPercent] = useState(44)
  const [artifactWidthPercent, setArtifactWidthPercent] = useState(42)
  const rootRef = useRef<HTMLDivElement>(null)
  const theme = useChatStore((state) => state.theme)
  const setTheme = useChatStore((state) => state.setTheme)
  const selectedArtifact = useChatStore((state) => state.selectedArtifact)
  const setSelectedArtifact = useChatStore((state) => state.setSelectedArtifact)
  const selectedArtifactV2 = useChatStore((state) => state.selectedArtifactV2)
  const setSelectedArtifactV2 = useChatStore((state) => state.setSelectedArtifactV2)
  const designStudioOpen = useChatStore((state) => state.designStudioOpen)
  const setDesignStudioOpen = useChatStore((state) => state.setDesignStudioOpen)

  // artifact panel takes precedence over editor when both could be open
  const artifactOpen = selectedArtifact !== null || selectedArtifactV2 !== null
  const showEditor = editorOpen && !artifactOpen

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

    setTheme('claude')
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

  useEffect(() => {
    const handler = () => setDesignStudioOpen(true)
    window.addEventListener('kodo:open-design-studio', handler)
    return () => window.removeEventListener('kodo:open-design-studio', handler)
  }, [setDesignStudioOpen])

  const [openClawOpen, setOpenClawOpen] = useState(false)
  useEffect(() => {
    const handler = () => setOpenClawOpen(true)
    window.addEventListener('kodo:open-openclaw', handler)
    return () => window.removeEventListener('kodo:open-openclaw', handler)
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev)
  }

  const toggleEditor = () => {
    setEditorOpen((prev) => !prev)
  }

  useEffect(() => {
    const handler = () => {
      setAntivibeOpen((prev) => {
        if (!prev) {
          setHermesOpen(false)
          setSkillsLibraryOpen(false)
        }
        return !prev
      })
    }
    window.addEventListener('kodo:toggle-antivibe', handler)
    return () => window.removeEventListener('kodo:toggle-antivibe', handler)
  }, [])

  useEffect(() => {
    const handler = () => {
      setHermesOpen((prev) => {
        if (!prev) {
          setAntivibeOpen(false)
          setSkillsLibraryOpen(false)
        }
        return !prev
      })
    }
    window.addEventListener('kodo:toggle-hermes', handler)
    return () => window.removeEventListener('kodo:toggle-hermes', handler)
  }, [])

  useEffect(() => {
    const handler = () => {
      setSkillsLibraryOpen((prev) => {
        if (!prev) {
          setAntivibeOpen(false)
          setHermesOpen(false)
        }
        return !prev
      })
    }
    window.addEventListener('kodo:toggle-skills-library', handler)
    return () => window.removeEventListener('kodo:toggle-skills-library', handler)
  }, [])

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

  const startResizeArtifact = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const root = rootRef.current
    if (!root) return

    const onMove = (moveEvent: MouseEvent) => {
      const rect = root.getBoundingClientRect()
      const rightPanePx = rect.right - moveEvent.clientX
      const next = (rightPanePx / rect.width) * 100
      const clamped = Math.max(28, Math.min(65, next))
      setArtifactWidthPercent(clamped)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeAntivibe = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const root = rootRef.current
    if (!root) return

    const onMove = (moveEvent: MouseEvent) => {
      const rect = root.getBoundingClientRect()
      const rightPanePx = rect.right - moveEvent.clientX
      const next = (rightPanePx / rect.width) * 100
      const clamped = Math.max(28, Math.min(65, next))
      setAntivibeWidthPercent(clamped)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeHermes = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const root = rootRef.current
    if (!root) return

    const onMove = (moveEvent: MouseEvent) => {
      const rect = root.getBoundingClientRect()
      const rightPanePx = rect.right - moveEvent.clientX
      const next = (rightPanePx / rect.width) * 100
      const clamped = Math.max(28, Math.min(65, next))
      setHermesWidthPercent(clamped)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeSkillsLibrary = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const root = rootRef.current
    if (!root) return

    const onMove = (moveEvent: MouseEvent) => {
      const rect = root.getBoundingClientRect()
      const rightPanePx = rect.right - moveEvent.clientX
      const next = (rightPanePx / rect.width) * 100
      const clamped = Math.max(32, Math.min(68, next))
      setSkillsLibraryWidthPercent(clamped)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const rightPanelWidth = artifactOpen
    ? artifactWidthPercent
    : (showEditor
      ? editorWidthPercent
      : (antivibeOpen
        ? antivibeWidthPercent
        : (hermesOpen
          ? hermesWidthPercent
          : (skillsLibraryOpen ? skillsLibraryWidthPercent : 0))))

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-0)',
      position: 'relative',
    }} ref={rootRef}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        antivibeOpen={antivibeOpen}
        hermesOpen={hermesOpen}
        skillsLibraryOpen={skillsLibraryOpen}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', height: '100%' }}>
        <div style={{
          width: (artifactOpen || showEditor || antivibeOpen || hermesOpen || skillsLibraryOpen) ? `${100 - rightPanelWidth}%` : '100%',
          minWidth: 0,
          transition: 'width 0.2s ease',
        }}>
          <ChatWindow editorOpen={showEditor} onToggleEditor={toggleEditor} />
        </div>

        {artifactOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={startResizeArtifact}
              style={{
                width: 6,
                cursor: 'col-resize',
                background: 'var(--bg-2)',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                flexShrink: 0,
              }}
            />
            <div style={{ width: `${artifactWidthPercent}%`, flexShrink: 0, height: '100%' }}>
              {selectedArtifactV2 ? (
                <ArtifactSidePanelV2
                  artifactId={selectedArtifactV2.id}
                  onClose={() => setSelectedArtifactV2(null)}
                />
              ) : selectedArtifact ? (
                <ArtifactSidePanel
                  artifacts={[selectedArtifact]}
                  onClose={() => setSelectedArtifact(null)}
                />
              ) : null}
            </div>
          </>
        )}

        {showEditor && (
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
                flexShrink: 0,
              }}
            />
            <EditorPanel widthPercent={editorWidthPercent} />
          </>
        )}

        {antivibeOpen && !artifactOpen && !showEditor && !hermesOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={startResizeAntivibe}
              style={{
                width: 6,
                cursor: 'col-resize',
                background: 'var(--bg-2)',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                flexShrink: 0,
              }}
            />
            <div style={{ width: `${antivibeWidthPercent}%`, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <AntiVibePanel onClose={() => setAntivibeOpen(false)} />
            </div>
          </>
        )}

        {hermesOpen && !artifactOpen && !showEditor && !antivibeOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={startResizeHermes}
              style={{
                width: 6,
                cursor: 'col-resize',
                background: 'var(--bg-2)',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                flexShrink: 0,
              }}
            />
            <div style={{ width: `${hermesWidthPercent}%`, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <HermesPanel onClose={() => setHermesOpen(false)} />
            </div>
          </>
        )}

        {skillsLibraryOpen && !artifactOpen && !showEditor && !antivibeOpen && !hermesOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={startResizeSkillsLibrary}
              style={{
                width: 6,
                cursor: 'col-resize',
                background: 'var(--bg-2)',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                flexShrink: 0,
              }}
            />
            <div style={{ width: `${skillsLibraryWidthPercent}%`, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <SkillsBrowserPanel onClose={() => setSkillsLibraryOpen(false)} />
            </div>
          </>
        )}

      </div>

      <NotificationCenter />

      {designStudioOpen && (
        <DesignStudio onClose={() => setDesignStudioOpen(false)} />
      )}
      {openClawOpen && (
        <OpenClawPanel onClose={() => setOpenClawOpen(false)} />
      )}
    </div>
  )
}
