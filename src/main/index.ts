import { app, shell, BrowserWindow, nativeImage, globalShortcut, NativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import path from 'path'

// Import Services
import { settingsService } from './services/SettingsService'
import { doctorService } from './services/DoctorService'
import { autoClickerService } from './services/AutoClickerService'
import { capsWriterService } from './services/CapsWriterService'
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
import { registerStoreIpc } from './ipc/storeIpc'
import { registerDoctorIpc } from './ipc/doctorIpc'
import { registerSystemIpc } from './ipc/systemIpc'
import { registerWindowIpc } from './ipc/windowIpc'
import { registerScreenshotIpc } from './ipc/screenshotIpc'
import { registerFloatBallIpc } from './ipc/floatBallIpc'
import { registerTranslateIpc } from './ipc/translateIpc'

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
  screenshotService.setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // 窗口显示后延迟初始化剪贴板监听，确保 UI 已准备好接收初始历史数据
    setTimeout(() => {
      clipboardService.startWatcher()
    }, 1000)
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
  registerTranslateIpc()
  registerRenameIpc()
  registerQuickInstallerIpc()
  registerScreenOverlayIpc()
  registerScreenRecorderIpc(() => mainWindow)
  registerScreenSaverIpc()
  registerSettingsIpc(() => mainWindow)
  registerStoreIpc(() => mainWindow)
  registerDoctorIpc()
  registerSystemIpc(() => mainWindow)
  registerScreenshotIpc()
  registerFloatBallIpc()

  // Silent system health check
  setTimeout(async () => {
    const res = await doctorService.runFullAudit()
    if (res.success && res.data) {
      const issues = Object.entries(res.data).filter(([_, v]: [string, any]) => !v.ok)
      if (issues.length > 0 && mainWindow) {
        mainWindow.webContents.send('app-notification', {
          type: 'warning',
          title: '系统环境自检提醒',
          message: `发现 ${issues.length} 项环境依赖异常，部分工具可能无法正常工作。请前往设置页查看详情。`,
          duration: 10000
        })
      }
    }
  }, 3000)
  registerWindowIpc()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Global Initializations
  createWindow()
  // windowManagerService.createTray() // Optional: enable if tray is needed
  windowManagerService.createFloatBallWindow()

  autoClickerService.registerShortcuts()
  // clipboardService.startWatcher() // 移除此处的重复调用，改为在 ready-to-show 后启动
  hotkeyService.registerRecorderShortcut()
  hotkeyService.registerScreenshotShortcut()
  hotkeyService.registerTranslatorShortcut()
  hotkeyService.registerFloatBallShortcut()

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
