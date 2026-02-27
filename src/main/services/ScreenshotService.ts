import { app, BrowserWindow, desktopCapturer, screen, nativeImage, dialog, clipboard } from 'electron'
import fs from 'fs'
import path from 'path'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcResponse } from '../../shared/types'
import { settingsService } from './SettingsService'

export class ScreenshotService {
  private selectionWindow: BrowserWindow | null = null
  private mainWindow: BrowserWindow | null = null

  constructor() {}

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  async capture(bounds: { x: number; y: number; width: number; height: number }): Promise<IpcResponse<string>> {
    const primaryDisplay = screen.getPrimaryDisplay()
    const scaleFactor = primaryDisplay.scaleFactor

    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'], 
        thumbnailSize: { 
          width: Math.round(primaryDisplay.size.width * scaleFactor), 
          height: Math.round(primaryDisplay.size.height * scaleFactor) 
        } 
      })
      
      const source = sources[0]
      const img = source.thumbnail
      
      const cropped = img.crop({
        x: Math.round(bounds.x * scaleFactor),
        y: Math.round(bounds.y * scaleFactor),
        width: Math.round(bounds.width * scaleFactor),
        height: Math.round(bounds.height * scaleFactor)
      })

      return { success: true, data: cropped.toDataURL() }
    } catch (e) {
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

  openSelectionWindow(restrictBounds?: any): void {
    if (this.selectionWindow || !this.mainWindow) return
    
    let x, y, width, height;
    if (restrictBounds) {
      x = restrictBounds.x
      y = restrictBounds.y
      width = restrictBounds.width
      height = restrictBounds.height
    } else {
      const targetDisplay = screen.getDisplayMatching(this.mainWindow.getBounds())
      x = targetDisplay.bounds.x
      y = targetDisplay.bounds.y
      width = targetDisplay.bounds.width
      height = targetDisplay.bounds.height
    }

    this.selectionWindow = new BrowserWindow({
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
      webPreferences: {
        preload: join(__dirname, '../../preload/index.js'),
        sandbox: false
      }
    })

    this.selectionWindow.setIgnoreMouseEvents(false)
    this.selectionWindow.setAlwaysOnTop(true, 'screen-saver')
    
    const url = is.dev && process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}#/recorder-selection`
      : join(__dirname, '../../renderer/index.html') + '#/recorder-selection'

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.selectionWindow.loadURL(url)
    } else {
      this.selectionWindow.loadFile(join(__dirname, '../../renderer/index.html'), {
        hash: '/recorder-selection'
      })
    }

    this.selectionWindow.on('closed', () => {
      this.selectionWindow = null
    })
  }

  closeSelectionWindow(bounds?: any): void {
    if (this.selectionWindow) {
      const winBounds = this.selectionWindow.getBounds()
      this.selectionWindow.close()
      this.selectionWindow = null
      
      if (bounds && this.mainWindow) {
        const finalBounds = {
          x: bounds.x + winBounds.x,
          y: bounds.y + winBounds.y,
          width: bounds.width,
          height: bounds.height
        }
        this.mainWindow.webContents.send('recorder-selection-result', finalBounds)
      }
    }
  }
}

export const screenshotService = new ScreenshotService()
