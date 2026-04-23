import type { BrowserWindow, NativeImage } from 'electron'

type BrowserWindowConstructor = new (options: Record<string, unknown>) => BrowserWindow

type CreateMainWindowDependencies = {
  BrowserWindow: BrowserWindowConstructor
  shell: {
    openExternal(url: string): void
  }
  runtime: {
    isDevelopment: boolean
    rendererUrl: string | null | undefined
  }
  assets: {
    iconPath: string
    preloadPath: string
    rendererHtmlPath: string
  }
  settingsService: {
    getSettings(): { minimizeToTray: boolean }
  }
  windowManagerService: {
    getIsQuitting(): boolean
  }
  clipboardService: {
    startWatcher(): void
  }
  logger: {
    error(message: string, details?: unknown): void
  }
  shouldHideMainWindowOnClose(input: {
    isQuitting: boolean
    minimizeToTray: boolean
  }): boolean
  createWindowIcon(iconPath: string): NativeImage | undefined | unknown
  createPreloadPreferences(preloadPath: string): unknown
  bindMainWindowServices(window: BrowserWindow | null): void
  onWindowClosed(window: BrowserWindow): void
  scheduleTimeout?(handler: () => void, timeoutMs: number): unknown
}

export function createMainWindow(dependencies: CreateMainWindowDependencies): BrowserWindow {
  const {
    BrowserWindow,
    shell,
    runtime,
    assets,
    settingsService,
    windowManagerService,
    clipboardService,
    logger,
    shouldHideMainWindowOnClose,
    createWindowIcon,
    createPreloadPreferences,
    bindMainWindowServices,
    onWindowClosed,
    scheduleTimeout = setTimeout
  } = dependencies

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    center: true,
    resizable: true,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: createWindowIcon(assets.iconPath),
    webPreferences: createPreloadPreferences(assets.preloadPath)
  })

  bindMainWindowServices(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    scheduleTimeout(() => {
      clipboardService.startWatcher()
    }, 1000)
  })

  mainWindow.on('close', (event) => {
    const minimizeToTray = settingsService.getSettings().minimizeToTray
    if (
      shouldHideMainWindowOnClose({
        isQuitting: windowManagerService.getIsQuitting(),
        minimizeToTray
      })
    ) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    onWindowClosed(mainWindow)
  })

  mainWindow.on('unresponsive', () => {
    logger.error('Main window became unresponsive')
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process gone', details)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (runtime.isDevelopment && runtime.rendererUrl) {
    void mainWindow.loadURL(runtime.rendererUrl)
  } else {
    void mainWindow.loadFile(assets.rendererHtmlPath)
  }

  return mainWindow
}
