import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcResponse } from '../../shared/types'
import {
  buildCaptureThumbnailSize,
  mapCaptureSourcesToDisplays,
  PickedColor
} from '../../shared/colorPicker'
import { createIsolatedPreloadWebPreferences } from '../utils/windowSecurity'

export class ColorPickerService {
  private mainWindow: BrowserWindow | null = null
  private colorPickerWindows: BrowserWindow[] = []
  private pickSessionPromise: Promise<IpcResponse<{ color?: PickedColor }>> | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private async captureAllScreens(): Promise<Map<number, string>> {
    const displays = screen.getAllDisplays()
    const thumbnailSize = buildCaptureThumbnailSize(displays)

    if (thumbnailSize.width === 0 || thumbnailSize.height === 0) {
      throw new Error('No displays available for capture')
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize
    })

    const normalizedSources = sources.map((source) => {
      const size = source.thumbnail.getSize()
      return {
        display_id: source.display_id,
        width: size.width,
        height: size.height,
        dataUrl: source.thumbnail.toDataURL()
      }
    })

    const { screenshots, missingDisplayIds } = mapCaptureSourcesToDisplays(displays, normalizedSources)
    if (missingDisplayIds.length > 0) {
      throw new Error(`Failed to capture displays: ${missingDisplayIds.join(', ')}`)
    }

    return screenshots
  }

  async pick(): Promise<IpcResponse<{ color?: PickedColor }>> {
    if (this.pickSessionPromise) {
      return { success: false, error: 'Color picker is already active' }
    }

    const displays = screen.getAllDisplays()
    if (displays.length === 0) {
      return { success: false, error: 'No displays available' }
    }

    this.pickSessionPromise = new Promise((resolve) => {
      const displayMap = new Map<number, { win: BrowserWindow; displayId: number }>()
      let screenshotMap = new Map<number, string>()
      let finished = false

      const cleanup = () => {
        ipcMain.removeListener('color-picker:confirm-pick', onPicked)
        ipcMain.removeListener('color-picker:cancel-pick', onCancelled)
        ipcMain.removeListener('color-picker:overlay-ready', onOverlayReady)

        this.colorPickerWindows.forEach((win) => {
          if (!win.isDestroyed()) {
            win.close()
          }
        })
        this.colorPickerWindows = []
        displayMap.clear()

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.show()
          this.mainWindow.focus()
        }
      }

      const finish = (result: IpcResponse<{ color?: PickedColor }>) => {
        if (finished) {
          return
        }

        finished = true
        cleanup()
        resolve(result)
      }

      const onOverlayReady = (event: Electron.IpcMainEvent) => {
        const entry = displayMap.get(event.sender.id)
        if (!entry) {
          return
        }

        const dataUrl = screenshotMap.get(entry.displayId)
        if (!dataUrl) {
          finish({ success: false, error: `Missing screenshot for display ${entry.displayId}` })
          return
        }

        entry.win.webContents.send('color-picker:screenshot', dataUrl)
      }

      const onPicked = (_event: Electron.IpcMainEvent, data: PickedColor) => {
        finish({ success: true, data: { color: data } })
      }

      const onCancelled = () => {
        finish({ success: false, error: 'Cancelled' })
      }

      const buildOverlayRoute = (displayId: number, x: number, y: number) => {
        return `/color-picker-overlay?display=${displayId}&dx=${x}&dy=${y}`
      }

      void (async () => {
        try {
          screenshotMap = await this.captureAllScreens()

          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.hide()
          }

          ipcMain.once('color-picker:confirm-pick', onPicked)
          ipcMain.once('color-picker:cancel-pick', onCancelled)
          ipcMain.on('color-picker:overlay-ready', onOverlayReady)

          this.colorPickerWindows = displays.map((display) => {
            const { x, y, width, height } = display.bounds
            const route = buildOverlayRoute(display.id, x, y)

            const win = new BrowserWindow({
              x,
              y,
              width,
              height,
              transparent: true,
              frame: false,
              alwaysOnTop: true,
              skipTaskbar: true,
              resizable: false,
              focusable: true,
              show: false,
              fullscreenable: true,
              kiosk: true,
              webPreferences: createIsolatedPreloadWebPreferences(join(__dirname, '../preload/index.js'))
            })

            win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            displayMap.set(win.webContents.id, { win, displayId: display.id })

            if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
              win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
            } else {
              win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
            }

            win.once('ready-to-show', () => {
              if (!finished) {
                win.show()
              }
            })

            win.webContents.on('did-fail-load', () => {
              console.error(`ColorPicker Window for display ${display.id} failed to load`)
              finish({ success: false, error: 'Overlay load failed' })
            })

            return win
          })
        } catch (error) {
          console.error('ColorPickerService: pick session error:', error)
          finish({ success: false, error: (error as Error).message })
        }
      })()
    })

    try {
      return await this.pickSessionPromise
    } finally {
      this.pickSessionPromise = null
    }
  }
}

export const colorPickerService = new ColorPickerService()
