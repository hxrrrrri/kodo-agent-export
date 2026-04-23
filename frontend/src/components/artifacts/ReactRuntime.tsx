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

const REACT_CDN = 'https://unpkg.com/react@18.2.0/umd/react.development.js'
const REACT_DOM_CDN = 'https://unpkg.com/react-dom@18.2.0/umd/react-dom.development.js'
const BABEL_CDN = 'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js'

function buildReactSrcDoc(artifact: ArtifactV2Type): string {
  const entry = artifact.files.find((f) => f.path === artifact.entrypoint) || artifact.files[0]
  const sourceRaw = entry?.content || ''

  // Always use Babel + UMD globals — no <script type="module"> needed.
  // Avoids CORS/null-origin issues in sandboxed srcdoc iframes (especially Firefox).
  // Babel transforms JSX + import/export to CommonJS; a require() shim handles react/react-dom.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>body{margin:0;font-family:system-ui,sans-serif} #root{min-height:100vh}</style>
<script>
window.addEventListener('error', function(e) {
  try { parent.postMessage({ __kodo: 'artifact-error', message: String(e.message || e.error) }, '*'); } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  try { parent.postMessage({ __kodo: 'artifact-error', message: 'Unhandled: ' + String(e.reason || '') }, '*'); } catch (_) {}
});
</script>
<script src="${REACT_CDN}"></script>
<script src="${REACT_DOM_CDN}"></script>
<script src="${BABEL_CDN}"></script>
</head>
<body>
<div id="root"></div>
<script>
(function() {
  // CommonJS shim: Babel preset-env transforms import → require(); this resolves them.
  var _requireCache = {};
  window.require = function(pkg) {
    if (_requireCache[pkg]) return _requireCache[pkg];
    if (pkg === 'react') return window.React;
    if (pkg === 'react-dom') return window.ReactDOM;
    if (pkg === 'react-dom/client') return window.ReactDOM;
    // Named subpath: try splitting
    var base = pkg.split('/')[0];
    if (base === 'react') return window.React;
    console.warn('[kodo] require("' + pkg + '") not resolved in sandbox');
    return {};
  };

  var source = ${JSON.stringify(sourceRaw)};
  var transformed;
  try {
    transformed = Babel.transform(source, {
      presets: [['env', { modules: 'commonjs', targets: 'last 2 Chrome versions' }], 'react'],
      filename: 'artifact.jsx',
    }).code;
  } catch (err) {
    parent.postMessage({ __kodo: 'artifact-error', message: 'Syntax: ' + String(err && err.message || err) }, '*');
    return;
  }

  var _exports = {};
  var _module = { exports: _exports };
  try {
    // Append fallback: if no explicit export, look for App/Component in local scope.
    var body = transformed + '\\n;if(!exports.default){if(typeof App!=="undefined")exports.default=App;else if(typeof Component!=="undefined")exports.default=Component;}';
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', 'React', 'ReactDOM', body)(
      _module, _exports, window.require, window.React, window.ReactDOM
    );
  } catch (err) {
    parent.postMessage({ __kodo: 'artifact-error', message: 'Runtime: ' + String(err && err.message || err) }, '*');
    return;
  }

  var Comp = _exports.default || _exports['default'];
  if (!Comp || typeof Comp !== 'function') {
    parent.postMessage({ __kodo: 'artifact-error', message: 'No default React component exported. Define "export default function App()" or "export default App".' }, '*');
    return;
  }
  try {
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Comp));
  } catch (err) {
    parent.postMessage({ __kodo: 'artifact-error', message: 'Render: ' + String(err && err.message || err) }, '*');
  }
})();
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
