import { ipcMain } from 'electron'
import { colorPickerService } from '../services/ColorPickerService'

export function registerColorPickerIpc() {
  ipcMain.handle('color-picker:pick', async () => {
    return colorPickerService.pick()
  })
}
