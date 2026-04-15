import { CSSProperties, ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Plus, RefreshCw, Save, Trash2, Upload } from 'lucide-react'
import { buildApiHeaders, parseApiError } from '../lib/api'

type CustomSkill = {
  name: string
  description?: string
  content: string
}

export function SkillBuilderPanel() {
  const [skills, setSkills] = useState<CustomSkill[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [name, setName] = useState('')
  const [content, setContent] = useState('# New Skill\n\nDescribe what this skill should do.')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const importPackInputRef = useRef<HTMLInputElement>(null)
  // Ref so loadSkills doesn't need selectedName in its dep array,
  // preventing the cascade: setSelectedName('') → new loadSkills ref →
  // useEffect fires → auto-selects first skill → overwrites uploaded content.
  const selectedNameRef = useRef(selectedName)
  selectedNameRef.current = selectedName
  // Set to true in handleUpload so the selectedSkill effect won't overwrite
  // the just-uploaded content when selectedName resets to ''.
  const skipSkillEffectRef = useRef(false)

  const selectedSkill = useMemo(
    () => skills.find((row) => row.name === selectedName) || null,
    [skills, selectedName],
  )

  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/skills/custom', {
        headers: buildApiHeaders(),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      const data = await response.json()
      const rows = Array.isArray(data.skills) ? (data.skills as CustomSkill[]) : []
      setSkills(rows)
      // Use ref so this callback never needs selectedName as a dep.
      if (rows.length > 0 && !selectedNameRef.current) {
        setSelectedName(rows[0].name)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, []) // stable — uses ref for selectedName check

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  useEffect(() => {
    // Skip when handleUpload just populated name/content — don't overwrite it.
    if (skipSkillEffectRef.current) {
      skipSkillEffectRef.current = false
      return
    }
    if (!selectedSkill) return
    setName(selectedSkill.name)
    setContent(selectedSkill.content)
  }, [selectedSkill])

  const saveSkill = async () => {
    const trimmedName = name.trim().toLowerCase().replace(/\s+/g, '-')
    const trimmedContent = content.trim()
    if (!trimmedName || !trimmedContent) {
      setError('Name and markdown content are required.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/skills/custom', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: trimmedName, content: trimmedContent }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      setSelectedName(trimmedName)
      await loadSkills()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const deleteSkill = async () => {
    if (!selectedSkill) return
    const confirmed = window.confirm(`Delete custom skill "${selectedSkill.name}"?`)
    if (!confirmed) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/skills/custom/${encodeURIComponent(selectedSkill.name)}`, {
        method: 'DELETE',
        headers: buildApiHeaders(),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      setSelectedName('')
      setName('')
      setContent('# New Skill\n\nDescribe what this skill should do.')
      await loadSkills()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset immediately (before any await) so the same file can be re-selected.
    event.target.value = ''
    if (!file) return

    file.text().then((text) => {
      const baseName = file.name.replace(/\.md$/i, '').trim().toLowerCase().replace(/\s+/g, '-')
      // Flag the selectedSkill effect to skip its next run — otherwise the
      // cascade (setSelectedName('') → loadSkills → auto-select → effect)
      // would overwrite the content we're about to set.
      skipSkillEffectRef.current = true
      setSelectedName('')
      setName(baseName || 'imported-skill')
      setContent(text)
      setError('')
    }).catch(() => {
      setError('Failed to read uploaded file.')
    })
  }

  const exportMarketplacePack = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/marketplace/export', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: 'kodo-skills-pack',
          description: 'Exported skills pack from KODO Skill Builder',
          author: 'kodo-user',
        }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'kodo-skills-pack.kodopack'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const importMarketplacePack = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSaving(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/marketplace/import', {
        method: 'POST',
        headers: buildApiHeaders(),
        body: form,
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      await loadSkills()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
      event.target.value = ''
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '10px 10px 12px', display: 'grid', gap: 8 }}>
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--bg-2)',
        padding: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Skill Builder</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => void loadSkills()} style={miniButtonStyle} title="Refresh custom skills">
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedName('')
              setName('new-skill')
              setContent('# New Skill\n\nDescribe what this skill should do.')
            }}
            style={miniButtonStyle}
            title="New custom skill"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      <select
        value={selectedName}
        onChange={(event) => setSelectedName(event.target.value)}
        style={inputStyle}
      >
        <option value="">Select custom skill</option>
        {skills.map((skill) => (
          <option key={skill.name} value={skill.name}>{skill.name}</option>
        ))}
      </select>

      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="skill-name"
        style={inputStyle}
      />

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={14}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 220, fontFamily: 'var(--font-mono)' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void saveSkill()} disabled={saving} style={miniButtonStyle}>
          <Save size={12} /> {saving ? 'Saving...' : 'Save Skill'}
        </button>
        <button type="button" onClick={() => void deleteSkill()} disabled={saving || !selectedSkill} style={miniButtonStyle}>
          <Trash2 size={12} /> Delete
        </button>
        <button type="button" onClick={() => uploadInputRef.current?.click()} style={miniButtonStyle}>
          <Upload size={12} /> Upload .md
        </button>
        <button type="button" onClick={() => void exportMarketplacePack()} disabled={saving} style={miniButtonStyle}>
          <Download size={12} /> Export pack
        </button>
        <button type="button" onClick={() => importPackInputRef.current?.click()} disabled={saving} style={miniButtonStyle}>
          <Upload size={12} /> Import pack
        </button>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        style={{ display: 'none' }}
        onChange={handleUpload}
      />

      <input
        ref={importPackInputRef}
        type="file"
        accept=".kodopack,.zip,application/zip"
        style={{ display: 'none' }}
        onChange={importMarketplacePack}
      />

      {selectedSkill?.description && (
        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{selectedSkill.description}</div>
      )}
      {loading && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Loading custom skills...</div>}
      {error && <div style={{ fontSize: 11, color: 'var(--red)' }}>{error}</div>}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  color: 'var(--text-0)',
  borderRadius: 8,
  padding: '7px 9px',
  fontSize: 12,
  outline: 'none',
}

const miniButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-3)',
  color: 'var(--text-1)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 8px',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
}
