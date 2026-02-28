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

      // 【1】提前截图，在此之前不应该有覆盖层的窗口影响当前画面
      const screenDataUrl = await this.captureScreen()

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

      // 监听覆盖层页面准备就绪的信号
      const { ipcMain } = require('electron')
      const onOverlayReady = (event: Electron.IpcMainEvent) => {
        if (this.overlayWindow && event.sender.id === this.overlayWindow.webContents.id) {
          if (screenDataUrl) {
            this.overlayWindow.webContents.send('screen-overlay:screenshot', screenDataUrl)
          }
        }
      }
      ipcMain.on('screen-overlay:ready', onOverlayReady)

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        // 【2】移除 URL 携带超大图片 base64 参数
        const url = new URL(`${process.env['ELECTRON_RENDERER_URL']}#/screen-overlay`)
        this.overlayWindow.loadURL(url.toString())
      } else {
        this.overlayWindow.loadFile(join(__dirname, '../../renderer/index.html'), {
          hash: '/screen-overlay'
        })
      }

      this.overlayWindow.on('closed', () => {
        this.overlayWindow = null
        ipcMain.removeListener('screen-overlay:ready', onOverlayReady)
      })

      // 不再把 Base64 数据返回给 IPC 的调用方（避免无意义的性能开销和序列化）
      return { success: true, data: {} }
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
