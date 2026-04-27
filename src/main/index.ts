import { app, shell, BrowserWindow, nativeImage, globalShortcut, NativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import path from 'path'

// Import Services
import { settingsService } from './services/SettingsService'
import { doctorService } from './services/DoctorService'
import { autoClickerService } from './services/AutoClickerService'
import { clipboardService } from './services/ClipboardService'
import { hotkeyService } from './services/HotkeyService'
import { colorPickerService } from './services/ColorPickerService'
import { webActivatorService } from './services/WebActivatorService'
import { quickInstallerService } from './services/QuickInstallerService'
import { screenOverlayService } from './services/ScreenOverlayService'
import { screenRecorderService } from './services/ScreenRecorderService'
import { windowManagerService } from './services/WindowManagerService'
import { processRegistry } from './services/ProcessRegistry'
import { screenshotService } from './services/ScreenshotService'
import { appUpdateService, registerAutoUpdateSettingsChangeHandler } from './services/AppUpdateService'
import { createIsolatedPreloadWebPreferences } from './utils/windowSecurity'
import { logger } from './utils/logger'
import { serializeUnhandledReason, shouldHideMainWindowOnClose } from './utils/runtimePolicy'
import { createBeforeQuitAndInstallHook } from './utils/updateInstallFlow'
import {
  bindMainWindowServices,
  initializeMainRuntime,
  registerMainProcessIpc,
  scheduleDoctorAudit
} from './bootstrap/runtimeBootstrap'
import { registerAppLifecycle } from './bootstrap/appLifecycle'
import { createMainWindow } from './bootstrap/createMainWindow'
import { registerProcessDiagnostics } from './bootstrap/diagnostics'
import { setupSingleInstance } from './bootstrap/singleInstance'
import { startWarmups } from './bootstrap/startWarmups'

// Import IPC Handlers
import { registerAutoClickerIpc } from './ipc/autoClickerIpc'
import { registerClipboardIpc } from './ipc/clipboardIpc'
import { registerColorPickerIpc } from './ipc/colorPickerIpc'
import { registerHotkeyIpc } from './ipc/hotkeyIpc'
import { registerNetworkIpc } from './ipc/networkIpc'
import { registerLocalProxyIpc } from './ipc/localProxyIpc'
import { registerRenameIpc } from './ipc/renameIpc'
import { registerQuickInstallerIpc } from './ipc/quickInstallerIpc'
import { registerScreenOverlayIpc } from './ipc/screenOverlayIpc'
import { registerScreenRecorderIpc } from './ipc/screenRecorderIpc'
import { registerScreenSaverIpc } from './ipc/screenSaverIpc'
import { registerSettingsIpc } from './ipc/settingsIpc'
import { registerStoreIpc } from './ipc/storeIpc'
import { registerDoctorIpc } from './ipc/doctorIpc'
import { registerDevEnvironmentIpc } from './ipc/devEnvironmentIpc'
import { registerSystemIpc } from './ipc/systemIpc'
import { registerWindowIpc } from './ipc/windowIpc'
import { registerScreenshotIpc } from './ipc/screenshotIpc'
import { registerFloatBallIpc } from './ipc/floatBallIpc'
import { registerCalendarIpc } from './ipc/calendarIpc'
import { registerTranslateIpc } from './ipc/translateIpc'
import { registerLlmIpc } from './ipc/llmIpc'
import { registerTaskbarAppearanceIpc, restoreTaskbarAppearanceOnStartup } from './ipc/taskbarAppearanceIpc'
import { registerUpdateIpc } from './ipc/updateIpc'
import { registerWebActivatorIpc } from './ipc/webActivatorIpc'
import { registerWslIpc } from './ipc/wslIpc'
import { registerSpaceCleanupIpc } from './ipc/spaceCleanupIpc'
import { spaceCleanupService } from './services/SpaceCleanupService'
import { registerDownloadOrganizerIpc } from './ipc/downloadOrganizerIpc'
import { downloadOrganizerService } from './services/DownloadOrganizerService'
import { registerModelDownloadIpc } from './ipc/modelDownloadIpc'
import { registerTableOcrIpc } from './ipc/tableOcrIpc'
import { registerBilibiliDownloaderIpc } from './ipc/bilibiliDownloaderIpc'
import { calendarReminderService } from './services/CalendarReminderService'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Capture unhandled exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error)
  })

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      promise: String(promise),
      reason: serializeUnhandledReason(reason)
    })
  })

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')

  const preloadPath = join(__dirname, '../preload/index.js')
  const rendererHtmlPath = join(__dirname, '../renderer/index.html')

  mainWindow = createMainWindow({
    BrowserWindow,
    shell,
    runtime: {
      isDevelopment: is.dev,
      rendererUrl: process.env['ELECTRON_RENDERER_URL']
    },
    assets: {
      iconPath,
      preloadPath,
      rendererHtmlPath
    },
    settingsService,
    windowManagerService,
    clipboardService,
    logger,
    shouldHideMainWindowOnClose,
    createWindowIcon: (resolvedIconPath) => {
      if (fs.existsSync(resolvedIconPath)) {
        return nativeImage.createFromPath(resolvedIconPath)
      }
      return undefined
    },
    createPreloadPreferences: (resolvedPreloadPath) =>
      createIsolatedPreloadWebPreferences(resolvedPreloadPath),
    bindMainWindowServices: (window) =>
      bindMainWindowServices(window, {
        autoClickerService,
        clipboardService,
        hotkeyService,
        screenRecorderService,
        screenOverlayService,
        colorPickerService,
        webActivatorService,
        quickInstallerService,
        spaceCleanupService,
        downloadOrganizerService,
        windowManagerService,
        screenshotService
      }),
    onWindowClosed: () => {
      mainWindow = null
    }
  })
}

