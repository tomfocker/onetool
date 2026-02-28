import { ipcMain } from 'electron'
import { screenshotService } from '../services/ScreenshotService'
import { settingsService } from '../services/SettingsService'
import { ScreenshotCaptureSchema, ScreenshotSettingsSchema } from '../../shared/ipc-schemas'

export function registerScreenshotIpc() {
  ipcMain.handle('screenshot-capture', async (_event, bounds) => {
    try {
      const validBounds = ScreenshotCaptureSchema.parse(bounds)
      return screenshotService.capture(validBounds)
    } catch (e: any) {
      return { success: false, error: 'Invalid bounds for screenshot: ' + e.message }
    }
  })

  ipcMain.handle('screenshot-settings-get', async () => {
    const settings = settingsService.getSettings()
    return {
      success: true,
      data: {
        savePath: settings.screenshotSavePath,
        autoSave: settings.autoSaveScreenshot
      }
    }
  })

  ipcMain.handle('screenshot-settings-set', async (_event, params) => {
    try {
      const { savePath, autoSave } = ScreenshotSettingsSchema.parse(params)
      settingsService.updateSettings({ screenshotSavePath: savePath, autoSaveScreenshot: autoSave })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: 'Invalid settings for screenshot: ' + e.message }
    }
  })

  ipcMain.handle('save-image', async (_event, dataUrl, customPath) => {
    return screenshotService.saveImage(dataUrl, customPath)
  })

  ipcMain.handle('copy-to-clipboard-image', async (_event, dataUrl) => {
    return screenshotService.copyToClipboard(dataUrl)
  })

  ipcMain.handle('recorder-selection-open', async (_event, restrictBounds) => {
    screenshotService.openSelectionWindow(restrictBounds)
    return { success: true }
  })

  ipcMain.handle('recorder-selection-close', async (_event, bounds) => {
    screenshotService.closeSelectionWindow(bounds)
    return { success: true }
  })
}
