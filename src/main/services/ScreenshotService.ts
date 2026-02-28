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

  /**
   * 高清截图：优化多显匹配与 DPI 采样
   */
  async capture(bounds: { x: number; y: number; width: number; height: number }): Promise<IpcResponse<string>> {
    console.log('[ScreenshotService] High-res capture requested:', bounds)
    try {
      const cleanBounds = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height)
      }

      // 1. 获取所在显示器
      const targetDisplay = screen.getDisplayNearestPoint({
        x: cleanBounds.x + cleanBounds.width / 2,
        y: cleanBounds.y + cleanBounds.height / 2
      })

      const scaleFactor = targetDisplay.scaleFactor

      // 2. 获取源（增加优先匹配逻辑）
      // 请求更大的尺寸以确保高清采样
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.max(800, Math.round(targetDisplay.bounds.width * scaleFactor)),
          height: Math.max(600, Math.round(targetDisplay.bounds.height * scaleFactor))
        }
      })

      // 优先通过 display_id 匹配，如果没有（比如某些旧系统），尝试通过缩略图宽高比例匹配
      let source = sources.find(s => s.display_id === targetDisplay.id.toString())
      if (!source) {
        // 备选方案：通过比例匹配 (容错 10% 误差)
        const targetRatio = targetDisplay.bounds.width / targetDisplay.bounds.height
        source = sources.find(s => {
          const size = s.thumbnail.getSize()
          const ratio = size.width / size.height
          return Math.abs(ratio - targetRatio) < 0.1
        }) || sources[0]
      }

      const img = source.thumbnail
      const imgSize = img.getSize()

      // 3. 计算选区在该显示器内的相对坐标（物理像素）
      const localX = cleanBounds.x - targetDisplay.bounds.x
      const localY = cleanBounds.y - targetDisplay.bounds.y

      // 这里的缩放比例计算：图片实际高度 / 显示器逻辑高度
      // 解决某些高 DPI 环境下缩放比不完全等于 scaleFactor 的微小偏差
      const actualScaleX = imgSize.width / targetDisplay.bounds.width
      const actualScaleY = imgSize.height / targetDisplay.bounds.height

      let cropX = Math.round(localX * actualScaleX)
      let cropY = Math.round(localY * actualScaleY)
      let cropW = Math.round(cleanBounds.width * actualScaleX)
      let cropH = Math.round(cleanBounds.height * actualScaleY)

      // 限制边界防止越界报错
      cropX = Math.max(0, Math.min(cropX, imgSize.width - 1))
      cropY = Math.max(0, Math.min(cropY, imgSize.height - 1))
      cropW = Math.max(1, Math.min(cropW, imgSize.width - cropX))
      cropH = Math.max(1, Math.min(cropH, imgSize.height - cropY))

      // 4. 执行裁剪并转换。使用 PNG 格式保证最高质量（用于 OCR 识别）
      const cropped = img.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
      const dataUrl = cropped.toDataURL()

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

  /**
   * 开启全屏选区窗口 (支持多显示器)
   */
  openSelectionWindow(restrictBounds?: { x: number; y: number; width: number; height: number }, resultChannel: string = 'screenshot-selection-result', enhanced: boolean = false): void {
    if (this.selectionWindows.length > 0) return

    this.selectionResultsChannel = resultChannel
    const displays = screen.getAllDisplays()

    for (const display of displays) {
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
        kiosk: true,
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

      const route = resultChannel === 'recorder-selection-result' ? '#/recorder-selection' : '#/screenshot-selection'
      const restrictQuery = restrictBounds ? `&restrict=${encodeURIComponent(JSON.stringify(restrictBounds))}` : ''
      const modeQuery = resultChannel === 'recorder-selection-result' ? '&mode=recorder' : ''
      const enhancedQuery = enhanced ? `&enhanced=true` : ''
      // 关键！传递显示器原始偏移，方便 renderer 修正坐标
      const displayQuery = `&display=${display.id}&dx=${display.bounds.x}&dy=${display.bounds.y}`

      const url = is.dev && process.env['ELECTRON_RENDERER_URL']
        ? `${process.env['ELECTRON_RENDERER_URL']}${route}?${displayQuery}${restrictQuery}${modeQuery}${enhancedQuery}`
        : join(__dirname, '../../renderer/index.html') + `${route}?${displayQuery}${restrictQuery}${modeQuery}${enhancedQuery}`

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(url)
      } else {
        win.loadURL(`file://${join(__dirname, '../../renderer/index.html')}${route}?${displayQuery}${restrictQuery}${modeQuery}${enhancedQuery}`)
      }

      win.on('closed', () => {
        const index = this.selectionWindows.indexOf(win)
        if (index > -1) this.selectionWindows.splice(index, 1)
      })

      this.selectionWindows.push(win)
    }
  }

  closeSelectionWindow(sender: Electron.WebContents, bounds: any): void {
    const senderWindow = BrowserWindow.fromWebContents(sender)
    const senderBounds = senderWindow?.getBounds()

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
