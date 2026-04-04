const API_AUTH_STORAGE_KEY = 'kodo_api_auth_token'
const API_KEYS_STORAGE_KEY = 'kodo_api_keys'

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

function getApiKeyOverrides(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {}
  }

  const raw = window.localStorage.getItem(API_KEYS_STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }

    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        continue
      }
      const trimmed = value.trim()
      if (!trimmed) {
        continue
      }
      result[key] = trimmed
    }
    return result
  } catch {
    return {}
  }
}

export function buildApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) }
  const token = getApiAuthToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const keys = getApiKeyOverrides()
  if (Object.keys(keys).length > 0) {
    headers['X-Kodo-Keys'] = JSON.stringify(keys)
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
