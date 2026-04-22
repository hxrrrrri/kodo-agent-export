import { describe, expect, it } from 'vitest'
import { parseArtifacts } from './parser'

describe('progressive streaming behaviour', () => {
  it('yields no artifact while fence is still open', () => {
    const partial = [
      'Let me build it.',
      '```artifact type=html id=demo title="Demo" version=1',
      '<!DOCTYPE html>',
      '<html><body><h1>Loading',
    ].join('\n')

    const result = parseArtifacts(partial)
    expect(result.streaming).toBe(true)
    expect(result.artifacts).toHaveLength(0)
  })

  it('promotes fence to artifact once closed', () => {
    const closed = [
      '```artifact type=html id=demo title="Demo" version=1',
      '<!DOCTYPE html><html><body><h1>Done</h1></body></html>',
      '```',
    ].join('\n')

    const result = parseArtifacts(closed)
    expect(result.streaming).toBe(false)
    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts[0].files[0].content).toContain('Done')
  })

  it('handles interleaved narration and artifact gracefully', () => {
    const narration = [
      'Here is a quick demo:',
      '',
      '```artifact type=svg id=icon title="Icon" version=1',
      '<svg width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>',
      '```',
      '',
      'And a second one:',
      '',
      '```artifact type=mermaid id=flow title="Flow" version=1',
      'graph TD; A-->B',
      '```',
    ].join('\n')

    const result = parseArtifacts(narration)
    expect(result.artifacts).toHaveLength(2)
    expect(result.artifacts.map((a) => a.id).sort()).toEqual(['flow', 'icon'])
  })

  it('tracks updates — two versions, same id, both produced', () => {
    const updates = [
      '```artifact type=html id=page title="Page" version=1',
      '<h1>v1</h1>',
      '```',
      '',
      'Adding dark mode:',
      '',
      '```artifact type=html id=page title="Page" version=2',
      '<h1 class=dark>v2</h1>',
      '```',
    ].join('\n')

    const result = parseArtifacts(updates)
    expect(result.artifacts).toHaveLength(2)
    const byVersion = [...result.artifacts].sort((a, b) => a.version - b.version)
    expect(byVersion[0].version).toBe(1)
    expect(byVersion[1].version).toBe(2)
    expect(byVersion[1].files[0].content).toContain('v2')
  })
})
