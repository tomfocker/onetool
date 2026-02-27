import { ipcMain } from 'electron'
import { autoClickerService } from '../services/AutoClickerService'
import { IpcResponse } from '../../shared/types'

export function registerAutoClickerIpc() {
  ipcMain.handle('autoclicker-start', async (_event, config: { interval: number; button: string }): Promise<IpcResponse> => {
    return autoClickerService.start(config)
  })

  ipcMain.handle('autoclicker-stop', async (): Promise<IpcResponse> => {
    autoClickerService.stop()
    return { success: true }
  })

  ipcMain.handle('autoclicker-update-config', async (_event, config: any): Promise<IpcResponse> => {
    return autoClickerService.updateConfig(config)
  })

  ipcMain.handle('autoclicker-status', async (): Promise<IpcResponse<{ running: boolean; config: any }>> => {
    return {
      success: true,
      data: autoClickerService.getStatus()
    }
  })
}
