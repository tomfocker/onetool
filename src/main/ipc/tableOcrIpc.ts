import { BrowserWindow, dialog, ipcMain } from 'electron'
import { tableOcrService } from '../services/TableOcrService'
import { TABLE_OCR_IMAGE_EXTENSIONS } from '../../shared/tableOcr'
import type { TableOcrRecognizeRequest } from '../../shared/tableOcr'

export function registerTableOcrIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('table-ocr-get-status', () => {
    return tableOcrService.getStatus()
  })

  ipcMain.handle('table-ocr-prepare-runtime', () => {
    return tableOcrService.prepareRuntime()
  })

  ipcMain.handle('table-ocr-cancel-prepare', () => {
    return tableOcrService.cancelPrepare()
  })

  ipcMain.handle('table-ocr-recognize', async (_event, request: TableOcrRecognizeRequest) => {
    return tableOcrService.recognize(request)
  })

  ipcMain.handle('table-ocr-choose-image', async () => {
    const options = {
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: [...TABLE_OCR_IMAGE_EXTENSIONS]
        }
      ]
    } satisfies Electron.OpenDialogOptions
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)

    return {
      success: true,
      data: {
        canceled: result.canceled || !result.filePaths[0],
        path: result.filePaths[0] ?? null
      }
    }
  })

  ipcMain.handle('table-ocr-choose-output-dir', async () => {
    const options = {
      properties: ['openDirectory', 'createDirectory']
    } satisfies Electron.OpenDialogOptions
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)

    return {
      success: true,
      data: {
        canceled: result.canceled || !result.filePaths[0],
        path: result.filePaths[0] ?? null
      }
    }
  })

  ipcMain.handle('table-ocr-open-path', async (_event, targetPath: string) => {
    return tableOcrService.openPath(targetPath)
  })

  tableOcrService.onStateChanged((state) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send('table-ocr-state-changed', state)
  })
}
