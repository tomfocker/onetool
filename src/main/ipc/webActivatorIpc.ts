import { ipcMain } from 'electron'
import { webActivatorService } from '../services/WebActivatorService'
import { z } from 'zod'
import { WebActivatorToggleSchema, WebActivatorShortcutSchema } from '../../shared/ipc-schemas'

export function registerWebActivatorIpc() {
  ipcMain.handle('web-activator-get-window-list', async () => {
    return webActivatorService.getWindowList()
  })

  ipcMain.handle('web-activator-check-visibility', async (_event, configs) => {
    return webActivatorService.checkVisibility(configs)
  })

  ipcMain.handle('web-activator-toggle-window', async (_event, config) => {
    try {
      const validConfig = WebActivatorToggleSchema.parse(config)
      let result;
      if (validConfig.type === 'app') result = await webActivatorService.toggleApp(validConfig.pattern, validConfig.id)
      else result = await webActivatorService.toggleTab(validConfig.pattern)

      if (result.success) return { success: true, data: { action: result.action } }
      else return { success: false, error: result.error }
    } catch (e: any) {
      return { success: false, error: 'Invalid configuration for web activator: ' + e.message }
    }
  })

  ipcMain.handle('web-activator-register-shortcuts', async (_event, configs) => {
    try {
      const validConfigs = z.array(WebActivatorShortcutSchema).parse(configs)
      return webActivatorService.registerShortcuts(validConfigs as any)
    } catch (e: any) {
      return { success: false, error: 'Invalid shortcuts for web activator: ' + e.message }
    }
  })
}
