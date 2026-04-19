import { BrowserWindow, Tray, Menu, NativeImage, nativeImage, app, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import fs from 'fs'
import { IpcResponse } from '../../shared/types'
import { createIsolatedPreloadWebPreferences } from '../utils/windowSecurity'

export class WindowManagerService {
  private mainWindow: BrowserWindow | null = null
  private floatBallWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private isQuitting = false
  private floatBallVisible = true

  private getDefaultFloatBallBounds() {
    const display = this.mainWindow && !this.mainWindow.isDestroyed()
      ? screen.getDisplayMatching(this.mainWindow.getBounds())
      : screen.getPrimaryDisplay()
    const { x, y, width, height } = display.workArea

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const mainBounds = this.mainWindow.getBounds()
      const targetX = Math.min(
        Math.max(mainBounds.x + mainBounds.width - 120 - 24, x + 16),
        x + width - 120 - 16
      )
      const targetY = Math.min(
        Math.max(mainBounds.y + 56, y + 16),
        y + height - 120 - 16
      )

      return {
        x: Math.round(targetX),
        y: Math.round(targetY),
        width: 120,
        height: 120
      }
    }

    return {
      x: Math.round(x + width - 120 - 24),
      y: Math.round(y + 120),
      width: 120,
      height: 120
    }
  }

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  setTrayEnabled(enabled: boolean) {
    if (enabled) {
      if (!this.tray) {
        this.createTray()
      }
      return
    }

    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
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

  getFloatBallWindow() {
    return this.floatBallWindow
  }

  private broadcastFloatBallVisibility(visible: boolean) {
    const targets = [this.mainWindow, this.floatBallWindow]

    targets.forEach((target) => {
      if (!target || target.isDestroyed()) {
        return
      }

      const send = () => target.webContents.send('floatball-visibility-changed', visible)

      if (target.webContents.isLoading()) {
        target.webContents.once('did-finish-load', send)
        return
      }

      send()
    })
  }

  hideFloatBallWindow(): IpcResponse {
    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      return { success: false, error: '悬浮球窗口不存在' }
    }

    this.floatBallVisible = false
    this.floatBallWindow.hide()
    this.broadcastFloatBallVisibility(false)
    return { success: true }
  }

  showFloatBallWindow(): IpcResponse {
    this.floatBallVisible = true

    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      this.createFloatBallWindow()
    }

    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      return { success: false, error: '悬浮球窗口不存在' }
    }

    const display = screen.getDisplayMatching(this.floatBallWindow.getBounds())
    const workArea = display.workArea
    const bounds = this.floatBallWindow.getBounds()
    const isOffscreen =
      bounds.x + bounds.width < workArea.x ||
      bounds.x > workArea.x + workArea.width ||
      bounds.y + bounds.height < workArea.y ||
      bounds.y > workArea.y + workArea.height

    if (isOffscreen) {
      const nextBounds = this.getDefaultFloatBallBounds()
      this.floatBallWindow.setBounds(nextBounds)
    }

    this.floatBallWindow.showInactive()
    this.floatBallWindow.setAlwaysOnTop(true, 'screen-saver')
    this.floatBallWindow.moveTop()
    this.broadcastFloatBallVisibility(true)
    return { success: true }
  }

  setFloatBallVisible(visible: boolean): IpcResponse<boolean> {
    this.floatBallVisible = visible

    if ((!this.floatBallWindow || this.floatBallWindow.isDestroyed()) && visible) {
      this.createFloatBallWindow()
    }

    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      this.broadcastFloatBallVisibility(visible)
      return visible
        ? { success: false, error: '悬浮球窗口不存在' }
        : { success: true, data: false }
    }

    if (visible && !this.floatBallWindow.isVisible()) {
      this.floatBallWindow.showInactive()
    }

    if (!visible && this.floatBallWindow.isVisible()) {
      this.floatBallWindow.hide()
    }

    this.broadcastFloatBallVisibility(visible)
    return { success: true, data: visible }
  }

  toggleFloatBallVisibility(): IpcResponse<boolean> {
    return this.setFloatBallVisible(!this.floatBallVisible)
  }

  getFloatBallState(): IpcResponse<{ exists: boolean; visible: boolean }> {
    const exists = Boolean(this.floatBallWindow && !this.floatBallWindow.isDestroyed())
    return {
      success: true,
      data: {
        exists,
        visible: this.floatBallVisible
      }
    }
  }

  createFloatBallWindow(): void {
    if (this.floatBallWindow) return

    this.floatBallWindow = new BrowserWindow({
      ...this.getDefaultFloatBallBounds(),
      show: false,
      type: 'toolbar',
      frame: false,
      transparent: true,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      focusable: true,
      webPreferences: createIsolatedPreloadWebPreferences(join(__dirname, '../preload/index.js'))
    })

    this.floatBallWindow.setAlwaysOnTop(true, 'screen-saver')
    this.floatBallWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.floatBallWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/float-ball`)
    } else {
      this.floatBallWindow.loadFile(join(__dirname, '../../renderer/index.html'), {
        hash: '/float-ball'
      })
    }

    this.floatBallWindow.once('ready-to-show', () => {
      if (this.floatBallVisible && this.floatBallWindow && !this.floatBallWindow.isDestroyed()) {
        this.floatBallWindow.showInactive()
        this.floatBallWindow.moveTop()
      }
      this.broadcastFloatBallVisibility(this.floatBallVisible)
    })

    this.floatBallWindow.on('closed', () => {
      this.floatBallWindow = null
    })
  }

  createTray(): void {
    if (this.tray) {
      return
    }

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
