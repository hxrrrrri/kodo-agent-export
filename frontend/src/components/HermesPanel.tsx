/**
 * HermesPanel — hermes-inspired features in Kodo:
 *   1. LLM-powered session search
 *   2. Create skill from session
 *   3. User profile viewer + inference
 */
import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Brain, Search, Sparkles, User, Zap, Save, CheckCircle, X, Wrench, FileText } from 'lucide-react'
import { buildApiHeaders } from '../lib/api'
import { useChatStore } from '../store/chatStore'

type Tab = 'search' | 'profile' | 'skill' | 'identity' | 'catalog' | 'context'

interface SearchResult {
  session_id: string
  title: string
  updated_at: string
  message_count: number
  relevance: string
  summary: string
}

interface UserProfile {
  traits: Record<string, string>
  preferences: Record<string, string>
  notes: string[]
  interaction_count: number
  last_updated: string
}

export function HermesPanel({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('search')
  const sessionId = useChatStore((s) => s.sessionId)
  const sessions = useChatStore((s) => s.sessions)

  // Search state
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchError, setSearchError] = useState('')

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [inferring, setInferring] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  // Skill creation state
  const [skillName, setSkillName] = useState('')
  const [skillDesc, setSkillDesc] = useState('')
  const [skillSession, setSkillSession] = useState(sessionId || '')
  const [creatingSkill, setCreatingSkill] = useState(false)
  const [skillResult, setSkillResult] = useState('')

  // Identity state
  const [soulContent, setSoulContent] = useState('')
  const [memoryContent, setMemoryContent] = useState('')
  const [loadingIdentity, setLoadingIdentity] = useState(false)
  const [savingSoul, setSavingSoul] = useState(false)
  const [savingMemory, setSavingMemory] = useState(false)

  // Catalog + context state
  const [catalog, setCatalog] = useState<{ tools?: any; models?: any; insights?: any }>({})
  const [contextFiles, setContextFiles] = useState<Array<{ name: string; size: number; updated_at: number }>>([])
  const [contextName, setContextName] = useState('project.md')
  const [contextContent, setContextContent] = useState('')
  const [contextMsg, setContextMsg] = useState('')

  const loadCatalog = useCallback(async () => {
    try {
      const [toolsRes, modelsRes, insightsRes] = await Promise.all([
        fetch('/api/hermes/tools', { headers: buildApiHeaders() }),
        fetch('/api/hermes/models', { headers: buildApiHeaders() }),
        fetch('/api/hermes/insights', { headers: buildApiHeaders() }),
      ])
      setCatalog({
        tools: toolsRes.ok ? await toolsRes.json() : null,
        models: modelsRes.ok ? await modelsRes.json() : null,
        insights: insightsRes.ok ? await insightsRes.json() : null,
      })
    } catch { /* ignore */ }
  }, [])

  const loadContextFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/context-files', { headers: buildApiHeaders() })
      if (res.ok) {
        const data = await res.json()
        setContextFiles(data.files || [])
      }
    } catch { /* ignore */ }
  }, [])

  const saveContextFile = useCallback(async () => {
    setContextMsg('')
    try {
      const res = await fetch('/api/hermes/context-files', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: contextName, content: contextContent }),
      })
      if (!res.ok) throw new Error(await res.text())
      setContextMsg('Context file saved.')
      await loadContextFiles()
    } catch (e) {
      setContextMsg(`Error: ${(e as Error).message}`)
    }
  }, [contextName, contextContent, loadContextFiles])

  const loadIdentity = useCallback(async () => {
    setLoadingIdentity(true)
    try {
      const [soulRes, memRes] = await Promise.all([
        fetch('/api/hermes/soul', { headers: buildApiHeaders() }),
        fetch('/api/hermes/memory', { headers: buildApiHeaders() }),
      ])
      if (soulRes.ok) {
        const soulData = await soulRes.json()
        setSoulContent(soulData.content || '')
      }
      if (memRes.ok) {
        const memData = await memRes.json()
        setMemoryContent(memData.content || '')
      }
    } catch { /* ignore */ }
    setLoadingIdentity(false)
  }, [])

  const saveSoul = useCallback(async () => {
    setSavingSoul(true)
    try {
      await fetch('/api/hermes/soul', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: soulContent })
      })
      setTimeout(() => setSavingSoul(false), 1000)
    } catch { setSavingSoul(false) }
  }, [soulContent])

  const saveMemory = useCallback(async () => {
    setSavingMemory(true)
    try {
      await fetch('/api/hermes/memory', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: memoryContent })
      })
      setTimeout(() => setSavingMemory(false), 1000)
    } catch { setSavingMemory(false) }
  }, [memoryContent])

  useEffect(() => {
    setSkillSession(sessionId || '')
  }, [sessionId])

  useEffect(() => {
    if (tab === 'identity') void loadIdentity()
  }, [tab, loadIdentity])

  useEffect(() => {
    if (tab === 'catalog') void loadCatalog()
    if (tab === 'context') void loadContextFiles()
  }, [tab, loadCatalog, loadContextFiles])

  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    setResults([])
    try {
      const res = await fetch('/api/hermes/search', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query: query.trim(), limit: 8, use_llm_ranking: true }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`Search failed: ${res.status} ${t}`)
      }
      const data = await res.json() as { results: SearchResult[] }
      setResults(data.results || [])
    } catch (e) {
      setSearchError((e as Error).message)
    } finally {
      setSearching(false)
    }
  }, [query])

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/profile', { headers: buildApiHeaders() })
      if (res.ok) setProfile(await res.json() as UserProfile)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (tab === 'profile') void loadProfile()
  }, [tab, loadProfile])

  const inferProfile = useCallback(async () => {
    if (!sessionId) return
    setInferring(true)
    setProfileMsg('')
    try {
      const res = await fetch('/api/hermes/profile/infer', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session_id: sessionId }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { updated: boolean; profile?: UserProfile }
      if (data.profile) setProfile(data.profile)
      setProfileMsg(data.updated ? 'Profile updated from session.' : 'No new insights found.')
    } catch (e) {
      setProfileMsg(`Error: ${(e as Error).message}`)
    } finally {
      setInferring(false)
    }
  }, [sessionId])

  const createSkill = useCallback(async () => {
    if (!skillName.trim() || !skillSession.trim()) return
    setCreatingSkill(true)
    setSkillResult('')
    try {
      const res = await fetch('/api/hermes/create-skill', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          session_id: skillSession.trim(),
          skill_name: skillName.trim().toLowerCase().replace(/\s+/g, '-'),
          description: skillDesc.trim(),
          auto_generate: true,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { skill_name: string }
      setSkillResult(`Skill "${data.skill_name}" created and saved.`)
      setSkillName('')
      setSkillDesc('')
    } catch (e) {
      setSkillResult(`Error: ${(e as Error).message}`)
    } finally {
      setCreatingSkill(false)
    }
  }, [skillName, skillDesc, skillSession])

  const TABS = [
    { id: 'search' as Tab, icon: <Search size={11} />, label: 'SEARCH' },
    { id: 'profile' as Tab, icon: <User size={11} />, label: 'PROFILE' },
    { id: 'skill' as Tab, icon: <Sparkles size={11} />, label: 'SKILLS' },
    { id: 'identity' as Tab, icon: <Brain size={11} />, label: 'IDENTITY' },
    { id: 'catalog' as Tab, icon: <Wrench size={11} />, label: 'CATALOG' },
    { id: 'context' as Tab, icon: <FileText size={11} />, label: 'CONTEXT' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Brain size={14} color="var(--blue)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>
            HERMES
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            search · profile · skills
          </span>
          {onClose && (
            <button
              onClick={onClose}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(({ id, icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                background: tab === id ? 'var(--blue-dim)' : 'var(--bg-2)',
                border: `1px solid ${tab === id ? 'var(--blue)' : 'var(--border)'}`,
                color: tab === id ? 'var(--blue)' : 'var(--text-2)',
                borderRadius: 8,
                padding: '4px 0',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>

        {/* ── SEARCH TAB ── */}
        {tab === 'search' && (
          <div>
            <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              Search past sessions using natural language. LLM re-ranks results for relevance.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void doSearch() }}
                placeholder="e.g. 'authentication bug fix last week'"
                style={{
                  flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-0)', fontSize: 12,
                  padding: '7px 10px', outline: 'none', fontFamily: 'var(--font-mono)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--blue)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
              <button
                type="button"
                onClick={() => void doSearch()}
                disabled={searching || !query.trim()}
                style={{
                  background: 'var(--blue-dim)', border: '1px solid var(--blue)',
                  color: 'var(--blue)', borderRadius: 8, padding: '6px 12px',
                  cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
                  fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Search size={11} /> {searching ? '...' : 'GO'}
              </button>
            </div>

            {searchError && (
              <div style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                {searchError}
              </div>
            )}

            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map((r) => (
                  <div key={r.session_id} style={{
                    background: 'var(--bg-2)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-0)' }}>{r.title || r.session_id.slice(0, 12)}</span>
                      <span style={{
                        fontSize: 9, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 6,
                        background: r.relevance === 'High' ? 'var(--green-dim)' : 'var(--blue-dim)',
                        color: r.relevance === 'High' ? 'var(--green)' : 'var(--blue)',
                        border: `1px solid ${r.relevance === 'High' ? 'var(--green)' : 'var(--blue)'}`,
                      }}>
                        {r.relevance}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-1)', marginBottom: 4, lineHeight: 1.5 }}>
                      {r.summary}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                      {r.message_count} messages · {r.session_id.slice(0, 8)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!searching && results.length === 0 && query && (
              <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: 'var(--text-2)' }}>
                No matching sessions found for "{query}"
              </div>
            )}

            {!query && (
              <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: 'var(--text-2)' }}>
                <Search size={28} style={{ opacity: 0.15, display: 'block', margin: '0 auto 8px' }} />
                Enter a natural language query to search your past sessions.<br />
                LLM ranks results by relevance.
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <div>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                Persistent user model. LLM infers from your sessions.
              </div>
              <button
                type="button"
                onClick={() => void inferProfile()}
                disabled={inferring || !sessionId}
                style={{
                  background: 'var(--blue-dim)', border: '1px solid var(--blue)',
                  color: 'var(--blue)', borderRadius: 7, padding: '4px 10px',
                  cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Zap size={10} /> {inferring ? 'Inferring...' : 'INFER FROM SESSION'}
              </button>
            </div>

            {profileMsg && (
              <div style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                {profileMsg}
              </div>
            )}

            {profile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Section title="Traits" data={profile.traits} color="var(--accent)" />
                <Section title="Preferences" data={profile.preferences} color="var(--blue)" />
                {profile.notes && profile.notes.length > 0 && (
                  <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.08em' }}>NOTES</div>
                    {profile.notes.slice(-5).map((n, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--text-1)', marginBottom: 3, lineHeight: 1.4 }}>· {n}</div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                  {profile.interaction_count} interactions · last updated: {profile.last_updated ? profile.last_updated.slice(0, 10) : 'never'}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: 'var(--text-2)' }}>
                <User size={28} style={{ opacity: 0.15, display: 'block', margin: '0 auto 8px' }} />
                No profile yet. Click "Infer from session" to start building your user model.
              </div>
            )}
          </div>
        )}

        {/* ── SKILL TAB ── */}
        {tab === 'skill' && (
          <div>
            <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              Extract a reusable skill from any session. LLM distills the workflow into a prompt.
            </div>

            <label style={{ display: 'block', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>SKILL NAME</span>
              <input
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="e.g. auth-bug-fixer"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = 'var(--blue)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>DESCRIPTION</span>
              <input
                value={skillDesc}
                onChange={(e) => setSkillDesc(e.target.value)}
                placeholder="What does this skill do?"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = 'var(--blue)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>SOURCE SESSION</span>
              <select
                value={skillSession}
                onChange={(e) => setSkillSession(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.title || s.session_id.slice(0, 12)} ({s.message_count} msgs)
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void createSkill()}
              disabled={creatingSkill || !skillName.trim() || !skillSession}
              style={{
                width: '100%',
                background: 'var(--blue-dim)', border: '1px solid var(--blue)',
                color: 'var(--blue)', borderRadius: 8, padding: '8px 14px',
                cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)',
                fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <BookOpen size={12} /> {creatingSkill ? 'Creating...' : 'CREATE SKILL FROM SESSION'}
            </button>

            {skillResult && (
              <div style={{ marginTop: 10, fontSize: 11, color: skillResult.startsWith('Error') ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                {skillResult}
              </div>
            )}
          </div>
        )}

        {/* ── IDENTITY TAB ── */}
        {tab === 'identity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              Manage your agent's Persona (SOUL) and Global Memory. These files are injected into every session.
            </div>

            {loadingIdentity ? (
              <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', padding: 20 }}>Loading...</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>SOUL.md (Persona)</span>
                    <button
                      onClick={() => void saveSoul()}
                      style={{
                        background: 'transparent', border: 'none', color: savingSoul ? 'var(--green)' : 'var(--blue)',
                        cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, padding: 0
                      }}
                    >
                      {savingSoul ? <CheckCircle size={12} /> : <Save size={12} />} {savingSoul ? 'Saved' : 'Save'}
                    </button>
                  </div>
                  <textarea
                    value={soulContent}
                    onChange={e => setSoulContent(e.target.value)}
                    style={{
                      ...inputStyle,
                      minHeight: 180, resize: 'vertical', fontSize: 11,
                      fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap'
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--blue)' }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                  />
                  <div style={{ fontSize: 9, color: 'var(--text-2)' }}>Defines the agent's core personality and coding style.</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>MEMORY.md (Global Memory)</span>
                    <button
                      onClick={() => void saveMemory()}
                      style={{
                        background: 'transparent', border: 'none', color: savingMemory ? 'var(--green)' : 'var(--blue)',
                        cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, padding: 0
                      }}
                    >
                      {savingMemory ? <CheckCircle size={12} /> : <Save size={12} />} {savingMemory ? 'Saved' : 'Save'}
                    </button>
                  </div>
                  <textarea
                    value={memoryContent}
                    onChange={e => setMemoryContent(e.target.value)}
                    style={{
                      ...inputStyle,
                      minHeight: 180, resize: 'vertical', fontSize: 11,
                      fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap'
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--blue)' }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
                  />
                  <div style={{ fontSize: 9, color: 'var(--text-2)' }}>Global facts and procedures the agent should always remember.</div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'catalog' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              Hermes-style catalog of Kodo toolsets, model routes, and agent insights.
            </div>
            <div style={panelBox}>
              <div style={panelTitle}>INSIGHTS</div>
              <div style={metricGrid}>
                <Metric label="Sessions" value={catalog.insights?.sessions_total ?? '-'} />
                <Metric label="Recent" value={catalog.insights?.sessions_recent ?? '-'} />
                <Metric label="Skills" value={catalog.insights?.skills ?? '-'} />
                <Metric label="Traits" value={catalog.insights?.profile_traits ?? '-'} />
              </div>
            </div>
            <div style={panelBox}>
              <div style={panelTitle}>MODELS</div>
              <div style={{ fontSize: 11, color: 'var(--text-1)', marginBottom: 8 }}>
                Active: {catalog.models?.active_provider || 'unset'} / {catalog.models?.active_model || 'unset'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(catalog.models?.providers || []).map((p: any) => (
                  <span key={p.name} style={{
                    fontSize: 10, fontFamily: 'var(--font-mono)', padding: '3px 7px', borderRadius: 7,
                    border: `1px solid ${p.configured ? 'var(--green)' : 'var(--border)'}`,
                    color: p.configured ? 'var(--green)' : 'var(--text-2)'
                  }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
            <div style={panelBox}>
              <div style={panelTitle}>TOOLSETS</div>
              {(catalog.tools?.toolsets || []).map((t: any) => (
                <div key={t.name} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-0)', fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.5 }}>{(t.tools || []).join(', ')}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'context' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              Context files are durable instructions or project notes that can shape future sessions.
            </div>
            <div style={panelBox}>
              <div style={panelTitle}>FILES</div>
              {contextFiles.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>No context files saved.</div>
              ) : contextFiles.map(f => (
                <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-1)', marginBottom: 5 }}>
                  <span>{f.name}</span>
                  <span style={{ color: 'var(--text-2)' }}>{f.size} bytes</span>
                </div>
              ))}
            </div>
            <div style={panelBox}>
              <div style={panelTitle}>EDIT</div>
              <input value={contextName} onChange={e => setContextName(e.target.value)} style={inputStyle} />
              <textarea
                value={contextContent}
                onChange={e => setContextContent(e.target.value)}
                placeholder="Persistent context, operating rules, project facts..."
                style={{ ...inputStyle, minHeight: 220, resize: 'vertical', fontFamily: 'var(--font-mono)', marginTop: 8 }}
              />
              <button onClick={() => void saveContextFile()} style={{
                marginTop: 8, background: 'var(--blue-dim)', border: '1px solid var(--blue)',
                color: 'var(--blue)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700
              }}>
                SAVE CONTEXT
              </button>
              {contextMsg && <div style={{ marginTop: 8, fontSize: 10, color: contextMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{contextMsg}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
      <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, color: 'var(--text-0)', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function Section({ title, data, color }: { title: string; data: Record<string, string>; color: string }) {
  const entries = Object.entries(data)
  if (entries.length === 0) return null
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.08em' }}>
        {title.toUpperCase()}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{
            background: `${color}18`, border: `1px solid ${color}44`,
            borderRadius: 7, padding: '3px 8px', fontSize: 11,
          }}>
            <span style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{k}: </span>
            <span style={{ color }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  background: 'var(--bg-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-0)',
  fontSize: 12,
  padding: '7px 10px',
  outline: 'none',
  fontFamily: 'var(--font-mono)',
  boxSizing: 'border-box',
}

const panelBox: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
}

const panelTitle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-2)',
  fontFamily: 'var(--font-mono)',
  marginBottom: 8,
  letterSpacing: '0.08em',
  fontWeight: 700,
}

const metricGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}
