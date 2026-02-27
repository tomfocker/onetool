import { ipcMain } from 'electron'
import { screenOverlayService } from '../services/ScreenOverlayService'

export function registerScreenOverlayIpc() {
  ipcMain.handle('screen-overlay-start', async () => {
    return screenOverlayService.start()
  })

  ipcMain.handle('screen-overlay-close', async () => {
    return screenOverlayService.close()
  })
}
