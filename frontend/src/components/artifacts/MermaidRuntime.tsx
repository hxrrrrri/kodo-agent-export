import { useMemo } from 'react'
import { ArtifactV2 } from '../../store/chatStore'
import { HtmlRuntime } from './HtmlRuntime'

type Props = {
  artifact: ArtifactV2
}

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'

export function MermaidRuntime({ artifact }: Props) {
  const diagram = (artifact.files[0]?.content || '').trim()

  const srcDoc = useMemo(() => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>body{margin:0;padding:16px;font-family:system-ui} .mermaid{display:flex;justify-content:center}</style>
</head>
<body>
<div class="mermaid">${escape(diagram)}</div>
<script src="${MERMAID_CDN}"></script>
<script>
try {
  mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'strict' });
} catch (err) {
  parent.postMessage({ __kodo: 'artifact-error', message: String(err && err.message || err) }, '*');
}
</script>
</body>
</html>`, [diagram])

  const synthetic: ArtifactV2 = useMemo(() => ({
    ...artifact,
    type: 'html',
    files: [{ path: 'index.html', content: srcDoc, language: 'html' }],
    entrypoint: 'index.html',
  }), [artifact, srcDoc])

  return <HtmlRuntime artifact={synthetic} />
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
