import { BrowserWindow, Tray, Menu, NativeImage, nativeImage, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import fs from 'fs'
import { IpcResponse } from '../../shared/types'

export class WindowManagerService {
  private mainWindow: BrowserWindow | null = null
  private floatBallWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private isQuitting = false

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  setIsQuitting(quitting: boolean) {
    this.isQuitting = quitting
  }

  getIsQuitting() {
    return this.isQuitting
  }

  minimize() {
    if (this.mainWindow) {
      this.mainWindow.minimize()
      return { success: true }
    }
    return { success: false, error: '主窗口不存在' }
  }

  maximize() {
    if (this.mainWindow) {
      if (this.mainWindow.isMaximized()) {
        this.mainWindow.unmaximize()
        return { success: true, data: { maximized: false } }
      } else {
        this.mainWindow.maximize()
        return { success: true, data: { maximized: true } }
      }
    }
    return { success: false, error: '主窗口不存在' }
  }

  close() {
    if (this.mainWindow) {
      this.mainWindow.close()
      return { success: true }
    }
    return { success: false, error: '主窗口不存在' }
  }

  isMaximized() {
    if (this.mainWindow) {
      return { success: true, data: { maximized: this.mainWindow.isMaximized() } }
    }
    return { success: false, error: '主窗口不存在' }
  }

  createFloatBallWindow(): void {
    if (this.floatBallWindow) return

    this.floatBallWindow = new BrowserWindow({
      width: 60,
      height: 60,
      type: 'toolbar',
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../../preload/index.js'),
        sandbox: false
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.floatBallWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/float-ball`)
    } else {
      this.floatBallWindow.loadFile(join(__dirname, '../../renderer/index.html'), {
        hash: '/float-ball'
      })
    }

    this.floatBallWindow.on('closed', () => {
      this.floatBallWindow = null
    })
  }

  createTray(): void {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(__dirname, '../../../resources/icon.png')

    let icon: NativeImage
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    } else {
      icon = nativeImage.createEmpty()
    }

    this.tray = new Tray(icon)
    const contextMenu = Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => this.mainWindow?.show() },
      { label: '隐藏主窗口', click: () => this.mainWindow?.hide() },
      { type: 'separator' },
      { label: '退出程序', click: () => { this.isQuitting = true; app.quit() } }
    ])

    this.tray.setToolTip('onetool')
    this.tray.setContextMenu(contextMenu)
    this.tray.on('double-click', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isVisible()) this.mainWindow.hide()
        else { this.mainWindow.show(); this.mainWindow.focus() }
      }
    })
  }
}

export const windowManagerService = new WindowManagerService()
