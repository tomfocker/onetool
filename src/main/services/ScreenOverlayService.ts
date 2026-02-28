import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcResponse } from '../../shared/types'

export class ScreenOverlayService {
  private overlayWindow: BrowserWindow | null = null
  private mainWindow: BrowserWindow | null = null

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private async captureScreen(): Promise<string | null> {
    const { desktopCapturer, screen } = require('electron')
    const cursorPoint = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursorPoint)

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(display.bounds.width * display.scaleFactor),
          height: Math.round(display.bounds.height * display.scaleFactor)
        }
      })
      const source = sources.find(s => s.display_id === display.id.toString()) || sources[0]
      return source ? source.thumbnail.toDataURL() : null
    } catch (error) {
      console.error('ScreenOverlayService: captureScreen error:', error)
      return null
    }
  }

  async start(): Promise<IpcResponse<{ screenDataUrl?: string }>> {
    try {
      if (this.overlayWindow) {
        this.overlayWindow.close()
        this.overlayWindow = null
      }

      const cursorPoint = screen.getCursorScreenPoint()
      const displays = screen.getAllDisplays()
      const targetDisplay = displays.find(d =>
        cursorPoint.x >= d.bounds.x &&
        cursorPoint.x < d.bounds.x + d.bounds.width &&
        cursorPoint.y >= d.bounds.y &&
        cursorPoint.y < d.bounds.y + d.bounds.height
      ) || screen.getPrimaryDisplay()

      const { x, y, width, height } = targetDisplay.bounds

      this.overlayWindow = new BrowserWindow({
        x, y, width, height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false
        }
      })

      this.overlayWindow.setIgnoreMouseEvents(false)
      this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

      const screenDataUrl = await this.captureScreen()

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const url = new URL(`${process.env['ELECTRON_RENDERER_URL']}#/screen-overlay`)
        if (screenDataUrl) url.searchParams.set('screen', encodeURIComponent(screenDataUrl))
        this.overlayWindow.loadURL(url.toString())
      } else {
        this.overlayWindow.loadFile(join(__dirname, '../../renderer/index.html'), {
          hash: '/screen-overlay',
          search: screenDataUrl ? `?screen=${encodeURIComponent(screenDataUrl)}` : ''
        })
      }

      this.overlayWindow.on('closed', () => {
        this.overlayWindow = null
      })

      return { success: true, data: { screenDataUrl: screenDataUrl || undefined } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  close(): IpcResponse {
    try {
      if (this.overlayWindow) {
        this.overlayWindow.close()
        this.overlayWindow = null
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const screenOverlayService = new ScreenOverlayService()
