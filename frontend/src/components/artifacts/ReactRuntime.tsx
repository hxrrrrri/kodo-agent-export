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

const IMPORT_ALLOWLIST = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'lucide-react',
  'framer-motion',
  'clsx',
  'zustand',
])

function esmRewrite(source: string, allowAllImports: boolean): string {
  // Rewrite `from "x"` / `from 'x'` to `from "https://esm.sh/x"` for allowlisted deps.
  return source.replace(/from\s+['"]([^'"]+)['"]/g, (match, pkg) => {
    if (pkg.startsWith('http://') || pkg.startsWith('https://') || pkg.startsWith('./') || pkg.startsWith('../') || pkg.startsWith('/')) {
      return match
    }
    if (allowAllImports || IMPORT_ALLOWLIST.has(pkg)) {
      return `from "https://esm.sh/${pkg}?bundle"`
    }
    return `from "https://esm.sh/${pkg}?bundle"`
  })
}

function buildReactSrcDoc(artifact: ArtifactV2Type, allowAllImports: boolean): string {
  const entry = artifact.files.find((f) => f.path === artifact.entrypoint) || artifact.files[0]
  const sourceRaw = entry?.content || ''
  const usesModules = /^\s*import\s+/m.test(sourceRaw) || /\bexport\s+default\b/.test(sourceRaw)

  // Transform with Babel standalone inside iframe. Provide React + ReactDOM globals.
  const rewritten = esmRewrite(sourceRaw, allowAllImports)

  if (usesModules) {
    // Use esm.sh for everything; skip Babel. Inject an import map so `react` resolves.
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom": "https://esm.sh/react-dom@18.2.0",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client"
  }
}
</script>
<style>body{margin:0;font-family:system-ui,sans-serif} #root{min-height:100vh}</style>
<script>
window.addEventListener('error', function(e) {
  try { parent.postMessage({ __kodo: 'artifact-error', message: String(e.message || e.error) }, '*'); } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  try { parent.postMessage({ __kodo: 'artifact-error', message: 'Unhandled: ' + String(e.reason || '') }, '*'); } catch (_) {}
});
</script>
</head>
<body>
<div id="root"></div>
<script type="module">
import React from "react";
import { createRoot } from "react-dom/client";
window.React = React;
${rewritten}
try {
  const root = createRoot(document.getElementById('root'));
  const candidate = (typeof App !== 'undefined' && App) || (typeof default_1 !== 'undefined' && default_1);
  if (candidate) {
    root.render(React.createElement(candidate));
  } else {
    document.body.insertAdjacentText('beforeend', 'Artifact did not export a default component.');
  }
} catch (err) {
  parent.postMessage({ __kodo: 'artifact-error', message: String(err && err.message || err) }, '*');
}
</script>
</body>
</html>`
  }

  // Legacy JSX: use Babel standalone + UMD React.
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
<script src="${REACT_CDN}" crossorigin></script>
<script src="${REACT_DOM_CDN}" crossorigin></script>
<script src="${BABEL_CDN}"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="env,react">
${rewritten}
try {
  const candidate = (typeof App !== 'undefined' && App) || null;
  if (candidate) {
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(candidate));
  } else {
    document.body.insertAdjacentText('beforeend', 'Artifact did not define an App component.');
  }
} catch (err) {
  parent.postMessage({ __kodo: 'artifact-error', message: String(err && err.message || err) }, '*');
}
</script>
</body>
</html>`
}

export function ReactRuntime({ artifact, allowForms, allowPopups, allowAllImports }: Props) {
  const html = useMemo(() => buildReactSrcDoc(artifact, Boolean(allowAllImports)), [artifact, allowAllImports])
  const synthetic: ArtifactV2 = useMemo(() => ({
    ...artifact,
    type: 'html',
    files: [{ path: 'index.html', content: html, language: 'html' }],
    entrypoint: 'index.html',
  }), [artifact, html])
  return <HtmlRuntime artifact={synthetic} allowForms={allowForms} allowPopups={allowPopups} />
}
