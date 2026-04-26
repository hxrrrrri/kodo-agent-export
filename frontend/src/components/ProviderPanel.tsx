import { useEffect, useMemo, useState } from 'react'
import { Activity, RefreshCw, ShieldCheck, Stethoscope } from 'lucide-react'
import { buildApiHeaders, parseApiError } from '../lib/api'
import { useChatStore } from '../store/chatStore'

type ProviderRow = {
  provider: string
  healthy: boolean
  configured: boolean
  latency_ms: number | null
  errors: number
  requests: number
  error_rate: number
  cost_per_1k: number | null
  big_model: string
  small_model: string
}

type ProvidersStatusResponse = {
  mode: string
  strategy: string
  fallback_enabled: boolean
  providers: ProviderRow[]
}

type GatewayStatusResponse = {
  status: string
  api_auth_enabled: boolean
  request_id_enabled: boolean
  permission_mode: string
  router_mode: string
  router_strategy: string
  primary_provider: string
  provider: string | null
  model: string
  audit_log_file: string
  usage_log_file: string
  telemetry_disabled: boolean
  providers: Record<string, boolean>
}

type ProviderProfile = {
  provider: string
  model: string
  base_url: string | null
  api_key: string | null
  goal: string
  created_at: string
  name: string | null
}

type DoctorCheck = {
  name: string
  passed: boolean
  message: string
  fix?: string | null
}

type WebhookEvent = {
  event_type: string
  task_id: string
  queued_at: string
}

const ROUTER_STRATEGIES = ['latency', 'cost', 'balanced', 'quality']
const ALL_PROVIDER_OPTIONS = [
  'anthropic',
  'openai',
  'gemini',
  'deepseek',
  'groq',
  'openrouter',
  'github-models',
  'codex',
  'ollama',
  'atomic-chat',
]

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'anthropic/claude-sonnet-4-6',
  'github-models': 'gpt-4o',
  codex: 'gpt-4o',
  ollama: '',
  'atomic-chat': '',
}

type ProvidersDiscoveryResponse = {
  providers: Record<string, boolean>
  models: Record<string, string[]>
  key_status: Record<string, boolean>
}

type ProviderSwitchResponse = {
  provider: string
  model: string
  router_mode: string
  profile: string
  persisted: boolean
}

type OllamaSetupStatusResponse = {
  base_url: string
  configured: boolean
  reachable: boolean
  models: string[]
  recommended_model: string | null
  active_model?: string | null
}

type OllamaSetupResponse = OllamaSetupStatusResponse & {
  provider: string
  model: string
  profile: string
  persisted: boolean
}

function normalizeProviderName(value: string): string {
  const normalized = String(value || '').trim().toLowerCase().replace('_', '-')
  return normalized === 'atomicchat' ? 'atomic-chat' : normalized
}

function mergeModelCatalog(
  base: Record<string, string[]>,
  rows: ProviderRow[],
): Record<string, string[]> {
  const merged: Record<string, string[]> = {}

  for (const [provider, models] of Object.entries(base)) {
    const key = normalizeProviderName(provider)
    merged[key] = Array.from(new Set((models || []).map((item) => String(item || '').trim()).filter(Boolean)))
  }

  for (const row of rows) {
    const key = normalizeProviderName(row.provider)
    const existing = merged[key] || []
    const additions = [row.big_model, row.small_model]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    merged[key] = Array.from(new Set([...existing, ...additions]))
  }

  for (const provider of ALL_PROVIDER_OPTIONS) {
    const key = normalizeProviderName(provider)
    if (!merged[key] || merged[key].length === 0) {
      const fallback = DEFAULT_MODEL_BY_PROVIDER[key]
      merged[key] = fallback ? [fallback] : []
    }
  }

  return merged
}

function latencyColor(latency: number | null): string {
  if (latency === null) return 'var(--text-2)'
  if (latency < 500) return 'var(--green)'
  if (latency < 2000) return 'var(--yellow)'
  return 'var(--red)'
}

