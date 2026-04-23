import type { BrowserWindow } from 'electron'

export type MainProcessIpcRegistrars = {
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

export function registerIpc(input: {
  mainWindowProvider: () => BrowserWindow | null
  registrars: MainProcessIpcRegistrars
}): void {
  const { mainWindowProvider, registrars } = input

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
  registrars.registerScreenRecorderIpc(mainWindowProvider)
  registrars.registerScreenSaverIpc()
  registrars.registerSettingsIpc(mainWindowProvider)
  registrars.registerStoreIpc(mainWindowProvider)
  registrars.registerDoctorIpc()
  registrars.registerDevEnvironmentIpc(mainWindowProvider)
  registrars.registerSystemIpc(mainWindowProvider)
  registrars.registerScreenshotIpc()
  registrars.registerFloatBallIpc()
  registrars.registerUpdateIpc(mainWindowProvider)
  registrars.registerWebActivatorIpc()
  registrars.registerWslIpc()
  registrars.registerSpaceCleanupIpc(mainWindowProvider)
  registrars.registerDownloadOrganizerIpc(mainWindowProvider)
  registrars.registerModelDownloadIpc(mainWindowProvider)
  registrars.registerBilibiliDownloaderIpc(mainWindowProvider)
}
