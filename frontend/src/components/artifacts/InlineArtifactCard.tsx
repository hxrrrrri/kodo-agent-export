/**
 * InlineArtifactCard — renders an artifact directly in a chat message bubble
 * (Claude-AI style), with playback controls for animated artifacts:
 *   - Run / Reload — reload iframe to restart animation
 *   - Pause — postMessage to iframe to pause CSS/JS animations
 *   - Speed — change animation playback rate multiplier
 *   - Code / Preview toggle
 *   - Expand to side panel
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Code2, Eye, Maximize2, Pause, Play, RefreshCw, Zap } from 'lucide-react'
import { ArtifactV2, useChatStore } from '../../store/chatStore'
import { ArtifactRuntime, canLivePreview } from './ArtifactRuntime'
import { CodeRuntime } from './CodeRuntime'

type Props = {
  artifact: ArtifactV2
}

const ANIMATABLE_TYPES = new Set(['html', 'html-multi', 'react', 'react-multi', 'svg'])

const SPEED_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '0.5×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '4×', value: 4 },
]

export function InlineArtifactCard({ artifact }: Props) {
  const [view, setView] = useState<'preview' | 'code'>('preview')
  const [reloadKey, setReloadKey] = useState(0)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const setSelectedArtifactV2 = useChatStore((s) => s.setSelectedArtifactV2)
  const containerRef = useRef<HTMLDivElement>(null)

  const livePreview = canLivePreview(artifact.type)
  const animatable = ANIMATABLE_TYPES.has(artifact.type)

  // Inject playback controls into HTML artifacts via a postMessage bridge
  const decoratedArtifact = useMemo<ArtifactV2>(() => {
    if (!animatable || artifact.type !== 'html' && artifact.type !== 'html-multi') {
      return artifact
    }
    // Inject control script into the entrypoint file content
    const files = artifact.files.map((f, idx) => {
      const isEntry = idx === 0 || f.path === (artifact.entrypoint || 'index.html')
      if (!isEntry) return f
      const bridgeScript = `\n<script>(function(){
        function applySpeed(rate){
          try {
            document.getAnimations && document.getAnimations().forEach(function(a){ try{a.playbackRate=rate;}catch(e){} });
            document.querySelectorAll('*').forEach(function(el){
              if (!el.style) return;
              if (el.style.animationDuration) {
                if (!el.dataset.kodoOrigDur) el.dataset.kodoOrigDur = el.style.animationDuration;
                el.style.animationDuration = (parseFloat(el.dataset.kodoOrigDur) / rate) + 's';
              }
            });
          } catch(e) {}
        }
        function setPaused(paused){
          try {
            document.getAnimations && document.getAnimations().forEach(function(a){ try{ paused ? a.pause() : a.play(); }catch(e){} });
            document.body && (document.body.style.animationPlayState = paused ? 'paused' : 'running');
            document.querySelectorAll('*').forEach(function(el){
              if (el.style) el.style.animationPlayState = paused ? 'paused' : 'running';
            });
          } catch(e) {}
        }
        window.addEventListener('message', function(ev){
          var d = ev.data || {};
          if (d.__kodo_anim === 'speed') applySpeed(parseFloat(d.value)||1);
          if (d.__kodo_anim === 'pause') setPaused(!!d.value);
        });
      })();<\/script>`
      const content = /<\/body>/i.test(f.content)
        ? f.content.replace(/<\/body>/i, bridgeScript + '</body>')
        : f.content + bridgeScript
      return { ...f, content }
    })
    return { ...artifact, files }
  }, [artifact, animatable])

  const handleReload = useCallback(() => {
    setReloadKey((k) => k + 1)
    setPaused(false)
  }, [])

  const handlePauseToggle = useCallback(() => {
    const next = !paused
    setPaused(next)
    const iframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
    iframe?.contentWindow?.postMessage({ __kodo_anim: 'pause', value: next }, '*')
  }, [paused])

  const handleSpeedChange = useCallback((rate: number) => {
    setSpeed(rate)
    const iframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
    iframe?.contentWindow?.postMessage({ __kodo_anim: 'speed', value: rate }, '*')
  }, [])

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      background: 'var(--bg-1)',
      transition: 'border-color 0.18s ease',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        padding: '8px 12px 6px 12px',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {artifact.type.toUpperCase()}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {artifact.title}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
          v{artifact.version}
        </span>

        {livePreview && (
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <button type="button" onClick={() => setView('preview')}
              title="Show preview"
              style={{
                background: view === 'preview' ? 'var(--accent-dim)' : 'transparent',
                color: view === 'preview' ? 'var(--accent)' : 'var(--text-2)',
                border: 'none', padding: '3px 8px', cursor: 'pointer',
                fontSize: 10, fontFamily: 'var(--font-mono)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              <Eye size={10} /> PREVIEW
            </button>
            <button type="button" onClick={() => setView('code')}
              title="Show code"
              style={{
                background: view === 'code' ? 'var(--accent-dim)' : 'transparent',
                color: view === 'code' ? 'var(--accent)' : 'var(--text-2)',
                border: 'none', borderLeft: '1px solid var(--border)', padding: '3px 8px', cursor: 'pointer',
                fontSize: 10, fontFamily: 'var(--font-mono)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              <Code2 size={10} /> CODE
            </button>
          </div>
        )}

        {/* Animation controls — only for animatable types in preview view */}
        {animatable && view === 'preview' && (
          <>
            <button type="button" onClick={handlePauseToggle}
              title={paused ? 'Resume animation' : 'Pause animation'}
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 6, padding: '3px 7px', cursor: 'pointer',
                color: paused ? 'var(--green)' : 'var(--text-2)',
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontFamily: 'var(--font-mono)',
              }}>
              {paused ? <Play size={10} /> : <Pause size={10} />}
              {paused ? 'RUN' : 'PAUSE'}
            </button>

            <button type="button" onClick={handleReload}
              title="Reload / Restart animation"
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 6, padding: '3px 7px', cursor: 'pointer',
                color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontFamily: 'var(--font-mono)',
              }}>
              <RefreshCw size={10} /> RELOAD
            </button>

            <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <span style={{ fontSize: 9, color: 'var(--text-2)', padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 3, background: 'var(--bg-3)' }}>
                <Zap size={9} />SPEED
              </span>
              {SPEED_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => handleSpeedChange(opt.value)}
                  style={{
                    background: speed === opt.value ? 'var(--accent-dim)' : 'transparent',
                    color: speed === opt.value ? 'var(--accent)' : 'var(--text-2)',
                    border: 'none', borderLeft: '1px solid var(--border)',
                    padding: '3px 6px', cursor: 'pointer',
                    fontSize: 10, fontFamily: 'var(--font-mono)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        <button type="button"
          onClick={() => setSelectedArtifactV2({ id: artifact.id, version: artifact.version })}
          title="Expand to side panel"
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 7px', cursor: 'pointer',
            color: 'var(--text-2)', display: 'flex', alignItems: 'center',
          }}>
          <Maximize2 size={10} />
        </button>
      </div>

      {/* Body */}
      <div ref={containerRef} style={{
        height: livePreview && view === 'preview' ? 360 : 'auto',
        maxHeight: 480,
        overflow: 'auto',
        background: livePreview && view === 'preview' ? '#fff' : 'transparent',
      }}>
        {view === 'preview' && livePreview ? (
          <div key={reloadKey} style={{ width: '100%', height: '100%' }}>
            <ArtifactRuntime artifact={decoratedArtifact} />
          </div>
        ) : (
          <CodeRuntime artifact={artifact} />
        )}
      </div>
    </div>
  )
}