export function ProviderPanel() {
  const sessionId = useChatStore((state) => state.sessionId)
  const [status, setStatus] = useState<ProvidersStatusResponse | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusResponse | null>(null)
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<ProviderProfile | null>(null)
  const [checks, setChecks] = useState<DoctorCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([])
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [strategyDraft, setStrategyDraft] = useState('balanced')
  const [modelCatalog, setModelCatalog] = useState<Record<string, string[]>>({})
  const [providerAvailability, setProviderAvailability] = useState<Record<string, boolean>>({})
  const [switchDraft, setSwitchDraft] = useState({ provider: '', model: '' })
  const [switching, setSwitching] = useState(false)
  const [ollamaSetup, setOllamaSetup] = useState<OllamaSetupStatusResponse | null>(null)
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://127.0.0.1:11434')
  const [ollamaModel, setOllamaModel] = useState('')
  const [ollamaSetupLoading, setOllamaSetupLoading] = useState(false)
  const [ollamaSetupSaving, setOllamaSetupSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [newProfile, setNewProfile] = useState({
    name: '',
    provider: 'openai',
    model: 'gpt-4o',
    goal: 'balanced',
    base_url: '',
    api_key: '',
  })

  const activeProvider = useMemo(() => {
    const rows = status?.providers || []
    const activeProfileProvider = String(activeProfile?.provider || '').trim().toLowerCase()
    if (activeProfileProvider) {
      const exact = rows.find((row) => String(row.provider || '').trim().toLowerCase() === activeProfileProvider)
      if (exact) return exact

      if (activeProfile?.model) {
        return {
          provider: activeProfileProvider,
          healthy: true,
          configured: true,
          latency_ms: null,
          errors: 0,
          requests: 0,
          error_rate: 0,
          cost_per_1k: null,
          big_model: activeProfile.model,
          small_model: activeProfile.model,
        } as ProviderRow
      }
    }

    return rows.find((row) => row.healthy) || rows[0] || null
  }, [activeProfile, status])

  const mergedModelCatalog = useMemo(() => {
    return mergeModelCatalog(modelCatalog, status?.providers || [])
  }, [modelCatalog, status])

  const providerOptions = useMemo(() => {
    const dynamic = Object.keys(mergedModelCatalog)
    return Array.from(new Set([...ALL_PROVIDER_OPTIONS, ...dynamic])).map((provider) => normalizeProviderName(provider))
  }, [mergedModelCatalog])

  const effectiveSwitchProvider = useMemo(() => {
    if (switchDraft.provider) {
      return normalizeProviderName(switchDraft.provider)
    }
    return providerOptions[0] || ''
  }, [providerOptions, switchDraft.provider])

  const modelOptions = useMemo(() => {
    const key = normalizeProviderName(effectiveSwitchProvider)
    return mergedModelCatalog[key] || []
  }, [effectiveSwitchProvider, mergedModelCatalog])

  const switchModelOptions = useMemo(() => {
    const current = String(switchDraft.model || '').trim()
    if (!current || modelOptions.includes(current)) return modelOptions
    return [current, ...modelOptions]
  }, [modelOptions, switchDraft.model])

  const ollamaModelOptions = useMemo(() => {
    const models = Array.isArray(ollamaSetup?.models) ? ollamaSetup.models : []
    const current = String(ollamaModel || '').trim()
    if (!current || models.includes(current)) return models
    return [current, ...models]
  }, [ollamaModel, ollamaSetup])

  const webhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/api/webhooks/trigger'
    return `${window.location.origin}/api/webhooks/trigger`
  }, [])

  const loadGatewayStatus = async () => {
    try {
      const res = await fetch('/api/gateway/status', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = (await res.json()) as GatewayStatusResponse
      setGatewayStatus(payload)
    } catch (e) {
      setError(String(e))
    }
  }

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/providers/status', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = (await res.json()) as ProvidersStatusResponse
      setStatus(payload)
      setStrategyDraft(payload.strategy || 'balanced')

      const nextAvailability: Record<string, boolean> = {}
      for (const row of payload.providers || []) {
        nextAvailability[normalizeProviderName(row.provider)] = Boolean(row.configured)
      }
      setProviderAvailability((prev) => ({ ...prev, ...nextAvailability }))

      if (payload.providers && payload.providers.length > 0) {
        const first = payload.providers[0]
        const firstProvider = normalizeProviderName(first.provider)
        setSwitchDraft((prev) => {
          if (prev.provider) {
            return prev
          }
          return {
            provider: firstProvider,
            model: first.big_model || prev.model || '',
          }
        })
      }
    } catch (e) {
      setError(String(e))
    }
  }

  const loadDiscovery = async () => {
    try {
      const res = await fetch('/api/providers/discover', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = (await res.json()) as ProvidersDiscoveryResponse

      const discoveredModels: Record<string, string[]> = {}
      for (const [provider, models] of Object.entries(payload.models || {})) {
        discoveredModels[normalizeProviderName(provider)] = (models || []).map((item) => String(item || '').trim()).filter(Boolean)
      }
      setModelCatalog(discoveredModels)

      const nextAvailability: Record<string, boolean> = {}
      const local = payload.providers || {}
      const keys = payload.key_status || {}
      nextAvailability['openai'] = Boolean(keys.openai)
      nextAvailability['anthropic'] = Boolean(keys.anthropic)
      nextAvailability['gemini'] = Boolean(keys.gemini)
      nextAvailability['deepseek'] = Boolean(keys.deepseek)
      nextAvailability['groq'] = Boolean(keys.groq)
      nextAvailability['ollama'] = Boolean(local.ollama)
      nextAvailability['atomic-chat'] = Boolean(local.atomic_chat)

      setProviderAvailability((prev) => ({ ...prev, ...nextAvailability }))
    } catch (e) {
      setError(String(e))
    }
  }

  const loadOpenRouterModels = async () => {
    try {
      const res = await fetch('/api/providers/openrouter/models', { headers: buildApiHeaders() })
      if (!res.ok) return
      const payload = await res.json() as { models: Array<{ id: string; name: string }> }
      const ids = (payload.models || []).map((m) => String(m.id || '').trim()).filter(Boolean)
      if (ids.length > 0) {
        setModelCatalog((prev) => ({ ...prev, openrouter: ids }))
        setProviderAvailability((prev) => ({ ...prev, openrouter: true }))
      }
    } catch { /* silently skip */ }
  }

  const loadOllamaSetupStatus = async () => {
    setOllamaSetupLoading(true)
    try {
      const res = await fetch('/api/providers/ollama/setup', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = (await res.json()) as OllamaSetupStatusResponse
      setOllamaSetup(payload)
      setOllamaBaseUrl(payload.base_url || 'http://127.0.0.1:11434')

      const models = Array.isArray(payload.models) ? payload.models : []
      const preferred = payload.active_model || payload.recommended_model || models[0] || ''
      setOllamaModel(String(preferred || ''))
      setModelCatalog((prev) => ({
        ...prev,
        ollama: Array.from(new Set([...models, String(preferred || '')].map((item) => item.trim()).filter(Boolean))),
      }))
    } catch (e) {
      setError(String(e))
    } finally {
      setOllamaSetupLoading(false)
    }
  }

  const runOllamaSetup = async () => {
    setOllamaSetupSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/providers/ollama/setup', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          base_url: ollamaBaseUrl.trim() || null,
          model: ollamaModel.trim() || null,
          session_id: sessionId || null,
          persist: true,
        }),
      })
      if (!response.ok) throw new Error(await parseApiError(response))

      const payload = (await response.json()) as OllamaSetupResponse
      setSwitchDraft({ provider: payload.provider, model: payload.model })

      await Promise.all([
        loadStatus(),
        loadProfiles(),
        loadDiscovery(),
        loadOllamaSetupStatus(),
      ])
    } catch (e) {
      setError(String(e))
    } finally {
      setOllamaSetupSaving(false)
    }
  }

  const loadProfiles = async () => {
    try {
      const [profilesRes, activeRes] = await Promise.all([
        fetch('/api/profiles', { headers: buildApiHeaders() }),
        fetch('/api/profiles/active', { headers: buildApiHeaders() }),
      ])
      if (!profilesRes.ok) throw new Error(await parseApiError(profilesRes))
      if (!activeRes.ok) throw new Error(await parseApiError(activeRes))

      const profilesPayload = await profilesRes.json()
      const activePayload = await activeRes.json()
      setProfiles((profilesPayload.profiles || []) as ProviderProfile[])
      setActiveProfile((activePayload.profile || null) as ProviderProfile | null)
    } catch (e) {
      setError(String(e))
    }
  }

  const runDoctor = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/doctor/runtime', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = await res.json()
      setChecks((payload.checks || []) as DoctorCheck[])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const loadWebhookEvents = async () => {
    try {
      const res = await fetch('/api/webhooks/events', { headers: buildApiHeaders() })
      if (res.status === 404) {
        setWebhookError('Webhooks are disabled on the backend.')
        setWebhookEvents([])
        return
      }
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = await res.json()
      setWebhookEvents((payload.events || []) as WebhookEvent[])
      setWebhookError(null)
    } catch (e) {
      setWebhookError(String(e))
    }
  }

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopiedWebhook(true)
      window.setTimeout(() => setCopiedWebhook(false), 1200)
    } catch {
      setCopiedWebhook(false)
    }
  }

  const setRouterStrategy = async (strategy: string) => {
    setStrategyDraft(strategy)
    try {
      const res = await fetch('/api/providers/router-strategy', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ strategy }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = (await res.json()) as ProvidersStatusResponse
      setStatus(payload)
      setStrategyDraft(payload.strategy)
    } catch (e) {
      setError(String(e))
    }
  }

  const pingProvider = async (provider: string) => {
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(provider)}/ping`, {
        method: 'POST',
        headers: buildApiHeaders(),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      await loadStatus()
    } catch (e) {
      setError(String(e))
    }
  }

  const setActiveFromProvider = async (row: ProviderRow) => {
    try {
      const targetProvider = normalizeProviderName(row.provider)
      const modelHint = targetProvider === 'ollama' || targetProvider === 'atomic-chat'
        ? null
        : (row.big_model || row.small_model || null)

      const res = await fetch('/api/providers/switch', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          provider: targetProvider,
          model: modelHint,
          session_id: sessionId || null,
          persist: true,
        }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))

      const payload = (await res.json()) as ProviderSwitchResponse
      setSwitchDraft({ provider: payload.provider, model: payload.model })
      await Promise.all([loadStatus(), loadProfiles(), loadDiscovery()])
    } catch (e) {
      setError(String(e))
    }
  }

  const applyQuickSwitch = async () => {
    const provider = normalizeProviderName(effectiveSwitchProvider)
    if (!provider) {
      setError('Choose a provider to switch.')
      return
    }

    setSwitching(true)
    setError(null)
    try {
      const response = await fetch('/api/providers/switch', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          provider,
          model: switchDraft.model.trim() || modelOptions[0] || null,
          session_id: sessionId || null,
          persist: true,
        }),
      })
      if (!response.ok) throw new Error(await parseApiError(response))

      const payload = (await response.json()) as ProviderSwitchResponse
      setSwitchDraft({ provider: payload.provider, model: payload.model })
      await Promise.all([loadStatus(), loadProfiles(), loadDiscovery()])
    } catch (e) {
      setError(String(e))
    } finally {
      setSwitching(false)
    }
  }

  const activateProfile = async (name: string) => {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(name)}/activate`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          session_id: sessionId || null,
          persist: true,
        }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = await res.json()
      const profile = payload?.profile as ProviderProfile | undefined
      if (profile?.provider && profile?.model) {
        setSwitchDraft({ provider: profile.provider, model: profile.model })
      }
      await Promise.all([loadProfiles(), loadStatus(), loadDiscovery()])
    } catch (e) {
      setError(String(e))
    }
  }

  const deleteProfile = async (name: string) => {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: buildApiHeaders(),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      await loadProfiles()
    } catch (e) {
      setError(String(e))
    }
  }

  const createProfile = async () => {
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...newProfile,
          base_url: newProfile.base_url || null,
          api_key: newProfile.api_key || null,
        }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      setShowModal(false)
      setNewProfile({
        name: '',
        provider: 'openai',
        model: 'gpt-4o',
        goal: 'balanced',
        base_url: '',
        api_key: '',
      })
      await loadProfiles()
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    void loadGatewayStatus()
    void loadStatus()
    void loadDiscovery()
    void loadProfiles()
    void loadOllamaSetupStatus()
    void loadWebhookEvents()
    void loadOpenRouterModels()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadGatewayStatus()
      void loadStatus()
      void loadDiscovery()
      void loadProfiles()
      void loadOllamaSetupStatus()
    }, 7000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadWebhookEvents()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div style={{ padding: '10px 10px 14px', overflowY: 'auto', height: '100%' }}>
      {error && (
        <div style={{
          border: '1px solid var(--red)',
          background: 'var(--red-dim)',
          borderRadius: 'var(--radius)',
          padding: '8px 10px',
          fontSize: 11,
          marginBottom: 10,
          color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      <section style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em' }}>GATEWAY</div>
          <button
            onClick={() => void loadGatewayStatus()}
            style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-2)',
              color: 'var(--text-1)',
              borderRadius: 'var(--radius)',
              padding: '3px 6px',
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={10} /> REFRESH
          </button>
        </div>

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-2)',
          padding: '8px 10px',
          display: 'grid',
          gap: 4,
          fontSize: 11,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Status</span>
            <span style={{ color: gatewayStatus?.status === 'ok' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase' }}>
              {gatewayStatus?.status || 'unknown'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Provider</span>
            <span style={{ color: 'var(--text-0)', textTransform: 'uppercase' }}>{gatewayStatus?.provider || gatewayStatus?.primary_provider || 'none'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Model</span>
            <span style={{ color: 'var(--text-1)' }}>{gatewayStatus?.model || '-'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Router</span>
            <span style={{ color: 'var(--text-1)' }}>{gatewayStatus?.router_mode || '-'} / {gatewayStatus?.router_strategy || '-'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Auth</span>
            <span style={{ color: gatewayStatus?.api_auth_enabled ? 'var(--yellow)' : 'var(--green)' }}>
              {gatewayStatus?.api_auth_enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Telemetry</span>
            <span style={{ color: gatewayStatus?.telemetry_disabled ? 'var(--yellow)' : 'var(--green)' }}>
              {gatewayStatus?.telemetry_disabled ? 'disabled' : 'enabled'}
            </span>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em' }}>ACTIVE PROVIDER</div>
          <button
            onClick={() => void loadStatus()}
            style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-2)',
              color: 'var(--text-1)',
              borderRadius: 'var(--radius)',
              padding: '3px 6px',
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={10} /> REFRESH
          </button>
        </div>

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-2)',
          padding: '8px 10px',
          display: 'grid',
          gap: 4,
          fontSize: 11,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Provider</span>
            <span style={{ color: 'var(--text-0)', textTransform: 'uppercase' }}>{activeProvider?.provider || 'none'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Model</span>
            <span style={{ color: 'var(--text-1)' }}>{activeProvider?.big_model || '-'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Latency</span>
            <span style={{ color: latencyColor(activeProvider?.latency_ms ?? null) }}>
              {activeProvider?.latency_ms == null ? '-' : `${Math.round(activeProvider.latency_ms)}ms`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Health</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: activeProvider?.healthy ? 'var(--green)' : 'var(--red)',
              fontSize: 10,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: activeProvider?.healthy ? 'var(--green)' : 'var(--red)',
                display: 'inline-block',
              }} />
              {activeProvider?.healthy ? 'HEALTHY' : 'UNHEALTHY'}
            </span>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em', marginBottom: 6 }}>QUICK SWITCH</div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-2)',
            padding: '8px 10px',
            display: 'grid',
            gap: 8,
          }}
        >
          <select
            value={effectiveSwitchProvider}
            onChange={(event) => {
              const provider = normalizeProviderName(event.target.value)
              const models = mergedModelCatalog[provider] || []
              setSwitchDraft({
                provider,
                model: models[0] || DEFAULT_MODEL_BY_PROVIDER[provider] || '',
              })
            }}
            style={{
              width: '100%',
              background: 'var(--bg-1)',
              color: 'var(--text-0)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '6px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {providerOptions.map((provider) => {
              const available = providerAvailability[provider]
              return (
                <option key={provider} value={provider}>
                  {available ? provider : `${provider} (not configured)`}
                </option>
              )
            })}
          </select>

          <select
            value={switchDraft.model}
            onChange={(event) => setSwitchDraft((prev) => ({ ...prev, model: event.target.value }))}
            style={{
              width: '100%',
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              color: 'var(--text-0)',
              borderRadius: 'var(--radius)',
              padding: '6px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {!switchDraft.model && switchModelOptions.length > 0 && (
              <option value="">Choose a model...</option>
            )}
            {switchModelOptions.length === 0 && (
              <option value="">(no discovered models)</option>
            )}
            {switchModelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>

          <button
            onClick={() => void loadDiscovery()}
            style={{
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              background: 'var(--bg-1)',
              borderRadius: 'var(--radius)',
              fontSize: 10,
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            Refresh Models
          </button>

          <button
            onClick={() => void applyQuickSwitch()}
            disabled={switching}
            style={{
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              background: 'var(--accent-dim)',
              borderRadius: 'var(--radius)',
              fontSize: 11,
              padding: '6px 8px',
              cursor: switching ? 'not-allowed' : 'pointer',
              opacity: switching ? 0.65 : 1,
            }}
          >
            {switching ? 'Switching...' : 'Switch Provider'}
          </button>

          <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
            Applies instantly and persists to backend settings. Existing session model is updated when available.
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em', marginBottom: 6 }}>OLLAMA SETUP</div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-2)',
            padding: '8px 10px',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 10 }}>
            <span style={{ color: 'var(--text-2)' }}>Status</span>
            <span style={{ color: ollamaSetup?.reachable ? 'var(--green)' : 'var(--yellow)' }}>
              {ollamaSetup?.reachable ? 'reachable' : 'not reachable'}
            </span>
          </div>

          <input
            value={ollamaBaseUrl}
            onChange={(event) => setOllamaBaseUrl(event.target.value)}
            placeholder="http://127.0.0.1:11434"
            style={{
              width: '100%',
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              color: 'var(--text-0)',
              borderRadius: 'var(--radius)',
              padding: '6px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          />

          <select
            value={ollamaModel}
            onChange={(event) => setOllamaModel(event.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              color: 'var(--text-0)',
              borderRadius: 'var(--radius)',
              padding: '6px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {ollamaModelOptions.length === 0 && (
              <option value="">(no models discovered)</option>
            )}
            {ollamaModelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => void loadOllamaSetupStatus()}
              disabled={ollamaSetupLoading}
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                background: 'var(--bg-1)',
                borderRadius: 'var(--radius)',
                fontSize: 10,
                padding: '4px 8px',
                cursor: ollamaSetupLoading ? 'not-allowed' : 'pointer',
                opacity: ollamaSetupLoading ? 0.65 : 1,
              }}
            >
              {ollamaSetupLoading ? 'Refreshing...' : 'Refresh'}
            </button>

            <button
              onClick={() => void runOllamaSetup()}
              disabled={ollamaSetupSaving}
              style={{
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                background: 'var(--accent-dim)',
                borderRadius: 'var(--radius)',
                fontSize: 10,
                padding: '4px 8px',
                cursor: ollamaSetupSaving ? 'not-allowed' : 'pointer',
                opacity: ollamaSetupSaving ? 0.65 : 1,
              }}
            >
              {ollamaSetupSaving ? 'Connecting...' : 'Connect Ollama'}
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
            Sets provider to Ollama, updates model, and persists settings for one-click local usage.
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em' }}>
          <Activity size={12} /> PROVIDERS
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {(status?.providers || []).map((row) => (
            <div key={row.provider} style={{ borderBottom: '1px solid var(--border)', padding: '8px 8px', background: 'var(--bg-2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-0)', textTransform: 'uppercase' }}>{row.provider}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{row.big_model}</div>
                  <div style={{ fontSize: 10, color: latencyColor(row.latency_ms), marginTop: 2 }}>
                    {row.latency_ms == null ? '-' : `${Math.round(row.latency_ms)}ms`} · errors {row.errors} · ${row.cost_per_1k ?? 0}/1k
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <button
                    onClick={() => void setActiveFromProvider(row)}
                    style={{
                      border: '1px solid var(--accent)',
                      color: 'var(--accent)',
                      background: 'var(--accent-dim)',
                      borderRadius: 'var(--radius)',
                      fontSize: 10,
                      padding: '3px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    Set Active
                  </button>
                  <button
                    onClick={() => void pingProvider(row.provider)}
                    style={{
                      border: '1px solid var(--border)',
                      color: 'var(--text-1)',
                      background: 'var(--bg-1)',
                      borderRadius: 'var(--radius)',
                      fontSize: 10,
                      padding: '3px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    Ping Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em' }}>
            <ShieldCheck size={12} /> PROFILES
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              background: 'var(--accent-dim)',
              borderRadius: 'var(--radius)',
              fontSize: 10,
              padding: '3px 6px',
              cursor: 'pointer',
            }}
          >
            New Profile
          </button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {profiles.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-2)' }}>
              No saved profiles.
            </div>
          )}
          {profiles.map((profile) => {
            const active = activeProfile?.name && profile.name && activeProfile.name === profile.name
            return (
              <div key={profile.name || `${profile.provider}-${profile.model}`} style={{ borderBottom: '1px solid var(--border)', padding: '8px 8px', background: active ? 'var(--bg-3)' : 'var(--bg-2)' }}>
                <div style={{ fontSize: 11, color: active ? 'var(--accent)' : 'var(--text-0)' }}>{profile.name || '(unnamed)'}</div>
                <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{profile.provider} / {profile.model}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    onClick={() => profile.name && void activateProfile(profile.name)}
                    style={{
                      border: '1px solid var(--border)',
                      color: 'var(--text-1)',
                      background: 'var(--bg-1)',
                      borderRadius: 'var(--radius)',
                      fontSize: 10,
                      padding: '3px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    Activate
                  </button>
                  <button
                    onClick={() => profile.name && void deleteProfile(profile.name)}
                    style={{
                      border: '1px solid var(--red)',
                      color: 'var(--red)',
                      background: 'var(--red-dim)',
                      borderRadius: 'var(--radius)',
                      fontSize: 10,
                      padding: '3px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em', marginBottom: 6 }}>ROUTER STRATEGY</div>
        <select
          value={strategyDraft}
          onChange={(e) => void setRouterStrategy(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-2)',
            color: 'var(--text-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '6px 8px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {ROUTER_STRATEGIES.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em' }}>
            <Stethoscope size={12} /> DOCTOR
          </div>
          <button
            onClick={() => void runDoctor()}
            disabled={loading}
            style={{
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              background: 'var(--bg-2)',
              borderRadius: 'var(--radius)',
              fontSize: 10,
              padding: '3px 6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Running...' : 'Run Health Check'}
          </button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {checks.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-2)' }}>
              No checks run yet.
            </div>
          )}
          {checks.map((check) => (
            <div key={check.name} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
              <div style={{
                fontSize: 11,
                color: check.passed ? 'var(--green)' : 'var(--red)',
              }}>
                {check.passed ? 'PASS' : 'FAIL'} · {check.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-1)', marginTop: 2 }}>{check.message}</div>
              {!check.passed && check.fix && (
                <div style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 2 }}>Fix: {check.fix}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em', marginBottom: 6 }}>WEBHOOKS</div>

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-2)',
          padding: 8,
          display: 'grid',
          gap: 8,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6, alignItems: 'stretch' }}>
            <input
              value={webhookUrl}
              readOnly
              style={{
                minWidth: 0,
                background: 'var(--bg-0)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                borderRadius: 'var(--radius)',
                padding: '6px 8px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                lineHeight: '16px',
              }}
            />
            <button
              onClick={() => void copyWebhookUrl()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border)',
                background: 'var(--bg-1)',
                color: copiedWebhook ? 'var(--green)' : 'var(--text-1)',
                borderRadius: 'var(--radius)',
                fontSize: 10,
                padding: '6px 8px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                minWidth: 62,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {copiedWebhook ? 'COPIED' : 'COPY'}
            </button>
          </div>

          {webhookError ? (
            <div style={{ fontSize: 10, color: 'var(--yellow)' }}>{webhookError}</div>
          ) : (
            <div style={{ maxHeight: 120, overflowY: 'auto', display: 'grid', gap: 4 }}>
              {webhookEvents.length === 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-2)' }}>No webhook events yet.</div>
              )}
              {webhookEvents.map((event, idx) => (
                <div key={`${event.task_id}-${idx}`} style={{
                  fontSize: 10,
                  color: 'var(--text-1)',
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '4px 6px',
                  background: 'var(--bg-1)',
                }}>
                  {event.event_type} - {event.task_id} - {event.queued_at}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
          padding: 16,
        }}>
          <div style={{
            width: 'min(420px, 100%)',
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 12,
            display: 'grid',
            gap: 8,
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-0)', fontWeight: 700 }}>Create Profile</div>
            {['name', 'provider', 'model', 'goal', 'base_url', 'api_key'].map((field) => (
              <input
                key={field}
                placeholder={field}
                value={(newProfile as Record<string, string>)[field]}
                onChange={(e) => setNewProfile((prev) => ({ ...prev, [field]: e.target.value }))}
                style={{
                  width: '100%',
                  background: 'var(--bg-0)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-0)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 8px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              />
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => void createProfile()}
                style={{
                  flex: 1,
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Save
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1,
                  border: '1px solid var(--border)',
                  color: 'var(--text-1)',
                  background: 'var(--bg-2)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
