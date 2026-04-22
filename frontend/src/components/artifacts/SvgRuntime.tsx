import { useMemo } from 'react'
import { ArtifactV2 } from '../../store/chatStore'
import { HtmlRuntime } from './HtmlRuntime'

type Props = {
  artifact: ArtifactV2
}

/**
 * Renders SVG inside an iframe srcdoc so any embedded <script> runs with
 * no-same-origin sandbox isolation. Never interpolate SVG directly into the
 * parent DOM — an inline <script> in malicious SVG would execute with the
 * app's origin.
 */
export function SvgRuntime({ artifact }: Props) {
  const svg = artifact.files[0]?.content || ''

  const srcDoc = useMemo(() => `<!DOCTYPE html>
<html>
<head>
<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fafafa} svg{max-width:100%;max-height:100%}</style>
</head>
<body>${svg}</body>
</html>`, [svg])

  const synthetic: ArtifactV2 = useMemo(() => ({
    ...artifact,
    type: 'html',
    files: [{ path: 'index.html', content: srcDoc, language: 'html' }],
    entrypoint: 'index.html',
  }), [artifact, srcDoc])

  return <HtmlRuntime artifact={synthetic} />
}
