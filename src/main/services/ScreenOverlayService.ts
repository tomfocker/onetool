import { BrowserWindow, screen, desktopCapturer, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcResponse } from '../../shared/types'

export class ScreenOverlayService {
  private overlayWindows: Map<number, BrowserWindow> = new Map()
  private screenMap: Map<number, string> = new Map()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  constructor() {
    // 全局监听器：分发截图数据给对应的窗口
    ipcMain.on('screen-overlay:ready', (event) => {
      for (const [displayId, win] of this.overlayWindows.entries()) {
        if (!win.isDestroyed() && event.sender.id === win.webContents.id) {
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
      // 请求高清采样
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 3840, height: 2160 }
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

  async start(): Promise<IpcResponse<any>> {
    try {
      this.close() // 清除旧窗口

      await this.captureAllScreens()
      const displays = screen.getAllDisplays()

      for (const display of displays) {
        const { x, y, width, height } = display.bounds

        const win = new BrowserWindow({
          x, y, width, height,
          transparent: true,
          frame: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          resizable: false,
          focusable: true,
          show: false, // 准备好截图后再显示 (可选)
          enableLargerThanScreen: true,
          fullscreen: true,
          webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false
          }
        })

        win.setAlwaysOnTop(true, 'screen-saver')
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/screen-overlay`)
        } else {
          win.loadFile(join(__dirname, '../../renderer/index.html'), { hash: '/screen-overlay' })
        }

        win.once('ready-to-show', () => win.show())

        win.on('closed', () => {
          this.overlayWindows.delete(display.id)
        })

        this.overlayWindows.set(display.id, win)
      }

      return { success: true, data: {} }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  close(): IpcResponse {
    try {
      this.overlayWindows.forEach(win => {
        if (!win.isDestroyed()) win.close()
      })
      this.overlayWindows.clear()
      this.screenMap.clear()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const screenOverlayService = new ScreenOverlayService()
