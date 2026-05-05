/**
 * SkillsBrowserPanel — dedicated right-panel skills library.
 *
 * Mounted as a resizable flex sibling of ChatWindow (same pattern as
 * AntiVibePanel / HermesPanel). Shows all bundled/custom/project skills
 * in a 2-column card grid. Clicking a card opens a full markdown detail
 * modal. Each card has enable and auto-inject toggles.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Zap,
  ZapOff,
} from 'lucide-react'
import { buildApiHeaders, parseApiError } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type SkillSource = 'bundled' | 'custom' | 'project'
type FilterSource = 'all' | SkillSource

interface Skill {
  name: string
  description: string
  source: SkillSource
  path: string
  enabled: boolean
  auto_inject: boolean
  content?: string
}

// ── Category inference ────────────────────────────────────────────────────────

const CATEGORY_MAP: Array<[string[], string, string]> = [
  [['smart-planner', 'task-planning', 'ultraplan', 'coordinator', 'kanban', 'pm-spec', 'advisor'], 'Planning', 'var(--accent)'],
  [['code-review', 'bughunter', 'testing', 'production', 'git-forensics', 'checkpoint', 'incident', 'karpathy', 'extension', 'eng-runbook'], 'Engineering', 'var(--blue)'],
  [['design', 'wireframe', 'ui-polish', 'craft', 'saas', 'web-proto', 'mobile', 'social', 'invoice', 'html-ppt', 'pricing', 'image-poster', 'hyperframe', 'motion', 'tweaks', 'dashboard', 'open-design', 'magazine', 'blog', 'digital', 'email', 'finance', 'huashu'], 'Design', 'var(--green)'],
  [['caveman'], 'Style', 'var(--red)'],
  [['web-research', 'dream-mode'], 'Research', 'var(--yellow)'],
]

function inferCategory(name: string): [string, string] {
  const n = name.toLowerCase()
  for (const [keywords, label, color] of CATEGORY_MAP) {
    if (keywords.some((k) => n.includes(k))) return [label, color]
  }
  return ['General', 'var(--text-2)']
}

function formatName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <span
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked) }}
      style={{
        display: 'inline-block',
        width: 36,
        height: 20,
        borderRadius: 8,
        background: checked ? 'var(--accent)' : 'var(--bg-3)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-bright)'}`,
        position: 'relative',
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2,
        left: checked ? 18 : 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: checked ? '#fff' : 'var(--text-2)',
        transition: 'left 0.15s',
      }} />
    </span>
  )
}

// ── Skill card (wide, 2-col grid layout) ──────────────────────────────────────

function SkillCard({
  skill,
  onClick,
  onToggleEnabled,
  onToggleAutoInject,
  patching,
}: {
  skill: Skill
  onClick: () => void
  onToggleEnabled: (v: boolean) => void
  onToggleAutoInject: (v: boolean) => void
  patching: boolean
}) {
  const [cat, catColor] = inferCategory(skill.name)
  const sourceColors: Record<SkillSource, string> = {
    bundled: 'var(--text-2)',
    custom: 'var(--accent)',
    project: 'var(--blue)',
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-2)',
        border: `1px solid ${skill.enabled ? 'var(--border-bright)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '14px 16px',
        cursor: 'pointer',
        opacity: skill.enabled ? 1 : 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
        minHeight: 130,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = 'var(--bg-3)'
        el.style.borderColor = skill.enabled ? 'var(--accent)' : 'var(--border-bright)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = 'var(--bg-2)'
        el.style.borderColor = skill.enabled ? 'var(--border-bright)' : 'var(--border)'
      }}
    >
      {/* Name row + enable toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)', lineHeight: 1.25, flex: 1, minWidth: 0 }}>
          {formatName(skill.name)}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle checked={skill.enabled} onChange={onToggleEnabled} disabled={patching} />
        </div>
      </div>

      {/* Badges row */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', color: catColor,
          background: `color-mix(in srgb, ${catColor} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${catColor} 28%, transparent)`,
          borderRadius: 4, padding: '2px 6px', letterSpacing: '0.07em', textTransform: 'uppercase',
        }}>
          {cat}
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', color: sourceColors[skill.source],
          background: `color-mix(in srgb, ${sourceColors[skill.source]} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${sourceColors[skill.source]} 22%, transparent)`,
          borderRadius: 4, padding: '2px 6px', letterSpacing: '0.07em', textTransform: 'uppercase',
        }}>
          {skill.source}
        </span>
      </div>

      {/* Description */}
      {skill.description && (
        <p style={{
          fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.55, margin: 0, flex: 1,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {skill.description}
        </p>
      )}

      {/* Auto-inject row — only when enabled */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 8, borderTop: '1px solid var(--border)',
          opacity: skill.enabled ? 1 : 0.3,
          transition: 'opacity 0.15s',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {skill.auto_inject
            ? <Zap size={10} color="var(--accent)" />
            : <ZapOff size={10} color="var(--text-2)" />}
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)',
            color: skill.auto_inject ? 'var(--accent)' : 'var(--text-2)',
            letterSpacing: '0.07em', textTransform: 'uppercase',
          }}>
            Auto-inject
          </span>
        </div>
        <Toggle
          checked={skill.auto_inject}
          onChange={onToggleAutoInject}
          disabled={patching || !skill.enabled}
        />
      </div>
    </div>
  )
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function SkillDetailModal({
  skill,
  onClose,
  onToggleEnabled,
  onToggleAutoInject,
  patching,
}: {
  skill: Skill
  onClose: () => void
  onToggleEnabled: (v: boolean) => void
  onToggleAutoInject: (v: boolean) => void
  patching: boolean
}) {
  const [cat, catColor] = inferCategory(skill.name)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const body = useMemo(() => {
    if (!skill.content) return ''
    let text = skill.content
    if (text.startsWith('---')) {
      const end = text.indexOf('---', 3)
      if (end !== -1) text = text.slice(end + 3).trimStart()
    }
    return text
  }, [skill.content])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '4vh 20px 20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 720, maxHeight: '92vh',
          background: 'var(--bg-1)', border: '1px solid var(--border-bright)',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', animation: 'fadeIn 0.18s ease',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-0)', margin: '0 0 6px', lineHeight: 1.2 }}>
                {formatName(skill.name)}
              </h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: catColor, background: `color-mix(in srgb, ${catColor} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${catColor} 28%, transparent)`, borderRadius: 4, padding: '2px 7px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {cat}
                </span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {skill.source}
                </span>
              </div>
              {skill.description && (
                <p style={{ fontSize: 13, color: 'var(--text-1)', margin: '10px 0 0', lineHeight: 1.6 }}>
                  {skill.description}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <X size={14} />
            </button>
          </div>

          {/* Enable / Auto-inject controls */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 14px', flex: 1, minWidth: 140 }}>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', flex: 1, letterSpacing: '0.04em' }}>ENABLED</span>
              <Toggle checked={skill.enabled} onChange={onToggleEnabled} disabled={patching} />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: skill.auto_inject ? 'var(--accent-dim)' : 'var(--bg-2)',
              border: `1px solid ${skill.auto_inject && skill.enabled ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 9, padding: '10px 14px', flex: 1, minWidth: 180,
              opacity: skill.enabled ? 1 : 0.4, transition: 'all 0.15s',
            }}>
              <Zap size={12} color={skill.auto_inject && skill.enabled ? 'var(--accent)' : 'var(--text-2)'} />
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: skill.auto_inject && skill.enabled ? 'var(--accent)' : 'var(--text-1)', flex: 1, letterSpacing: '0.04em' }}>
                AUTO-INJECT
              </span>
              <Toggle checked={skill.auto_inject} onChange={onToggleAutoInject} disabled={patching || !skill.enabled} />
            </div>
          </div>

          {skill.auto_inject && skill.enabled && (
            <p style={{ fontSize: 10.5, color: 'var(--accent)', fontFamily: 'var(--font-mono)', margin: '10px 0 0', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Zap size={10} /> This skill is automatically injected into every LLM system prompt.
            </p>
          )}
        </div>

        {/* Markdown body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {body ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-0)', margin: '0 0 14px', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)', margin: '22px 0 8px' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)', margin: '16px 0 6px' }}>{children}</h3>,
                p: ({ children }) => <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.75, margin: '0 0 12px' }}>{children}</p>,
                li: ({ children }) => <li style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.65, marginBottom: 5 }}>{children}</li>,
                ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '0 0 12px' }}>{children}</ol>,
                code: ({ children, className }) => {
                  const block = className?.startsWith('language-')
                  return block
                    ? <code style={{ display: 'block', background: 'var(--bg-0)', color: 'var(--text-0)', padding: '12px 14px', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', margin: '0 0 12px', border: '1px solid var(--border)', lineHeight: 1.6 }}>{children}</code>
                    : <code style={{ background: 'var(--bg-3)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{children}</code>
                },
                pre: ({ children }) => <pre style={{ margin: '0 0 12px' }}>{children}</pre>,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 14, margin: '0 0 12px', color: 'var(--text-2)', fontStyle: 'italic' }}>{children}</blockquote>,
                strong: ({ children }) => <strong style={{ color: 'var(--text-0)', fontWeight: 700 }}>{children}</strong>,
                hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />,
                input: ({ checked }) => <input type="checkbox" checked={checked} readOnly style={{ accentColor: 'var(--accent)', marginRight: 5 }} />,
                table: ({ children }) => <div style={{ overflowX: 'auto', marginBottom: 14 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>{children}</table></div>,
                th: ({ children }) => <th style={{ textAlign: 'left', padding: '7px 12px', borderBottom: '2px solid var(--border)', color: 'var(--text-0)', fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</th>,
                td: ({ children }) => <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 12, lineHeight: 1.5 }}>{children}</td>,
              }}
            >
              {body}
            </ReactMarkdown>
          ) : (
            <p style={{ color: 'var(--text-2)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>No content available.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export function SkillsBrowserPanel({ onClose }: Props) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<FilterSource>('all')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [patching, setPatching] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Fetch all skills ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/skill-library', { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const data = await res.json()
      setSkills(Array.isArray(data.skills) ? data.skills : [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Focus search on open
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 80)
  }, [])

  // ── Fetch full skill content for modal ────────────────────────────────────
  const openDetail = useCallback(async (skill: Skill) => {
    if (skill.content) { setSelectedSkill(skill); return }
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/skill-library/${encodeURIComponent(skill.name)}`, { headers: buildApiHeaders() })
      if (!res.ok) throw new Error(await parseApiError(res))
      const data = await res.json()
      const full = { ...skill, content: data.content ?? '' }
      setSelectedSkill(full)
      setSkills((prev) => prev.map((s) => s.name === skill.name ? full : s))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  // ── Patch a setting ───────────────────────────────────────────────────────
  const patch = useCallback(async (name: string, field: 'enabled' | 'auto_inject', value: boolean) => {
    setPatching((p) => new Set([...p, name]))
    try {
      const res = await fetch(`/api/skill-library/${encodeURIComponent(name)}/settings`, {
        method: 'PATCH',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const updated = await res.json()
      setSkills((prev) => prev.map((s) => s.name === name ? { ...s, enabled: updated.enabled, auto_inject: updated.auto_inject } : s))
      setSelectedSkill((prev) => prev?.name === name ? { ...prev, enabled: updated.enabled, auto_inject: updated.auto_inject } : prev)
    } catch (e) {
      setError(String(e))
    } finally {
      setPatching((p) => { const n = new Set(p); n.delete(name); return n })
    }
  }, [])

  // ── Derived state ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return skills.filter((s) => {
      if (sourceFilter !== 'all' && s.source !== sourceFilter) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || inferCategory(s.name)[0].toLowerCase().includes(q)
    })
  }, [skills, search, sourceFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, Skill[]>()
    for (const s of filtered) {
      const [cat] = inferCategory(s.name)
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(s)
    }
    const order = ['Planning', 'Engineering', 'Design', 'Content', 'Research', 'Style', 'General']
    return [...map.entries()].sort(([a], [b]) => {
      const ai = order.indexOf(a), bi = order.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }, [filtered])

  const counts = useMemo(() => ({
    all: skills.length,
    bundled: skills.filter((s) => s.source === 'bundled').length,
    custom: skills.filter((s) => s.source === 'custom').length,
    project: skills.filter((s) => s.source === 'project').length,
    enabled: skills.filter((s) => s.enabled).length,
    autoInject: skills.filter((s) => s.auto_inject && s.enabled).length,
  }), [skills])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-1)', borderLeft: '1px solid var(--border)' }}>

        {/* ── Panel header ─────────────────────────────────────────────── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-1)' }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <BookOpen size={15} color="var(--accent)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)', letterSpacing: '0.03em', flex: 1 }}>
              Skills Library
            </span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {counts.autoInject > 0 && (
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 5, padding: '2px 7px' }}>
                  <Zap size={9} /> {counts.autoInject} injecting
                </span>
              )}
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px' }}>
                {counts.enabled}/{counts.all} active
              </span>
              <button type="button" onClick={onClose} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.12s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-0)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Search + filter row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skills by name, description or category..."
                style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-0)', borderRadius: 8, padding: '7px 10px 7px 30px', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--border-bright)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Source filter pills */}
          <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
            {([
              ['all', `All ${counts.all}`],
              ['bundled', `Bundled ${counts.bundled}`],
              ['custom', `Custom ${counts.custom}`],
              ['project', `Project ${counts.project}`],
            ] as [FilterSource, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSourceFilter(key)}
                style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', padding: '4px 10px', borderRadius: 6,
                  border: `1px solid ${sourceFilter === key ? 'var(--accent)' : 'var(--border)'}`,
                  background: sourceFilter === key ? 'var(--accent-dim)' : 'var(--bg-2)',
                  color: sourceFilter === key ? 'var(--accent)' : 'var(--text-2)',
                  cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.12s',
                }}
              >
                {label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content area ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 24px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-mono)', flexDirection: 'column', gap: 10 }}>
              <BookOpen size={22} color="var(--text-2)" style={{ opacity: 0.4 }} />
              Loading skills...
            </div>
          )}

          {error && !loading && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--red)', marginBottom: 12, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <button type="button" onClick={load} style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 5, padding: '3px 9px', cursor: 'pointer', fontSize: 11 }}>Retry</button>
            </div>
          )}

          {!loading && grouped.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-2)', fontSize: 13, fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Search size={28} style={{ opacity: 0.3 }} />
              {search ? `No skills match "${search}"` : 'No skills found.'}
            </div>
          )}

          {!loading && grouped.map(([cat, catSkills]) => {
            const [, catColor] = inferCategory(catSkills[0]?.name ?? '')
            const isCollapsed = collapsed[cat]
            const activeCount = catSkills.filter((s) => s.enabled).length
            const injectCount = catSkills.filter((s) => s.auto_inject && s.enabled).length

            return (
              <div key={cat} style={{ marginBottom: 20 }}>
                {/* Category header */}
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 2px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: isCollapsed ? 0 : 10 }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1, textAlign: 'left' }}>
                    {cat}
                  </span>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {injectCount > 0 && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Zap size={8} />{injectCount}
                      </span>
                    )}
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                      {activeCount}/{catSkills.length}
                    </span>
                    {isCollapsed ? <ChevronDown size={11} color="var(--text-2)" /> : <ChevronUp size={11} color="var(--text-2)" />}
                  </div>
                </button>

                {/* 2-column card grid */}
                {!isCollapsed && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 10,
                  }}>
                    {catSkills.map((skill) => (
                      <SkillCard
                        key={skill.name}
                        skill={skill}
                        onClick={() => void openDetail(skill)}
                        onToggleEnabled={(v) => void patch(skill.name, 'enabled', v)}
                        onToggleAutoInject={(v) => void patch(skill.name, 'auto_inject', v)}
                        patching={patching.has(skill.name)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail modal */}
      {(loadingDetail || selectedSkill) && (
        loadingDetail ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading...</span>
          </div>
        ) : selectedSkill && (
          <SkillDetailModal
            skill={selectedSkill}
            onClose={() => setSelectedSkill(null)}
            onToggleEnabled={(v) => void patch(selectedSkill.name, 'enabled', v)}
            onToggleAutoInject={(v) => void patch(selectedSkill.name, 'auto_inject', v)}
            patching={patching.has(selectedSkill.name)}
          />
        )
      )}
    </>
  )
}
