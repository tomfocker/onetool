import { ipcMain, BrowserWindow } from 'electron'
import { devEnvironmentService } from '../services/DevEnvironmentService'
import type { DevEnvironmentId } from '../../shared/devEnvironment'

export function registerDevEnvironmentIpc(getMainWindow: () => BrowserWindow | null) {
  devEnvironmentService.setMainWindow(getMainWindow())

  ipcMain.handle('dev-environment-get-overview', async () => {
    devEnvironmentService.setMainWindow(getMainWindow())
    return devEnvironmentService.inspectAll()
  })

  ipcMain.handle('dev-environment-refresh-all', async () => {
    devEnvironmentService.setMainWindow(getMainWindow())
    return devEnvironmentService.inspectAll()
  })

  ipcMain.handle('dev-environment-refresh-one', async (_event, id: DevEnvironmentId) => {
    devEnvironmentService.setMainWindow(getMainWindow())
    return devEnvironmentService.inspectOne(id)
  })

  ipcMain.handle('dev-environment-install', async (_event, id: DevEnvironmentId) => {
    devEnvironmentService.setMainWindow(getMainWindow())
    return devEnvironmentService.install(id)
  })

  ipcMain.handle('dev-environment-update', async (_event, id: DevEnvironmentId) => {
    devEnvironmentService.setMainWindow(getMainWindow())
    return devEnvironmentService.update(id)
  })

  ipcMain.handle('dev-environment-update-all', async () => {
    devEnvironmentService.setMainWindow(getMainWindow())
    return devEnvironmentService.updateAll()
  })

  ipcMain.handle('dev-environment-open-related-tool', async (_event, id: DevEnvironmentId) => {
    devEnvironmentService.setMainWindow(getMainWindow())
    return devEnvironmentService.openRelatedTool(id)
  })
}
