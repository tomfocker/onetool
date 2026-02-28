import { app, BrowserWindow, desktopCapturer, screen, nativeImage, dialog, clipboard } from 'electron'
import fs from 'fs'
import path from 'path'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcResponse } from '../../shared/types'
import { settingsService } from './SettingsService'

export class ScreenshotService {
  private selectionWindows: BrowserWindow[] = []
  private selectionResultsChannel: string = 'screenshot-selection-result'
  private mainWindow: BrowserWindow | null = null

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  async capture(bounds: { x: number; y: number; width: number; height: number }): Promise<IpcResponse<string>> {
    console.log('[ScreenshotService] Capture requested:', bounds)
    try {
      // 保证输入坐标为整数
      const cleanBounds = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height)
      }

      // 1. 根据 bounds 中心点找到所在的显示器
      const targetDisplay = screen.getDisplayNearestPoint({
        x: cleanBounds.x + cleanBounds.width / 2,
        y: cleanBounds.y + cleanBounds.height / 2
      })

      console.log('[ScreenshotService] Target Display:', {
        id: targetDisplay.id,
        bounds: targetDisplay.bounds,
        scaleFactor: targetDisplay.scaleFactor
      })

      const scaleFactor = targetDisplay.scaleFactor

      // 2. 获取所有屏幕源
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(targetDisplay.bounds.width * scaleFactor),
          height: Math.round(targetDisplay.bounds.height * scaleFactor)
        }
      })

      // 尝试匹配显示器 ID
      // 某些环境下 display_id 可能是 string(id), string(index), 或 number
      let source = sources.find(s => s.display_id === targetDisplay.id.toString())
      if (!source) {
        // 备选方案：按名称或索引尝试匹配 (Windows 下可能有 "Screen 1", "Screen 2")
        console.warn('[ScreenshotService] ID match failed, attempting fallback index match')
        const allDisplays = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x)
        const displayIndex = allDisplays.findIndex(d => d.id === targetDisplay.id)
        if (displayIndex !== -1 && sources[displayIndex]) {
          source = sources[displayIndex]
        } else {
          source = sources[0]
        }
      }

      if (!source) {
        console.error('[ScreenshotService] No capture source found')
        return { success: false, error: '无法获取屏幕源' }
      }

      console.log('[ScreenshotService] Mapping to source:', {
        name: source.name,
        display_id: source.display_id,
        imgSize: source.thumbnail.getSize()
      })

      const img = source.thumbnail

      // 3. 计算选区在该显示器内的相对坐标
      const localX = cleanBounds.x - targetDisplay.bounds.x
      const localY = cleanBounds.y - targetDisplay.bounds.y

      // 4. 计算图片实际尺寸，防止越界
      const imgSize = img.getSize()
      let cropX = Math.round(localX * scaleFactor)
      let cropY = Math.round(localY * scaleFactor)
      let cropW = Math.round(cleanBounds.width * scaleFactor)
      let cropH = Math.round(cleanBounds.height * scaleFactor)

      console.log('[ScreenshotService] Before clamp:', { cropX, cropY, cropW, cropH, localX, localY })

      // 限制边界
      cropX = Math.max(0, cropX)
      // 处理底部可能由于任务栏或缩放导致的 1-2 像素偏移
      cropY = Math.max(0, cropY)

      if (cropX + cropW > imgSize.width) {
        cropW = imgSize.width - cropX
      }
      if (cropY + cropH > imgSize.height) {
        cropH = imgSize.height - cropY
      }

      console.log('[ScreenshotService] After clamp:', { cropX, cropY, cropW, cropH })

      // 容错：如果宽高极小，尝试微调至少保留 1 像素，除非完全在外部
      if (cropW <= 0 || cropH <= 0) {
        console.error('[ScreenshotService] Selection out of current screen source bounds')
        return { success: false, error: '选区位置无效或在显示范围外' }
      }

      const cropped = img.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
      const dataUrl = cropped.toDataURL()
      console.log('[ScreenshotService] Capture success, dataUrl length:', dataUrl.length)

      return { success: true, data: dataUrl }
    } catch (e) {
      console.error('[ScreenshotService] Capture failure:', e)
      return { success: false, error: (e as Error).message }
    }
  }

  async saveImage(dataUrl: string, customPath?: string): Promise<IpcResponse<{ filePath?: string, canceled?: boolean }>> {
    try {
      const win = BrowserWindow.getFocusedWindow() || this.mainWindow
      if (!win) return { success: false, error: '无法获取窗口' }

      let filePath = customPath
      if (!filePath) {
        const settings = settingsService.getSettings()
        const result = await dialog.showSaveDialog(win, {
          title: '保存截图',
          defaultPath: path.join(settings.screenshotSavePath || app.getPath('pictures'), `screenshot-${Date.now()}.png`),
          filters: [
            { name: 'PNG 图片', extensions: ['png'] },
            { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] }
          ]
        })

        if (result.canceled || !result.filePath) return { success: false, data: { canceled: true } }
        filePath = result.filePath
      }

      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(filePath, buffer)

      return { success: true, data: { filePath } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  copyToClipboard(dataUrl: string): IpcResponse {
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      clipboard.writeImage(img)
      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  openSelectionWindow(restrictBounds?: { x: number; y: number; width: number; height: number }, resultChannel: string = 'screenshot-selection-result'): void {
    if (this.selectionWindows.length > 0) return

    this.selectionResultsChannel = resultChannel
    const displays = screen.getAllDisplays()

    for (const display of displays) {
      // 如果有限制区域，只在所在显示器开启，否则全屏开启
      if (restrictBounds) {
        const isOverlap = (
          restrictBounds.x < display.bounds.x + display.bounds.width &&
          restrictBounds.x + restrictBounds.width > display.bounds.x &&
          restrictBounds.y < display.bounds.y + display.bounds.height &&
          restrictBounds.y + restrictBounds.height > display.bounds.y
        )
        if (!isOverlap) continue
      }

      const { x, y, width, height } = display.bounds

      const win = new BrowserWindow({
        x, y, width, height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        hasShadow: false,
        enableLargerThanScreen: true,
        backgroundColor: '#00000000',
        fullscreenable: true,
        kiosk: true, // 使用 kiosk 模式强制覆盖任务栏和所有边缘
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false
        }
      })

      win.setIgnoreMouseEvents(false)
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      win.setMenu(null)
      win.setMenuBarVisibility(false)

      const restrictQuery = restrictBounds ? `&restrict=${encodeURIComponent(JSON.stringify(restrictBounds))}` : ''
      const modeQuery = resultChannel === 'recorder-selection-result' ? '&mode=recorder' : ''
      const displayQuery = `&display=${display.id}&dx=${display.bounds.x}&dy=${display.bounds.y}`
      const url = is.dev && process.env['ELECTRON_RENDERER_URL']
        ? `${process.env['ELECTRON_RENDERER_URL']}#/screenshot-selection?${displayQuery}${restrictQuery}${modeQuery}`
        : join(__dirname, '../../renderer/index.html') + `#/screenshot-selection?${displayQuery}${restrictQuery}${modeQuery}`

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(url)
      } else {
        win.loadURL(`file://${join(__dirname, '../../renderer/index.html')}#/screenshot-selection?${displayQuery}${restrictQuery}${modeQuery}`)
      }

      win.on('closed', () => {
        const index = this.selectionWindows.indexOf(win)
        if (index > -1) {
          this.selectionWindows.splice(index, 1)
        }
      })

      this.selectionWindows.push(win)
    }
  }

  closeSelectionWindow(sender: Electron.WebContents, bounds: any): void {
    const senderWindow = BrowserWindow.fromWebContents(sender)
    const senderBounds = senderWindow?.getBounds()

    // 关闭所有选区窗口
    const windowsToClose = [...this.selectionWindows]
    this.selectionWindows = []
    windowsToClose.forEach(win => {
      if (!win.isDestroyed()) win.close()
    })

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      let finalBounds = bounds
      if (bounds && senderBounds) {
        finalBounds = {
          x: bounds.x + senderBounds.x,
          y: bounds.y + senderBounds.y,
          width: bounds.width,
          height: bounds.height
        }
      }
      this.mainWindow.webContents.send(this.selectionResultsChannel, finalBounds)
    }
  }
}

export const screenshotService = new ScreenshotService()
