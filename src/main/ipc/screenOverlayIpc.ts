import { ipcMain } from 'electron'
import { screenOverlayService } from '../services/ScreenOverlayService'
import type { ScreenOverlayMode } from '../../shared/llm'

export function registerScreenOverlayIpc() {
  ipcMain.handle('screen-overlay-start', async (_event, mode: ScreenOverlayMode = 'translate') => {
    return screenOverlayService.start(mode)
  })

  ipcMain.handle('screen-overlay-close', async () => {
    return screenOverlayService.close()
  })
}
