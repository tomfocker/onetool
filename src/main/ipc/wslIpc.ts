import { ipcMain } from 'electron'
import { wslService } from '../services/WslService'
import type { WslBackupFormat, WslRestoreMode } from '../../shared/types'

export function registerWslIpc() {
  ipcMain.handle('wsl:get-overview', async () => {
    return wslService.getOverview()
  })

  ipcMain.handle('wsl:get-backups', async () => {
    return wslService.getBackups()
  })

  ipcMain.handle('wsl:set-default', async (_event, name: string) => {
    return wslService.setDefault(name)
  })

  ipcMain.handle('wsl:terminate', async (_event, name: string) => {
    return wslService.terminate(name)
  })

  ipcMain.handle('wsl:shutdown-all', async () => {
    return wslService.shutdownAll()
  })

  ipcMain.handle('wsl:create-backup', async (_event, name: string, format: WslBackupFormat) => {
    return wslService.createBackup(name, format)
  })

  ipcMain.handle('wsl:delete-backup', async (_event, id: string) => {
    return wslService.deleteBackup(id)
  })

  ipcMain.handle('wsl:restore-backup', async (_event, id: string, mode: WslRestoreMode, targetName?: string) => {
    return wslService.restoreBackup(id, mode, targetName)
  })

  ipcMain.handle('wsl:reclaim-space', async (_event, name: string) => {
    return wslService.reclaimSpace(name)
  })

  ipcMain.handle('wsl:launch-shell', async (_event, name: string) => {
    return wslService.launchShell(name)
  })
}
