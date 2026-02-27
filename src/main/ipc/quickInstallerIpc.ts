import { ipcMain } from 'electron'
import { quickInstallerService } from '../services/QuickInstallerService'

export function registerQuickInstallerIpc() {
  ipcMain.handle('quick-installer-install', async (_event, softwareList) => {
    return quickInstallerService.installSoftware(softwareList)
  })
}
