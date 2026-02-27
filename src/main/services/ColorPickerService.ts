import { BrowserWindow, desktopCapturer, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcResponse } from '../../shared/types'
import { execPowerShell } from '../utils/processUtils'

export class ColorPickerService {
  private mainWindow: BrowserWindow | null = null
  private colorPickerWindow: BrowserWindow | null = null
  private colorPickerWindows: BrowserWindow[] = []
  private colorPickerTimer: NodeJS.Timeout | null = null
  private colorPickerActive = false
  private isColorPicking = false
  private lastX = -1
  private lastY = -1
  private lastR = -1
  private lastG = -1
  private lastB = -1

  constructor() {}

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private async getMouseAndColor(): Promise<{ x: number; y: number; r: number; g: number; b: number } | null> {
    const script = `
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
$pos = [System.Windows.Forms.Control]::MousePosition
$bmp = New-Object System.Drawing.Bitmap(1, 1)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($pos, [System.Drawing.Point]::Empty, [System.Drawing.Size]::new(1, 1))
$pixel = $bmp.GetPixel(0, 0)
$g.Dispose()
$bmp.Dispose()
Write-Output "$($pos.X),$($pos.Y),$($pixel.R),$($pixel.G),$($pixel.B)"
`
    try {
      const result = await execPowerShell(script)
      const lines = result.trim().split(/\r?\n/)
      const lastLine = lines[lines.length - 1]
      const parts = lastLine.split(',')
      if (parts.length >= 5) {
        return {
          x: parseInt(parts[0]),
          y: parseInt(parts[1]),
          r: parseInt(parts[2]),
          g: parseInt(parts[3]),
          b: parseInt(parts[4])
        }
      }
    } catch (e) {
      console.error('ColorPickerService: getMouseAndColor error:', e)
    }
    return null
  }

  private runLoop = async () => {
    if (!this.colorPickerActive || !this.mainWindow) {
      this.isColorPicking = false
      return
    }

    this.isColorPicking = true
    try {
      const data = await this.getMouseAndColor()
      if (data && this.colorPickerActive && this.mainWindow) {
        const isValid = !isNaN(data.x) && !isNaN(data.y) && !isNaN(data.r) && !isNaN(data.g) && !isNaN(data.b)
        if (isValid) {
          const r = Math.max(0, Math.min(255, data.r))
          const g = Math.max(0, Math.min(255, data.g))
          const b = Math.max(0, Math.min(255, data.b))

          const hasMoved = data.x !== this.lastX || data.y !== this.lastY
          const hasColorChanged = r !== this.lastR || g !== this.lastG || b !== this.lastB

          if (hasMoved || hasColorChanged) {
            this.lastX = data.x
            this.lastY = data.y
            this.lastR = r
            this.lastG = g
            this.lastB = b
            
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
            const rgb = `RGB(${r}, ${g}, ${b})`
            
            this.mainWindow.webContents.send('color-picker:update', { hex, r, g, b, rgb, x: data.x, y: data.y })
          }
        }
      }
    } catch (error) {
      console.error('ColorPickerService: loop error:', error)
    }

    if (this.colorPickerActive) {
      this.colorPickerTimer = setTimeout(this.runLoop, 100)
    } else {
      this.isColorPicking = false
    }
  }

  enable(): void {
    if (this.colorPickerActive) return
    this.colorPickerActive = true
    this.runLoop()
  }

  disable(): void {
    this.colorPickerActive = false
    if (this.colorPickerTimer) {
      clearTimeout(this.colorPickerTimer)
      this.colorPickerTimer = null
    }
  }

  private async captureAllScreens(): Promise<Map<number, string>> {
    const displays = screen.getAllDisplays()
    const screenshotMap = new Map<number, string>()

    try {
      let maxWidth = 0
      let maxHeight = 0
      displays.forEach(display => {
        maxWidth = Math.max(maxWidth, Math.round(display.bounds.width * display.scaleFactor))
        maxHeight = Math.max(maxHeight, Math.round(display.bounds.height * display.scaleFactor))
      })

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: maxWidth, height: maxHeight }
      })

      for (const display of displays) {
        const source = sources.find(s => s.display_id === display.id.toString()) || sources[displays.indexOf(display)]
        if (source) {
          screenshotMap.set(display.id, source.thumbnail.toDataURL())
        }
      }
    } catch (error) {
      console.error('ColorPickerService: captureAllScreens error:', error)
    }
    return screenshotMap
  }

  async pick(): Promise<IpcResponse<{ color?: any }>> {
    const displays = screen.getAllDisplays()
    if (this.mainWindow) this.mainWindow.hide()

    const screenshotMap = await this.captureAllScreens()

    this.colorPickerWindows = displays.map(display => {
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
        webPreferences: {
          preload: join(__dirname, '../../preload/index.js'),
          sandbox: false
        }
      })

      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/color-picker-overlay`)
      } else {
        win.loadFile(join(__dirname, '../../renderer/index.html'), { hash: '/color-picker-overlay' })
      }

      win.webContents.once('did-finish-load', () => {
        const dataUrl = screenshotMap.get(display.id)
        if (dataUrl) win.webContents.send('color-picker:screenshot', dataUrl)
      })

      win.once('ready-to-show', () => win.show())
      return win
    })

    return new Promise((resolve) => {
      const onPicked = (_event, data) => {
        cleanup()
        if (this.mainWindow) this.mainWindow.webContents.send('color-picker:selected', data)
        resolve({ success: true, data: { color: data } })
      }
      const onCancelled = () => {
        cleanup()
        resolve({ success: false, error: 'Cancelled' })
      }
      
      const cleanup = () => {
        ipcMain.removeListener('color-picker:confirm-pick', onPicked)
        ipcMain.removeListener('color-picker:cancel-pick', onCancelled)
        this.colorPickerWindows.forEach(win => { if (!win.isDestroyed()) win.close() })
        this.colorPickerWindows = []
        if (this.mainWindow) {
          this.mainWindow.show()
          this.mainWindow.focus()
        }
      }

      ipcMain.once('color-picker:confirm-pick', onPicked)
      ipcMain.once('color-picker:cancel-pick', onCancelled)
    })
  }
}

export const colorPickerService = new ColorPickerService()
