import { ipcMain } from 'electron'
import { networkService } from '../services/NetworkService'
import { NetPingSchema, NetScanSchema } from '../../shared/ipc-schemas'

export function registerNetworkIpc() {
  ipcMain.handle('network:ping', async (_event, host: string) => {
    try {
      const validHost = NetPingSchema.parse(host)
      return networkService.ping(validHost)
    } catch (e: any) {
      return { success: false, error: 'Invalid host for ping: ' + e.message }
    }
  })

  ipcMain.handle('network:ping-batch', async (_event, hosts: string[]) => {
    try {
      const validHosts = hosts.map(h => NetPingSchema.parse(h))
      return networkService.pingBatch(validHosts)
    } catch (e: any) {
      return { success: false, error: 'Invalid hosts for ping-batch: ' + e.message }
    }
  })

  ipcMain.handle('network:get-info', async () => {
    return networkService.getInfo()
  })

  ipcMain.handle('network:scan-lan', async (_event, targetSubnet: string) => {
    try {
      const validSubnet = NetScanSchema.parse(targetSubnet)
      return networkService.scanLan(validSubnet)
    } catch (e: any) {
      return { success: false, error: 'Invalid subnet for scan: ' + e.message }
    }
  })
}
