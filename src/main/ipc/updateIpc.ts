import { BrowserWindow, ipcMain } from 'electron'
import { appUpdateService } from '../services/AppUpdateService'
import type { UpdateState } from '../../shared/appUpdate'

function pushUpdateState(getMainWindow: () => BrowserWindow | null, state: UpdateState): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('updates-state-changed', state)
  }
}

export function registerUpdateIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('updates-get-state', () => {
    return { success: true, data: appUpdateService.getState() }
  })

  ipcMain.handle('updates-check', async () => {
    return appUpdateService.checkForUpdates()
  })

  ipcMain.handle('updates-download', async () => {
    return appUpdateService.downloadUpdate()
  })

  ipcMain.handle('updates-quit-and-install', async () => {
    return appUpdateService.quitAndInstall()
  })

  appUpdateService.on('state-changed', (state: UpdateState) => {
    pushUpdateState(getMainWindow, state)
  })
}
