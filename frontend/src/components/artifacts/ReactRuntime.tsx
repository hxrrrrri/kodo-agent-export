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
<html>
<head>
<meta charset="utf-8">
<style>body{margin:0;font-family:system-ui,sans-serif} #root{min-height:100vh}</style>
<script src="${TAILWIND_CDN}"></script>
<script src="${BABEL_CDN}"></script>
<script>
window.addEventListener('error', function(e) {
  // Suppress opaque cross-origin "Script error." — real errors are caught inline.
  if (!e.message || e.message === 'Script error.') return;
  try { parent.postMessage({ __kodo: 'artifact-error', message: String(e.message) }, '*'); } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  var msg = (e.reason && (e.reason.message || String(e.reason))) || 'Unhandled rejection';
  try { parent.postMessage({ __kodo: 'artifact-error', message: msg }, '*'); } catch (_) {}
});
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
