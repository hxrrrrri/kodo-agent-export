import { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Trash2, Sparkles, Send } from 'lucide-react'
import { buildApiHeaders, parseApiError } from '../lib/api'

type PromptRow = {
  name: string
  content: string
  variables?: string[]
  updated_at?: string
  created_at?: string
}

export function PromptLibraryPanel() {
  const [prompts, setPrompts] = useState<PromptRow[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [variablesJson, setVariablesJson] = useState('{\n  "project": "",\n  "task": ""\n}')
  const [rendered, setRendered] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedPrompt = useMemo(
    () => prompts.find((row) => row.name === selectedName) || null,
    [prompts, selectedName],
  )

  const loadPrompts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/prompts', {
        headers: buildApiHeaders(),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      const data = await response.json()
      const rows = Array.isArray(data.prompts) ? (data.prompts as PromptRow[]) : []
      setPrompts(rows)
      if (rows.length > 0 && !selectedName) {
        setSelectedName(rows[0].name)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [selectedName])

  useEffect(() => {
    void loadPrompts()
  }, [loadPrompts])

  useEffect(() => {
    if (!selectedPrompt) return
    setName(selectedPrompt.name)
    setContent(selectedPrompt.content)
    setRendered('')
  }, [selectedPrompt])

  const savePrompt = async () => {
    const trimmedName = name.trim()
    const trimmedContent = content.trim()
    if (!trimmedName || !trimmedContent) {
      setError('Name and content are required.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: trimmedName, content: trimmedContent }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      setSelectedName(trimmedName)
      await loadPrompts()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const deletePrompt = async () => {
    if (!selectedPrompt) return
    const confirmed = window.confirm(`Delete prompt "${selectedPrompt.name}"?`)
    if (!confirmed) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/prompts/${encodeURIComponent(selectedPrompt.name)}`, {
        method: 'DELETE',
        headers: buildApiHeaders(),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      setSelectedName('')
      setName('')
      setContent('')
      setRendered('')
      await loadPrompts()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const renderPrompt = async () => {
    const promptName = selectedPrompt?.name || name.trim()
    if (!promptName) {
      setError('Select or save a prompt first.')
      return
    }

    let parsedVariables: Record<string, unknown> = {}
    try {
      parsedVariables = JSON.parse(variablesJson)
    } catch {
      setError('Variables must be valid JSON.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/prompts/${encodeURIComponent(promptName)}/render`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ variables: parsedVariables }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      const data = await response.json()
      setRendered(String(data.rendered || ''))
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const insertRendered = () => {
    if (!rendered.trim()) return
    window.dispatchEvent(new CustomEvent('kodo:insert-prompt', { detail: { text: rendered } }))
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
        <div style={{ fontSize: 12, color: 'var(--text-0)' }}>Prompt Library</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => void loadPrompts()} style={miniButtonStyle} title="Refresh prompts">
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedName('')
              setName('new-prompt')
              setContent('')
              setRendered('')
            }}
            style={miniButtonStyle}
            title="New prompt"
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
        <option value="">Select prompt</option>
        {prompts.map((prompt) => (
          <option key={prompt.name} value={prompt.name}>{prompt.name}</option>
        ))}
      </select>

      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Prompt name"
        style={inputStyle}
      />

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Write prompt content, use {{variable}} placeholders."
        rows={8}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 120, fontFamily: 'var(--font-mono)' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => void savePrompt()} disabled={saving} style={miniButtonStyle}>
          <Sparkles size={12} /> {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={() => void deletePrompt()} disabled={saving || !selectedPrompt} style={miniButtonStyle}>
          <Trash2 size={12} /> Delete
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Render variables (JSON)</div>
      <textarea
        value={variablesJson}
        onChange={(event) => setVariablesJson(event.target.value)}
        rows={5}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 90, fontFamily: 'var(--font-mono)' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => void renderPrompt()} disabled={saving} style={miniButtonStyle}>
          <Sparkles size={12} /> Render
        </button>
        <button type="button" onClick={insertRendered} disabled={!rendered.trim()} style={miniButtonStyle}>
          <Send size={12} /> Insert In Chat
        </button>
      </div>

      <textarea
        value={rendered}
        onChange={(event) => setRendered(event.target.value)}
        placeholder="Rendered prompt appears here."
        rows={6}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 110, fontFamily: 'var(--font-mono)' }}
      />

      {selectedPrompt?.variables && selectedPrompt.variables.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
          Variables: {selectedPrompt.variables.join(', ')}
        </div>
      )}

      {loading && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Loading prompts...</div>}
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
