import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArtifactV2 } from '../../store/chatStore'
import { SandboxIframe } from './SandboxIframe'

type Props = {
  artifact: ArtifactV2
  allowForms?: boolean
  allowPopups?: boolean
}

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
            <button type="button" onClick={handleReload}
              style={{ background: 'none', border: '1px solid var(--border,#444)', color: 'var(--text-2,#aaa)', cursor: 'pointer', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>
              Reload
            </button>
          </div>
          {errors.map((err, i) => <div key={i} style={{ marginBottom: 2 }}>{err}</div>)}
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

// Adapter written as raw strings — zero escaping issues, works in any browser JS engine.
// Converts blue-dark colors to theme greys and uses MutationObserver to intercept
// React re-renders that reset inline styles after initial adaptation.
const ADAPTER_SCRIPT = [
  '(function(){',
  // ── hex → rgba parser
  'function h2r(h){h=h.replace("#","");',
  '  if(h.length===3)h=h.split("").map(function(c){return c+c}).join("");',
  '  if(h.length===6)return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),1];',
  '  if(h.length===8)return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),Math.round(parseInt(h.slice(6,8),16)/2.55)/100];',
  '  return null;}',
  // ── generic color string parser
  'function pc(s){s=(s||"").trim();',
  '  if(!s||s==="transparent"||s==="none"||s.indexOf("var(")===0)return null;',
  '  if(s[0]==="#")return h2r(s);',
  '  var m=s.match(/rgba?\\s*\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?/i);',
  '  if(m)return[+m[1],+m[2],+m[3],m[4]!==undefined?+m[4]:1];',
  '  return null;}',
  // ── color math
  'function lm(r,g,b){return 0.299*r+0.587*g+0.114*b}',
  // blue-tinted dark: lum < 115 AND blue dominates red+green by 8+
  'function isBD(r,g,b){return lm(r,g,b)<115&&(b-(r+g)/2)>8}',
  // light bg: lum > 155
  'function isLt(r,g,b,a){return(a===undefined||a>0.05)&&lm(r,g,b)>155}',
  // map lum + alpha → theme bg token
  'function mBg(l,a,C){',
  '  var base=l<20?C.bg0:l<42?C.bg1:l<70?C.bg2:C.bg3;',
  '  if(a!==undefined&&a<0.98){var bc=h2r(base)||[17,17,20];',
  '    return"rgba("+bc[0]+","+bc[1]+","+bc[2]+","+a.toFixed(2)+")";}',
  '  return base;}',
  // adapt a single color token
  'function ac(raw,C){var c=pc(raw);if(!c)return raw;',
  '  var r=c[0],g=c[1],b=c[2],a=c[3];',
  '  if(isBD(r,g,b))return mBg(lm(r,g,b),a,C);',
  '  if(isLt(r,g,b,a))return mBg(35,a,C);',
  '  return raw;}',
  // process a CSS text string — replaces all hex + rgb/rgba tokens
  'var HX=new RegExp("#[0-9a-fA-F]{3,8}\\\\b","g");',
  'var RG=new RegExp("rgba?\\\\s*\\\\([^)]+\\\\)","gi");',
  'function pCSS(css,C){',
  '  return css.replace(HX,function(m){return ac(m,C)}).replace(RG,function(m){return ac(m,C)});}',
  // adapt a single element's inline style
  'var BP=["backgroundColor","background","borderColor","borderTopColor","borderBottomColor","borderLeftColor","borderRightColor","outlineColor"];',
  'function aEl(el,C){if(!el||!el.style)return;',
  '  BP.forEach(function(p){if(el.style[p]){',
  '    var n=pCSS(el.style[p],C);',
  '    if(n!==el.style[p])el.style.setProperty(p.replace(/([A-Z])/g,"-$1").toLowerCase(),n,"important");}});',
  '  if(el.style.color){var c=pc(el.style.color);if(c&&isBD(c[0],c[1],c[2]))el.style.setProperty("color",C.text1,"important");}}',
  // state
  'var _C=null,_obs=null,_busy=false;',
  // full adaptation
  'function fa(C){_C=C;',
  // 1. rewrite <style> tag contents
  '  document.querySelectorAll("style:not(#__ka)").forEach(function(el){',
  '    var o=el.textContent||"",p=pCSS(o,C);if(p!==o)el.textContent=p;});',
  // 2. inject !important class overrides
  '  var old=document.getElementById("__ka");if(old)old.remove();',
  '  var st=document.createElement("style");st.id="__ka";',
  '  st.textContent=[',
  '    "html,body{background:"+C.bg0+"!important;color:"+C.text0+"!important}",',
  '    "body *{color-scheme:dark}",',
  '    "[class*=\'bg-blue\'],[class*=\'bg-indigo\'],[class*=\'bg-slate\'],[class*=\'bg-sky\'],[class*=\'bg-navy\']{background:"+C.bg1+"!important}",',
  '    "[class~=\'bg-white\'],[class~=\'bg-gray-50\'],[class~=\'bg-zinc-50\']{background:"+C.bg1+"!important}",',
  '    "[class~=\'bg-gray-100\'],[class~=\'bg-zinc-100\']{background:"+C.bg1+"!important}",',
  '    "[class~=\'bg-gray-900\'],[class~=\'bg-zinc-900\'],[class~=\'bg-slate-900\']{background:"+C.bg1+"!important}",',
  '    "[class~=\'bg-gray-800\'],[class~=\'bg-zinc-800\']{background:"+C.bg2+"!important}",',
  '    "[class~=\'text-black\'],[class~=\'text-gray-900\']{color:"+C.text0+"!important}",',
  '    "[class~=\'text-gray-600\'],[class~=\'text-gray-700\']{color:"+C.text1+"!important}",',
  '    "[class*=\'border-\']{border-color:"+C.border+"!important}",',
  '    ":root{--background:"+C.bg0+";--foreground:"+C.text0+";--card:"+C.bg1+";--card-foreground:"+C.text0+";--muted:"+C.bg2+";--muted-foreground:"+C.text2+";--border:"+C.border+";--primary:"+C.accent+"}"',
  '  ].join("\\n");',
  '  document.head.appendChild(st);',
  // 3. adapt all current inline styles
  '  _busy=true;',
  '  document.querySelectorAll("[style]").forEach(function(el){aEl(el,C);});',
  '  document.documentElement.style.setProperty("background",C.bg0,"important");',
  '  document.body.style.setProperty("background",C.bg0,"important");',
  '  document.body.style.setProperty("color",C.text0,"important");',
  '  _busy=false;',
  // 4. MutationObserver — catches React re-renders resetting inline styles
  '  if(_obs)_obs.disconnect();',
  '  _obs=new MutationObserver(function(muts){',
  '    if(_busy||!_C)return;_busy=true;',
  '    muts.forEach(function(m){',
  '      if(m.type==="attributes"&&m.attributeName==="style"&&m.target&&m.target.nodeType===1)aEl(m.target,_C);',
  '      if(m.type==="childList")m.addedNodes.forEach(function(n){',
  '        if(n.nodeType===1){aEl(n,_C);if(n.querySelectorAll)n.querySelectorAll("[style]").forEach(function(c){aEl(c,_C);});}});',
  '    });_busy=false;});',
  '  _obs.observe(document.documentElement,{attributes:true,attributeFilter:["style"],childList:true,subtree:true});}',
  // animation helpers + message listener
  'window.addEventListener("message",function(ev){',
  '  var d=ev.data||{};',
  '  if(d.__kodo==="adapt-ui"&&d.colors)fa(d.colors);',
  '  if(d.__kodo==="speed"){try{(document.getAnimations&&document.getAnimations()||[]).forEach(function(a){try{a.playbackRate=+d.v||1}catch(e){}});}catch(e){}}',
  '  if(d.__kodo==="pause"){try{(document.getAnimations&&document.getAnimations()||[]).forEach(function(a){try{d.v?a.pause():a.play()}catch(e){}});}catch(e){}}',
  '});',
  '})();',
].join('\n')

const ERROR_BRIDGE = `<script>
window.tailwind = { config: { darkMode: 'class' } };
document.documentElement.classList.add('dark');
window.addEventListener('error', function(e) {
  try { parent.postMessage({ __kodo: 'artifact-error', message: String(e.message || e.error || 'error') }, '*'); } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  try { parent.postMessage({ __kodo: 'artifact-error', message: 'Unhandled: ' + String(e.reason || '') }, '*'); } catch (_) {}
});
` + ADAPTER_SCRIPT + `
</script>
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent;color-scheme:dark;color:inherit;overflow-x:hidden}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#ffffff26;border-radius:2px}
</style>`

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
    if (reloadKey > 0) result += `<!-- kodo-reload:${reloadKey} -->`
    return result
  }

  const entrypointPath = artifact.entrypoint || 'index.html'
  const entrypoint = artifact.files.find((f) => f.path === entrypointPath) || artifact.files[0]
  const siblings = artifact.files.filter((f) => f.path !== entrypoint.path)

  const fileMap = new Map<string, { content: string; path: string }>()
  for (const f of siblings) {
    fileMap.set(f.path, f)
    fileMap.set(f.path.replace(/^\.\//, ''), f)
    const basename = f.path.split('/').pop() || f.path
    fileMap.set(basename, f)
  }

  function resolveFileRef(ref: string): string | null {
    if (!ref) return null
    if (/^(https?:|data:|blob:|mailto:|javascript:|#)/i.test(ref)) return null
    const clean = ref.replace(/^\.\//, '')
    const f = fileMap.get(ref) || fileMap.get(clean) || fileMap.get(ref.split('/').pop() || ref)
    return f ? f.content : null
  }

  function inlineAssets(html: string): string {
    html = html.replace(/<link\b([^>]*)\bhref=["']([^"']+)["']([^>]*)>/gi, (match, pre, href, post) => {
      const isStylesheet = /rel=["']stylesheet["']/i.test(pre + post) || /\.css$/i.test(href)
      if (!isStylesheet) return match
      const content = resolveFileRef(href)
      if (content === null) return match
      return `<style>/* inlined: ${escapeHtml(href)} */\n${content}</style>`
    })
    html = html.replace(/<script\b([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/gi, (match, pre, src, post) => {
      if (/^(https?:|\/\/)/i.test(src)) return match
      const content = resolveFileRef(src)
      if (content === null) return match
      return `<script${pre}${post}>${content}<\/script>`
    })
    return html
  }

  let body = inlineAssets(entrypoint.content)
  let result: string
  if (/<head[^>]*>/i.test(body)) {
    result = body.replace(/<head[^>]*>/i, (m) => m + ERROR_BRIDGE)
  } else {
    result = `<!DOCTYPE html><html><head><meta charset="utf-8">${ERROR_BRIDGE}</head><body>${body}</body></html>`
  }
  if (reloadKey > 0) result += `<!-- kodo-reload:${reloadKey} -->`
  return result
}

export { escapeHtml }
