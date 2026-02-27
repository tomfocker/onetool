import { ipcMain } from 'electron'
import { screenSaverService } from '../services/ScreenSaverService'

export function registerScreenSaverIpc() {
  ipcMain.handle('start-screen-saver', async () => {
    return screenSaverService.start()
  })
}
