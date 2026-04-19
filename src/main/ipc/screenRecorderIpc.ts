
import { ipcMain, BrowserWindow } from 'electron'
import { screenRecorderService } from '../services/ScreenRecorderService'
import { screenshotService } from '../services/ScreenshotService'
import {
  RecorderBoundsSchema,
  ScreenRecorderConfigSchema
} from '../../shared/ipc-schemas'

export function registerScreenRecorderIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('screen-recorder-select-output', async () => {
    return screenRecorderService.selectOutput(getMainWindow())
  })

  ipcMain.handle('screen-recorder-get-screens', async () => {
    return screenRecorderService.getScreens()
  })

  ipcMain.handle('screen-recorder-start', async (_event, config) => {
    try {
      const validConfig = ScreenRecorderConfigSchema.parse(config)
      return screenRecorderService.start(validConfig)
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

  ipcMain.handle('screen-recorder-get-default-path', async () => {
    return screenRecorderService.getDefaultPath()
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

  ipcMain.handle('recorder-selection-open', async () => {
    screenRecorderService.beginSelection()
    screenshotService.openSelectionWindow(undefined, 'recorder-selection-result')
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
