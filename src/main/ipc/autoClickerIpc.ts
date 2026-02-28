import { ipcMain } from 'electron'
import { autoClickerService } from '../services/AutoClickerService'
import { IpcResponse } from '../../shared/types'
import { AutoClickerConfigSchema } from '../../shared/ipc-schemas'

export function registerAutoClickerIpc() {
  ipcMain.handle('autoclicker-start', async (_event, config): Promise<IpcResponse> => {
    try {
      const validConfig = AutoClickerConfigSchema.parse(config)
      return autoClickerService.start(validConfig as any)
    } catch (e: any) {
      return { success: false, error: 'Invalid configuration for auto clicker: ' + e.message }
    }
  })

  ipcMain.handle('autoclicker-stop', async (): Promise<IpcResponse> => {
    autoClickerService.stop()
    return { success: true }
  })

  ipcMain.handle('autoclicker-update-config', async (_event, config: any): Promise<IpcResponse> => {
    try {
      const validConfig = AutoClickerConfigSchema.parse(config)
      return autoClickerService.updateConfig(validConfig)
    } catch (e: any) {
      return { success: false, error: 'Invalid configuration update for auto clicker: ' + e.message }
    }
  })

  ipcMain.handle('autoclicker-status', async (): Promise<IpcResponse<{ running: boolean; config: any }>> => {
    return {
      success: true,
      data: autoClickerService.getStatus()
    }
  })
}
