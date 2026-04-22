import { describe, expect, it } from 'vitest'
import { parseArtifacts } from './parser'

describe('parseArtifacts — v2 protocol', () => {
  it('parses a single-file react artifact with full attributes', () => {
    const text = [
      '```artifact type=react id=todo-app title="Todo App" version=1 filename=App.jsx',
      'export default function App() { return null }',
      '```',
    ].join('\n')

    const { artifacts, streaming } = parseArtifacts(text)
    expect(streaming).toBe(false)
    expect(artifacts).toHaveLength(1)
    const [a] = artifacts
    expect(a.id).toBe('todo-app')
    expect(a.type).toBe('react')
    expect(a.title).toBe('Todo App')
    expect(a.version).toBe(1)
    expect(a.files).toHaveLength(1)
    expect(a.files[0].path).toBe('App.jsx')
    expect(a.files[0].language).toBe('jsx')
    expect(a.files[0].content).toContain('export default')
  })

  it('parses quoted titles with spaces', () => {
    const text = [
      '```artifact type=html id=demo title="Hello World Demo" version=1',
      '<h1>hi</h1>',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts[0].title).toBe('Hello World Demo')
  })

  it('collapses bundled fences sharing id into one multi-file artifact', () => {
    const text = [
      '```artifact type=html-multi id=landing title="Landing" version=1 bundle=true filename=index.html entrypoint=true',
      '<!DOCTYPE html><link rel=stylesheet href=styles.css>',
      '```',
      '',
      '```artifact type=html-multi id=landing title="Landing" version=1 bundle=true filename=styles.css',
      'body { color: red }',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts).toHaveLength(1)
    const [a] = artifacts
    expect(a.files).toHaveLength(2)
    expect(a.files.map((f) => f.path).sort()).toEqual(['index.html', 'styles.css'])
    expect(a.entrypoint).toBe('index.html')
  })

  it('supports updates via same id + new version', () => {
    const text = [
      '```artifact type=html id=demo title="Demo" version=1',
      '<h1>v1</h1>',
      '```',
      '',
      '```artifact type=html id=demo title="Demo" version=2',
      '<h1>v2</h1>',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts).toHaveLength(2)
    expect(artifacts.map((a) => a.version).sort()).toEqual([1, 2])
  })

  it('detects mid-stream unclosed fence', () => {
    const text = [
      '```artifact type=react id=pending title="Pending" version=1',
      'export default () => {',
      '  return (',
    ].join('\n')

    const { artifacts, streaming } = parseArtifacts(text)
    expect(streaming).toBe(true)
    expect(artifacts).toHaveLength(0)
  })

  it('handles legacy v1 fences (artifact:html)', () => {
    const text = [
      '```artifact:html',
      '<div>legacy</div>',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].type).toBe('html')
    expect(artifacts[0].files[0].content).toContain('legacy')
  })

  it('handles legacy bare artifact keyword', () => {
    const text = [
      '```artifact',
      'some raw text',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].type).toBe('code')
  })

  it('skips fences that are not artifacts', () => {
    const text = [
      '```js',
      'const x = 1',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts).toHaveLength(0)
  })

  it('handles mermaid diagrams', () => {
    const text = [
      '```artifact type=mermaid id=flow title="Flow" version=1',
      'graph TD; A-->B',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts[0].type).toBe('mermaid')
    expect(artifacts[0].files[0].path).toBe('diagram.mmd')
  })

  it('defaults filename per type when omitted', () => {
    const text = [
      '```artifact type=svg id=icon title="Icon" version=1',
      '<svg/>',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts[0].files[0].path).toBe('image.svg')
  })

  it('ignores empty artifact bodies', () => {
    const text = [
      '```artifact type=html id=empty title="Empty" version=1',
      '',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts).toHaveLength(0)
  })

  it('parses output representative of weaker local models', () => {
    // Simulates an ollama llama3 output: lowercase attributes, missing quotes, minor whitespace quirks.
    const text = [
      '```artifact type=html id=hello   title="Hello"     version=1',
      '<p>hi</p>',
      '```',
    ].join('\n')

    const { artifacts } = parseArtifacts(text)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].id).toBe('hello')
  })
})
