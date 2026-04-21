import { ipcMain } from 'electron'
import { taskbarAppearanceService } from '../services/TaskbarAppearanceService'

type TaskbarAppearanceServiceLike = Pick<
  typeof taskbarAppearanceService,
  'getStatus' | 'applyPreset' | 'restoreDefault'
>

export function registerTaskbarAppearanceIpc(service: TaskbarAppearanceServiceLike = taskbarAppearanceService) {
  ipcMain.handle('taskbar-appearance-get-status', () => {
    return service.getStatus()
  })

  ipcMain.handle('taskbar-appearance-apply-preset', async (_event, input) => {
    return service.applyPreset(input)
  })

  ipcMain.handle('taskbar-appearance-restore-default', async () => {
    return service.restoreDefault()
  })
}

export async function restoreTaskbarAppearanceOnStartup(
  service: TaskbarAppearanceServiceLike = taskbarAppearanceService
) {
  const status = service.getStatus()

  if (!status.success || !status.data) {
    return status
  }

  const { settings } = status.data

  if (!settings.enabled) {
    return service.restoreDefault()
  }

  return service.applyPreset({
    preset: settings.preset,
    intensity: settings.intensity,
    tintHex: settings.tintHex
  })
}
