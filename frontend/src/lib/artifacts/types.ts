export type ArtifactType =
  | 'html'
  | 'react'
  | 'svg'
  | 'mermaid'
  | 'markdown'
  | 'code'
  | 'dot'
  | 'html-multi'
  | 'react-multi'

export interface ArtifactFile {
  path: string
  content: string
  language: string
}

export interface ArtifactV2 {
  id: string
  type: ArtifactType
  title: string
  version: number
  files: ArtifactFile[]
  entrypoint?: string
  streaming?: boolean
  createdAt: number
}

export interface ArtifactRef {
  id: string
  version: number
}

export const ARTIFACT_TYPES: ArtifactType[] = [
  'html',
  'react',
  'svg',
  'mermaid',
  'markdown',
  'code',
  'dot',
  'html-multi',
  'react-multi',
]

export function isArtifactType(value: string): value is ArtifactType {
  return (ARTIFACT_TYPES as string[]).includes(value)
}

export function defaultFilename(type: ArtifactType): string {
  switch (type) {
    case 'html':
    case 'html-multi':
      return 'index.html'
    case 'react':
    case 'react-multi':
      return 'App.jsx'
    case 'svg':
      return 'image.svg'
    case 'mermaid':
      return 'diagram.mmd'
    case 'markdown':
      return 'document.md'
    case 'dot':
      return 'graph.dot'
    case 'code':
    default:
      return 'file.txt'
  }
}

export function languageForFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.tsx')) return 'tsx'
  if (lower.endsWith('.ts')) return 'ts'
  if (lower.endsWith('.jsx')) return 'jsx'
  if (lower.endsWith('.js')) return 'js'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.svg')) return 'svg'
  if (lower.endsWith('.mmd')) return 'mermaid'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.dot') || lower.endsWith('.gv')) return 'dot'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.py')) return 'python'
  return 'text'
}
