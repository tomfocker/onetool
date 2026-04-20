
import { ipcMain, BrowserWindow } from 'electron'
import { screenRecorderService } from '../services/ScreenRecorderService'
import { screenshotService } from '../services/ScreenshotService'
import {
  RecorderBoundsSchema,
  ScreenRecorderConfigSchema
} from '../../shared/ipc-schemas'

export function registerScreenRecorderIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('screen-recorder-select-output', async (_event, format) => {
    return screenRecorderService.selectOutput(getMainWindow(), format === 'gif' ? 'gif' : 'mp4')
  })

  ipcMain.handle('screen-recorder-get-screens', async () => {
    return screenRecorderService.getScreens()
  })

  ipcMain.handle('screen-recorder-start', async (_event, config) => {
    try {
      const validConfig = ScreenRecorderConfigSchema.parse(config)
      return screenRecorderService.start({
        ...validConfig,
        format: validConfig.format === 'gif' ? 'gif' : 'mp4'
      })
    } catch (e: any) {
      return { success: false, error: 'Invalid configuration for screen recorder: ' + e.message }
    }
  })

  ipcMain.handle('screen-recorder-stop', async () => {
    return screenRecorderService.stop()
  })

  ipcMain.handle('screen-recorder-status', async () => {
    return screenRecorderService.getStatus()
  })

  ipcMain.handle('screen-recorder-get-default-path', async (_event, format) => {
    return screenRecorderService.getDefaultPath(format === 'gif' ? 'gif' : 'mp4')
  })

  ipcMain.handle('screen-recorder-get-session', async () => {
    return screenRecorderService.getSession()
  })

  ipcMain.handle('screen-recorder-prepare-selection', async (_event, bounds) => {
    try {
      const validBounds = RecorderBoundsSchema.parse(bounds)
      return screenRecorderService.prepareSelection(validBounds)
    } catch (e: any) {
      return { success: false, error: 'Invalid bounds for recorder selection: ' + e.message }
    }
  })

  ipcMain.handle('screen-recorder-expand-panel', async () => {
    return screenRecorderService.expandPanel()
  })

  ipcMain.handle('screen-recorder-hide-selection-preview', async () => {
    screenRecorderService.hideSelectionPreview()
    return { success: true }
  })

  ipcMain.on('screen-recorder-move-selection-by', (_event, payload) => {
    const deltaX = Number(payload?.deltaX) || 0
    const deltaY = Number(payload?.deltaY) || 0
    screenRecorderService.movePreparedSelectionBy(deltaX, deltaY)
  })

  ipcMain.handle('recorder-selection-open', async () => {
    const startedSelection = screenRecorderService.beginSelection()
    if (!startedSelection) {
      return { success: false, error: '录制进行中，无法重新选择区域' }
    }
    const existingBounds = screenRecorderService.getPreparedSelectionBounds() ?? undefined
    screenshotService.openSelectionWindow(existingBounds, 'recorder-selection-result', false, existingBounds)
    return { success: true }
  })

  ipcMain.handle('recorder-selection-close', async (_event, bounds) => {
    if (!bounds) {
      screenRecorderService.cancelSelection()
    }
    screenshotService.closeSelectionWindow(_event.sender, bounds)
    return { success: true }
  })
}
