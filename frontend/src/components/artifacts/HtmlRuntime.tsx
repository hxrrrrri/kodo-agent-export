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

// Adapter script — plain JS raw string. Injected into every artifact srcdoc.
// No TypeScript types, no string arrays, no function.toString() extraction.
// The ONLY escape needed: avoid the literal sequence </script> (use <\/script>).
const ADAPTER_SCRIPT = /* js */`(function(){
  // ── colour helpers ───────────────────────────────────────────────────────
  function h2r(h){
    h=h.replace('#','');
    if(h.length===3)h=h.split('').map(function(c){return c+c}).join('');
    if(h.length===6)return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),1];
    if(h.length===8)return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),Math.round(parseInt(h.slice(6,8),16)/255*100)/100];
    return null;
  }
  function pc(s){
    s=(s||'').trim();
    if(!s||s==='transparent'||s==='none'||s.indexOf('var(')===0)return null;
    if(s[0]==='#')return h2r(s);
    var m=s.match(/rgba?\\s*\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?/i);
    if(m)return[+m[1],+m[2],+m[3],m[4]!==undefined?+m[4]:1];
    return null;
  }
  function lm(r,g,b){return 0.299*r+0.587*g+0.114*b;}
  // chroma = colour intensity. High chroma = vivid accent/animation colour — leave alone.
  // Low chroma = near-grey background colour — safe to remap.
  function chroma(r,g,b){return Math.max(r,g,b)-Math.min(r,g,b);}
  // Blue-dark background: dark AND blue-dominant AND low saturation (not an accent blue)
  function isBD(r,g,b){return lm(r,g,b)<115&&(b-(r+g)/2)>8&&chroma(r,g,b)<90;}
  // Light background: very bright AND near-grey (not a tinted accent/animation colour)
  function isLt(r,g,b,a){return(a===undefined||a>0.05)&&lm(r,g,b)>155&&chroma(r,g,b)<40;}
  function mBg(l,a,C){
    var base=l<20?C.bg0:l<42?C.bg1:l<70?C.bg2:C.bg3;
    if(a!==undefined&&a<0.98){var bc=h2r(base)||[17,17,20];return'rgba('+bc[0]+','+bc[1]+','+bc[2]+','+a.toFixed(2)+')';}
    return base;
  }
  function ac(raw,C){
    var c=pc(raw);if(!c)return raw;
    var r=c[0],g=c[1],b=c[2],a=c[3];
    if(isBD(r,g,b))return mBg(lm(r,g,b),a,C);
    if(isLt(r,g,b,a))return mBg(35,a,C);
    return raw;
  }
  var HX=/#[0-9a-fA-F]{3,8}\\b/g;
  var RG=/rgba?\\s*\\([^)]+\\)/gi;
  function pCSS(css,C){
    HX.lastIndex=0;RG.lastIndex=0;
    return css.replace(HX,function(m){return ac(m,C);}).replace(RG,function(m){return ac(m,C);});
  }
  var BP_BG=['backgroundColor','background'];
  var BP_BORDER=['borderColor','borderTopColor','borderBottomColor','borderLeftColor','borderRightColor','outlineColor'];
  function aEl(el,C){
    if(!el||!el.style)return;
    var BB=C.borderBright||'rgba(255,255,255,0.14)';
    // html/body = always transparent so chat bg shows through
    var isRoot=el.tagName==='BODY'||el.tagName==='HTML';
    try{
      // Remap background colors
      BP_BG.forEach(function(p){
        try{
          if(el.style[p]){
            if(isRoot){
              // Root elements → transparent (chat bg visible)
              el.style.setProperty(p.replace(/([A-Z])/g,'-$1').toLowerCase(),'transparent','important');
            } else {
              var n=pCSS(el.style[p],C);
              if(n!==el.style[p])el.style.setProperty(p.replace(/([A-Z])/g,'-$1').toLowerCase(),n,'important');
            }
          }
        }catch(e){}
      });
      // Remap border colors to borderBright (visible on dark bg)
      BP_BORDER.forEach(function(p){
        try{
          if(el.style[p]){
            var orig=el.style[p];var parsed=pc(orig);
            // Replace if it was a dark/navy colour or a very light colour
            if(parsed&&(isBD(parsed[0],parsed[1],parsed[2])||isLt(parsed[0],parsed[1],parsed[2],parsed[3]))){
              el.style.setProperty(p.replace(/([A-Z])/g,'-$1').toLowerCase(),BB,'important');
            }
          }
        }catch(e){}
      });
      try{
        if(el.style.color){var c=pc(el.style.color);if(c&&isBD(c[0],c[1],c[2]))el.style.setProperty('color',C.text1,'important');}
      }catch(e){}
    }catch(e){}
  }
  var _C=null,_obs=null,_busy=false;
  function fa(C){
    _C=C;
    // 1. rewrite style tags
    try{
      document.querySelectorAll('style:not(#__ka)').forEach(function(el){
        try{var o=el.textContent||'',p=pCSS(o,C);if(p!==o)el.textContent=p;}catch(e){}
      });
    }catch(e){}
    // 2. inject override stylesheet
    try{var old=document.getElementById('__ka');if(old)old.remove();}catch(e){}
    var st=document.createElement('style');
    st.id='__ka';
    // borderBright: lighter visible border for component outlines on dark bg
    var BB=C.borderBright||'rgba(255,255,255,0.14)';
    st.textContent=[
      // ── Main canvas: transparent so chat session bg shows through ──────────
      'html,body{background:transparent!important;color:'+C.text0+'!important}',
      // Root-level wrappers (min-h-screen, full-page divs) → also transparent
      'body>div,[class*="min-h-screen"],[class*="min-h-full"]{background:transparent!important}',
      // ── Component backgrounds ─────────────────────────────────────────────
      // Light → dark card
      '[class~="bg-white"],[class~="bg-gray-50"],[class~="bg-zinc-50"],[class~="bg-slate-50"]{background:'+C.bg1+'!important}',
      '[class~="bg-gray-100"],[class~="bg-zinc-100"]{background:'+C.bg1+'!important}',
      // Dark blue-grey → theme card
      '[class~="bg-gray-900"],[class~="bg-zinc-900"],[class~="bg-slate-900"]{background:'+C.bg1+'!important}',
      '[class~="bg-gray-800"],[class~="bg-zinc-800"],[class~="bg-slate-800"]{background:'+C.bg2+'!important}',
      '[class~="bg-gray-700"],[class~="bg-zinc-700"]{background:'+C.bg3+'!important}',
      // Saturated blue/indigo component bgs → theme card
      '[class*="bg-blue-9"],[class*="bg-indigo-9"],[class*="bg-slate-9"]{background:'+C.bg1+'!important}',
      // ── Text ─────────────────────────────────────────────────────────────
      '[class~="text-black"],[class~="text-gray-900"],[class~="text-zinc-900"]{color:'+C.text0+'!important}',
      '[class~="text-gray-600"],[class~="text-gray-700"],[class~="text-zinc-600"]{color:'+C.text1+'!important}',
      '[class~="text-gray-400"],[class~="text-gray-500"],[class~="text-zinc-500"]{color:'+C.text2+'!important}',
      // ── Borders ──────────────────────────────────────────────────────────
      '[class*="border-"]{border-color:'+BB+'!important}',
      '[class*="divide-"]{border-color:'+BB+'!important}',
      // Card/panel borders — div prefix avoids :not() chaining bug
      'div[class*="rounded-lg"]{border:1px solid '+BB+'!important}',
      'div[class*="rounded-xl"]{border:1px solid '+BB+'!important}',
      'div[class*="rounded-2xl"]{border:1px solid '+BB+'!important}',
      'div[class*="rounded-3xl"]{border:1px solid '+BB+'!important}',
      'section[class*="rounded"]{border:1px solid '+BB+'!important}',
      'article[class*="rounded"]{border:1px solid '+BB+'!important}',
      // ── CSS custom properties ─────────────────────────────────────────────
      ':root{--background:transparent;--foreground:'+C.text0+';--card:'+C.bg1+
        ';--card-foreground:'+C.text0+';--muted:'+C.bg2+';--muted-foreground:'+C.text2+
        ';--border:'+BB+';--ring:'+BB+';--input:'+C.bg2+';--primary:'+C.accent+'}'
    ].join('\\n');
    try{(document.head||document.documentElement).appendChild(st);}catch(e){}
    // 3. adapt inline styles
    _busy=true;
    try{document.querySelectorAll('[style]').forEach(function(el){aEl(el,C);});}catch(e){}
    // Force html/body to transparent — the chat bg shows through
    try{if(document.documentElement){
      document.documentElement.style.setProperty('background','transparent','important');
    }}catch(e){}
    try{if(document.body){
      document.body.style.setProperty('background','transparent','important');
      document.body.style.setProperty('color',C.text0,'important');
    }}catch(e){}
    _busy=false;
    // 4. MutationObserver for React re-renders
    if(_obs)_obs.disconnect();
    _obs=new MutationObserver(function(muts){
      if(_busy||!_C)return;
      _busy=true;
      try{
        muts.forEach(function(m){
          if(m.type==='attributes'&&m.attributeName==='style'&&m.target&&m.target.nodeType===1)aEl(m.target,_C);
          if(m.type==='childList')m.addedNodes.forEach(function(n){
            if(n.nodeType===1){aEl(n,_C);if(n.querySelectorAll)n.querySelectorAll('[style]').forEach(function(c){aEl(c,_C);});}
          });
        });
      }catch(e){}
      _busy=false;
    });
    try{_obs.observe(document.documentElement||document.body,{attributes:true,attributeFilter:['style'],childList:true,subtree:true});}catch(e){}
  }
  // animation + message listener
  window.addEventListener('message',function(ev){
    var d=ev.data||{};
    if(d.__kodo==='adapt-ui'&&d.colors)fa(d.colors);
    if(d.__kodo==='speed'){try{(document.getAnimations&&document.getAnimations()||[]).forEach(function(a){try{a.playbackRate=+d.v||1;}catch(e){}});}catch(e){}}
    if(d.__kodo==='pause'){try{(document.getAnimations&&document.getAnimations()||[]).forEach(function(a){try{d.v?a.pause():a.play();}catch(e){}});}catch(e){}}
  });
})();`
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

