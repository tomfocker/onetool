import { ipcMain } from 'electron'
import { localProxyService } from '../services/LocalProxyService'
import { LocalProxyConfig } from '../../shared/types'

export function registerLocalProxyIpc() {
  ipcMain.handle('local-proxy:get-status', async () => {
    return localProxyService.getStatus()
  })

  ipcMain.handle('local-proxy:set-config', async (_event, config: LocalProxyConfig) => {
    return localProxyService.setConfig(config)
  })

  ipcMain.handle('local-proxy:disable', async () => {
    return localProxyService.disable()
  })

  ipcMain.handle('local-proxy:open-system-settings', async () => {
    return localProxyService.openSystemSettings()
  })
}
