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
  'nvidia',
  // Local CLI providers
  'claude-cli',
  'codex-cli',
  'gemini-cli',
  'copilot-cli',
]

const CLI_PROVIDER_LABELS: Record<string, string> = {
  'claude-cli': 'Claude CLI / VS Code',
  'codex-cli': 'Codex CLI / VS Code',
  'gemini-cli': 'Gemini CLI / VS Code',
  'copilot-cli': 'GitHub Copilot CLI / VS Code',
}

const PROVIDER_LABELS: Record<string, string> = {
  ...CLI_PROVIDER_LABELS,
  codex: 'Codex API',
  gemini: 'Gemini API',
  'github-models': 'GitHub Models',
  'atomic-chat': 'Atomic Chat',
}

const API_TO_CLI_FALLBACKS: Record<string, string> = {
  codex: 'codex-cli',
  gemini: 'gemini-cli',
}

const CLI_PROVIDERS = new Set(['claude-cli', 'codex-cli', 'gemini-cli', 'copilot-cli'])

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
  nvidia: 'meta/llama-3.1-8b-instruct',
  'claude-cli': 'default',
  'codex-cli': 'default',
  'gemini-cli': 'default',
  'copilot-cli': 'default',
}

type CliProviderStatus = {
  available: boolean
  exe?: string
  candidates?: string[]
  env_path?: string
  path: string | null
  message?: string
  extension?: {
    installed: boolean
    ids: string[]
    paths: string[]
    runnable: boolean
    runnable_paths: string[]
    bundled_path?: string | null
    note?: string | null
  }
}

type ProvidersDiscoveryResponse = {
  providers: Record<string, boolean>
  models: Record<string, string[]>
  key_status: Record<string, boolean>
}

type CliModelsResponse = {
  models: Record<string, string[]>
}

type ProviderSwitchResponse = {
  provider: string
  model: string
  router_mode: string
  profile: string
  persisted: boolean
}

type ProviderSwitchPayload = {
  provider: string
  model: string
  profile: string
}

