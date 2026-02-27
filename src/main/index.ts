import { app, shell, BrowserWindow, nativeImage, globalShortcut, nativeTheme, NativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import path from 'path'

// Import Services
import { settingsService } from './services/SettingsService'
import { autoClickerService } from './services/AutoClickerService'
import { capsWriterService } from './services/CapsWriterService'
import { clipboardService } from './services/ClipboardService'
import { hotkeyService } from './services/HotkeyService'
import { colorPickerService } from './services/ColorPickerService'
import { webActivatorService } from './services/WebActivatorService'
import { networkService } from './services/NetworkService'
import { renameService } from './services/RenameService'
import { quickInstallerService } from './services/QuickInstallerService'
import { screenOverlayService } from './services/ScreenOverlayService'
import { screenRecorderService } from './services/ScreenRecorderService'
import { screenSaverService } from './services/ScreenSaverService'
import { systemService } from './services/SystemService'
import { windowManagerService } from './services/WindowManagerService'
import { processRegistry } from './services/ProcessRegistry'

// Import IPC Handlers
import { registerAutoClickerIpc } from './ipc/autoClickerIpc'
import { registerCapsWriterIpc } from './ipc/capsWriterIpc'
import { registerClipboardIpc } from './ipc/clipboardIpc'
import { registerColorPickerIpc } from './ipc/colorPickerIpc'
import { registerHotkeyIpc } from './ipc/hotkeyIpc'
import { registerNetworkIpc } from './ipc/networkIpc'
import { registerRenameIpc } from './ipc/renameIpc'
import { registerQuickInstallerIpc } from './ipc/quickInstallerIpc'
import { registerScreenOverlayIpc } from './ipc/screenOverlayIpc'
import { registerScreenRecorderIpc } from './ipc/screenRecorderIpc'
import { registerScreenSaverIpc } from './ipc/screenSaverIpc'
import { registerSettingsIpc } from './ipc/settingsIpc'
import { registerSystemIpc } from './ipc/systemIpc'
import { registerWindowIpc } from './ipc/windowIpc'

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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Initialize Services with MainWindow
  autoClickerService.setMainWindow(mainWindow)
  clipboardService.setMainWindow(mainWindow)
  hotkeyService.setMainWindow(mainWindow)
  screenRecorderService.setMainWindow(mainWindow)
  screenOverlayService.setMainWindow(mainWindow)
  colorPickerService.setMainWindow(mainWindow)
  webActivatorService.setMainWindow(mainWindow)
  quickInstallerService.setMainWindow(mainWindow)
  windowManagerService.setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (windowManagerService.getIsQuitting()) {
      mainWindow = null
    } else {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // Capture unhandled exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error)
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
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
  
  settingsService.loadSettings()
  screenRecorderService.initFfmpeg()

  // Register all IPC Handlers
  registerAutoClickerIpc()
  registerCapsWriterIpc()
  registerClipboardIpc()
  registerColorPickerIpc()
  registerHotkeyIpc()
  registerNetworkIpc()
  registerRenameIpc()
  registerQuickInstallerIpc()
  registerScreenOverlayIpc()
  registerScreenRecorderIpc(() => mainWindow)
  registerScreenSaverIpc()
  registerSettingsIpc(() => mainWindow)
  registerSystemIpc(() => mainWindow)
  registerWindowIpc()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Global Initializations
  createWindow()
  // windowManagerService.createTray() // Optional: enable if tray is needed
  windowManagerService.createFloatBallWindow()
  
  autoClickerService.registerShortcuts()
  clipboardService.startWatcher()
  hotkeyService.registerRecorderShortcut()
  hotkeyService.registerScreenshotShortcut()
  hotkeyService.registerTranslatorShortcut()

  // Retry shortcut registration after 1s to avoid conflicts
  setTimeout(() => {
    autoClickerService.registerShortcuts()
  }, 1000)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  windowManagerService.setIsQuitting(true)
  capsWriterService.stopAll()
  autoClickerService.stop()
  screenRecorderService.stop()
  processRegistry.killAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
