const API_AUTH_STORAGE_KEY = 'kodo_api_auth_token'

function readEnvToken(): string {
  const token = import.meta.env.VITE_API_AUTH_TOKEN
  return typeof token === 'string' ? token.trim() : ''
}

export function getApiAuthToken(): string {
  if (typeof window === 'undefined') {
    return readEnvToken()
  }

  const saved = window.localStorage.getItem(API_AUTH_STORAGE_KEY)
  if (saved && saved.trim()) {
    return saved.trim()
  }

  return readEnvToken()
}

export function setApiAuthToken(token: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const trimmed = token.trim()
  if (!trimmed) {
    window.localStorage.removeItem(API_AUTH_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(API_AUTH_STORAGE_KEY, trimmed)
}

export function clearApiAuthToken(): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(API_AUTH_STORAGE_KEY)
}

export function buildApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) }
  const token = getApiAuthToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

export async function parseApiError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (typeof data?.detail === 'string' && data.detail.trim()) {
      return `${response.status} ${data.detail}`
    }
  } catch {
    // Fallback to status text if response is not JSON.
  }
  return `${response.status} ${response.statusText || 'Request failed'}`
}