type OllamaSetupStatusResponse = {
  base_url: string
  configured: boolean
  api_key_configured?: boolean
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

type NvidiaSetupStatusResponse = {
  configured: boolean
  models: string[]
  recommended_model: string | null
  active_model?: string | null
}

type NvidiaSetupResponse = NvidiaSetupStatusResponse & {
  provider: string
  model: string
  profile: string
  persisted: boolean
}

function normalizeProviderName(value: string): string {
  const normalized = String(value || '').trim().toLowerCase().replace('_', '-')
  return normalized === 'atomicchat' ? 'atomic-chat' : normalized
}

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] || provider
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)))
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
  const [cliStatus, setCliStatus] = useState<Record<string, CliProviderStatus>>({})
  const [ollamaSetup, setOllamaSetup] = useState<OllamaSetupStatusResponse | null>(null)
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://127.0.0.1:11434')
  const [ollamaApiKey, setOllamaApiKey] = useState('')
  const [ollamaMode, setOllamaMode] = useState<'local' | 'cloud'>('local')
  const [ollamaModel, setOllamaModel] = useState('')
  const [ollamaSetupLoading, setOllamaSetupLoading] = useState(false)
  const [ollamaSetupSaving, setOllamaSetupSaving] = useState(false)
  const [nvidiaSetup, setNvidiaSetup] = useState<NvidiaSetupStatusResponse | null>(null)
  const [nvidiaApiKey, setNvidiaApiKey] = useState('')
  const [nvidiaModel, setNvidiaModel] = useState('')
  const [nvidiaSetupLoading, setNvidiaSetupLoading] = useState(false)
  const [nvidiaSetupSaving, setNvidiaSetupSaving] = useState(false)
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
    return uniqueStrings(modelOptions)
  }, [modelOptions])

  const ollamaModelOptions = useMemo(() => {
    const models = Array.isArray(ollamaSetup?.models) ? ollamaSetup.models : []
    const current = String(ollamaModel || '').trim()
    return uniqueStrings(current ? [current, ...models] : models)
  }, [ollamaModel, ollamaSetup])

  const nvidiaModelOptions = useMemo(() => {
    const models = Array.isArray(nvidiaSetup?.models) ? nvidiaSetup.models : []
    const current = String(nvidiaModel || '').trim()
    return uniqueStrings(current ? [current, ...models] : models)
  }, [nvidiaModel, nvidiaSetup])

  const webhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/api/webhooks/trigger'
    return `${window.location.origin}/api/webhooks/trigger`
  }, [])

  const resolveSwitchProvider = (provider: string): string => {
    const normalized = normalizeProviderName(provider)
    const fallback = API_TO_CLI_FALLBACKS[normalized]
    if (fallback && !providerAvailability[normalized] && providerAvailability[fallback]) {
      return fallback
    }
    return normalized
  }

  const applySwitchPayload = (payload: ProviderSwitchPayload) => {
    setSwitchDraft({ provider: payload.provider, model: payload.model })
    setActiveProfile({
      provider: payload.provider,
      model: payload.model,
      base_url: null,
      api_key: null,
      goal: 'balanced',
      created_at: new Date().toISOString(),
      name: payload.profile,
    })
    setStatus((prev) => prev ? {
      ...prev,
      providers: [{
        provider: payload.provider,
        healthy: true,
        configured: true,
        latency_ms: null,
        errors: 0,
        requests: 0,
        error_rate: 0,
        cost_per_1k: null,
        big_model: payload.model,
        small_model: payload.model,
      }],
    } : prev)
  }

  const loadCliStatus = async () => {
    try {
      const res = await fetch('/api/providers/cli-status', { headers: buildApiHeaders() })
      if (!res.ok) return
      const payload = await res.json() as { cli_providers?: Record<string, CliProviderStatus> }
      const rows = payload.cli_providers || {}
      setCliStatus(rows)

      const nextAvailability: Record<string, boolean> = {}
      for (const provider of CLI_PROVIDERS) {
        nextAvailability[provider] = Boolean(rows[provider]?.available)
      }
      setProviderAvailability((prev) => ({ ...prev, ...nextAvailability }))
    } catch {
      /* CLI status is advisory; provider switching still returns a backend error if unavailable. */
    }
  }

  const loadCliModels = async () => {
    try {
      const res = await fetch('/api/providers/cli-models', { headers: buildApiHeaders() })
      if (!res.ok) return
      const payload = (await res.json()) as CliModelsResponse
      const next: Record<string, string[]> = {}
      for (const [provider, models] of Object.entries(payload.models || {})) {
        next[normalizeProviderName(provider)] = uniqueStrings((models || []).map((model) => String(model || '').trim()))
      }
      setModelCatalog((prev) => ({ ...prev, ...next }))
    } catch {
      /* CLI model discovery is best-effort. */
    }
  }

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
      setModelCatalog((prev) => ({ ...prev, ...discoveredModels }))

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
      nextAvailability['nvidia'] = Boolean((keys as Record<string, boolean>).nvidia)

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
      if (payload.api_key_configured && !payload.configured) {
        setOllamaMode('cloud')
      }

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
          base_url: ollamaMode === 'cloud' ? (ollamaBaseUrl.trim() || null) : (ollamaBaseUrl.trim() || null),
          api_key: ollamaApiKey.trim() || null,
          model: ollamaModel.trim() || null,
          session_id: sessionId || null,
          persist: true,
        }),
      })
      if (!response.ok) throw new Error(await parseApiError(response))

      const payload = (await response.json()) as OllamaSetupResponse
      applySwitchPayload(payload)

      await Promise.all([
        loadStatus(),
        loadProfiles(),
        loadDiscovery(),
        loadCliStatus(),
        loadOllamaSetupStatus(),
      ])
    } catch (e) {
      setError(String(e))
    } finally {
      setOllamaSetupSaving(false)
    }
  }

  const loadNvidiaSetupStatus = async () => {
    setNvidiaSetupLoading(true)
    try {
      const res = await fetch('/api/providers/nvidia/setup', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = (await res.json()) as NvidiaSetupStatusResponse
      setNvidiaSetup(payload)

      const models = Array.isArray(payload.models) ? payload.models : []
      const preferred = payload.active_model || payload.recommended_model || models[0] || ''
      setNvidiaModel(String(preferred || ''))
      setModelCatalog((prev) => ({
        ...prev,
        nvidia: Array.from(new Set([...models, String(preferred || '')].map((item) => item.trim()).filter(Boolean))),
      }))
      setProviderAvailability((prev) => ({ ...prev, nvidia: payload.configured }))
    } catch (e) {
      setError(String(e))
    } finally {
      setNvidiaSetupLoading(false)
    }
  }

  const runNvidiaSetup = async () => {
    setNvidiaSetupSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/providers/nvidia/setup', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          api_key: nvidiaApiKey.trim() || null,
          model: nvidiaModel.trim() || null,
          session_id: sessionId || null,
          persist: true,
        }),
      })
      if (!response.ok) throw new Error(await parseApiError(response))

      const payload = (await response.json()) as NvidiaSetupResponse
      applySwitchPayload(payload)
      setNvidiaApiKey('')

      await Promise.all([
        loadStatus(),
        loadProfiles(),
        loadDiscovery(),
        loadCliStatus(),
        loadNvidiaSetupStatus(),
      ])
    } catch (e) {
      setError(String(e))
    } finally {
      setNvidiaSetupSaving(false)
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
      applySwitchPayload(payload)
      await Promise.all([loadStatus(), loadProfiles(), loadDiscovery(), loadCliStatus()])
    } catch (e) {
      setError(String(e))
    }
  }

  const applyQuickSwitch = async () => {
    const selectedProvider = normalizeProviderName(effectiveSwitchProvider)
    const provider = resolveSwitchProvider(selectedProvider)
    if (!provider) {
      setError('Choose a provider to switch.')
      return
    }

    const fallbackProviderModels = mergedModelCatalog[provider] || []
    const model = provider !== selectedProvider
      ? fallbackProviderModels[0] || DEFAULT_MODEL_BY_PROVIDER[provider] || null
      : switchDraft.model.trim() || modelOptions[0] || null

    setSwitching(true)
    setError(null)
    try {
      const response = await fetch('/api/providers/switch', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          provider,
          model,
          session_id: sessionId || null,
          persist: true,
        }),
      })
      if (!response.ok) throw new Error(await parseApiError(response))

      const payload = (await response.json()) as ProviderSwitchResponse
      applySwitchPayload(payload)
      await Promise.all([loadStatus(), loadProfiles(), loadDiscovery(), loadCliStatus()])
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
      await Promise.all([loadProfiles(), loadStatus(), loadDiscovery(), loadCliStatus()])
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
    void loadCliStatus()
    void loadCliModels()
    void loadProfiles()
    void loadOllamaSetupStatus()
    void loadNvidiaSetupStatus()
    void loadWebhookEvents()
    void loadOpenRouterModels()
  }, [])

  useEffect(() => {
    const fallbackModel = switchModelOptions[0] || DEFAULT_MODEL_BY_PROVIDER[effectiveSwitchProvider] || ''
    setSwitchDraft((prev) => {
      const currentProvider = normalizeProviderName(prev.provider || effectiveSwitchProvider)
      const providerChanged = currentProvider !== effectiveSwitchProvider
      const currentModel = String(prev.model || '').trim()
      const modelValid = Boolean(currentModel) && switchModelOptions.includes(currentModel)
      const nextModel = modelValid ? currentModel : fallbackModel
      const nextProvider = effectiveSwitchProvider

      if (!providerChanged && prev.provider === nextProvider && currentModel === nextModel) {
        return prev
      }

      return {
        provider: nextProvider,
        model: nextModel,
      }
    })
  }, [effectiveSwitchProvider, switchModelOptions])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadGatewayStatus()
      void loadStatus()
      void loadDiscovery()
      void loadCliStatus()
      void loadProfiles()
      void loadOllamaSetupStatus()
      void loadNvidiaSetupStatus()
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
              const fallback = API_TO_CLI_FALLBACKS[provider]
              const usesLocalFallback = Boolean(fallback && !available && providerAvailability[fallback])
              const label = providerLabel(provider)
              return (
                <option key={provider} value={provider}>
                  {available ? label : usesLocalFallback ? `${label} -> ${providerLabel(fallback)}` : `${label} (not configured)`}
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
            onClick={() => {
              void loadDiscovery()
              void loadCliStatus()
              void loadCliModels()
            }}
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

          <div style={{ display: 'grid', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 7 }}>
            {Array.from(CLI_PROVIDERS).map((provider) => {
              const row = cliStatus[provider]
              const available = Boolean(row?.available)
              const extensionInstalled = Boolean(row?.extension?.installed)
              const statusLabel = available ? 'READY' : extensionInstalled ? 'EXTENSION' : 'MISSING'
              const statusColor = available ? 'var(--green)' : extensionInstalled ? 'var(--yellow)' : 'var(--text-2)'
              const detail = row?.path || row?.message || 'Not detected yet.'
              return (
                <div key={provider} style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 8,
                  alignItems: 'start',
                  fontSize: 10,
                }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ color: 'var(--text-1)', display: 'block' }}>
                      {CLI_PROVIDER_LABELS[provider]}
                    </span>
                    <span style={{
                      color: 'var(--text-2)',
                      display: 'block',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {detail}
                    </span>
                  </span>
                  <span style={{ color: statusColor, fontFamily: 'var(--font-mono)' }}>
                    {statusLabel}
                  </span>
                </div>
              )
            })}
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
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-1)', borderRadius: 'var(--radius)', padding: 3 }}>
            {(['local', 'cloud'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setOllamaMode(m)}
                style={{
                  flex: 1,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  padding: '3px 0',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  background: ollamaMode === m ? 'var(--accent)' : 'transparent',
                  color: ollamaMode === m ? '#fff' : 'var(--text-2)',
                  letterSpacing: '0.06em',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {m === 'local' ? 'LOCAL' : 'CLOUD / API KEY'}
              </button>
            ))}
          </div>

          {/* Status row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 10 }}>
            <span style={{ color: 'var(--text-2)' }}>
              {ollamaMode === 'local' ? 'Status' : 'API key'}
            </span>
            <span style={{
              color: ollamaMode === 'local'
                ? (ollamaSetup?.reachable ? 'var(--green)' : 'var(--yellow)')
                : (ollamaSetup?.api_key_configured ? 'var(--green)' : 'var(--text-2)'),
            }}>
              {ollamaMode === 'local'
                ? (ollamaSetup?.reachable ? 'reachable' : 'not reachable')
                : (ollamaSetup?.api_key_configured ? 'configured' : 'not set')}
            </span>
          </div>

          {/* Local mode: base URL input */}
          {ollamaMode === 'local' && (
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
          )}

          {/* Cloud mode: API key + optional base URL */}
          {ollamaMode === 'cloud' && (
            <>
              <input
                type="password"
                value={ollamaApiKey}
                onChange={(event) => setOllamaApiKey(event.target.value)}
                placeholder="API key (e.g. sk-...)"
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
              <input
                value={ollamaBaseUrl}
                onChange={(event) => setOllamaBaseUrl(event.target.value)}
                placeholder="Base URL (e.g. https://ollama.example.com)"
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
            </>
          )}

          {/* Model select (local: dropdown, cloud: text input) */}
          {ollamaMode === 'local' ? (
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
          ) : (
            <input
              value={ollamaModel}
              onChange={(event) => setOllamaModel(event.target.value)}
              placeholder="Model name (e.g. llama3, mistral)"
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
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            {ollamaMode === 'local' && (
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
            )}

            <button
              onClick={() => void runOllamaSetup()}
              disabled={ollamaSetupSaving}
              style={{
                flex: 1,
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
            {ollamaMode === 'local'
              ? 'Local: run Ollama in background and connect via base URL.'
              : 'Cloud: connect to a hosted Ollama-compatible endpoint using an API key.'}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.1em', marginBottom: 6 }}>NVIDIA SETUP</div>
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
            <span style={{ color: nvidiaSetup?.configured ? 'var(--green)' : 'var(--yellow)' }}>
              {nvidiaSetup?.configured ? 'configured' : 'not configured'}
            </span>
          </div>

          <input
            type="password"
            value={nvidiaApiKey}
            onChange={(event) => setNvidiaApiKey(event.target.value)}
            placeholder="NVIDIA_API_KEY (nvapi-...)"
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
            value={nvidiaModel}
            onChange={(event) => setNvidiaModel(event.target.value)}
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
            {nvidiaModelOptions.length === 0 && (
              <option value="">(no models discovered)</option>
            )}
            {nvidiaModelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => void loadNvidiaSetupStatus()}
              disabled={nvidiaSetupLoading}
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                background: 'var(--bg-1)',
                borderRadius: 'var(--radius)',
                fontSize: 10,
                padding: '4px 8px',
                cursor: nvidiaSetupLoading ? 'not-allowed' : 'pointer',
                opacity: nvidiaSetupLoading ? 0.65 : 1,
              }}
            >
              {nvidiaSetupLoading ? 'Refreshing...' : 'Refresh'}
            </button>

            <button
              onClick={() => void runNvidiaSetup()}
              disabled={nvidiaSetupSaving}
              style={{
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                background: 'var(--accent-dim)',
                borderRadius: 'var(--radius)',
                fontSize: 10,
                padding: '4px 8px',
                cursor: nvidiaSetupSaving ? 'not-allowed' : 'pointer',
                opacity: nvidiaSetupSaving ? 0.65 : 1,
              }}
            >
              {nvidiaSetupSaving ? 'Connecting...' : 'Connect Nvidia'}
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
            Sets provider to NVIDIA, updates model, and persists settings for AI chat and coding.
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
