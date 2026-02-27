import { ipcMain } from 'electron'
import { screenshotService } from '../services/ScreenshotService'
import { settingsService } from '../services/SettingsService'

export function registerScreenshotIpc() {
  ipcMain.handle('screenshot-capture', async (_event, bounds) => {
    return screenshotService.capture(bounds)
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

  ipcMain.handle('screenshot-settings-set', async (_event, { savePath, autoSave }) => {
    settingsService.updateSettings({ screenshotSavePath: savePath, autoSaveScreenshot: autoSave })
    return { success: true }
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
