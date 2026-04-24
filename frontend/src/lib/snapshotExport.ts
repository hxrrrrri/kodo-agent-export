/**
 * Conversation Snapshot — exports the current session as a self-contained,
 * shareable HTML file. Includes all messages, tool call summaries, and
 * artifact code blocks. No external dependencies required to view.
 */

import { Message } from '../store/chatStore'

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

function renderMessageHtml(msg: Message, idx: number): string {
  const role = msg.role === 'user' ? 'user' : 'assistant'
  const body = msg.content
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trimStart()

  const toolHtml = (msg.toolCalls || []).map((tc) => `
    <div class="tool-call">
      <div class="tool-name">${escHtml(tc.tool)}</div>
      ${tc.output ? `<div class="tool-output">${escHtml(tc.output.slice(0, 400))}${tc.output.length > 400 ? '...' : ''}</div>` : ''}
    </div>`).join('')

  const artifactsHtml = (msg.artifactRefs || []).length > 0
    ? `<div class="artifact-refs">${(msg.artifactRefs || []).map((ref) => `<span class="artifact-badge">artifact: ${escHtml(ref.id)} v${ref.version}</span>`).join('')}</div>`
    : ''

  // Render markdown-style code blocks
  const renderedBody = escHtml(body)
    .replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="code-block" data-lang="${escHtml(lang)}"><code>${code}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')

  return `
  <div class="message ${role}" id="msg-${idx}">
    <div class="message-header">
      <span class="role-badge">${role === 'user' ? 'YOU' : 'KODO'}</span>
      ${msg.timestamp ? `<span class="timestamp">${formatDate(msg.timestamp)}</span>` : ''}
      ${msg.usage ? `<span class="usage">${msg.usage.input_tokens?.toLocaleString()} in / ${msg.usage.output_tokens?.toLocaleString()} out</span>` : ''}
    </div>
    <div class="message-body">${renderedBody}</div>
    ${toolHtml ? `<div class="tools">${toolHtml}</div>` : ''}
    ${artifactsHtml}
  </div>`
}

export function exportAsSnapshotHtml(
  messages: Message[],
  sessionId: string | null,
  sessionMode: string,
): void {
  const nonSystem = messages.filter((m) => m.role !== 'system')
  const messagesHtml = nonSystem.map((m, i) => renderMessageHtml(m, i)).join('\n')

  const totalIn = nonSystem.reduce((s, m) => s + (m.usage?.input_tokens || 0), 0)
  const totalOut = nonSystem.reduce((s, m) => s + (m.usage?.output_tokens || 0), 0)
  const cost = (totalIn / 1e6) * 3 + (totalOut / 1e6) * 15

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kodo Session Snapshot${sessionId ? ` — ${sessionId.slice(0, 8)}` : ''}</title>
<style>
  :root {
    --bg: #0a0a0b; --surface: #111114; --raised: #1a1a1f;
    --border: #2a2a32; --accent: #ff4d21; --green: #00ff88;
    --text: #f0f0f5; --muted: #a8a8b8; --dim: #606070;
    --font: 'JetBrains Mono', 'Fira Code', monospace;
    --sans: system-ui, -apple-system, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.6; }
  .page { max-width: 860px; margin: 0 auto; padding: 40px 24px; }

  .header { border-bottom: 1px solid var(--border); padding-bottom: 24px; margin-bottom: 32px; }
  .header h1 { font-size: 24px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
  .meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; font-family: var(--font); color: var(--dim); }
  .meta span { display: flex; align-items: center; gap: 4px; }
  .meta .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); display: inline-block; }

  .message { margin-bottom: 24px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .message.user { border-color: var(--border); }
  .message.assistant { border-color: #2a2a32; }

  .message-header { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .role-badge { font-family: var(--font); font-size: 9px; letter-spacing: 0.12em; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
  .message.user .role-badge { background: rgba(255,77,33,0.15); color: var(--accent); border: 1px solid var(--accent); }
  .message.assistant .role-badge { background: rgba(0,255,136,0.1); color: var(--green); border: 1px solid var(--green); }
  .timestamp { font-size: 10px; color: var(--dim); font-family: var(--font); margin-left: auto; }
  .usage { font-size: 9px; color: var(--dim); font-family: var(--font); }

  .message-body { padding: 14px 16px; font-size: 14px; color: var(--text); line-height: 1.7; }
  .message.user .message-body { background: var(--raised); }

  .code-block { background: #0f0f13; border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin: 12px 0; overflow-x: auto; }
  .code-block::before { display: block; font-size: 9px; font-family: var(--font); color: var(--dim); letter-spacing: 0.1em; margin-bottom: 8px; content: attr(data-lang); text-transform: uppercase; }
  code { font-family: var(--font); font-size: 12px; color: #e0e0e8; }
  .inline-code { background: var(--raised); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-family: var(--font); font-size: 12px; color: var(--green); }

  .tools { padding: 8px 14px; background: #0d0d10; border-top: 1px solid var(--border); }
  .tool-call { margin-bottom: 6px; }
  .tool-name { font-family: var(--font); font-size: 10px; color: var(--accent); letter-spacing: 0.08em; margin-bottom: 3px; }
  .tool-output { font-family: var(--font); font-size: 10px; color: var(--dim); white-space: pre-wrap; max-height: 100px; overflow: hidden; }

  .artifact-refs { padding: 6px 14px; border-top: 1px solid var(--border); display: flex; gap: 6px; flex-wrap: wrap; }
  .artifact-badge { font-family: var(--font); font-size: 9px; color: var(--accent); border: 1px solid rgba(255,77,33,0.3); border-radius: 4px; padding: 2px 6px; }

  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border); font-family: var(--font); font-size: 10px; color: var(--dim); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .kodo-brand { color: var(--accent); font-weight: 700; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>Kodo Session Snapshot</h1>
    <div class="meta">
      ${sessionId ? `<span><span class="dot"></span>Session ${sessionId.slice(0, 8)}</span>` : ''}
      <span>Mode: ${sessionMode.toUpperCase()}</span>
      <span>${nonSystem.length} messages</span>
      <span>Exported ${new Date().toLocaleString()}</span>
      ${totalIn > 0 ? `<span>${(totalIn + totalOut).toLocaleString()} tokens</span>` : ''}
      ${totalIn > 0 ? `<span>~$${cost.toFixed(4)}</span>` : ''}
    </div>
  </div>

  <div class="messages">
    ${messagesHtml}
  </div>

  <div class="footer">
    <span>Generated by <span class="kodo-brand">KODO</span> — AI Engineering Agent</span>
    <span>${new Date().toISOString()}</span>
  </div>
</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kodo-snapshot-${sessionId?.slice(0, 8) ?? 'session'}-${Date.now()}.html`
  a.click()
  URL.revokeObjectURL(url)
}
