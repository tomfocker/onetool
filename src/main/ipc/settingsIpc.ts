import { ipcMain, BrowserWindow } from 'electron'
import { settingsService } from '../services/SettingsService'

export function registerSettingsIpc(getMainWindow: () => BrowserWindow | null) {
  // 获取初始设置
  ipcMain.handle('settings-get-all', () => {
    return { success: true, data: settingsService.getSettings() }
  })

  // 更新设置
  ipcMain.handle('settings-update', (_event, updates) => {
    settingsService.updateSettings(updates)
    return { success: true }
  })

  // 监听内部设置变更并推送到前端
  settingsService.on('changed', (newSettings) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings-changed', newSettings)
    }
  })
}
