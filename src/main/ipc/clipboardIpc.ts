import { ipcMain, nativeImage, clipboard } from 'electron'
import { clipboardService } from '../services/ClipboardService'

export function registerClipboardIpc() {
  ipcMain.on('get-clipboard-history', (event) => {
    event.reply('clipboard-history', clipboardService.getHistory())
  })

  ipcMain.on('delete-clipboard-item', (_event, id: string) => {
    clipboardService.deleteItem(id)
  })

  ipcMain.on('toggle-clipboard-pin', (_event, id: string) => {
    clipboardService.togglePin(id)
  })

  ipcMain.on('clear-clipboard-history', () => {
    clipboardService.clearHistory()
  })

  ipcMain.on('copy-image-to-clipboard', (_event, dataUrl: string) => {
    try {
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      const image = nativeImage.createFromBuffer(buffer)
      clipboard.writeImage(image)
    } catch (error) {
      console.error('clipboardIpc: Failed to copy image:', error)
    }
  })
}
