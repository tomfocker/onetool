import { ipcMain } from 'electron'
import { colorPickerService } from '../services/ColorPickerService'

export function registerColorPickerIpc() {
  ipcMain.handle('color-picker:enable', async () => {
    colorPickerService.enable()
    return { success: true }
  })

  ipcMain.handle('color-picker:disable', async () => {
    colorPickerService.disable()
    return { success: true }
  })

  ipcMain.handle('color-picker:pick', async () => {
    return colorPickerService.pick()
  })
}
