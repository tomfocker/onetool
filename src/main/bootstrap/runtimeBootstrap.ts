import type { BrowserWindow } from 'electron'
import { registerIpc, type MainProcessIpcRegistrars } from './registerIpc'

type MainWindowSetter = {
  setMainWindow(window: BrowserWindow | null): void
}

type MainWindowBoundServices = {
  autoClickerService: MainWindowSetter
  clipboardService: MainWindowSetter
  hotkeyService: MainWindowSetter
  screenRecorderService: MainWindowSetter
  screenOverlayService: MainWindowSetter
  colorPickerService: MainWindowSetter
  webActivatorService: MainWindowSetter
  quickInstallerService: MainWindowSetter
  spaceCleanupService: MainWindowSetter
  downloadOrganizerService: MainWindowSetter
  windowManagerService: MainWindowSetter
  screenshotService: MainWindowSetter
}

type SettingsLike = {
  getSettings(): { minimizeToTray?: boolean }
  on(event: 'changed', handler: (settings: { minimizeToTray: boolean }) => void): void
}

type RuntimeInitializationDependencies = {
  settingsService: SettingsLike
  downloadOrganizerService: {
    initialize(): Promise<void>
  }
  windowManagerService: {
    setTrayEnabled(enabled: boolean): void
    createFloatBallWindow(): void
  }
  appUpdateService: {
    setBeforeQuitAndInstall(hook: unknown): void
    initialize(): Promise<unknown>
  }
  autoClickerService: {
    registerShortcuts(): void
  }
  hotkeyService: {
    registerRecorderShortcut(): void
    registerScreenshotShortcut(): void
    registerTranslatorShortcut(): void
    registerFloatBallShortcut(): void
    registerClipboardShortcut(): void
  }
  registerAutoUpdateSettingsChangeHandler(input: {
    settingsService: unknown
    appUpdateService: unknown
    runtime: RuntimeEnvironment
  }): void
  createBeforeQuitAndInstallHook(windowManagerService: unknown): unknown
  runtime: RuntimeEnvironment
  scheduleTimeout?(handler: () => void, timeoutMs: number): unknown
}

type RuntimeEnvironment = {
  platform: string
  isPackaged: boolean
  isDevelopment: boolean
  isPortableWindowsRuntime: boolean
}

type DoctorAuditDependencies = {
  doctorService: {
    runFullAudit(): Promise<{ success: boolean; data?: unknown }>
  }
  scheduleTimeout?(handler: () => void | Promise<void>, timeoutMs: number): unknown
}

export function bindMainWindowServices(
  mainWindow: BrowserWindow | null,
  services: MainWindowBoundServices
): void {
  services.autoClickerService.setMainWindow(mainWindow)
  services.clipboardService.setMainWindow(mainWindow)
  services.hotkeyService.setMainWindow(mainWindow)
  services.screenRecorderService.setMainWindow(mainWindow)
  services.screenOverlayService.setMainWindow(mainWindow)
  services.colorPickerService.setMainWindow(mainWindow)
  services.webActivatorService.setMainWindow(mainWindow)
  services.quickInstallerService.setMainWindow(mainWindow)
  services.spaceCleanupService.setMainWindow(mainWindow)
  services.downloadOrganizerService.setMainWindow(mainWindow)
  services.windowManagerService.setMainWindow(mainWindow)
  services.screenshotService.setMainWindow(mainWindow)
}

export function registerMainProcessIpc(
  getMainWindow: () => BrowserWindow | null,
  registrars: MainProcessIpcRegistrars
): void {
  registerIpc({
    mainWindowProvider: getMainWindow,
    registrars
  })
}

export async function initializeMainRuntime(
  dependencies: RuntimeInitializationDependencies
): Promise<void> {
  const {
    settingsService,
    downloadOrganizerService,
    windowManagerService,
    appUpdateService,
    autoClickerService,
    hotkeyService,
    registerAutoUpdateSettingsChangeHandler,
    createBeforeQuitAndInstallHook,
    runtime,
    scheduleTimeout = setTimeout
  } = dependencies

  await downloadOrganizerService.initialize()
  windowManagerService.setTrayEnabled(Boolean(settingsService.getSettings().minimizeToTray))
  windowManagerService.createFloatBallWindow()
  appUpdateService.setBeforeQuitAndInstall(createBeforeQuitAndInstallHook(windowManagerService))

  settingsService.on('changed', (newSettings) => {
    windowManagerService.setTrayEnabled(newSettings.minimizeToTray)
  })

  registerAutoUpdateSettingsChangeHandler({
    settingsService,
    appUpdateService,
    runtime
  })

  await appUpdateService.initialize()

  autoClickerService.registerShortcuts()
  hotkeyService.registerRecorderShortcut()
  hotkeyService.registerScreenshotShortcut()
  hotkeyService.registerTranslatorShortcut()
  hotkeyService.registerFloatBallShortcut()
  hotkeyService.registerClipboardShortcut()

  scheduleTimeout(() => {
    autoClickerService.registerShortcuts()
  }, 1000)
}

export function scheduleDoctorAudit(
  getMainWindow: () => BrowserWindow | null,
  dependencies: DoctorAuditDependencies
): void {
  const { doctorService, scheduleTimeout = setTimeout } = dependencies

  scheduleTimeout(async () => {
    const res = await doctorService.runFullAudit()
    if (!res.success || !res.data) {
      return
    }

    const auditEntries = Object.entries(res.data as Record<string, { ok?: boolean }>)
    const issues = auditEntries.filter(([_, value]) => !value.ok)
    const mainWindow = getMainWindow()
    if (issues.length > 0 && mainWindow) {
      mainWindow.webContents.send('app-notification', {
        type: 'warning',
        title: '系统环境自检提醒',
        message: `发现 ${issues.length} 项环境依赖异常，部分工具可能无法正常工作。请前往设置页查看详情。`,
        duration: 10000
      })
    }
  }, 3000)
}
