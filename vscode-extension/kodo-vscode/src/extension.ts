import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('kodo.open', async () => {
    const panel = vscode.window.createWebviewPanel(
      'kodoAgent',
      'KODO Agent',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      },
    )

    const target = 'http://localhost:5173'
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KODO Agent</title>
    <style>
      html, body, iframe {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        border: 0;
        overflow: hidden;
        background: #111114;
      }
    </style>
  </head>
  <body>
    <iframe src="${target}" title="KODO Agent"></iframe>
  </body>
</html>`
  })

  context.subscriptions.push(disposable)
}

export function deactivate() {
  // no-op
}
