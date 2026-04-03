import { useEffect, useMemo, useState } from 'react'
import { Activity, RefreshCw, ShieldCheck, Stethoscope } from 'lucide-react'
import { buildApiHeaders, parseApiError } from '../lib/api'

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

const ROUTER_STRATEGIES = ['latency', 'cost', 'balanced', 'quality']

function latencyColor(latency: number | null): string {
  if (latency === null) return 'var(--text-2)'
  if (latency < 500) return 'var(--green)'
  if (latency < 2000) return 'var(--yellow)'
  return 'var(--red)'
}

export function ProviderPanel() {
  const [status, setStatus] = useState<ProvidersStatusResponse | null>(null)
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<ProviderProfile | null>(null)
  const [checks, setChecks] = useState<DoctorCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [strategyDraft, setStrategyDraft] = useState('balanced')
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
    return rows.find((row) => row.healthy) || rows[0] || null
  }, [status])

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/providers/status', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const payload = (await res.json()) as ProvidersStatusResponse
      setStatus(payload)
      setStrategyDraft(payload.strategy || 'balanced')
    } catch (e) {
      setError(String(e))
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
    const name = `quick-${row.provider}`
    try {
      const saveRes = await fetch('/api/profiles', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name,
          provider: row.provider,
          model: row.big_model || row.small_model,
          goal: 'balanced',
          base_url: null,
          api_key: null,
        }),
      })
      if (!saveRes.ok) throw new Error(await parseApiError(saveRes))

      const activateRes = await fetch(`/api/profiles/${encodeURIComponent(name)}/activate`, {
        method: 'POST',
        headers: buildApiHeaders(),
      })
      if (!activateRes.ok) throw new Error(await parseApiError(activateRes))

      await loadProfiles()
    } catch (e) {
      setError(String(e))
    }
  }

  const activateProfile = async (name: string) => {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(name)}/activate`, {
        method: 'POST',
        headers: buildApiHeaders(),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      await loadProfiles()
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
    void loadStatus()
    void loadProfiles()
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
