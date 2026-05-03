/**
 * OpenClawPanel — full-screen panel for managing OpenClaw messaging bridge.
 *
 * OpenClaw connects Kodo to WhatsApp, Telegram, Discord, Slack, Instagram and
 * 20+ other platforms. Messages from those platforms are routed to Kodo's agent,
 * which processes them and sends responses back.
 *
 * Panel sections:
 *   1. Status & daemon control (install / start / stop)
 *   2. Platform connections (tokens, QR codes, status)
 *   3. Live message feed (all platforms)
 *   4. Send messages to any platform
 *   5. Log viewer
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Cpu,
  Download,
  Hash,
  Link2,
  Loader,
  MessageCircle,
  MessageSquare,
  Phone,
  Power,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Square,
  Stethoscope,
  Terminal,
  Wand2,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { buildApiHeaders } from '../lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface DaemonStatus {
  running: boolean
  gateway_ok?: boolean | null
  node_available: boolean
  openclaw_installed: boolean
  config_exists: boolean
  platforms: Record<string, PlatformStatus>
  message_count: number
  port: number
  ciao_retries?: number
  ciao_max_retries?: number
}

interface PlatformStatus {
  connected?: boolean
  token_set?: boolean
  auto_reply_enabled?: boolean
  last_message?: number
  message_count?: number
  qr_pending?: boolean
  error?: string
}

interface Message {
  platform: string
  from_name?: string
  from_id?: string
  text?: string
  received_at: number
}

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#25d366',
  telegram: '#0088cc',
  discord: '#5865f2',
  slack: '#e01e5a',
  instagram: '#e1306c',
  signal: '#2592e9',
  matrix: '#0dbd8b',
  teams: '#6264a7',
  default: 'var(--text-2)',
}

function PlatformIcon({ platform, size = 15 }: { platform: string; size?: number }) {
  const color = PLATFORM_COLORS[platform] || 'var(--text-2)'
  switch (platform) {
    case 'whatsapp': return <Phone size={size} color={color} />
    case 'telegram': return <Send size={size} color={color} />
    case 'discord': return <Hash size={size} color={color} />
    case 'slack': return <MessageSquare size={size} color={color} />
    case 'instagram': return <Radio size={size} color={color} />
    case 'signal': return <Shield size={size} color={color} />
    case 'matrix': return <Wand2 size={size} color={color} />
    case 'teams': return <MessageSquare size={size} color={color} />
    default: return <Link2 size={size} color={color} />
  }
}

// ── Claw logo SVG ─────────────────────────────────────────────────────────────
function ClawIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8 2 5 5 5 9c0 2.5 1.5 4.5 3 6l4 7 4-7c1.5-1.5 3-3.5 3-6 0-4-3-7-7-7z" />
      <path d="M9 9.5c0-1.5 1.5-3 3-3s3 1.5 3 3" />
      <path d="M7 13l-2 5" />
      <path d="M17 13l2 5" />
    </svg>
  )
}

// ── Tab type ──────────────────────────────────────────────────────────────────
type Tab = 'status' | 'platforms' | 'advanced' | 'messages' | 'send' | 'log'

// ── Main component ────────────────────────────────────────────────────────────
export function OpenClawPanel({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('status')
  const [status, setStatus] = useState<DaemonStatus | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [log, setLog] = useState<string[]>([])
  const [_loading, _setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [configMsg, setConfigMsg] = useState('')

  // Config form — platforms
  const [telegramToken, setTelegramToken] = useState('')
  const [discordToken, setDiscordToken] = useState('')
  const [slackToken, setSlackToken] = useState('')
  const [enableWhatsApp, setEnableWhatsApp] = useState(false)
  const [signalNumber, setSignalNumber] = useState('')
  const [matrixHomeserver, setMatrixHomeserver] = useState('')
  const [matrixToken, setMatrixToken] = useState('')
  const [teamsWebhook, setTeamsWebhook] = useState('')

  // API keys for cloud providers
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [googleKey, setGoogleKey] = useState('')
  const [deepseekKey, setDeepseekKey] = useState('')
  const [mistralKey, setMistralKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')

  // Advanced agent settings
  const [sandboxMode, setSandboxMode] = useState<string>('off')
  const [mcpServersText, setMcpServersText] = useState<string>('')
  const [mcpParseError, setMcpParseError] = useState<string>('')

  // Auto-reply toggle per platform
  const [autoReplyStates, setAutoReplyStates] = useState<Record<string, boolean>>({})

  // LLM provider+model selection
  const [selectedProvider, setSelectedProvider] = useState<string>('ollama')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>('http://127.0.0.1:11434')
  const [testingModel, setTestingModel] = useState(false)
  const [modelTestResult, setModelTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const model = selectedProvider === 'ollama'
    ? `ollama/${selectedModel}`
    : selectedProvider === 'custom'
    ? selectedModel
    : `${selectedProvider}/${selectedModel}`

  const baseUrl = selectedProvider === 'ollama' ? ollamaBaseUrl : ''

  // model is valid only when provider/model-id both present and non-empty
  const modelValid = selectedModel.trim().length > 0

  // Send form
  const [sendPlatform, setSendPlatform] = useState('telegram')
  const [sendRecipient, setSendRecipient] = useState('')
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')

  // QR code
  const [qrText, setQrText] = useState<string | null>(null)

  const pollQr = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/qr', { headers: buildApiHeaders() })
      if (res.ok) {
        const d = await res.json() as { found: boolean; qr: string | null }
        setQrText(d.found ? d.qr : null)
      }
    } catch { /* ignore */ }
  }, [])

  const sseRef = useRef<EventSource | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/status', { headers: buildApiHeaders() })
      if (res.ok) setStatus(await res.json() as DaemonStatus)
    } catch { /* ignore */ }
  }, [])

  const refreshMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/messages?limit=200', { headers: buildApiHeaders() })
      if (res.ok) {
        const data = await res.json() as { messages: Message[] }
        setMessages(data.messages || [])
      }
    } catch { /* ignore */ }
  }, [])

  const refreshLog = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/log?tail=150', { headers: buildApiHeaders() })
      if (res.ok) {
        const data = await res.json() as { lines: string[] }
        setLog(data.lines || [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const id = setInterval(() => void refreshStatus(), 4000)
    return () => clearInterval(id)
  }, [refreshStatus])

  // Poll for WhatsApp QR when daemon is running and WA is pending
  useEffect(() => {
    const wa = status?.platforms?.whatsapp
    if (!status?.running || !wa?.qr_pending) { setQrText(null); return }
    void pollQr()
    const id = setInterval(() => void pollQr(), 6000)
    return () => clearInterval(id)
  }, [status?.running, status?.platforms?.whatsapp?.qr_pending, pollQr])

  // SSE live messages
  useEffect(() => {
    if (tab !== 'messages') return
    const es = new EventSource('/api/openclaw/stream')
    sseRef.current = es
    es.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data) as Message
        setMessages((prev) => [...prev.slice(-199), msg])
      } catch { /* ignore */ }
    })
    return () => { es.close(); sseRef.current = null }
  }, [tab])

  const install = async () => {
    setInstalling(true); setError(null)
    try {
      const res = await fetch('/api/openclaw/install', { method: 'POST', headers: buildApiHeaders() })
      const d = await res.json() as { ok: boolean; error?: string; output?: string }
      if (!d.ok) {
        setError(d.error || 'Install failed — check Log tab for details')
      } else {
        await refreshStatus()
      }
    } catch (e) {
      setError(`Network error: ${(e as Error).message}. Is the backend running?`)
    }
    setInstalling(false)
  }

  const startDaemon = async () => {
    setStarting(true); setError(null)
    try {
      const res = await fetch('/api/openclaw/start', { method: 'POST', headers: buildApiHeaders() })
      const d = await res.json() as { ok: boolean; error?: string }
      if (!d.ok) setError(d.error || 'Start failed')
      else await refreshStatus()
    } catch (e) { setError((e as Error).message) }
    setStarting(false)
  }

  const stopDaemon = async () => {
    setStopping(true); setError(null)
    try {
      await fetch('/api/openclaw/stop', { method: 'POST', headers: buildApiHeaders() })
      await refreshStatus()
    } catch (e) { setError((e as Error).message) }
    setStopping(false)
  }

  const configure = async () => {
    setConfiguring(true); setConfigMsg(''); setError(null); setMcpParseError('')
    let mcp_servers: Record<string, unknown> | null = null
    if (mcpServersText.trim()) {
      try {
        mcp_servers = JSON.parse(mcpServersText)
      } catch {
        setMcpParseError('Invalid JSON — check MCP servers definition')
        setConfiguring(false)
        return
      }
    }
    try {
      const res = await fetch('/api/openclaw/configure', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          model,
          base_url: baseUrl || null,
          telegram_token: telegramToken || null,
          discord_token: discordToken || null,
          slack_token: slackToken || null,
          whatsapp: enableWhatsApp,
          signal_number: signalNumber || null,
          matrix_homeserver: matrixHomeserver || null,
          matrix_token: matrixToken || null,
          teams_webhook: teamsWebhook || null,
          anthropic_api_key: anthropicKey || null,
          openai_api_key: openaiKey || null,
          groq_api_key: groqKey || null,
          google_api_key: googleKey || null,
          deepseek_api_key: deepseekKey || null,
          mistral_api_key: mistralKey || null,
          openrouter_api_key: openrouterKey || null,

          sandbox_mode: sandboxMode || null,
          mcp_servers: mcp_servers,
        }),
      })
      const d = await res.json() as { ok: boolean }
      if (d.ok) setConfigMsg('Configuration saved. Restart daemon to apply.')
      else setError('Configure failed')
    } catch (e) { setError((e as Error).message) }
    setConfiguring(false)
  }

  const toggleAutoReply = async (platform: string, enabled: boolean) => {
    setAutoReplyStates(prev => ({ ...prev, [platform]: enabled }))
    await fetch(`/api/openclaw/platforms/${platform}/auto-reply?enabled=${enabled}`, {
      method: 'POST', headers: buildApiHeaders(),
    }).catch(() => {})
  }

  const sendMessage = async () => {
    if (!sendText.trim() || !sendRecipient.trim()) return
    setSending(true); setSendResult('')
    try {
      const res = await fetch('/api/openclaw/send', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ platform: sendPlatform, recipient: sendRecipient, text: sendText }),
      })
      const d = await res.json() as { ok: boolean; error?: string }
      setSendResult(d.ok ? 'Sent successfully' : `Error: ${d.error}`)
      if (d.ok) setSendText('')
    } catch (e) { setSendResult(`Error: ${(e as Error).message}`) }
    setSending(false)
  }

  const TABS: Array<{ id: Tab; icon: React.ReactNode; label: string }> = [
    { id: 'status', icon: <Activity size={13} />, label: 'Status' },
    { id: 'platforms', icon: <Settings size={13} />, label: 'Connect' },
    { id: 'advanced', icon: <Cpu size={13} />, label: 'Advanced' },
    { id: 'messages', icon: <MessageCircle size={13} />, label: 'Messages' },
    { id: 'send', icon: <Send size={13} />, label: 'Send' },
    { id: 'log', icon: <Terminal size={13} />, label: 'Log' },
  ]

  const isRunning = status?.running ?? false
  const isInstalled = status?.openclaw_installed ?? false
  const nodeOk = status?.node_available ?? false
  const platforms = status?.platforms ?? {}

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-mono)',
    }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)', flexShrink: 0,
      }}>
        <ClawIcon size={22} color="var(--accent)" />
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-0)' }}>OpenClaw</span>
        <span style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.08em' }}>
          MESSAGING BRIDGE
        </span>
        <div style={{
          marginLeft: 8,
          padding: '3px 10px', borderRadius: 20,
          background: isRunning ? 'var(--green-dim)' : 'var(--bg-3)',
          color: isRunning ? 'var(--green)' : 'var(--text-2)',
          border: `1px solid ${isRunning ? 'var(--green)' : 'var(--border)'}`,
          fontSize: 10, letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {isRunning ? <><Activity size={10} /> RUNNING</> : <><Circle size={10} /> STOPPED</>}
        </div>
        {status && (
          <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
            {Object.keys(platforms).length} platforms · {status.message_count} messages
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Daemon controls */}
        {!isInstalled && nodeOk && (
          <button type="button" onClick={() => void install()} disabled={installing}
            style={actionBtn('var(--blue)')}>
            {installing ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={11} />}
            INSTALL
          </button>
        )}
        {isInstalled && !isRunning && (
          <button type="button" onClick={() => void startDaemon()} disabled={starting}
            style={actionBtn('var(--green)')}>
            {starting ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Power size={11} />}
            START
          </button>
        )}
        {isRunning && (
          <button type="button" onClick={() => void stopDaemon()} disabled={stopping}
            style={actionBtn('var(--red)')}>
            {stopping ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Square size={11} />}
            STOP
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)', flexShrink: 0,
      }}>
        {TABS.map(({ id, icon, label }) => (
          <button key={id} type="button" onClick={() => {
            setTab(id)
            if (id === 'log') void refreshLog()
            if (id === 'messages') void refreshMessages()
          }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', border: 'none',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              color: tab === id ? 'var(--accent)' : 'var(--text-2)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
              fontWeight: tab === id ? 600 : 400,
            }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, color: 'var(--red)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <XCircle size={14} /> {error}
          </div>
        )}

        {/* STATUS TAB */}
        {tab === 'status' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7 }}>
              OpenClaw connects Kodo to <strong style={{ color: 'var(--text-0)' }}>WhatsApp, Telegram, Discord, Slack</strong> and 20+ other platforms.
              Messages from those platforms are routed to Kodo's AI agent, which processes them and sends responses back.
            </div>

            {/* CIAO recovery banner */}
            {status && (status.ciao_retries ?? 0) > 0 && (
              <div style={{ padding: '10px 14px', background: 'var(--yellow-dim)', border: '1px solid var(--yellow)', borderRadius: 8, fontSize: 12, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={14} style={{ flexShrink: 0 }} />
                <span>
                  WhatsApp CIAO error detected — auto-recovering ({status.ciao_retries}/{status.ciao_max_retries ?? 3} attempts).
                  Credentials cleared and daemon restarted. Scan the QR code in the Log tab.
                  {(status.ciao_retries ?? 0) >= (status.ciao_max_retries ?? 3) && (
                    <strong> Max retries reached — click RESET WHATSAPP to fix manually.</strong>
                  )}
                </span>
              </div>
            )}

            {/* Two-column grid for status sections */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {/* Prerequisites */}
              <Section title="Prerequisites">
                <StatusRow label="Node.js 22+" ok={nodeOk} note={nodeOk ? 'Found' : 'Install from nodejs.org'} />
                <StatusRow label="openclaw npm package" ok={isInstalled} note={isInstalled ? 'Installed' : 'Click INSTALL above'} />
                <StatusRow label="Configuration file" ok={status?.config_exists ?? false} note={status?.config_exists ? '~/.kodo/openclaw/openclaw.json' : 'Configure in Connect tab'} />
                <StatusRow label="Daemon" ok={isRunning} note={isRunning ? `Running on port ${status?.port}` : 'Click START to launch'} />
                {isRunning && (
                  <StatusRow
                    label="Gateway HTTP"
                    ok={status?.gateway_ok === true}
                    note={status?.gateway_ok === true ? 'Responding' : status?.gateway_ok === false ? 'Not responding' : 'Checking…'}
                  />
                )}
              </Section>

              {/* WhatsApp QR code */}
              {qrText && (
                <Section title="WhatsApp — Scan QR Code">
                  <div style={{ fontSize: 11, color: 'var(--yellow)', marginBottom: 8 }}>
                    Open WhatsApp on your phone → Linked Devices → Link a Device → scan below
                  </div>
                  <pre style={{
                    fontFamily: 'monospace', fontSize: 9, lineHeight: 1.1,
                    background: 'var(--bg-0)', color: 'var(--text-0)',
                    padding: 12, borderRadius: 6, overflowX: 'auto',
                    border: '1px solid var(--border)',
                  }}>{qrText}</pre>
                </Section>
              )}

              {/* Connected platforms */}
              <Section title="Connected Platforms">
                {Object.keys(platforms).length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '8px 0' }}>No platforms connected yet. Go to the Connect tab to add tokens.</div>
                ) : (
                  Object.entries(platforms).map(([name, ps]) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <PlatformIcon platform={name} size={16} />
                      <span style={{ color: PLATFORM_COLORS[name] || 'var(--text-1)', fontSize: 12, fontWeight: 600, textTransform: 'capitalize', flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{ps.message_count ?? 0} msgs</span>
                      <span style={{ fontSize: 10, color: ps.error ? 'var(--red)' : ps.connected ? 'var(--green)' : 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ps.error
                          ? <><AlertTriangle size={10} /> {ps.error}</>
                          : ps.qr_pending ? <><Clock size={10} /> QR pending</>
                          : ps.connected ? <><CheckCircle2 size={10} /> connected</>
                          : <><Circle size={10} /> pending</>}
                      </span>
                    </div>
                  ))
                )}
              </Section>
            </div>

            {/* Quick start */}
            {!isRunning && (
              <Section title="Quick Start">
                <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.8 }}>
                  1. Install Node.js 22+ from nodejs.org<br />
                  2. Click <strong style={{ color: 'var(--blue)' }}>INSTALL</strong> to install openclaw npm package<br />
                  3. Go to <strong>Connect</strong> tab &rarr; add your platform tokens<br />
                  4. Click <strong style={{ color: 'var(--green)' }}>START</strong> to launch the daemon<br />
                  5. Messages from your platforms will appear in the <strong>Messages</strong> tab
                </div>
              </Section>
            )}

            {/* Troubleshooting section */}
            <Section title="Troubleshooting & Repair">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-1)', marginBottom: 4 }}>
                  If WhatsApp is failing with <strong>"CIAO PROBING CANCELLED"</strong> or won't show a QR code, use the tools below to repair the session.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={async () => {
                    const res = await fetch('/api/openclaw/doctor', { method: 'POST', headers: buildApiHeaders() })
                    const d = await res.json() as { output: string }
                    setLog([`--- DOCTOR OUTPUT ---`, ...d.output.split('\n')]); setTab('log')
                  }} style={actionBtn('var(--blue)')}>
                    <Stethoscope size={11} /> RUN DOCTOR
                  </button>
                  <button type="button" onClick={async () => {
                    const res = await fetch('/api/openclaw/doctor-fix', { method: 'POST', headers: buildApiHeaders() })
                    const d = await res.json() as { ok: boolean; output: string; error?: string }
                    if (d.ok) setConfigMsg('Repair complete. Restart daemon.'); else setError(d.error || 'Repair failed')
                    setLog([`--- REPAIR OUTPUT ---`, ...d.output.split('\n')]); setTab('log')
                  }} style={actionBtn('var(--yellow)')}>
                    <Wrench size={11} /> AUTO-REPAIR
                  </button>
                  <button type="button" onClick={async () => {
                    if (!window.confirm('This will delete all WhatsApp session data. You will need to scan the QR code again. Proceed?')) return
                    const res = await fetch('/api/openclaw/channels/whatsapp/clean', { method: 'POST', headers: buildApiHeaders() })
                    const d = await res.json() as { ok: boolean; message: string }
                    if (d.ok) setConfigMsg(d.message); else setError('Failed to clear credentials')
                    await refreshStatus()
                  }} style={actionBtn('var(--red)')}>
                    <ShieldAlert size={11} /> RESET WHATSAPP
                  </button>
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* PLATFORMS TAB */}
        {tab === 'platforms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Add tokens for the platforms you want to connect. Save, then restart the daemon.
            </div>

            {/* AI Model — provider + model selector like main Kodo page */}
            <Section title="AI Model">
              {/* Provider selector */}
              <label style={labelStyle}>
                Provider
                <select value={selectedProvider} onChange={(e) => {
                  setSelectedProvider(e.target.value)
                  setSelectedModel('')
                  setModelTestResult(null)
                  if (e.target.value === 'ollama') {
                    // Fetch Ollama models
                    fetch('/api/openclaw/ollama-models?base_url=' + encodeURIComponent(ollamaBaseUrl), { headers: buildApiHeaders() })
                      .then(r => r.ok ? r.json() : { models: [] })
                      .then((d: { models: string[] }) => setOllamaModels(d.models || []))
                      .catch(() => {})
                  }
                }} style={inputStyle}>
                  <option value="ollama">Ollama (local)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="groq">Groq</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="custom">Custom / Other</option>
                </select>
              </label>

              {/* Ollama base URL + refresh */}
              {selectedProvider === 'ollama' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434" style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" onClick={() => {
                    fetch('/api/openclaw/ollama-models?base_url=' + encodeURIComponent(ollamaBaseUrl), { headers: buildApiHeaders() })
                      .then(r => r.ok ? r.json() : { models: [] })
                      .then((d: { models: string[] }) => setOllamaModels(d.models || []))
                      .catch(() => {})
                  }} style={{ ...actionBtn('var(--blue)'), whiteSpace: 'nowrap', padding: '6px 10px' }}>
                    Fetch Models
                  </button>
                </div>
              )}

              {/* Model selector */}
              <label style={{ ...labelStyle, marginTop: 8 }}>
                Model
                {selectedProvider === 'ollama' && ollamaModels.length > 0 ? (
                  <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={inputStyle}>
                    <option value="">-- select model --</option>
                    {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
                    placeholder={
                      selectedProvider === 'anthropic' ? 'claude-sonnet-4-6' :
                      selectedProvider === 'openai' ? 'gpt-4o' :
                      selectedProvider === 'groq' ? 'llama-3.3-70b-versatile' :
                      selectedProvider === 'ollama' ? 'llama3' : 'model-name'
                    } style={inputStyle} />
                )}
              </label>

              {/* Active model display */}
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                Active: <span style={{ color: 'var(--accent)' }}>{model || '(not set)'}</span>
                {baseUrl && <span> · {baseUrl}</span>}
              </div>

              {/* Test connection */}
              <button type="button" disabled={testingModel || !selectedModel} onClick={async () => {
                setTestingModel(true); setModelTestResult(null)
                try {
                  const res = await fetch('/api/openclaw/test-model', {
                    method: 'POST',
                    headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ model, base_url: baseUrl || null }),
                  })
                  const d = await res.json() as { ok: boolean; latency_ms?: number; error?: string }
                  setModelTestResult({
                    ok: d.ok,
                    message: d.ok ? `Connected (${d.latency_ms}ms)` : (d.error || 'Connection failed')
                  })
                } catch (e) {
                  setModelTestResult({ ok: false, message: (e as Error).message })
                }
                setTestingModel(false)
              }} style={{ ...actionBtn('var(--green)'), marginTop: 8 }}>
                {testingModel ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={11} />}
                Test Connection
              </button>
              {modelTestResult && (
                <div style={{
                  marginTop: 6, fontSize: 11, fontFamily: 'var(--font-mono)',
                  display: 'flex', alignItems: 'center', gap: 5,
                  color: modelTestResult.ok ? 'var(--green)' : 'var(--red)'
                }}>
                  {modelTestResult.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {modelTestResult.message}
                </div>
              )}
            </Section>

            {/* Platform grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              {/* Telegram */}
              <PlatformSection
                name="Telegram" platform="telegram" color="#0088cc"
                instructions={"1. Message @BotFather on Telegram\n2. /newbot → follow prompts\n3. Copy the token below"}
              >
                <input value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="1234567890:ABCDefGhIJKlmNoPQRsTUVwxyz" style={inputStyle} />
              </PlatformSection>

              {/* Discord */}
              <PlatformSection
                name="Discord" platform="discord" color="#5865f2"
                instructions={"1. discord.com/developers/applications → New Application\n2. Bot tab → Add Bot → Copy token\n3. Enable Message Content Intent"}
              >
                <input value={discordToken} onChange={(e) => setDiscordToken(e.target.value)}
                  placeholder="Discord bot token" style={inputStyle} />
              </PlatformSection>

              {/* Slack */}
              <PlatformSection
                name="Slack" platform="slack" color="#e01e5a"
                instructions={"1. api.slack.com/apps → Create App\n2. OAuth & Permissions → Bot Token Scopes: chat:write, im:history, im:read\n3. Install to workspace → copy Bot User OAuth Token"}
              >
                <input value={slackToken} onChange={(e) => setSlackToken(e.target.value)}
                  placeholder="xoxb-..." style={inputStyle} />
              </PlatformSection>

              {/* WhatsApp */}
              <PlatformSection
                name="WhatsApp" platform="whatsapp" color="#25d366"
                instructions={"1. Enable WhatsApp below\n2. Start the daemon\n3. A QR code will appear in the Log tab — scan it with WhatsApp on your phone\n4. WhatsApp Web will be automated in the background"}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-1)' }}>
                  <input type="checkbox" checked={enableWhatsApp} onChange={(e) => setEnableWhatsApp(e.target.checked)}
                    style={{ accentColor: '#25d366' }} />
                  Enable WhatsApp Web automation
                </label>
                {enableWhatsApp && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--yellow-dim)', border: '1px solid var(--yellow)', borderRadius: 6, fontSize: 11, color: 'var(--yellow)', lineHeight: 1.5 }}>
                    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> WhatsApp automation uses WhatsApp Web. Your phone must stay connected. Use a dedicated account to avoid ToS issues.</span>
                  </div>
                )}
              </PlatformSection>

              {/* Signal */}
              <PlatformSection
                name="Signal" platform="signal" color="#2592e9"
                instructions={"1. Install signal-cli and register your number\n2. Enter your Signal phone number below (with country code: +1234567890)"}
              >
                <input value={signalNumber} onChange={(e) => setSignalNumber(e.target.value)}
                  placeholder="+1234567890" style={inputStyle} />
              </PlatformSection>

              {/* Matrix */}
              <PlatformSection
                name="Matrix" platform="matrix" color="#0dbd8b"
                instructions={"1. Create a Matrix bot account on any homeserver\n2. Enter the homeserver URL and access token below"}
              >
                <input value={matrixHomeserver} onChange={(e) => setMatrixHomeserver(e.target.value)}
                  placeholder="https://matrix.org" style={inputStyle} />
                <input value={matrixToken} onChange={(e) => setMatrixToken(e.target.value)}
                  placeholder="Access token (syt_...)" style={{ ...inputStyle, marginTop: 8 }} />
              </PlatformSection>

              {/* Teams */}
              <PlatformSection
                name="Microsoft Teams" platform="teams" color="#6264a7"
                instructions={"1. In Teams: Apps → Connectors → Incoming Webhook\n2. Create webhook for a channel and copy the URL below"}
              >
                <input value={teamsWebhook} onChange={(e) => setTeamsWebhook(e.target.value)}
                  placeholder="https://outlook.office.com/webhook/..." style={inputStyle} />
              </PlatformSection>
            </div>

            {/* Auto-reply section */}
            {Object.keys(platforms).length > 0 && (
              <Section title="Auto-Reply (Kodo Agent)">
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.6 }}>
                  When enabled, incoming messages from a platform are processed by Kodo's AI agent and the response is sent back automatically.
                </div>
                {Object.entries(platforms).map(([name, ps]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <PlatformIcon platform={name} size={14} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-0)', textTransform: 'capitalize' }}>{name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{ps.message_count ?? 0} msgs</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-1)' }}>
                      <input type="checkbox"
                        checked={autoReplyStates[name] ?? ps.auto_reply_enabled ?? false}
                        onChange={(e) => void toggleAutoReply(name, e.target.checked)}
                        style={{ accentColor: 'var(--accent)' }} />
                      Auto-reply
                    </label>
                  </div>
                ))}
              </Section>
            )}

            {/* Save button */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => void configure()} disabled={configuring || !modelValid}
                style={actionBtn('var(--accent)')}>
                {configuring ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={11} />}
                SAVE CONFIGURATION
              </button>
              {!modelValid && <span style={{ fontSize: 11, color: 'var(--yellow)' }}>Select a model first</span>}
              {modelValid && configMsg && <span style={{ fontSize: 11, color: 'var(--green)' }}>{configMsg}</span>}
            </div>
          </div>
        )}

        {/* ADVANCED TAB */}
        {tab === 'advanced' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              API keys, agent tools, sandbox policy, and MCP server definitions.
            </div>

            {/* API Keys */}
            <Section title="Cloud Provider API Keys">
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.6 }}>
                Keys are stored in <code style={{ color: 'var(--accent)' }}>~/.openclaw/openclaw.json</code> under <code style={{ color: 'var(--accent)' }}>auth.profiles</code>. Leave blank to keep existing value.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                {([
                  ['Anthropic (Claude)', anthropicKey, setAnthropicKey, 'sk-ant-...'],
                  ['OpenAI (GPT)', openaiKey, setOpenaiKey, 'sk-...'],
                  ['Groq', groqKey, setGroqKey, 'gsk_...'],
                  ['Google Gemini', googleKey, setGoogleKey, 'AIza...'],
                  ['DeepSeek', deepseekKey, setDeepseekKey, 'sk-...'],
                  ['Mistral', mistralKey, setMistralKey, 'api key...'],
                  ['OpenRouter', openrouterKey, setOpenrouterKey, 'sk-or-...'],
                ] as [string, string, (v: string) => void, string][]).map(([label, val, setter, ph]) => (
                  <label key={label} style={labelStyle}>
                    {label}
                    <input type="password" value={val} onChange={(e) => setter(e.target.value)}
                      placeholder={ph} style={inputStyle} autoComplete="off" />
                  </label>
                ))}
              </div>
            </Section>

            {/* Agent Settings — sandbox only; tools profile is not in openclaw schema */}
            <Section title="Agent Settings">
              <label style={labelStyle}>
                Sandbox Mode
                <select value={sandboxMode} onChange={(e) => setSandboxMode(e.target.value)} style={inputStyle}>
                  <option value="off">off — no sandbox (recommended)</option>
                  <option value="local">local — process isolation</option>
                  <option value="docker">docker — container</option>
                </select>
              </label>
            </Section>

            {/* MCP Servers */}
            <Section title="MCP Servers">
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.6 }}>
                Define MCP (Model Context Protocol) servers as JSON. These are merged into <code style={{ color: 'var(--accent)' }}>mcp.servers</code>.<br />
                Example: <code style={{ color: 'var(--text-1)' }}>{`{"my-mcp": {"type": "stdio", "command": "node", "args": ["./mcp.js"]}}`}</code>
              </div>
              <textarea
                value={mcpServersText}
                onChange={(e) => { setMcpServersText(e.target.value); setMcpParseError('') }}
                rows={6}
                placeholder={'{\n  "my-tool": {\n    "type": "stdio",\n    "command": "node",\n    "args": ["./mcp-server.js"]\n  }\n}'}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                spellCheck={false}
              />
              {mcpParseError && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <XCircle size={11} /> {mcpParseError}
                </div>
              )}
            </Section>

            {/* Save button */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => void configure()} disabled={configuring || !modelValid}
                style={actionBtn('var(--accent)')}>
                {configuring ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={11} />}
                SAVE CONFIGURATION
              </button>
              {!modelValid && <span style={{ fontSize: 11, color: 'var(--yellow)' }}>Select a model first</span>}
              {modelValid && configMsg && <span style={{ fontSize: 11, color: 'var(--green)' }}>{configMsg}</span>}
            </div>
          </div>
        )}

        {/* MESSAGES TAB */}
        {tab === 'messages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12 }}>
              Live feed from all connected platforms. Auto-updates via SSE.
            </div>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-2)', fontSize: 13 }}>
                <MessageCircle size={36} style={{ opacity: 0.15, display: 'block', margin: '0 auto 12px' }} />
                No messages yet. Once platforms are connected, messages appear here.
              </div>
            ) : (
              [...messages].reverse().map((m, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><PlatformIcon platform={m.platform} size={16} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: PLATFORM_COLORS[m.platform] || 'var(--text-1)', textTransform: 'capitalize' }}>
                        {m.platform}
                      </span>
                      {m.from_name && (
                        <span style={{ fontSize: 11, color: 'var(--text-1)' }}>{m.from_name}</span>
                      )}
                      <span style={{ fontSize: 10, color: 'var(--text-2)', marginLeft: 'auto' }}>
                        {m.received_at ? new Date(m.received_at * 1000).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-0)', lineHeight: 1.5 }}>
                      {m.text || '(media/attachment)'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SEND TAB */}
        {tab === 'send' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Send a message from Kodo to any connected platform.
            </div>
            <label style={labelStyle}>
              Platform
              <select value={sendPlatform} onChange={(e) => setSendPlatform(e.target.value)} style={inputStyle}>
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
                <option value="slack">Slack</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
            <label style={labelStyle}>
              Recipient (chat ID / channel ID / phone)
              <input value={sendRecipient} onChange={(e) => setSendRecipient(e.target.value)}
                placeholder="@username or 1234567890" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Message
              <textarea value={sendText} onChange={(e) => setSendText(e.target.value)}
                rows={4} placeholder="Type your message..."
                style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => void sendMessage()} disabled={sending || !sendText.trim() || !sendRecipient.trim() || !isRunning}
                style={actionBtn('var(--accent)')}>
                {sending ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />}
                SEND
              </button>
              {!isRunning && <span style={{ fontSize: 11, color: 'var(--yellow)' }}>Daemon must be running</span>}
              {sendResult && <span style={{ fontSize: 11, color: sendResult.startsWith('Sent') || sendResult.startsWith('OK') ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>{sendResult}</span>}
            </div>
          </div>
        )}

        {/* LOG TAB */}
        {tab === 'log' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexShrink: 0 }}>
              <button type="button" onClick={() => void refreshLog()}
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                <RefreshCw size={11} /> Refresh
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Terminal size={11} /> ~/.kodo/openclaw/openclaw.log
              </span>
            </div>
            <div style={{
              background: 'var(--terminal-bg)', border: '1px solid var(--border)', borderRadius: 8,
              padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11,
              flex: 1, overflowY: 'auto', color: 'var(--terminal-fg)',
              lineHeight: 1.7, minHeight: 0,
            }}>
              {log.length === 0
                ? <span style={{ color: 'var(--text-2)' }}>No log output yet. Start the daemon first.</span>
                : log.map((line, i) => (
                  <div key={i} style={{
                    color: line.includes('error') || line.includes('Error') ? 'var(--red)'
                      : line.includes('warn') || line.includes('Warn') ? 'var(--yellow)'
                      : 'var(--terminal-fg)',
                  }}>{line}</div>
                ))
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-1)' }}>
      <div style={{ padding: '10px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {title.toUpperCase()}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function StatusRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      {ok ? <CheckCircle2 size={15} color="var(--green)" /> : <XCircle size={15} color="var(--red)" />}
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-0)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 11, color: ok ? 'var(--text-2)' : 'var(--text-2)' }}>{note}</span>
    </div>
  )
}

function PlatformSection({ name, platform, color, instructions, children }: {
  name: string; platform: string; color: string; instructions: string; children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-1)' }}>
      <button type="button" onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: 'var(--bg-2)', border: 'none',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', color: 'var(--text-0)',
        }}>
        <PlatformIcon platform={platform} size={16} />
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, textAlign: 'left' }}>Click to configure</span>
        {expanded ? <ChevronDown size={14} color="var(--text-2)" /> : <ChevronRight size={14} color="var(--text-2)" />}
      </button>
      {expanded && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'pre-line', lineHeight: 1.7 }}>
            {instructions}
          </div>
          {children}
        </div>
      )}
    </div>
  )
}

function actionBtn(color: string): React.CSSProperties {
  return {
    background: 'var(--bg-2)', border: `1px solid ${color}`, color,
    borderRadius: 8, padding: '7px 16px', cursor: 'pointer',
    fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'background 150ms ease, opacity 150ms ease',
  }
}

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 7,
  fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
  fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-0)', fontSize: 12,
  padding: '9px 12px', outline: 'none', fontFamily: 'var(--font-mono)',
  width: '100%', boxSizing: 'border-box',
  transition: 'border-color 150ms ease',
}

