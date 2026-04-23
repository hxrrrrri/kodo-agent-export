import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArtifactV2 } from '../../store/chatStore'
import { SandboxIframe } from './SandboxIframe'

type Props = {
  artifact: ArtifactV2
  allowForms?: boolean
  allowPopups?: boolean
}

/**
 * Renders single-file `html` or multi-file `html-multi` artifacts.
 *
 * Multi-file bundles are stitched inside the iframe via blob: URLs so that
 * `<link rel=stylesheet href=styles.css>` and `<script src=app.js>` references
 * resolve against sibling files without requiring same-origin.
 */
export function HtmlRuntime({ artifact, allowForms, allowPopups }: Props) {
  const [errors, setErrors] = useState<string[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const srcDoc = useMemo(() => buildSrcDoc(artifact, reloadKey), [artifact, reloadKey])

  useEffect(() => {
    setErrors([])
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const data = e.data as Record<string, unknown> | null
      if (!data) return
      if (data.__kodo === 'artifact-error') {
        setErrors((prev) => [...prev.slice(-9), String(data.message || 'Unknown error')])
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [artifact.id, artifact.version, reloadKey])

  const handleReload = useCallback(() => {
    setErrors([])
    setReloadKey((k) => k + 1)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <SandboxIframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title={`Artifact ${artifact.id} v${artifact.version}`}
        allowForms={allowForms}
        allowPopups={allowPopups}
      />
      {errors.length > 0 && (
        <div style={{
          background: 'var(--bg-2, #1a1a1f)',
          color: 'var(--red, #e06c75)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11,
          padding: '6px 10px',
          maxHeight: 140,
          overflow: 'auto',
          borderTop: '1px solid var(--border, #333)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ opacity: 0.6 }}>ARTIFACT ERRORS</span>
            <button
              type="button"
              onClick={handleReload}
              style={{
                background: 'none',
                border: '1px solid var(--border, #444)',
                color: 'var(--text-2, #aaa)',
                cursor: 'pointer',
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              Reload
            </button>
          </div>
          {errors.map((err, i) => (
            <div key={i} style={{ marginBottom: 2 }}>{err}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ERROR_BRIDGE = `
<script>
window.addEventListener('error', function(e) {
  try { parent.postMessage({ __kodo: 'artifact-error', message: String(e.message || e.error || 'error') }, '*'); } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  try { parent.postMessage({ __kodo: 'artifact-error', message: 'Unhandled: ' + String(e.reason || '') }, '*'); } catch (_) {}
});
</script>`

function injectErrorBridge(html: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + ERROR_BRIDGE)
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, ERROR_BRIDGE + '</body>')
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, ERROR_BRIDGE + '</html>')
  return html + ERROR_BRIDGE
}

function buildSrcDoc(artifact: ArtifactV2, reloadKey = 0): string {
  if (artifact.files.length <= 1) {
    const file = artifact.files[0]
    const body = file?.content || ''
    let result: string
    if (/<!DOCTYPE|<html[\s>]/i.test(body)) {
      result = injectErrorBridge(body)
    } else {
      result = `<!DOCTYPE html><html><head><meta charset="utf-8">${ERROR_BRIDGE}</head><body>${body}</body></html>`
    }
    // Append reload marker so iframe key changes force a real reload.
    if (reloadKey > 0) result += `<!-- kodo-reload:${reloadKey} -->`
    return result
  }

  // Multi-file bundle: inline the entrypoint and replace sibling references
  // with blob: URLs so the browser can fetch them despite the null origin.
  const entrypointPath = artifact.entrypoint || 'index.html'
  const entrypoint = artifact.files.find((f) => f.path === entrypointPath) || artifact.files[0]
  const siblings = artifact.files.filter((f) => f.path !== entrypoint.path)

  const blobMapDecls = siblings.map((f) => {
    const mime = mimeForPath(f.path)
    return `["${escapeJs(f.path)}", new Blob([${JSON.stringify(f.content)}], { type: "${mime}" })]`
  }).join(',\n')

  const rewriteScript = `
<script>
(function() {
  var files = new Map([${blobMapDecls}]);
  var urls = new Map();
  files.forEach(function(blob, path) { urls.set(path, URL.createObjectURL(blob)); });

  function resolve(href) {
    if (!href) return href;
    if (/^(https?:|data:|blob:|mailto:|javascript:|#)/i.test(href)) return href;
    var clean = href.replace(/^\\.?\\//, '');
    return urls.get(clean) || href;
  }

  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('link[href], script[src], img[src], source[src], a[href], iframe[src]').forEach(function(el) {
      var attr = el.hasAttribute('href') ? 'href' : 'src';
      el.setAttribute(attr, resolve(el.getAttribute(attr)));
    });
  });
})();
</script>`

  const body = entrypoint.content
  let result: string
  if (/<head[^>]*>/i.test(body)) {
    result = body.replace(/<head[^>]*>/i, (m) => m + ERROR_BRIDGE + rewriteScript)
  } else {
    result = `<!DOCTYPE html><html><head><meta charset="utf-8">${ERROR_BRIDGE}${rewriteScript}</head><body>${body}</body></html>`
  }
  if (reloadKey > 0) result += `<!-- kodo-reload:${reloadKey} -->`
  return result
}

function mimeForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html'
  if (lower.endsWith('.css')) return 'text/css'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'text/plain'
}

function escapeJs(text: string): string {
  return text.replace(/["\\]/g, (m) => '\\' + m)
}

// escapeHtml is exported so tests can introspect the sanitiser if needed.
export { escapeHtml }
