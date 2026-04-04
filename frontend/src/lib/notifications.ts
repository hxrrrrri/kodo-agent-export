export type UiNotificationKind = 'info' | 'success' | 'warning' | 'error'

export type UiNotification = {
  id: string
  title: string
  message: string
  kind: UiNotificationKind
  createdAt: number
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function pushUiNotification(title: string, message: string, kind: UiNotificationKind = 'info'): void {
  if (typeof window === 'undefined') return

  const payload: UiNotification = {
    id: generateId(),
    title,
    message,
    kind,
    createdAt: Date.now(),
  }

  window.dispatchEvent(new CustomEvent('kodo:notify', { detail: payload }))

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        body: message,
        tag: `kodo-${kind}`,
      })
      window.setTimeout(() => notification.close(), 4000)
    } catch {
      // Ignore browser-level notification failures.
    }
  }
}

export async function requestUiNotificationPermission(): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission()
    } catch {
      // Ignore permission prompt errors.
    }
  }
}
