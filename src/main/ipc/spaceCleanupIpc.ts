import { ipcMain, BrowserWindow } from 'electron'
import { spaceCleanupService } from '../services/SpaceCleanupService'

export function registerSpaceCleanupIpc(getMainWindow: () => BrowserWindow | null) {
  spaceCleanupService.setMainWindow(getMainWindow())

  ipcMain.handle('space-cleanup-choose-root', async () => {
    spaceCleanupService.setMainWindow(getMainWindow())
    return spaceCleanupService.chooseRoot()
  })

  ipcMain.handle('space-cleanup-start-scan', async (_event, rootPath: string) => {
    spaceCleanupService.setMainWindow(getMainWindow())
    return spaceCleanupService.startScan(rootPath)
  })

  ipcMain.handle('space-cleanup-cancel-scan', async () => {
    spaceCleanupService.setMainWindow(getMainWindow())
    return spaceCleanupService.cancelScan()
  })

  ipcMain.handle('space-cleanup-get-session', async () => {
    spaceCleanupService.setMainWindow(getMainWindow())
    return spaceCleanupService.getSession()
  })

  ipcMain.handle('space-cleanup-scan-directory-breakdown', async (_event, targetPath: string) => {
    return spaceCleanupService.scanDirectoryBreakdown(targetPath)
  })

  ipcMain.handle('space-cleanup-open-path', async (_event, targetPath: string) => {
    return spaceCleanupService.openPath(targetPath)
  })

  ipcMain.handle('space-cleanup-copy-path', async (_event, targetPath: string) => {
    return spaceCleanupService.copyPath(targetPath)
  })

  ipcMain.handle('space-cleanup-delete-to-trash', async (_event, targetPath: string) => {
    return spaceCleanupService.deleteToTrash(targetPath)
  })
}
