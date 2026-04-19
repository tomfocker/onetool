export function shouldHideMainWindowOnClose(options: { isQuitting: boolean; minimizeToTray: boolean }): boolean {
  return !options.isQuitting && options.minimizeToTray
}

export function serializeUnhandledReason(reason: unknown): string {
  if (
    typeof reason === 'object' &&
    reason !== null &&
    ('stack' in reason || 'message' in reason)
  ) {
    const stack = typeof (reason as { stack?: unknown }).stack === 'string'
      ? (reason as { stack: string }).stack
      : null
    const message = typeof (reason as { message?: unknown }).message === 'string'
      ? (reason as { message: string }).message
      : null

    if (stack || message) {
      return stack || message || String(reason)
    }
  }

  if (typeof reason === 'string') {
    return reason
  }

  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}
