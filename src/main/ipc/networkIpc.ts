import { ipcMain } from 'electron'
import { networkService } from '../services/NetworkService'

export function registerNetworkIpc() {
  ipcMain.handle('network:ping', async (_event, host: string) => {
    return networkService.ping(host)
  })

  ipcMain.handle('network:get-info', async () => {
    return networkService.getInfo()
  })

  ipcMain.handle('network:scan-lan', async (_event, targetSubnet: string) => {
    return networkService.scanLan(targetSubnet)
  })
}
