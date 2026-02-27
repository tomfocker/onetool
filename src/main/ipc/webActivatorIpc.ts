import { ipcMain } from 'electron'
import { webActivatorService } from '../services/WebActivatorService'

export function registerWebActivatorIpc() {
  ipcMain.handle('web-activator-get-window-list', async () => {
    return webActivatorService.getWindowList()
  })

  ipcMain.handle('web-activator-check-visibility', async (_event, configs) => {
    return webActivatorService.checkVisibility(configs)
  })

  ipcMain.handle('web-activator-toggle-window', async (_event, config) => {
    let result;
    if (config.type === 'app') result = await webActivatorService.toggleApp(config.pattern, config.id)
    else result = await webActivatorService.toggleTab(config.pattern)
    
    if (result.success) return { success: true, data: { action: result.action } }
    else return { success: false, error: result.error }
  })

  ipcMain.handle('web-activator-register-shortcuts', async (_event, configs) => {
    return webActivatorService.registerShortcuts(configs)
  })
}