// CDN hosts proxied through backend to avoid null-origin DNS failures in sandboxed iframes
// Only static-asset CDNs (CSS, non-module JS).
// ES-module CDNs (esm.sh, skypack, unpkg) use relative sub-imports that break
// when proxied — their origin must stay intact for the import chain to resolve.
const CDN_PROXY_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'code.jquery.com',
  'cdn.plot.ly',
  'd3js.org',
]

const CDN_HOST_RE = new RegExp(
  `https?://(?:${CDN_PROXY_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})[^\\s"'<>]*`,
  'gi',
)

// Rewrites <script src="CDN_URL"> to try proxy first, fall back to direct CDN on error.
// For non-script tags (link href etc.), rewrites the URL directly to the proxy.
function proxyCdnUrls(html: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (!origin) return html

  // Rewrite <script src="CDN"> → proxy with onerror fallback to direct CDN
  html = html.replace(
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>/gi,
    (match, pre, src, post) => {
      if (!CDN_HOST_RE.test(src)) return match
      CDN_HOST_RE.lastIndex = 0
      const proxyUrl = `${origin}/api/cdn-proxy?url=${encodeURIComponent(src)}`
      // Use single quotes inside onerror — double quotes would break the attribute parsing
      const safeSrc = src.replace(/'/g, '%27')
      const fallback = `this.onerror=null;this.src='${safeSrc}'`
      return `<script${pre}src="${proxyUrl}" onerror="${fallback}"${post}>`
    }
  )

  // Rewrite <link href="CDN"> (stylesheet) → proxy (no onerror, less critical)
  html = html.replace(
    /<link\b([^>]*)\bhref=["']([^"']+)["']([^>]*)>/gi,
    (match, pre, href, post) => {
      if (!CDN_HOST_RE.test(href)) return match
      CDN_HOST_RE.lastIndex = 0
      const proxyUrl = `${origin}/api/cdn-proxy?url=${encodeURIComponent(href)}`
      return `<link${pre}href="${proxyUrl}"${post}>`
    }
  )

  return html
}

function buildSrcDoc(artifact: ArtifactV2, reloadKey = 0): string {
  if (artifact.files.length <= 1) {
    const file = artifact.files[0]
    const body = proxyCdnUrls(file?.content || '')
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

  let body = inlineAssets(proxyCdnUrls(entrypoint.content))
  let result: string
  if (/<head[^>]*>/i.test(body)) {
    result = body.replace(/<head[^>]*>/i, (m) => m + ERROR_BRIDGE)
  } else {
    result = `<!DOCTYPE html><html><head><meta charset="utf-8">${ERROR_BRIDGE}</head><body>${body}</body></html>`
  }
  if (reloadKey > 0) result += `<!-- kodo-reload:${reloadKey} -->`
  return result
}

