import { describe, expect, it } from 'vitest'
import { canLivePreview } from './ArtifactRuntime'

describe('canLivePreview', () => {
  it('returns true for renderable types', () => {
    ['html', 'html-multi', 'react', 'react-multi', 'svg', 'mermaid', 'markdown', 'dot'].forEach((t) => {
      expect(canLivePreview(t)).toBe(true)
    })
  })

  it('returns false for code-only types', () => {
    expect(canLivePreview('code')).toBe(false)
    expect(canLivePreview('unknown')).toBe(false)
  })
})
