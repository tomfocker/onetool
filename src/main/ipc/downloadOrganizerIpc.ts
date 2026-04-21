import { ipcMain, BrowserWindow, dialog } from 'electron'
import { downloadOrganizerService } from '../services/DownloadOrganizerService'

export function registerDownloadOrganizerIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('download-organizer-get-state', () => {
    return downloadOrganizerService.getState()
  })

  ipcMain.handle('download-organizer-update-config', async (_event, updates) => {
    return downloadOrganizerService.updateConfig(updates)
  })

  ipcMain.handle('download-organizer-preview', () => {
    return downloadOrganizerService.preview()
  })

  ipcMain.handle('download-organizer-apply-preview', () => {
    return downloadOrganizerService.applyPreview()
  })

  ipcMain.handle('download-organizer-toggle-watch', async (_event, enabled: boolean) => {
    return downloadOrganizerService.updateConfig({ enabled })
  })

  ipcMain.handle('download-organizer-choose-watch-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
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

    await downloadOrganizerService.updateConfig({ watchPath: result.filePaths[0] })
    return {
      success: true,
      data: {
        canceled: false,
        path: result.filePaths[0]
      }
    }
  })

  ipcMain.handle('download-organizer-choose-destination-root', async () => {
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

    await downloadOrganizerService.updateConfig({ destinationRoot: result.filePaths[0] })
    return {
      success: true,
      data: {
        canceled: false,
        path: result.filePaths[0]
      }
    }
  })

  downloadOrganizerService.onStateChanged((state) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send('download-organizer-state-changed', state)
  })
}
