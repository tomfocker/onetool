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
  private colorPickerWindows: Map<number, BrowserWindow> = new Map()
  private readyDisplays: Set<number> = new Set()
  private screenshotMap: Map<number, string> = new Map()
  private pickSessionPromise: Promise<IpcResponse<{ color?: PickedColor }>> | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
    if (window) {
      void this.prepareOverlayWindows().catch((error) => {
        console.warn('[ColorPickerService] Failed to precreate overlay windows:', error)
      })
    }
  }

  constructor() {
    ipcMain.on('color-picker:overlay-ready', (event) => {
      for (const [displayId, win] of this.colorPickerWindows.entries()) {
        if (!win.isDestroyed() && event.sender.id === win.webContents.id) {
          this.readyDisplays.add(displayId)
          const dataUrl = this.screenshotMap.get(displayId)
          if (dataUrl) {
            win.webContents.send('color-picker:screenshot', dataUrl)
          }
          break
        }
      }
    })
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

  private buildOverlayRoute(displayId: number, x: number, y: number) {
    return `/color-picker-overlay?display=${displayId}&dx=${x}&dy=${y}`
  }

  private createOverlayWindow(display: Electron.Display): BrowserWindow {
    const { x, y, width, height } = display.bounds
    const route = this.buildOverlayRoute(display.id, x, y)
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

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
    }

    win.webContents.on('did-fail-load', () => {
      console.error(`ColorPicker Window for display ${display.id} failed to load`)
    })

    win.on('closed', () => {
      this.colorPickerWindows.delete(display.id)
      this.readyDisplays.delete(display.id)
    })

    this.colorPickerWindows.set(display.id, win)
    return win
  }

  private async prepareOverlayWindows(): Promise<void> {
    const displays = screen.getAllDisplays()
    const activeDisplayIds = new Set(displays.map((display) => display.id))

    for (const [displayId, win] of this.colorPickerWindows.entries()) {
      if (!activeDisplayIds.has(displayId)) {
        if (!win.isDestroyed()) {
          win.close()
        }
        this.colorPickerWindows.delete(displayId)
        this.readyDisplays.delete(displayId)
      }
    }

    for (const display of displays) {
      const existingWindow = this.colorPickerWindows.get(display.id)
      if (existingWindow && !existingWindow.isDestroyed()) {
        continue
      }
      this.createOverlayWindow(display)
    }
  }

  private dispatchScreensToReadyWindows(): void {
    for (const displayId of this.readyDisplays) {
      const win = this.colorPickerWindows.get(displayId)
      const dataUrl = this.screenshotMap.get(displayId)
      if (win && !win.isDestroyed() && dataUrl) {
        win.webContents.send('color-picker:screenshot', dataUrl)
      }
    }
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
      let finished = false

      const cleanup = () => {
        ipcMain.removeListener('color-picker:confirm-pick', onPicked)
        ipcMain.removeListener('color-picker:cancel-pick', onCancelled)
        this.screenshotMap.clear()

        this.colorPickerWindows.forEach((win) => {
          if (!win.isDestroyed()) {
            win.hide()
          }
        })

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

      const onPicked = (_event: Electron.IpcMainEvent, data: PickedColor) => {
        finish({ success: true, data: { color: data } })
      }

      const onCancelled = () => {
        finish({ success: false, error: 'Cancelled' })
      }

      void (async () => {
        try {
          await this.prepareOverlayWindows()
          this.screenshotMap = await this.captureAllScreens()

          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.hide()
          }

          ipcMain.once('color-picker:confirm-pick', onPicked)
          ipcMain.once('color-picker:cancel-pick', onCancelled)

          this.colorPickerWindows.forEach((win) => {
            if (!win.isDestroyed() && !finished) {
              win.show()
            }
          })
          this.dispatchScreensToReadyWindows()
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
