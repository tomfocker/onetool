import { BrowserWindow, Tray, Menu, NativeImage, nativeImage, app, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import fs from 'fs'
import { IpcResponse } from '../../shared/types'
import { createIsolatedPreloadWebPreferences } from '../utils/windowSecurity'

type FloatBallDockSide = 'left' | 'right' | null
type FloatBallDockState = 'free' | 'dragging' | 'preview' | 'docked' | 'peek' | 'expanded'

type FloatBallLayoutState = {
  bounds: { x: number; y: number; width: number; height: number }
  dockSide: FloatBallDockSide
  dockState: FloatBallDockState
  visibleWidth: number
}

type DisplayWorkArea = {
  x: number
  y: number
  width: number
  height: number
}

export class WindowManagerService {
  private mainWindow: BrowserWindow | null = null
  private floatBallWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private isQuitting = false
  private floatBallVisible = true
  private floatBallLayoutState: FloatBallLayoutState | null = null
  private floatBallDockedLayoutState: FloatBallLayoutState | null = null
  private floatBallDragSession:
    | { pointerOffsetX: number; pointerOffsetY: number; activeWorkArea: DisplayWorkArea }
    | null = null
  private floatBallDockAnimationTimer: NodeJS.Timeout | null = null
  private readonly floatBallBounds = { width: 96, height: 96 }
  private readonly floatBallVisibleWidth = 96
  private readonly floatBallPeekOffset = 16
  private readonly floatBallDockInset = 2
  private readonly floatBallDockThreshold = 56
  private readonly floatBallDisplaySwitchThreshold = 8
  private readonly floatBallDockAnimationDurationMs = 260
  private readonly floatBallStartupTopInset = 24
  private readonly floatBallStartupTopOffset = 84

  private getDockedFloatBallX(
    workArea: DisplayWorkArea,
    boundsWidth: number,
    dockSide: Exclude<FloatBallDockSide, null>
  ) {
    return dockSide === 'right'
      ? workArea.x + workArea.width - boundsWidth - this.floatBallDockInset
      : workArea.x + this.floatBallDockInset
  }

  private rememberDockedFloatBallState(bounds: { x: number; y: number; width: number; height: number }) {
    this.floatBallDockedLayoutState = {
      bounds,
      dockSide: 'right',
      dockState: 'docked',
      visibleWidth: bounds.width
    }
    this.floatBallLayoutState = this.floatBallDockedLayoutState
  }

  private getDefaultFloatBallBounds() {
    const display = this.mainWindow && !this.mainWindow.isDestroyed()
      ? screen.getDisplayMatching(this.mainWindow.getBounds())
      : screen.getPrimaryDisplay()
    const { x, y, width, height } = display.workArea
    const { width: floatBallWidth, height: floatBallHeight } = this.floatBallBounds
    const targetX = this.getDockedFloatBallX({ x, y, width, height }, floatBallWidth, 'right')

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const mainBounds = this.mainWindow.getBounds()
      const targetY = Math.min(
        Math.max(mainBounds.y + this.floatBallStartupTopOffset, y + this.floatBallStartupTopInset),
        y + height - floatBallHeight - this.floatBallStartupTopInset
      )

      return {
        x: Math.round(targetX),
        y: Math.round(targetY),
        width: floatBallWidth,
        height: floatBallHeight
      }
    }

    return {
      x: Math.round(targetX),
      y: Math.round(
        Math.min(
          Math.max(y + this.floatBallStartupTopOffset, y + this.floatBallStartupTopInset),
          y + height - floatBallHeight - this.floatBallStartupTopInset
        )
      ),
      width: floatBallWidth,
      height: floatBallHeight
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

  private resetFloatBallDragState() {
    this.floatBallLayoutState = null
    this.floatBallDragSession = null
  }

  private stopFloatBallDockAnimation() {
    if (this.floatBallDockAnimationTimer) {
      clearInterval(this.floatBallDockAnimationTimer)
      this.floatBallDockAnimationTimer = null
    }
  }

  private animateFloatBallBounds(targetBounds: { x: number; y: number; width: number; height: number }) {
    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      return
    }

    this.stopFloatBallDockAnimation()
    const startBounds = this.floatBallWindow.getBounds()
    const totalFrames = Math.max(1, Math.round(this.floatBallDockAnimationDurationMs / 16))
    let frame = 0
    const easeInOutCubic = (progress: number) => (
      progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2
    )

    this.floatBallDockAnimationTimer = setInterval(() => {
      if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
        this.stopFloatBallDockAnimation()
        return
      }

      frame += 1
      const progress = Math.min(1, frame / totalFrames)
      const eased = easeInOutCubic(progress)
      this.floatBallWindow.setBounds({
        x: Math.round(startBounds.x + (targetBounds.x - startBounds.x) * eased),
        y: Math.round(startBounds.y + (targetBounds.y - startBounds.y) * eased),
        width: targetBounds.width,
        height: targetBounds.height
      })

      if (progress >= 1) {
        this.stopFloatBallDockAnimation()
      }
    }, 16)
  }

  private getDisplayWorkAreaForPoint(point: { x: number; y: number }): DisplayWorkArea {
    if (typeof screen.getDisplayNearestPoint === 'function') {
      return screen.getDisplayNearestPoint(point).workArea
    }

    return screen.getDisplayMatching({ x: point.x, y: point.y, width: 1, height: 1 }).workArea
  }

  private clampBoundsToWorkArea(
    bounds: { x: number; y: number; width: number; height: number },
    workArea: DisplayWorkArea
  ) {
    return {
      x: Math.round(Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - bounds.width)),
      y: Math.round(Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - bounds.height)),
      width: bounds.width,
      height: bounds.height
    }
  }

  private rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
    return Math.max(startA, startB) < Math.min(endA, endB)
  }

  private getSharedEdgeAdjacentWorkArea(
    workArea: DisplayWorkArea,
    dockSide: Exclude<FloatBallDockSide, null>
  ) {
    if (typeof screen.getAllDisplays !== 'function') {
      return null
    }

    return screen.getAllDisplays().find((display) => {
      const other = display.workArea
      if (
        other.x === workArea.x &&
        other.y === workArea.y &&
        other.width === workArea.width &&
        other.height === workArea.height
      ) {
        return false
      }

      const overlapsVertically = this.rangesOverlap(
        workArea.y,
        workArea.y + workArea.height,
        other.y,
        other.y + other.height
      )

      if (!overlapsVertically) {
        return false
      }

      return dockSide === 'right'
        ? other.x === workArea.x + workArea.width
        : other.x + other.width === workArea.x
    })?.workArea ?? null
  }

  private hasSharedDisplayEdge(workArea: DisplayWorkArea, dockSide: Exclude<FloatBallDockSide, null>) {
    return this.getSharedEdgeAdjacentWorkArea(workArea, dockSide) !== null
  }

  private resolveDragWorkArea(
    desiredBounds: { x: number; y: number; width: number; height: number },
    point: { x: number; y: number },
    currentWorkArea: DisplayWorkArea
  ) {
    const desiredCenterX = desiredBounds.x + desiredBounds.width / 2
    const leftAdjacentWorkArea = this.getSharedEdgeAdjacentWorkArea(currentWorkArea, 'left')
    if (leftAdjacentWorkArea && desiredCenterX <= currentWorkArea.x - this.floatBallDisplaySwitchThreshold) {
      return leftAdjacentWorkArea
    }

    const rightAdjacentWorkArea = this.getSharedEdgeAdjacentWorkArea(currentWorkArea, 'right')
    const rightSwitchBoundary = currentWorkArea.x + currentWorkArea.width + this.floatBallDisplaySwitchThreshold
    if (rightAdjacentWorkArea && desiredCenterX >= rightSwitchBoundary) {
      return rightAdjacentWorkArea
    }

    const isWithinVerticalBand = (
      point.y >= currentWorkArea.y - this.floatBallDockThreshold &&
      point.y <= currentWorkArea.y + currentWorkArea.height + this.floatBallDockThreshold
    )

    const isWithinHorizontalBand = (
      desiredBounds.x + desiredBounds.width >= currentWorkArea.x - this.floatBallDockThreshold &&
      desiredBounds.x <= currentWorkArea.x + currentWorkArea.width + this.floatBallDockThreshold
    )

    if (isWithinHorizontalBand && isWithinVerticalBand) {
      return currentWorkArea
    }

    return this.getDisplayWorkAreaForPoint(point)
  }

  beginFloatBallDrag(input: { pointerOffsetX: number; pointerOffsetY: number }): IpcResponse<FloatBallLayoutState> {
    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      this.resetFloatBallDragState()
      return { success: false, error: '悬浮球窗口不存在' }
    }

    this.stopFloatBallDockAnimation()
    const bounds = this.floatBallWindow.getBounds()
    this.floatBallDragSession = {
      pointerOffsetX: input.pointerOffsetX,
      pointerOffsetY: input.pointerOffsetY,
      activeWorkArea: screen.getDisplayMatching(bounds).workArea
    }
    this.floatBallLayoutState = {
      bounds,
      dockSide: null,
      dockState: 'dragging',
      visibleWidth: this.floatBallVisibleWidth
    }

    return { success: true, data: this.floatBallLayoutState }
  }

  dragFloatBallTo(input: { screenX: number; screenY: number }): IpcResponse<FloatBallLayoutState> {
    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      this.resetFloatBallDragState()
      return { success: false, error: '悬浮球窗口不存在' }
    }

    const session = this.floatBallDragSession
    if (!session) {
      return { success: false, error: '拖拽会话不存在' }
    }

    this.stopFloatBallDockAnimation()
    const bounds = this.floatBallWindow.getBounds()
    const desiredBounds = {
      x: Math.round(input.screenX - session.pointerOffsetX),
      y: Math.round(input.screenY - session.pointerOffsetY),
      width: bounds.width || this.floatBallBounds.width,
      height: bounds.height || this.floatBallBounds.height
    }
    const activeWorkArea = this.resolveDragWorkArea(
      desiredBounds,
      { x: input.screenX, y: input.screenY },
      session.activeWorkArea
    )
    session.activeWorkArea = activeWorkArea
    const nextBounds = this.clampBoundsToWorkArea(desiredBounds, activeWorkArea)

    this.floatBallLayoutState = {
      bounds: nextBounds,
      dockSide: null,
      dockState: 'dragging',
      visibleWidth: this.floatBallVisibleWidth
    }

    if (
      typeof this.floatBallWindow.setPosition === 'function' &&
      nextBounds.width === bounds.width &&
      nextBounds.height === bounds.height
    ) {
      this.floatBallWindow.setPosition(nextBounds.x, nextBounds.y)
    } else {
      this.floatBallWindow.setBounds(nextBounds)
    }
    return { success: true, data: this.floatBallLayoutState }
  }

  private resolveReleasedBounds(
    bounds: { x: number; y: number; width: number; height: number },
    preferredWorkArea?: DisplayWorkArea
  ) {
    const { x, y, width, height } = preferredWorkArea ?? screen.getDisplayMatching(bounds).workArea
    const distanceToLeftEdge = Math.abs(bounds.x - x)
    const distanceToRightEdge = Math.abs((x + width) - (bounds.x + bounds.width))
    const nearestDockDistance = Math.min(distanceToLeftEdge, distanceToRightEdge)

    if (nearestDockDistance > this.floatBallDockThreshold) {
      return {
        bounds: this.clampBoundsToWorkArea(bounds, { x, y, width, height }),
        dockSide: null as FloatBallDockSide,
        dockState: 'free' as FloatBallDockState,
        visibleWidth: bounds.width
      }
    }

    const dockSide: FloatBallDockSide = distanceToRightEdge <= distanceToLeftEdge ? 'right' : 'left'
    const visibleWidth = bounds.width
    const dockedX = this.getDockedFloatBallX({ x, y, width, height }, bounds.width, dockSide)
    return {
      bounds: {
        x: Math.round(dockedX),
        y: Math.round(Math.min(Math.max(bounds.y, y), y + height - bounds.height)),
        width: bounds.width,
        height: bounds.height
      },
      dockSide,
      dockState: 'docked' as FloatBallDockState,
      visibleWidth
    }
  }

  endFloatBallDrag(): IpcResponse<FloatBallLayoutState> {
    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      this.resetFloatBallDragState()
      return { success: false, error: '悬浮球窗口不存在' }
    }

    const session = this.floatBallDragSession
    const currentBounds = this.floatBallWindow.getBounds()
    const releasedState = this.resolveReleasedBounds(currentBounds, session?.activeWorkArea)
    this.resetFloatBallDragState()
    this.floatBallLayoutState = {
      bounds: releasedState.bounds,
      dockSide: releasedState.dockSide,
      dockState: releasedState.dockState,
      visibleWidth: releasedState.visibleWidth
    }

    if (releasedState.dockState === 'docked') {
      this.floatBallDockedLayoutState = this.floatBallLayoutState
      this.animateFloatBallBounds(releasedState.bounds)
    } else {
      this.floatBallDockedLayoutState = null
      this.floatBallWindow.setBounds(releasedState.bounds)
    }

    return { success: true, data: this.floatBallLayoutState }
  }

  peekFloatBall(): IpcResponse<FloatBallLayoutState> {
    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      return { success: false, error: '悬浮球窗口不存在' }
    }

    this.stopFloatBallDockAnimation()
    const dockedState = this.floatBallDockedLayoutState
    if (!dockedState || !dockedState.dockSide) {
      return { success: false, error: '悬浮球未停靠' }
    }

    if (dockedState.visibleWidth >= dockedState.bounds.width) {
      this.floatBallLayoutState = {
        ...dockedState,
        dockState: 'peek'
      }
      return { success: true, data: this.floatBallLayoutState }
    }

    const display = screen.getDisplayMatching(dockedState.bounds)
    const { x, width } = display.workArea
    const nextBounds = dockedState.dockSide === 'right'
      ? {
          ...dockedState.bounds,
          x: Math.round(Math.max(x, dockedState.bounds.x - this.floatBallPeekOffset))
        }
      : {
          ...dockedState.bounds,
          x: Math.round(Math.min(x + width - dockedState.bounds.width, dockedState.bounds.x + this.floatBallPeekOffset))
        }

    this.floatBallLayoutState = {
      ...dockedState,
      bounds: nextBounds,
      dockState: 'peek'
    }
    this.floatBallWindow.setBounds(nextBounds)

    return { success: true, data: this.floatBallLayoutState }
  }

  restoreFloatBallDock(): IpcResponse<FloatBallLayoutState> {
    if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
      return { success: false, error: '悬浮球窗口不存在' }
    }

    this.stopFloatBallDockAnimation()
    const dockedState = this.floatBallDockedLayoutState
    if (!dockedState || !dockedState.dockSide) {
      return { success: false, error: '悬浮球未停靠' }
    }

    this.floatBallLayoutState = {
      ...dockedState,
      dockState: 'docked'
    }
    this.floatBallWindow.setBounds(dockedState.bounds)

    return { success: true, data: this.floatBallLayoutState }
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
      this.rememberDockedFloatBallState(nextBounds)
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
    const defaultBounds = this.getDefaultFloatBallBounds()
    this.rememberDockedFloatBallState(defaultBounds)

    this.floatBallWindow = new BrowserWindow({
      ...defaultBounds,
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
      this.floatBallWindow.loadFile(join(__dirname, '../renderer/index.html'), {
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
      this.stopFloatBallDockAnimation()
      this.floatBallWindow = null
      this.floatBallDockedLayoutState = null
      this.resetFloatBallDragState()
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
