import { ipcMain } from 'electron'
import { capsWriterService } from '../services/CapsWriterService'

export function registerCapsWriterIpc() {
  ipcMain.handle('capswriter-start-server', async () => {
    return capsWriterService.startServer()
  })

  ipcMain.handle('capswriter-start-client', async () => {
    return capsWriterService.startClient()
  })

  ipcMain.handle('capswriter-stop-server', async () => {
    return capsWriterService.stopServer()
  })

  ipcMain.handle('capswriter-stop-client', async () => {
    return capsWriterService.stopClient()
  })

  ipcMain.handle('capswriter-get-status', async () => {
    return capsWriterService.getStatus()
  })

  ipcMain.handle('capswriter-start-all', async () => {
    return capsWriterService.startAll()
  })

  ipcMain.handle('capswriter-stop-all', async () => {
    return capsWriterService.stopAll()
  })
}
