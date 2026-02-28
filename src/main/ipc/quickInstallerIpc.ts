import { ipcMain } from 'electron'
import { quickInstallerService } from '../services/QuickInstallerService'
import { InstallSoftwareSchema } from '../../shared/ipc-schemas'

export function registerQuickInstallerIpc() {
  ipcMain.handle('quick-installer-install', async (_event, softwareList) => {
    try {
      const validList = InstallSoftwareSchema.parse(softwareList)
      return quickInstallerService.installSoftware(validList)
    } catch (e: any) {
      return { success: false, error: 'Invalid software list for install: ' + e.message }
    }
  })
}