const { hasLock } = setupSingleInstance({
  app,
  getMainWindow: () => mainWindow
})

if (hasLock) {
  registerProcessDiagnostics({
    processLike: process,
    app,
    logger,
    serializeUnhandledReason
  })
}

if (hasLock) {
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.onetool')

  startWarmups({
    settingsService,
    screenRecorderService,
    restoreTaskbarAppearanceOnStartup,
    scheduleDoctorAudit: () => scheduleDoctorAudit(() => mainWindow, { doctorService })
  })

  registerMainProcessIpc(() => mainWindow, {
    registerAutoClickerIpc,
    registerClipboardIpc,
    registerColorPickerIpc,
    registerHotkeyIpc,
    registerLocalProxyIpc,
    registerNetworkIpc,
    registerTranslateIpc,
    registerLlmIpc,
    registerTaskbarAppearanceIpc,
    registerRenameIpc,
    registerQuickInstallerIpc,
    registerScreenOverlayIpc,
    registerScreenRecorderIpc,
    registerScreenSaverIpc,
    registerSettingsIpc,
    registerStoreIpc,
    registerDoctorIpc,
    registerDevEnvironmentIpc,
    registerSystemIpc,
    registerScreenshotIpc,
    registerFloatBallIpc,
    registerCalendarIpc,
    registerUpdateIpc,
    registerWebActivatorIpc,
    registerWslIpc,
    registerSpaceCleanupIpc,
    registerDownloadOrganizerIpc,
    registerModelDownloadIpc,
    registerTableOcrIpc,
    registerBilibiliDownloaderIpc
  })

  registerWindowIpc()

  registerAppLifecycle({
    app,
    BrowserWindow,
    globalShortcut,
    optimizer,
    runtime: {
      platform: process.platform
    },
    createWindow,
    windowManagerService,
    autoClickerService,
    screenRecorderService,
    processRegistry
  })

  // Global Initializations
  createWindow()
  void initializeMainRuntime({
    settingsService,
    downloadOrganizerService,
    windowManagerService,
    calendarReminderService,
    appUpdateService,
    autoClickerService,
    hotkeyService,
    registerAutoUpdateSettingsChangeHandler: (input) => registerAutoUpdateSettingsChangeHandler(input as any),
    createBeforeQuitAndInstallHook,
    runtime: {
      platform: process.platform,
      isPackaged: app.isPackaged,
      isDevelopment: is.dev,
      isPortableWindowsRuntime:
        Boolean(process.env.PORTABLE_EXECUTABLE_FILE) || Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
    }
  })
})
}

