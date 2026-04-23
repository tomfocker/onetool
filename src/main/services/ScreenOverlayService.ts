import { BrowserWindow, screen, desktopCapturer, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcResponse } from '../../shared/types'
import type { ScreenOverlayMode, ScreenOverlaySessionStartPayload } from '../../shared/llm'
import { createIsolatedPreloadWebPreferences } from '../utils/windowSecurity'
import { ocrService } from './OcrService'

export class ScreenOverlayService {
  private overlayWindows: Map<number, BrowserWindow> = new Map()
  private screenMap: Map<number, string> = new Map()
  private readyDisplays: Set<number> = new Set()
  private mainWindow: BrowserWindow | null = null
  private currentMode: ScreenOverlayMode = 'translate'
  private sessionActive = false

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
    if (window) {
      void this.prepareWindows().catch((error) => {
        console.warn('[ScreenOverlayService] Failed to precreate overlay windows:', error)
      })
    }
  }

  constructor() {
    // 全局监听器：分发截图数据给对应的窗口
    ipcMain.on('screen-overlay:ready', (event) => {
      for (const [displayId, win] of this.overlayWindows.entries()) {
        if (!win.isDestroyed() && event.sender.id === win.webContents.id) {
          this.readyDisplays.add(displayId)
          if (this.sessionActive) {
            win.webContents.send('screen-overlay:session-start', { mode: this.currentMode } satisfies ScreenOverlaySessionStartPayload)
          }
          const dataUrl = this.screenMap.get(displayId)
          if (dataUrl) {
            win.webContents.send('screen-overlay:screenshot', dataUrl)
          }
          break
        }
      }
    })
  }

  /**
   * 批量抓取所有屏幕的高清快照
   */
  private async captureAllScreens(): Promise<void> {
    const displays = screen.getAllDisplays()
    this.screenMap.clear()

    try {
      const maxCaptureWidth = Math.min(Math.max(...displays.map((display) => display.bounds.width), 1920), 2560)
      const maxCaptureHeight = Math.min(Math.max(...displays.map((display) => display.bounds.height), 1080), 1440)
      // 请求高清采样
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: maxCaptureWidth, height: maxCaptureHeight }
      })

      for (const display of displays) {
        let source = sources.find(s => s.display_id === display.id.toString())
        if (!source) {
          const targetRatio = display.bounds.width / display.bounds.height
          source = sources.find(s => {
            const size = s.thumbnail.getSize()
            return Math.abs((size.width / size.height) - targetRatio) < 0.1
          }) || sources[0]
        }

        if (source) {
          this.screenMap.set(display.id, source.thumbnail.toDataURL())
        }
      }
    } catch (error) {
      console.error('[ScreenOverlayService] Batch capture failed:', error)
    }
  }

  private getOverlayRoute(): string {
    return '/screen-overlay'
  }

  private createOverlayWindow(display: Electron.Display): BrowserWindow {
    const { x, y, width, height } = display.bounds
    const win = new BrowserWindow({
      x, y, width, height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      show: false,
      enableLargerThanScreen: true,
      fullscreen: true,
      webPreferences: createIsolatedPreloadWebPreferences(join(__dirname, '../preload/index.js'))
    })

    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const route = this.getOverlayRoute()
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
    }

    win.on('closed', () => {
      this.overlayWindows.delete(display.id)
      this.readyDisplays.delete(display.id)
    })

    this.overlayWindows.set(display.id, win)
    return win
  }

  private async prepareWindows(): Promise<void> {
    const displays = screen.getAllDisplays()
    const activeDisplayIds = new Set(displays.map((display) => display.id))

    for (const [displayId, win] of this.overlayWindows.entries()) {
      if (!activeDisplayIds.has(displayId)) {
        if (!win.isDestroyed()) {
          win.close()
        }
        this.overlayWindows.delete(displayId)
        this.readyDisplays.delete(displayId)
      }
    }

    for (const display of displays) {
      const existingWindow = this.overlayWindows.get(display.id)
      if (existingWindow && !existingWindow.isDestroyed()) {
        continue
      }
      this.createOverlayWindow(display)
    }
  }

  private broadcastSessionStart(): void {
    const payload = { mode: this.currentMode } satisfies ScreenOverlaySessionStartPayload
    for (const win of this.overlayWindows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send('screen-overlay:session-start', payload)
      }
    }
  }

  private dispatchScreensToReadyWindows(): void {
    for (const displayId of this.readyDisplays) {
      const win = this.overlayWindows.get(displayId)
      const dataUrl = this.screenMap.get(displayId)
      if (win && !win.isDestroyed() && dataUrl) {
        win.webContents.send('screen-overlay:screenshot', dataUrl)
      }
    }
  }

  async start(mode: ScreenOverlayMode = 'translate'): Promise<IpcResponse<any>> {
    try {
      this.currentMode = mode
      this.sessionActive = true
      void ocrService.warmup().catch((error) => {
        console.warn('[ScreenOverlayService] OCR warmup failed:', error)
      })

      await this.prepareWindows()
      this.broadcastSessionStart()

      for (const win of this.overlayWindows.values()) {
        if (!win.isDestroyed()) {
          win.show()
        }
      }

      void this.captureAllScreens()
        .then(() => this.dispatchScreensToReadyWindows())
        .catch((error) => {
          console.error('[ScreenOverlayService] Deferred screen capture failed:', error)
        })

      return { success: true, data: {} }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  close(): IpcResponse {
    try {
      this.sessionActive = false
      this.screenMap.clear()
      this.overlayWindows.forEach(win => {
        if (!win.isDestroyed()) win.hide()
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const screenOverlayService = new ScreenOverlayService()
