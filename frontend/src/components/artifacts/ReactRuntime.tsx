import { useMemo } from 'react'
import { ArtifactV2 } from '../../store/chatStore'
import { HtmlRuntime } from './HtmlRuntime'
import { ArtifactV2 as ArtifactV2Type } from '../../lib/artifacts/types'

type Props = {
  artifact: ArtifactV2
  allowForms?: boolean
  allowPopups?: boolean
  allowAllImports?: boolean
}

const BABEL_CDN = 'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js'
const TAILWIND_CDN = 'https://cdn.tailwindcss.com'

/** Extract bare package specifiers from import statements (excludes react / react-dom). */
function extractExternalPackages(source: string): string[] {
  const pkgs = new Set<string>()
  const re = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"./][^'"]*)['"]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const pkg = m[1]
    if (pkg !== 'react' && pkg !== 'react-dom' && !pkg.startsWith('react-dom/')) {
      pkgs.add(pkg)
    }
  }
  return Array.from(pkgs)
}

function buildReactSrcDoc(artifact: ArtifactV2Type): string {
  const entry = artifact.files.find((f) => f.path === artifact.entrypoint) || artifact.files[0]
  const sourceRaw = entry?.content || ''
  const externalPkgs = extractExternalPackages(sourceRaw)
  const pkgsJson = JSON.stringify(externalPkgs)
  const sourceJson = JSON.stringify(sourceRaw)

  // Strategy:
  //   1. Load Babel and Tailwind as sync <script src> (no CORS mode, no null-origin issues).
  //   2. Use dynamic import() to load React + all 3rd-party packages from esm.sh in one
  //      shared React@18 instance (?deps=react@18.2.0 prevents duplicate React bundles).
  //   3. Babel compiles JSX + import/export → CommonJS; a require() closure shim resolves deps.
  //   4. Run via new Function() and render the exported default component.
  return `<!DOCTYPE html>
<html class="dark">
<head>
<meta charset="utf-8">
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent;color-scheme:dark;color:white;font-family:system-ui,sans-serif;overflow-x:hidden}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px}#root{min-height:100%}</style>
<script>
  window.tailwind = { config: { darkMode: 'class' } };
</script>
<script src="${TAILWIND_CDN}"></script>
<script src="${BABEL_CDN}"></script>
<script>
window.addEventListener('error', function(e) {
  if (!e.message || e.message === 'Script error.') return;
  try { parent.postMessage({ __kodo: 'artifact-error', message: String(e.message) }, '*'); } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  var msg = (e.reason && (e.reason.message || String(e.reason))) || 'Unhandled rejection';
  try { parent.postMessage({ __kodo: 'artifact-error', message: msg }, '*'); } catch (_) {}
});
/* Kodo Theme Adapter — shared with HtmlRuntime */
(function(){
  function hexToRgba(hex){hex=hex.replace('#','');if(hex.length===3)hex=hex.split('').map(function(c){return c+c}).join('');if(hex.length===6)return[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),1];if(hex.length===8)return[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),parseInt(hex.slice(6,8),16)/255];return null;}
  function parseColor(s){s=(s||'').trim();if(!s||s==='transparent'||s==='none'||s.startsWith('var('))return null;if(s.startsWith('#'))return hexToRgba(s);var m=s.match(/rgba?\\s*\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?/i);if(m)return[+m[1],+m[2],+m[3],m[4]!==undefined?+m[4]:1];return null;}
  function lum(r,g,b){return 0.299*r+0.587*g+0.114*b}
  function isBlueishDark(r,g,b){return lum(r,g,b)<110&&(b-(r+g)/2)>10}
  function isLightBg(r,g,b,a){return a>0.05&&lum(r,g,b)>160}
  function lumToThemeBg(l,a,C){var base=l<18?C.bg0:l<38?C.bg1:l<65?C.bg2:C.bg3;if(a<0.99){var bc=hexToRgba(base)||[17,17,20,1];return 'rgba('+bc[0]+','+bc[1]+','+bc[2]+','+a.toFixed(2)+')';}return base;}
  function adaptColor(raw,C){var rgba=parseColor(raw);if(!rgba)return raw;var r=rgba[0],g=rgba[1],b=rgba[2],a=rgba[3];if(isBlueishDark(r,g,b))return lumToThemeBg(lum(r,g,b),a,C);if(isLightBg(r,g,b,a))return lumToThemeBg(30,a,C);return raw;}
  function processCSS(css,C){css=css.replace(/#[0-9a-fA-F]{3,8}\\b/g,function(m){return adaptColor(m,C)});css=css.replace(/rgba?\\s*\\([^)]+\\)/gi,function(m){return adaptColor(m,C)});return css;}
  function applyTheme(C){
    document.querySelectorAll('style:not(#__kodo_adapt)').forEach(function(el){var o=el.textContent||'';var p=processCSS(o,C);if(p!==o)el.textContent=p;});
    var old=document.getElementById('__kodo_adapt');if(old)old.remove();
    var st=document.createElement('style');st.id='__kodo_adapt';
    st.textContent=['html,body{background:'+C.bg0+'!important;color:'+C.text0+'!important}','[class~="bg-white"],[class~="bg-gray-50"],[class~="bg-slate-50"]{background:'+C.bg1+'!important}','[class~="bg-gray-100"],[class~="bg-zinc-100"]{background:'+C.bg1+'!important}','[class~="bg-gray-900"],[class~="bg-zinc-900"]{background:'+C.bg1+'!important}','[class~="bg-gray-800"],[class~="bg-zinc-800"]{background:'+C.bg2+'!important}','[class~="text-black"],[class~="text-gray-900"]{color:'+C.text0+'!important}','[class~="text-gray-600"],[class~="text-gray-700"]{color:'+C.text1+'!important}','[class*="border-gray"],[class*="border-zinc"]{border-color:'+C.border+'!important}',':root{--background:'+C.bg0+';--foreground:'+C.text0+';--card:'+C.bg1+';--card-foreground:'+C.text0+';--muted:'+C.bg2+';--muted-foreground:'+C.text2+';--border:'+C.border+';--primary:'+C.accent+'}'].join('\\n');
    document.head.appendChild(st);
    var PROPS=['backgroundColor','background','borderColor','borderTopColor','borderBottomColor','borderLeftColor','borderRightColor','outlineColor'];
    document.querySelectorAll('[style]').forEach(function(el){var s=el.style;PROPS.forEach(function(p){if(s[p])s[p]=processCSS(s[p],C);});if(s.color){var c=parseColor(s.color);if(c&&isBlueishDark(c[0],c[1],c[2]))s.color=C.text1;}});
    document.documentElement.style.setProperty('background',C.bg0,'important');
    document.body.style.setProperty('background',C.bg0,'important');
  }
  window.addEventListener('message',function(ev){var d=ev.data||{};if(d.__kodo==='adapt-ui'&&d.colors)applyTheme(d.colors);});
})();
</script>
</head>
<body>
<div id="root"></div>
<script>
(async function() {
  // Load React from esm.sh so all packages share one instance.
  var reactMod, reactDomClientMod;
  try {
    [reactMod, reactDomClientMod] = await Promise.all([
      import('https://esm.sh/react@18.2.0'),
      import('https://esm.sh/react-dom@18.2.0/client'),
    ]);
  } catch (e) {
    parent.postMessage({ __kodo: 'artifact-error', message: 'CDN load failed: ' + String(e && e.message || e) }, '*');
    return;
  }
  var React = reactMod.default !== undefined ? reactMod.default : reactMod;
  var createRoot = reactDomClientMod.createRoot;
  window.React = React;

  // Load external packages (lucide-react, framer-motion, recharts, …).
  // ?deps pins to the same React version, avoiding duplicate-React hook errors.
  var pkgs = ${pkgsJson};
  var modMap = {};
  await Promise.all(pkgs.map(async function(pkg) {
    try {
      var mod = await import('https://esm.sh/' + pkg + '?deps=react@18.2.0,react-dom@18.2.0');
      modMap[pkg] = mod;
    } catch (e) {
      console.warn('[kodo] Failed to load', pkg, '—', String(e && e.message || e));
      modMap[pkg] = {};
    }
  }));

  // CommonJS require() shim used by Babel-compiled output.
  var requireFn = function(pkg) {
    if (pkg === 'react') return React;
    if (pkg === 'react-dom' || pkg === 'react-dom/client') return { createRoot: createRoot };
    if (modMap[pkg]) return modMap[pkg];
    var base = pkg.split('/')[0];
    if (modMap[base]) return modMap[base];
    console.warn('[kodo] require("' + pkg + '") not resolved');
    return {};
  };

  // Compile JSX + ESM → CommonJS with Babel.
  var source = ${sourceJson};
  var transformed;
  try {
    transformed = Babel.transform(source, {
      presets: [['env', { modules: 'commonjs', targets: 'last 2 Chrome versions' }], 'react'],
      filename: 'artifact.jsx',
    }).code;
  } catch (err) {
    parent.postMessage({ __kodo: 'artifact-error', message: 'Syntax error: ' + String(err && err.message || err) }, '*');
    return;
  }

  // Execute the compiled module in a sandboxed Function scope.
  var _exports = {};
  var _module = { exports: _exports };
  try {
    var body = transformed + '\\n;if(!exports.default){if(typeof App!=="undefined")exports.default=App;else if(typeof Component!=="undefined")exports.default=Component;}';
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', 'React', 'ReactDOM', body)(
      _module, _exports, requireFn, React, { createRoot: createRoot }
    );
  } catch (err) {
    parent.postMessage({ __kodo: 'artifact-error', message: 'Runtime error: ' + String(err && err.message || err) }, '*');
    return;
  }

  var Comp = _exports.default;
  if (!Comp || (typeof Comp !== 'function' && typeof Comp !== 'object')) {
    parent.postMessage({ __kodo: 'artifact-error', message: 'No default React component found. Use "export default function App() { … }".' }, '*');
    return;
  }
  try {
    createRoot(document.getElementById('root')).render(React.createElement(Comp));
  } catch (err) {
    parent.postMessage({ __kodo: 'artifact-error', message: 'Render error: ' + String(err && err.message || err) }, '*');
  }
})().catch(function(e) {
  parent.postMessage({ __kodo: 'artifact-error', message: 'Init failed: ' + String(e && e.message || e) }, '*');
});
</script>
</body>
</html>`;
}

export function ReactRuntime({ artifact, allowForms, allowPopups }: Props) {
  const html = useMemo(() => buildReactSrcDoc(artifact), [artifact])
  const synthetic: ArtifactV2 = useMemo(() => ({
    ...artifact,
    type: 'html',
    files: [{ path: 'index.html', content: html, language: 'html' }],
    entrypoint: 'index.html',
  }), [artifact, html])
  return <HtmlRuntime artifact={synthetic} allowForms={allowForms} allowPopups={allowPopups} />
}
