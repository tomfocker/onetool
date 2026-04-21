import { BrowserWindow, dialog, ipcMain } from 'electron'
import { modelDownloadService } from '../services/ModelDownloadService'

export function registerModelDownloadIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('model-download-get-state', () => {
    return modelDownloadService.getState()
  })

  ipcMain.handle('model-download-start', async (_event, request) => {
    return modelDownloadService.startDownload(request)
  })

  ipcMain.handle('model-download-cancel', () => {
    return modelDownloadService.cancelDownload()
  })

  ipcMain.handle('model-download-choose-save-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || !result.filePaths[0]) {
      return {
        success: true,
        data: {
          canceled: true,
          path: null
        }
      }
    }

    return {
      success: true,
      data: {
        canceled: false,
        path: result.filePaths[0]
      }
    }
  })

  ipcMain.handle('model-download-open-path', async (_event, targetPath?: string) => {
    return modelDownloadService.openPath(targetPath)
  })

  modelDownloadService.onStateChanged((state) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send('model-download-state-changed', state)
  })
}
