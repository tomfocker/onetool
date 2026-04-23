import type { BrowserWindow } from 'electron'

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

type MainProcessIpcRegistrars = {
  registerAutoClickerIpc(): void
  registerClipboardIpc(): void
  registerColorPickerIpc(): void
  registerHotkeyIpc(): void
  registerLocalProxyIpc(): void
  registerNetworkIpc(): void
  registerTranslateIpc(): void
  registerLlmIpc(): void
  registerTaskbarAppearanceIpc(): void
  registerRenameIpc(): void
  registerQuickInstallerIpc(): void
  registerScreenOverlayIpc(): void
  registerScreenRecorderIpc(getMainWindow: () => BrowserWindow | null): void
  registerScreenSaverIpc(): void
  registerSettingsIpc(getMainWindow: () => BrowserWindow | null): void
  registerStoreIpc(getMainWindow: () => BrowserWindow | null): void
  registerDoctorIpc(): void
  registerDevEnvironmentIpc(getMainWindow: () => BrowserWindow | null): void
  registerSystemIpc(getMainWindow: () => BrowserWindow | null): void
  registerScreenshotIpc(): void
  registerFloatBallIpc(): void
  registerUpdateIpc(getMainWindow: () => BrowserWindow | null): void
  registerWebActivatorIpc(): void
  registerWslIpc(): void
  registerSpaceCleanupIpc(getMainWindow: () => BrowserWindow | null): void
  registerDownloadOrganizerIpc(getMainWindow: () => BrowserWindow | null): void
  registerModelDownloadIpc(getMainWindow: () => BrowserWindow | null): void
  registerBilibiliDownloaderIpc(getMainWindow: () => BrowserWindow | null): void
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
  registrars.registerAutoClickerIpc()
  registrars.registerClipboardIpc()
  registrars.registerColorPickerIpc()
  registrars.registerHotkeyIpc()
  registrars.registerLocalProxyIpc()
  registrars.registerNetworkIpc()
  registrars.registerTranslateIpc()
  registrars.registerLlmIpc()
  registrars.registerTaskbarAppearanceIpc()
  registrars.registerRenameIpc()
  registrars.registerQuickInstallerIpc()
  registrars.registerScreenOverlayIpc()
  registrars.registerScreenRecorderIpc(getMainWindow)
  registrars.registerScreenSaverIpc()
  registrars.registerSettingsIpc(getMainWindow)
  registrars.registerStoreIpc(getMainWindow)
  registrars.registerDoctorIpc()
  registrars.registerDevEnvironmentIpc(getMainWindow)
  registrars.registerSystemIpc(getMainWindow)
  registrars.registerScreenshotIpc()
  registrars.registerFloatBallIpc()
  registrars.registerUpdateIpc(getMainWindow)
  registrars.registerWebActivatorIpc()
  registrars.registerWslIpc()
  registrars.registerSpaceCleanupIpc(getMainWindow)
  registrars.registerDownloadOrganizerIpc(getMainWindow)
  registrars.registerModelDownloadIpc(getMainWindow)
  registrars.registerBilibiliDownloaderIpc(getMainWindow)
}
