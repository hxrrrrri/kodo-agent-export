/**
 * HermesPanel — hermes-inspired features in Kodo:
 *   1. LLM-powered session search
 *   2. Create skill from session
 *   3. User profile viewer + inference
 */
import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Brain, Search, Sparkles, User, Zap } from 'lucide-react'
import { buildApiHeaders } from '../lib/api'
import { useChatStore } from '../store/chatStore'

type Tab = 'search' | 'profile' | 'skill'

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

export function HermesPanel() {
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

  useEffect(() => {
    setSkillSession(sessionId || '')
  }, [sessionId])

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
    { id: 'skill' as Tab, icon: <Sparkles size={11} />, label: 'SKILL' },
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
      </div>
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
