import type { BrowserWindow } from 'electron'

type AppLike = {
  requestSingleInstanceLock(): boolean
  quit(): void
  on(event: 'second-instance', handler: () => void): void
}

export function setupSingleInstance(input: {
  app: AppLike
  getMainWindow(): BrowserWindow | null
}): { hasLock: boolean } {
  const { app, getMainWindow } = input
  const hasLock = app.requestSingleInstanceLock()

  if (!hasLock) {
    app.quit()
    return { hasLock: false }
  }

  app.on('second-instance', () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focus()
  })

  return { hasLock: true }
}
