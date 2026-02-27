import { ipcMain } from 'electron'
import { windowManagerService } from '../services/WindowManagerService'

export function registerWindowIpc() {
  ipcMain.handle('window-minimize', async () => {
    return windowManagerService.minimize()
  })

  ipcMain.handle('window-maximize', async () => {
    return windowManagerService.maximize()
  })

  ipcMain.handle('window-close', async () => {
    return windowManagerService.close()
  })

  ipcMain.handle('window-is-maximized', async () => {
    return windowManagerService.isMaximized()
  })
}
