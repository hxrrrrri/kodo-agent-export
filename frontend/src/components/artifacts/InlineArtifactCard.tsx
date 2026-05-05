/**
 * InlineArtifactCard — Claude-style inline artifact.
 *
 * No outer box, no type badges, no control clutter.
 * Artifact content bleeds into the chat flow.
 * The only external chrome: a subtle title row + "..." overflow menu.
 * Animation controls (pause/speed) live in a hover-revealed toolbar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Code2,
  Maximize2,
  MoreHorizontal,
  Palette,
  Pause,
  Play,
  RefreshCw,
  X,
  Zap,
} from 'lucide-react'
import { ArtifactV2, useChatStore } from '../../store/chatStore'
import { ArtifactRuntime, canLivePreview } from './ArtifactRuntime'
import { CodeRuntime } from './CodeRuntime'

type Props = {
  artifact: ArtifactV2
}

const ANIMATABLE = new Set(['html', 'html-multi', 'react', 'react-multi', 'svg'])

const SPEEDS = [
  { label: '0.5×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '4×', value: 4 },
]

const RESPONSIVE_INJECT = `<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
<style>
*,*::before,*::after{box-sizing:border-box}
html{overflow-x:hidden;width:100%;scroll-behavior:smooth}
body{width:100%;max-width:100%;overflow-x:hidden;min-height:100%}
img,video,canvas,svg,iframe,table{max-width:100%;height:auto}
</style>`

/** Inject pause/speed postMessage bridge + responsive CSS into HTML artifact entry file */
function injectBridge(artifact: ArtifactV2): ArtifactV2 {
  if (!ANIMATABLE.has(artifact.type)) return artifact
  if (artifact.type !== 'html' && artifact.type !== 'html-multi') return artifact

  const bridge = `\n<script>(function(){
    function applySpeed(r){
      try{
        (document.getAnimations?.() || []).forEach(function(a){try{a.playbackRate=r}catch(e){}});
        document.querySelectorAll('*').forEach(function(el){
          if(!el.style||!el.style.animationDuration)return;
          if(!el.dataset.kodoOrig)el.dataset.kodoOrig=el.style.animationDuration;
          el.style.animationDuration=(parseFloat(el.dataset.kodoOrig)/r)+'s';
        });
      }catch(e){}
    }
    function setPaused(p){
      try{
        (document.getAnimations?.() || []).forEach(function(a){try{p?a.pause():a.play()}catch(e){}});
        document.querySelectorAll('*').forEach(function(el){
          if(el.style)el.style.animationPlayState=p?'paused':'running';
        });
      }catch(e){}
    }
    window.addEventListener('message',function(ev){
      var d=ev.data||{};
      if(d.__kodo==='speed')applySpeed(+d.v||1);
      if(d.__kodo==='pause')setPaused(!!d.v);
    });
  })();<\/script>`

  const files = artifact.files.map((f, i) => {
    if (i !== 0 && f.path !== (artifact.entrypoint || 'index.html')) return f

    let content = f.content

    // Inject responsive meta + CSS into <head> if present, otherwise prepend
    if (/<head[^>]*>/i.test(content)) {
      content = content.replace(/<head[^>]*>/i, (m) => m + '\n' + RESPONSIVE_INJECT)
    } else if (!/<meta\s[^>]*name=["']viewport["']/i.test(content)) {
      content = RESPONSIVE_INJECT + '\n' + content
    }

    // Inject animation bridge before </body>
    content = /<\/body>/i.test(content)
      ? content.replace(/<\/body>/i, bridge + '</body>')
      : content + bridge

    return { ...f, content }
  })
  return { ...artifact, files }
}

/** Read the active Kodo theme CSS variables from the document root */
function readThemeColors() {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim() || undefined
  return {
    bg0: v('--bg-0') ?? '#0a0a0b',
    bg1: v('--bg-1') ?? '#111114',
    bg2: v('--bg-2') ?? '#1a1a1f',
    bg3: v('--bg-3') ?? '#222228',
    text0: v('--text-0') ?? '#f0f0f5',
    text1: v('--text-1') ?? '#a8a8b8',
    text2: v('--text-2') ?? '#606070',
    border: v('--border') ?? '#2a2a32',
    // borderBright: lighter visible border for artifact component outlines.
    // Uses --border-bright if available, otherwise a soft transparent white
    // that looks good on any dark background.
    borderBright: v('--border-bright') ?? 'rgba(255,255,255,0.14)',
    accent: v('--accent') ?? '#ff4d21',
  }
}

export function InlineArtifactCard({ artifact }: Props) {
  const [view, setView] = useState<'preview' | 'code'>('preview')
  const [reloadKey, setReloadKey] = useState(0)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [adapted, setAdapted] = useState(false)
  const iframeContainerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const setSelectedArtifactV2 = useChatStore((s) => s.setSelectedArtifactV2)

  const livePreview = canLivePreview(artifact.type)
  const animatable = ANIMATABLE.has(artifact.type)
  const bridged = useMemo(() => injectBridge(artifact), [artifact])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const postToIframe = useCallback((msg: object) => {
    const iframe = iframeContainerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
    iframe?.contentWindow?.postMessage(msg, '*')
  }, [])

  const handlePauseToggle = useCallback(() => {
    const next = !paused
    setPaused(next)
    postToIframe({ __kodo: 'pause', v: next })
  }, [paused, postToIframe])

  const handleSpeed = useCallback((v: number) => {
    setSpeed(v)
    postToIframe({ __kodo: 'speed', v })
    setMenuOpen(false)
  }, [postToIframe])




  const handleExpand = useCallback(() => {
    setSelectedArtifactV2({ id: artifact.id, version: artifact.version })
    setMenuOpen(false)
  }, [artifact.id, artifact.version, setSelectedArtifactV2])

  const handleAdaptToUI = useCallback(() => {
    const colors = readThemeColors()
    const iframe = iframeContainerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
    iframe?.contentWindow?.postMessage({ __kodo: 'adapt-ui', colors }, '*')
    setAdapted(true)
    setMenuOpen(false)
  }, [])

  // Re-apply adaptation after reload
  const handleReloadAdapted = useCallback(() => {
    setReloadKey((k) => k + 1)
    setPaused(false)
    setMenuOpen(false)
    if (adapted) {
      // Wait for iframe to load then re-send
      setTimeout(() => {
        const colors = readThemeColors()
        const iframe = iframeContainerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
        iframe?.contentWindow?.postMessage({ __kodo: 'adapt-ui', colors }, '*')
      }, 600)
    }
  }, [adapted])

  // Adaptive height: taller for complex types, compact for code/markdown
  const previewHeight = (() => {
    if (['code', 'markdown', 'dot'].includes(artifact.type)) return 'auto'
    if (['mermaid', 'svg'].includes(artifact.type)) return 280
    // HTML/React websites: use viewport-relative so they always show fully
    return 'clamp(520px, 60vh, 720px)'
  })()

  return (
    <div
      style={{ marginTop: 12, marginBottom: 6 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Title row — minimal, Claude-style ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        paddingLeft: 2,
        paddingRight: 2,
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-0)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {artifact.title}
        </span>

        {/* Tabs — only visible on hover or always for code */}
        {livePreview && (hovered || view === 'code') && (
          <div style={{
            display: 'inline-flex',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            opacity: hovered ? 1 : 0.6,
            transition: 'opacity 0.15s',
          }}>
            {(['preview', 'code'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  background: view === v ? 'var(--bg-3)' : 'transparent',
                  color: view === v ? 'var(--text-0)' : 'var(--text-2)',
                  border: 'none',
                  borderLeft: v === 'code' ? '1px solid var(--border)' : 'none',
                  padding: '3px 9px',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  fontWeight: view === v ? 600 : 400,
                }}
              >
                {v === 'preview' ? null : <Code2 size={9} />}
                {v === 'preview' ? 'Preview' : 'Code'}
              </button>
            ))}
          </div>
        )}

        {/* Animation controls — only on hover when preview is live */}
        {/* Adapt to UI — always visible on hover for all live-preview types */}
        {livePreview && view === 'preview' && hovered && (
          <button
            type="button"
            onClick={handleAdaptToUI}
            title="Adapt artifact colors to match the current UI theme"
            style={{
              background: adapted ? 'var(--accent-dim)' : 'var(--bg-2)',
              border: `1px solid ${adapted ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 7,
              padding: '3px 8px',
              cursor: 'pointer',
              color: adapted ? 'var(--accent)' : 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              transition: 'all 0.15s',
            }}
          >
            <Palette size={10} />
            {adapted ? 'ADAPTED' : 'ADAPT UI'}
          </button>
        )}

        {animatable && view === 'preview' && hovered && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handlePauseToggle}
              title={paused ? 'Resume' : 'Pause'}
              style={{
                background: 'var(--bg-2)', border: '1px solid var(--border)',
                borderRadius: 7, padding: '3px 8px', cursor: 'pointer',
                color: paused ? 'var(--green)' : 'var(--text-2)',
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontFamily: 'var(--font-mono)',
              }}
            >
              {paused ? <Play size={10} /> : <Pause size={10} />}
              {paused ? 'Run' : 'Pause'}
            </button>

            {/* Speed selector */}
            <div style={{ display: 'inline-flex', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              <span style={{ padding: '3px 6px', display: 'flex', alignItems: 'center', background: 'var(--bg-3)', borderRight: '1px solid var(--border)' }}>
                <Zap size={9} color="var(--text-2)" />
              </span>
              {SPEEDS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => handleSpeed(s.value)}
                  style={{
                    background: speed === s.value ? 'var(--accent-dim)' : 'transparent',
                    color: speed === s.value ? 'var(--accent)' : 'var(--text-2)',
                    border: 'none',
                    borderLeft: '1px solid var(--border)',
                    padding: '3px 6px',
                    cursor: 'pointer',
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ··· overflow menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              background: menuOpen ? 'var(--bg-3)' : 'transparent',
              border: '1px solid ' + (menuOpen ? 'var(--border)' : 'transparent'),
              borderRadius: 7,
              padding: '3px 5px',
              cursor: 'pointer',
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              opacity: hovered || menuOpen ? 1 : 0.3,
              transition: 'opacity 0.15s',
            }}
          >
            <MoreHorizontal size={14} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute',
              top: '110%',
              right: 0,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              minWidth: 160,
              zIndex: 999,
              overflow: 'hidden',
            }}>
              <button
                type="button"
                onClick={handleExpand}
                style={menuItemStyle}
              >
                <Maximize2 size={12} /> Open in panel
              </button>
              {livePreview && (
                <button
                  type="button"
                  onClick={handleAdaptToUI}
                  style={{ ...menuItemStyle, color: adapted ? 'var(--accent)' : 'var(--text-0)' }}
                >
                  <Palette size={12} /> {adapted ? 'Re-adapt to UI' : 'Adapt to UI'}
                </button>
              )}
              {livePreview && (
                <button
                  type="button"
                  onClick={() => { setView(view === 'code' ? 'preview' : 'code'); setMenuOpen(false) }}
                  style={menuItemStyle}
                >
                  <Code2 size={12} /> {view === 'code' ? 'Show preview' : 'View code'}
                </button>
              )}
              {animatable && view === 'preview' && (
                <button
                  type="button"
                  onClick={handleReloadAdapted}
                  style={menuItemStyle}
                >
                  <RefreshCw size={12} /> Restart animation
                </button>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                style={{ ...menuItemStyle, color: 'var(--text-2)' }}
              >
                <X size={12} /> Close menu
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── blends into chat, no white, no scrollbars ── */}
      <div
        ref={iframeContainerRef}
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          border: 'none',
          background: 'transparent',
          height: view === 'preview' && livePreview ? previewHeight : 'auto',
          maxHeight: view === 'preview' ? 'none' : 400,
          resize: view === 'preview' && livePreview ? 'vertical' : 'none',
        }}
      >
        {view === 'preview' && livePreview ? (
          <div key={reloadKey} style={{ width: '100%', height: '100%', background: 'transparent' }}>
            <ArtifactRuntime artifact={bridged} />
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto', background: 'var(--bg-0)', borderRadius: 12 }}>
            <CodeRuntime artifact={artifact} />
          </div>
        )}
      </div>
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-0)',
  fontSize: 12,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  transition: 'background 0.1s',
}
