import { BrowserWindow, dialog, ipcMain } from 'electron'
import { pdfToolsService } from '../services/PdfToolsService'
import {
  filterPdfToolInputPaths,
  getPdfToolAcceptedExtensions,
  getPdfToolModeLabel,
  PdfToolConvertRequest,
  PdfToolMode
} from '../../shared/pdfTools'

function createChooseFilesOptions(mode: PdfToolMode): Electron.OpenDialogOptions {
  return {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: getPdfToolModeLabel(mode),
        extensions: getPdfToolAcceptedExtensions(mode)
      }
    ]
  }
}

export function registerPdfToolsIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('pdf-tools-choose-files', async (_event, mode: PdfToolMode) => {
    const options = createChooseFilesOptions(mode)
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    const paths = filterPdfToolInputPaths(mode, result.filePaths)

    return {
      success: true,
      data: {
        canceled: result.canceled || paths.length === 0,
        paths
      }
    }
  })

  ipcMain.handle('pdf-tools-choose-output-dir', async () => {
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

  ipcMain.handle('pdf-tools-convert', async (_event, request: PdfToolConvertRequest) => {
    return pdfToolsService.convert(request)
  })

  ipcMain.handle('pdf-tools-open-path', async (_event, targetPath: string) => {
    return pdfToolsService.openPath(targetPath)
  })
}
