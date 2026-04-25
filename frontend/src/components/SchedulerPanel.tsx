import { useState, useEffect, useCallback } from 'react'
import { Clock, Plus, Trash2, CheckCircle, Activity } from 'lucide-react'
import { buildApiHeaders } from '../lib/api'

interface CronJob {
  name: string
  cron_expr: string
  prompt: string
  project_dir?: string | null
  enabled: boolean
  last_run?: string | null
  last_task_id?: string | null
}

interface CronRun {
  job_name: string
  task_id: string
  fired_at: string
}

export function SchedulerPanel() {
  const [enabled, setEnabled] = useState(true)
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [expr, setExpr] = useState('daily_09:00')
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [jobRes, runRes] = await Promise.all([
        fetch('/api/cron', { headers: buildApiHeaders() }),
        fetch('/api/cron/runs', { headers: buildApiHeaders() })
      ])
      
      if (jobRes.ok) {
        const data = await jobRes.json()
        setEnabled(data.enabled)
        setJobs(data.jobs || [])
      }
      
      if (runRes.ok) {
        const data = await runRes.json()
        setRuns(data.runs || [])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
    const int = setInterval(() => void loadData(), 30000)
    return () => clearInterval(int)
  }, [loadData])

  const saveJob = async () => {
    if (!name.trim() || !prompt.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: name.trim().toLowerCase().replace(/\s+/g, '-'),
          cron_expr: expr,
          prompt: prompt.trim(),
          enabled: true
        })
      })
      if (!res.ok) throw new Error(await res.text())
      setShowForm(false)
      setName('')
      setPrompt('')
      void loadData()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const deleteJob = async (jobName: string) => {
    try {
      await fetch(`/api/cron/${encodeURIComponent(jobName)}`, {
        method: 'DELETE',
        headers: buildApiHeaders()
      })
      void loadData()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!enabled) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-2)' }}>
        <Clock size={32} style={{ opacity: 0.2, margin: '0 auto 10px' }} />
        Cron features are disabled. Set KODO_ENABLE_CRON=1 in backend to enable.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="var(--blue)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>
              CRON SCHEDULER
            </span>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--blue)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontSize: 10
            }}
          >
            <Plus size={12} /> NEW JOB
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {error && (
          <div style={{ fontSize: 10, color: 'var(--red)', marginBottom: 10 }}>{error}</div>
        )}

        {showForm && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 8, fontWeight: 700 }}>NEW CRON JOB</div>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Job Name (e.g. daily-summary)"
              style={inputStyle}
            />
            <select value={expr} onChange={e => setExpr(e.target.value)} style={{ ...inputStyle, marginTop: 8 }}>
              <option value="every_15_minutes">Every 15 Minutes</option>
              <option value="every_1_hours">Every 1 Hour</option>
              <option value="daily_09:00">Daily</option>
              <option value="weekly_mon_09:00">Weekly</option>
            </select>
            <textarea
              value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="What should Kodo do? (e.g. Summarize the latest git commits)"
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', marginTop: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => void saveJob()}
                disabled={saving || !name || !prompt}
                style={{ flex: 1, background: 'var(--blue)', color: '#fff', border: 'none', padding: '6px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
              >
                {saving ? 'SAVING...' : 'SAVE JOB'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: 10, cursor: 'pointer' }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 8, fontWeight: 700 }}>ACTIVE JOBS</div>
        {jobs.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic', marginBottom: 20 }}>No scheduled jobs.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {jobs.map(job => (
              <div key={job.name} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-0)' }}>{job.name}</span>
                  <button onClick={() => void deleteJob(job.name)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--blue)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                  {job.cron_expr}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {job.prompt}
                </div>
                {job.last_run && (
                  <div style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={9} color="var(--green)" /> Last run: {job.last_run.slice(0, 16).replace('T', ' ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 8, fontWeight: 700 }}>RECENT RUNS</div>
        {runs.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic' }}>No runs yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {runs.slice(0, 10).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-1)' }}>
                <Activity size={10} color="var(--green)" />
                <span style={{ fontWeight: 600 }}>{r.job_name}</span>
                <span style={{ color: 'var(--text-2)' }}>{r.fired_at.slice(11, 16)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', background: 'var(--bg-1)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text-0)', fontSize: 11, padding: '6px 8px', outline: 'none',
  fontFamily: 'var(--font-mono)', boxSizing: 'border-box'
}
