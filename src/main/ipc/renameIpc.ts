import { ipcMain } from 'electron'
import { renameService } from '../services/RenameService'
import { RenameFilesSchema } from '../../shared/ipc-schemas'

export function registerRenameIpc() {
  ipcMain.handle('rename-files', async (_event, params) => {
    try {
      const { files, mode, options } = RenameFilesSchema.parse(params)
      return renameService.renameFiles(files, mode, options)
    } catch (e: any) {
      return { success: false, error: 'Invalid parameters for rename-files: ' + e.message }
    }
  })

  ipcMain.handle('get-file-info', async (_event, filePaths) => {
    return renameService.getFileInfo(filePaths)
  })
}
