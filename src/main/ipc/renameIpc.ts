import { ipcMain } from 'electron'
import { renameService } from '../services/RenameService'

export function registerRenameIpc() {
  ipcMain.handle('rename-files', async (_event, { files, mode, options }) => {
    return renameService.renameFiles(files, mode, options)
  })

  ipcMain.handle('get-file-info', async (_event, filePaths) => {
    return renameService.getFileInfo(filePaths)
  })
}
