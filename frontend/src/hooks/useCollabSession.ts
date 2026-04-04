import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildApiHeaders, parseApiError } from '../lib/api'

interface CollabState {
  observerMode: boolean
  shareUrl: string
  expiresAt: string
  viewerCount: number
  lastEventType: string
  error: string
  createShare: () => Promise<void>
  revokeShare: () => Promise<void>
}

function readShareTokenFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('share_token') || ''
}

export function useCollabSession(sessionId: string | null): CollabState {
  const [shareUrl, setShareUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [viewerCount, setViewerCount] = useState(0)
  const [lastEventType, setLastEventType] = useState('')
  const [error, setError] = useState('')
  const shareToken = useMemo(() => readShareTokenFromUrl(), [])
  const observerMode = Boolean(sessionId && shareToken)

  const createShare = useCallback(async () => {
    if (!sessionId) return
    setError('')
    const response = await fetch(`/api/collab/sessions/${encodeURIComponent(sessionId)}/share`, {
      method: 'POST',
      headers: buildApiHeaders(),
    })
    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }
    const data = await response.json()
    setShareUrl(String(data.share_url || ''))
    setExpiresAt(String(data.expires_at || ''))
  }, [sessionId])

  const revokeShare = useCallback(async () => {
    if (!sessionId) return
    setError('')
    const response = await fetch(`/api/collab/sessions/${encodeURIComponent(sessionId)}/share`, {
      method: 'DELETE',
      headers: buildApiHeaders(),
    })
    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }
    setShareUrl('')
    setExpiresAt('')
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) {
      setViewerCount(0)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/collab/sessions/${encodeURIComponent(sessionId)}/viewers`, {
          headers: buildApiHeaders(),
        })
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) {
          setViewerCount(Number(data.viewers || 0))
        }
      } catch {
        // Ignore viewer polling failures when feature is disabled.
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [sessionId])

  useEffect(() => {
    if (!observerMode || !sessionId) return

    const source = new EventSource(`/api/collab/sessions/${encodeURIComponent(sessionId)}/stream?token=${encodeURIComponent(shareToken)}`)
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>
        setLastEventType(String(payload.type || 'event'))
        window.dispatchEvent(new CustomEvent('kodo:collab-event', { detail: payload }))
      } catch {
        setLastEventType('event')
      }
    }
    source.onerror = () => {
      setError('Collaboration stream disconnected.')
      source.close()
    }

    return () => {
      source.close()
    }
  }, [observerMode, sessionId, shareToken])

  return {
    observerMode,
    shareUrl,
    expiresAt,
    viewerCount,
    lastEventType,
    error,
    createShare: async () => {
      try {
        await createShare()
      } catch (err) {
        setError(String(err))
      }
    },
    revokeShare: async () => {
      try {
        await revokeShare()
      } catch (err) {
        setError(String(err))
      }
    },
  }
}
