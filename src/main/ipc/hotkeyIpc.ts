import { ipcMain } from 'electron'
import { hotkeyService } from '../services/HotkeyService'

export function registerHotkeyIpc() {
  ipcMain.handle('recorder-hotkey-get', async () => {
    return hotkeyService.getRecorderHotkey()
  })

  ipcMain.handle('recorder-hotkey-set', async (_event, hotkey: string) => {
    return hotkeyService.setRecorderHotkey(hotkey)
  })

  ipcMain.handle('screenshot-hotkey-get', async () => {
    return hotkeyService.getScreenshotHotkey()
  })

  ipcMain.handle('screenshot-hotkey-set', async (_event, hotkey: string) => {
    return hotkeyService.setScreenshotHotkey(hotkey)
  })

  ipcMain.handle('clipboard-hotkey-get', async () => {
    return hotkeyService.getClipboardHotkey()
  })

  ipcMain.handle('clipboard-hotkey-set', async (_event, hotkey: string) => {
    return hotkeyService.setClipboardHotkey(hotkey)
  })
}
