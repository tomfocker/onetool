import { ipcMain, BrowserWindow } from 'electron'
import { systemService } from '../services/SystemService'
import { settingsService } from '../services/SettingsService'

export function registerSystemIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('get-system-config', async () => {
    return systemService.getSystemConfig()
  })

  ipcMain.handle('autostart-get-status', async () => {
    return systemService.getAutoStartStatus()
  })

  ipcMain.handle('autostart-set', async (_event, enabled: boolean) => {
    return systemService.setAutoStart(enabled)
  })

  ipcMain.handle('select-files-folders', async () => {
    return systemService.selectFilesAndFolders(getMainWindow())
  })

  ipcMain.handle('select-directory', async () => {
    return systemService.selectDirectory(getMainWindow())
  })
}
