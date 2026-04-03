import * as vscode from 'vscode'

const SESSION_ID_KEY = 'kodo.currentSessionId'

let panel: vscode.WebviewPanel | null = null
let activeRequest: AbortController | null = null

type KodoConfig = {
  serverUrl: string
  apiUrl: string
  apiToken: string
  autoOpenOnStartup: boolean
}

function getConfig(): KodoConfig {
  const config = vscode.workspace.getConfiguration('kodo')
  return {
    serverUrl: normalizeUrl(config.get<string>('serverUrl') || 'http://localhost:5173'),
    apiUrl: normalizeUrl(config.get<string>('apiUrl') || 'http://localhost:8000'),
    apiToken: (config.get<string>('apiToken') || '').trim(),
    autoOpenOnStartup: Boolean(config.get<boolean>('autoOpenOnStartup')),
  }
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function apiHeaders(token: string, includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeJson) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function postPanelStatus(text: string): void {
  if (!panel) return
  void panel.webview.postMessage({ type: 'status', text })
}

function buildPanelHtml(serverUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KODO Agent</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        background: #111114;
        color: #ececec;
      }
      .root {
        display: grid;
        grid-template-rows: auto 1fr;
        height: 100%;
      }
      .toolbar {
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 8px;
        border-bottom: 1px solid #2f2f37;
        background: #17171c;
      }
      .left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .btn {
        border: 1px solid #3a3a45;
        background: #22232b;
        color: #d7d7df;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
      }
      .btn:hover {
        border-color: #ff6a3d;
        color: #ffffff;
      }
      .status {
        font-size: 10px;
        color: #9fa0ac;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        max-width: 55vw;
      }
      iframe {
        border: 0;
        width: 100%;
        height: 100%;
        background: #111114;
      }
    </style>
  </head>
  <body>
    <div class="root">
      <div class="toolbar">
        <div class="left">
          <button class="btn" id="new-session">New Session</button>
          <button class="btn" id="send-selection">Send Selection</button>
          <button class="btn" id="open-external">Open Browser</button>
        </div>
        <div class="status" id="status">Connected panel at ${serverUrl}</div>
      </div>
      <iframe id="kodo-frame" src="${serverUrl}" title="KODO Agent"></iframe>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      const statusEl = document.getElementById('status');

      document.getElementById('new-session').addEventListener('click', () => {
        vscode.postMessage({ type: 'newSession' });
      });

      document.getElementById('send-selection').addEventListener('click', () => {
        vscode.postMessage({ type: 'sendSelection' });
      });

      document.getElementById('open-external').addEventListener('click', () => {
        vscode.postMessage({ type: 'openExternal' });
      });

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || typeof message !== 'object') return;
        if (message.type === 'status' && typeof message.text === 'string') {
          statusEl.textContent = message.text;
        }
      });
    </script>
  </body>
