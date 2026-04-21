import { BrowserWindow, dialog, ipcMain } from 'electron'
import { z } from 'zod'
import {
  BilibiliDownloaderSelectionSchema,
  BilibiliDownloaderStateSchema,
  BilibiliParseLinkRequestSchema
} from '../../shared/ipc-schemas'
import { bilibiliDownloaderService } from '../services/BilibiliDownloaderService'

const BilibiliLoadStreamOptionsRequestSchema = z.object({
  kind: z.enum(['video', 'episode', 'season']),
  itemId: z.string().min(1)
})

const BilibiliStartDownloadRequestSchema = BilibiliDownloaderSelectionSchema.extend({
  outputDirectory: z.string().min(1).optional()
})

type ChooseOutputDirectory = () => Promise<{ success: boolean; data?: { canceled: boolean; path: string | null }; error?: string }>

type RegisterBilibiliDownloaderIpcDependencies = {
  chooseOutputDirectory?: ChooseOutputDirectory
}

function formatValidationError(error: z.ZodError) {
  const issue = error.issues[0]
  return issue?.message ?? 'Invalid Bilibili downloader request'
}

function validateRequest<T>(schema: z.ZodType<T>, payload: unknown) {
  const result = schema.safeParse(payload)
  if (!result.success) {
    return {
      success: false as const,
      error: formatValidationError(result.error)
    }
  }

  return {
    success: true as const,
    data: result.data
  }
}

async function chooseOutputDirectoryWithDialog() {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || !result.filePaths[0]) {
      return {
        success: true,
        data: {
          canceled: true,
          path: null
        }
      }
    }

    return {
      success: true,
      data: {
        canceled: false,
        path: result.filePaths[0]
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function registerBilibiliDownloaderIpc(
  getMainWindow: () => BrowserWindow | null,
  dependencies: RegisterBilibiliDownloaderIpcDependencies = {}
) {
  const chooseOutputDirectory = dependencies.chooseOutputDirectory ?? chooseOutputDirectoryWithDialog

  ipcMain.handle('bilibili-downloader-get-session', () => {
    return bilibiliDownloaderService.loadSession()
  })

  ipcMain.handle('bilibili-downloader-start-login', () => {
    return bilibiliDownloaderService.bootstrapQrLogin()
  })

  ipcMain.handle('bilibili-downloader-poll-login', () => {
    return bilibiliDownloaderService.pollLogin()
  })

  ipcMain.handle('bilibili-downloader-logout', () => {
    return bilibiliDownloaderService.logout()
  })

  ipcMain.handle('bilibili-downloader-parse-link', async (_event, payload) => {
    const parsed = validateRequest(BilibiliParseLinkRequestSchema, payload)
    if (!parsed.success) {
      return parsed
    }

    return bilibiliDownloaderService.parseLink({
      url: parsed.data.link
    })
  })

  ipcMain.handle('bilibili-downloader-load-stream-options', async (_event, payload) => {
    const parsed = validateRequest(BilibiliLoadStreamOptionsRequestSchema, payload)
    if (!parsed.success) {
      return parsed
    }

    return bilibiliDownloaderService.loadStreamOptions(parsed.data)
  })

  ipcMain.handle('bilibili-downloader-start-download', async (_event, payload) => {
    const parsed = validateRequest(BilibiliStartDownloadRequestSchema, payload)
    if (!parsed.success) {
      return parsed
    }

    return bilibiliDownloaderService.startDownload(parsed.data)
  })

  ipcMain.handle('bilibili-downloader-cancel-download', () => {
    return bilibiliDownloaderService.cancelDownload()
  })

  ipcMain.handle('bilibili-downloader-select-output-directory', () => {
    return chooseOutputDirectory()
  })

  bilibiliDownloaderService.onStateChanged((state) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    const parsedState = BilibiliDownloaderStateSchema.safeParse(state)
    if (!parsedState.success) {
      return
    }

    mainWindow.webContents.send('bilibili-downloader-state-changed', parsedState.data)
  })
}
