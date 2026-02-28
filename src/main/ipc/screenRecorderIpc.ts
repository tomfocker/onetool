import { ipcMain, BrowserWindow } from 'electron'
import { screenRecorderService } from '../services/ScreenRecorderService'
import { ScreenRecorderConfigSchema } from '../../shared/ipc-schemas'

export function registerScreenRecorderIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('screen-recorder-select-output', async () => {
    return screenRecorderService.selectOutput(getMainWindow())
  })

  ipcMain.handle('screen-recorder-get-windows', async () => {
    return screenRecorderService.getWindows()
  })

  ipcMain.handle('screen-recorder-start', async (_event, config) => {
    try {
      const validConfig = ScreenRecorderConfigSchema.parse(config)
      return screenRecorderService.start(validConfig)
    } catch (e: any) {
      return { success: false, error: 'Invalid configuration for screen recorder: ' + e.message }
    }
  })

  ipcMain.handle('screen-recorder-stop', async () => {
    return screenRecorderService.stop()
  })

  ipcMain.handle('screen-recorder-status', async () => {
    return screenRecorderService.getStatus()
  })

  ipcMain.handle('screen-recorder-get-default-path', async () => {
    return screenRecorderService.getDefaultPath()
  })
}
