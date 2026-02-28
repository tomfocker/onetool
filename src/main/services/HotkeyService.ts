import { globalShortcut, BrowserWindow } from 'electron'
import { settingsService } from './SettingsService'
import { screenOverlayService } from './ScreenOverlayService'
import { IpcResponse } from '../../shared/types'

export class HotkeyService {
  private mainWindow: BrowserWindow | null = null

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  registerRecorderShortcut() {
    try {
      const settings = settingsService.getSettings()
      globalShortcut.unregister(settings.recorderHotkey)
      globalShortcut.register(settings.recorderHotkey, () => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('screen-recorder-toggle-hotkey')
        }
      })
    } catch (e) {
      console.error('HotkeyService: Error registering recorder shortcut:', e)
    }
  }

  registerScreenshotShortcut() {
    try {
      const settings = settingsService.getSettings()
      globalShortcut.unregister(settings.screenshotHotkey)
      globalShortcut.register(settings.screenshotHotkey, () => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('super-screenshot-trigger')
        }
      })
    } catch (e) {
      console.error('HotkeyService: Error registering screenshot shortcut:', e)
    }
  }

  registerTranslatorShortcut() {
    try {
      globalShortcut.unregister('Alt+Shift+T')
      globalShortcut.register('Alt+Shift+T', async () => {
        console.log('Global shortcut Alt+Shift+T pressed')
        await screenOverlayService.start()
      })
    } catch (e) {
      console.error('HotkeyService: Error registering translator shortcut:', e)
    }
  }

  registerFloatBallShortcut() {
    try {
      const settings = settingsService.getSettings()
      globalShortcut.unregister(settings.floatBallHotkey)
      globalShortcut.register(settings.floatBallHotkey, () => {
        const { windowManagerService } = require('./WindowManagerService')
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall && !floatBall.isDestroyed()) {
          floatBall.webContents.send('floatball-toggle')
        }
      })
    } catch (e) {
      console.error('HotkeyService: Error registering floatball shortcut:', e)
    }
  }

  getRecorderHotkey(): IpcResponse<string> {
    return { success: true, data: settingsService.getSettings().recorderHotkey }
  }

  setRecorderHotkey(hotkey: string): IpcResponse {
    try {
      const settings = settingsService.getSettings()
      globalShortcut.unregister(settings.recorderHotkey)
      const success = globalShortcut.register(hotkey, () => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('screen-recorder-toggle-hotkey')
        }
      })

      if (success) {
        settingsService.updateSettings({ recorderHotkey: hotkey })
        return { success: true }
      } else {
        this.registerRecorderShortcut()
        return { success: false, error: '快捷键已被占用或无效' }
      }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  getScreenshotHotkey(): IpcResponse<string> {
    return { success: true, data: settingsService.getSettings().screenshotHotkey }
  }

  setScreenshotHotkey(hotkey: string): IpcResponse {
    try {
      const settings = settingsService.getSettings()
      globalShortcut.unregister(settings.screenshotHotkey)
      const success = globalShortcut.register(hotkey, () => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('super-screenshot-trigger')
        }
      })

      if (success) {
        settingsService.updateSettings({ screenshotHotkey: hotkey })
        return { success: true }
      } else {
        this.registerScreenshotShortcut()
        return { success: false, error: '快捷键已被占用或无效' }
      }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  getFloatBallHotkey(): IpcResponse<string> {
    return { success: true, data: settingsService.getSettings().floatBallHotkey }
  }

  setFloatBallHotkey(hotkey: string): IpcResponse {
    try {
      const settings = settingsService.getSettings()
      globalShortcut.unregister(settings.floatBallHotkey)
      const success = globalShortcut.register(hotkey, () => {
        const { windowManagerService } = require('./WindowManagerService')
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall && !floatBall.isDestroyed()) {
          floatBall.webContents.send('floatball-toggle')
        }
      })

      if (success) {
        settingsService.updateSettings({ floatBallHotkey: hotkey })
        return { success: true }
      } else {
        this.registerFloatBallShortcut()
        return { success: false, error: '快捷键已被占用或无效' }
      }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }
}

export const hotkeyService = new HotkeyService()
