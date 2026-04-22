import { describe, expect, it } from 'vitest'
import { parseSharedRoute } from './SharedArtifactPage'

describe('parseSharedRoute', () => {
  it('parses a valid shared link with version', () => {
    const url = 'https://app.example/shared-artifact/sess-1/todo-app?token=abc123&version=3'
    const route = parseSharedRoute(url)
    expect(route).not.toBeNull()
    expect(route!.sessionId).toBe('sess-1')
    expect(route!.artifactId).toBe('todo-app')
    expect(route!.token).toBe('abc123')
    expect(route!.version).toBe(3)
  })

  it('accepts links without version (defaults to latest)', () => {
    const route = parseSharedRoute('https://app.example/shared-artifact/sess-1/todo-app?token=abc')
    expect(route!.version).toBeNull()
  })

  it('rejects missing token', () => {
    expect(parseSharedRoute('https://app.example/shared-artifact/s/a')).toBeNull()
  })

  it('rejects non-matching paths', () => {
    expect(parseSharedRoute('https://app.example/other/path')).toBeNull()
    expect(parseSharedRoute('not-a-url')).toBeNull()
  })

  it('url-decodes path components', () => {
    const route = parseSharedRoute('https://app.example/shared-artifact/sess%2Fone/my%20art?token=t')
    expect(route!.sessionId).toBe('sess/one')
    expect(route!.artifactId).toBe('my art')
  })
})
