# KODO VS Code Extension

KODO VS Code gives you a persistent KODO panel plus direct editor actions (new sessions and send selection) without leaving the editor.

## Commands

- `kodo.open`: Open (or reveal) the embedded KODO panel.
- `kodo.newSession`: Create a fresh backend chat session and store it for extension actions.
- `kodo.sendSelection`: Send current editor selection to KODO `/api/chat/send`.
- `kodo.openExternal`: Open KODO frontend URL in your default browser.
- `kodo.showLogs`: Open extension output channel logs.

## Keybindings

- `Ctrl+Alt+K` (`Cmd+Alt+K` on macOS): Open KODO panel.
- `Ctrl+Alt+Enter` (`Cmd+Alt+Enter` on macOS): Send editor selection.

## Settings

- `kodo.serverUrl` (default `http://localhost:5173`): URL loaded in embedded panel.
- `kodo.apiUrl` (default `http://localhost:8000`): Backend API base URL.
- `kodo.apiToken` (default empty): Optional bearer token for protected API.
- `kodo.autoOpenOnStartup` (default `false`): Auto-open panel on VS Code startup.

## Typical Flow

1. Start KODO backend and frontend.
2. Run `KODO: Open Agent`.
3. Optionally run `KODO: New Session`.
4. Select code in an editor and run `KODO: Send Editor Selection`.
5. Inspect responses in `KODO` output channel.
