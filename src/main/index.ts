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
import { registerBilibiliDownloaderIpc } from './ipc/bilibiliDownloaderIpc'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')

  let windowIcon: NativeImage | undefined
  if (fs.existsSync(iconPath)) {
    windowIcon = nativeImage.createFromPath(iconPath)
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    center: true,
    resizable: true,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: createIsolatedPreloadWebPreferences(join(__dirname, '../preload/index.js'))
  })

  bindMainWindowServices(mainWindow, {
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
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // 窗口显示后延迟初始化剪贴板监听，确保 UI 已准备好接收初始历史数据
    setTimeout(() => {
      clipboardService.startWatcher()
    }, 1000)
  })

  mainWindow.on('close', (event) => {
    const minimizeToTray = settingsService.getSettings().minimizeToTray

    if (shouldHideMainWindowOnClose({
      isQuitting: windowManagerService.getIsQuitting(),
      minimizeToTray
    })) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('unresponsive', () => {
    logger.error('Main window became unresponsive')
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process gone', details)
  })

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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

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
    registerUpdateIpc,
    registerWebActivatorIpc,
    registerWslIpc,
    registerSpaceCleanupIpc,
    registerDownloadOrganizerIpc,
    registerModelDownloadIpc,
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

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('child-process-gone', (_event, details) => {
  logger.error('Child process gone', details)
})

