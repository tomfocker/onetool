type AppLike = {
  on(event: string, handler: (...args: unknown[]) => void): void
  quit(): void
}

type BrowserWindowLike = {
  getAllWindows(): unknown[]
}

type LifecycleDependencies = {
  app: AppLike
  BrowserWindow: BrowserWindowLike
  globalShortcut: {
    unregisterAll(): void
  }
  optimizer: {
    watchWindowShortcuts(window: unknown): void
  }
  runtime: {
    platform: string
  }
  createWindow(): void
  windowManagerService: {
    setIsQuitting(value: boolean): void
  }
  autoClickerService: {
    stop(): void
  }
  screenRecorderService: {
    stop(): void
  }
  processRegistry: {
    killAll(): void
  }
}

export function registerAppLifecycle(dependencies: LifecycleDependencies): void {
  const {
    app,
    BrowserWindow,
    globalShortcut,
    optimizer,
    runtime,
    createWindow,
    windowManagerService,
    autoClickerService,
    screenRecorderService,
    processRegistry
  } = dependencies

  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('before-quit', () => {
    windowManagerService.setIsQuitting(true)
    autoClickerService.stop()
    screenRecorderService.stop()
    processRegistry.killAll()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (runtime.platform !== 'darwin') {
      app.quit()
    }
  })
}