</html>`
}

function ensurePanel(context: vscode.ExtensionContext, output: vscode.OutputChannel): vscode.WebviewPanel {
  const config = getConfig()
  if (panel) {
    panel.reveal(vscode.ViewColumn.One)
    panel.webview.html = buildPanelHtml(config.serverUrl)
    return panel
  }

  panel = vscode.window.createWebviewPanel(
    'kodoAgent',
    'KODO Agent',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  )

  panel.webview.html = buildPanelHtml(config.serverUrl)
  panel.onDidDispose(() => {
    panel = null
  })

  panel.webview.onDidReceiveMessage(async (message) => {
    if (!message || typeof message !== 'object') return
    const type = String((message as { type?: unknown }).type || '')
    if (type === 'newSession') {
      await createNewSession(context, output)
      return
    }
    if (type === 'sendSelection') {
      await sendEditorSelection(context, output)
      return
    }
    if (type === 'openExternal') {
      const cfg = getConfig()
      await vscode.env.openExternal(vscode.Uri.parse(cfg.serverUrl))
    }
  })

  context.subscriptions.push(panel)
  return panel
}

async function createNewSession(context: vscode.ExtensionContext, output: vscode.OutputChannel): Promise<string> {
  const config = getConfig()
  const response = await fetch(`${config.apiUrl}/api/chat/new-session`, {
    method: 'POST',
    headers: apiHeaders(config.apiToken),
  })
  if (!response.ok) {
    throw new Error(`Failed to create session (${response.status})`)
  }

  const payload = (await response.json()) as { session_id?: string }
  const sessionId = String(payload.session_id || '').trim()
  if (!sessionId) {
    throw new Error('API did not return a session_id')
  }

  await context.globalState.update(SESSION_ID_KEY, sessionId)
  output.appendLine(`KODO new session: ${sessionId}`)
  postPanelStatus(`Session ${sessionId} ready`)
  return sessionId
}

async function streamSendMessage(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  message: string,
): Promise<string> {
  const config = getConfig()
  const currentSessionId = context.globalState.get<string>(SESSION_ID_KEY)
  const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null

  activeRequest?.abort()
  const controller = new AbortController()
  activeRequest = controller

  const response = await fetch(`${config.apiUrl}/api/chat/send`, {
    method: 'POST',
    headers: apiHeaders(config.apiToken, true),
    body: JSON.stringify({
      message,
      session_id: currentSessionId || undefined,
      project_dir: projectDir,
      mode: 'execute',
    }),
    signal: controller.signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`KODO send failed (${response.status})`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let collected = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw) continue

      let event: { type?: string; content?: string; message?: string; session_id?: string }
      try {
        event = JSON.parse(raw)
      } catch {
        continue
      }

      if (event.type === 'meta' && event.session_id) {
        await context.globalState.update(SESSION_ID_KEY, event.session_id)
      }
      if (event.type === 'text' && typeof event.content === 'string') {
        collected += event.content
      }
      if (event.type === 'error') {
        throw new Error(event.message || 'KODO stream returned an error event')
      }
    }
  }

  return collected.trim()
}

async function sendEditorSelection(context: vscode.ExtensionContext, output: vscode.OutputChannel): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showWarningMessage('KODO: no active editor selection.')
    return
  }

  const selected = editor.document.getText(editor.selection).trim()
  if (!selected) {
    vscode.window.showWarningMessage('KODO: select some text first.')
    return
  }

  postPanelStatus('Sending selection to KODO...')
  output.show(true)
  output.appendLine('---')
  output.appendLine(`Prompt (${new Date().toISOString()}):`)
  output.appendLine(selected)
  output.appendLine('---')

  try {
    const result = await streamSendMessage(context, output, selected)
    output.appendLine(result || '(no response text)')
    postPanelStatus('Selection processed successfully')
    vscode.window.showInformationMessage('KODO: selection sent successfully.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    output.appendLine(`KODO error: ${message}`)
    postPanelStatus(`Error: ${message}`)
    vscode.window.showErrorMessage(`KODO: ${message}`)
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('KODO')

  context.subscriptions.push(
    vscode.commands.registerCommand('kodo.open', async () => {
      ensurePanel(context, output)
    }),
    vscode.commands.registerCommand('kodo.openExternal', async () => {
      const config = getConfig()
      await vscode.env.openExternal(vscode.Uri.parse(config.serverUrl))
    }),
    vscode.commands.registerCommand('kodo.newSession', async () => {
      try {
        const sessionId = await createNewSession(context, output)
        vscode.window.showInformationMessage(`KODO: created session ${sessionId}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        vscode.window.showErrorMessage(`KODO: ${message}`)
      }
    }),
    vscode.commands.registerCommand('kodo.sendSelection', async () => {
      await sendEditorSelection(context, output)
    }),
    vscode.commands.registerCommand('kodo.showLogs', async () => {
      output.show(true)
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('kodo')) return
      if (!panel) return
      panel.webview.html = buildPanelHtml(getConfig().serverUrl)
      postPanelStatus('KODO settings updated')
    }),
  )

  if (getConfig().autoOpenOnStartup) {
    ensurePanel(context, output)
  }
}

export function deactivate(): void {
  activeRequest?.abort()
  activeRequest = null
  panel?.dispose()
  panel = null
}
