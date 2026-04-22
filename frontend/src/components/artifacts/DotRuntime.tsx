import { useMemo } from 'react'
import { ArtifactV2 } from '../../store/chatStore'
import { HtmlRuntime } from './HtmlRuntime'

type Props = {
  artifact: ArtifactV2
}

const VIZ_CDN = 'https://cdn.jsdelivr.net/npm/@viz-js/viz@3.3.0/lib/viz-standalone.js'

export function DotRuntime({ artifact }: Props) {
  const source = (artifact.files[0]?.content || '').trim()

  const srcDoc = useMemo(() => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fafafa} svg{max-width:100%;max-height:100%}</style>
</head>
<body>
<div id="out">Loading viz.js...</div>
<script src="${VIZ_CDN}"></script>
<script>
(async function() {
  try {
    const viz = await Viz.instance();
    const svg = viz.renderSVGElement(${JSON.stringify(source)});
    document.getElementById('out').replaceWith(svg);
  } catch (err) {
    parent.postMessage({ __kodo: 'artifact-error', message: String(err && err.message || err) }, '*');
    document.getElementById('out').textContent = 'Graphviz render failed: ' + (err && err.message || err);
  }
})();
</script>
</body>
</html>`, [source])

  const synthetic: ArtifactV2 = useMemo(() => ({
    ...artifact,
    type: 'html',
    files: [{ path: 'index.html', content: srcDoc, language: 'html' }],
    entrypoint: 'index.html',
  }), [artifact, srcDoc])

  return <HtmlRuntime artifact={synthetic} />
}
