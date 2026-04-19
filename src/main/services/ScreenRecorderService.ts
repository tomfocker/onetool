import { app, BrowserWindow, dialog, desktopCapturer, screen } from 'electron'
import { spawn, ChildProcess, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { IpcResponse } from '../../shared/types'
import {
  createRecorderSessionUpdate,
  clampRecorderBounds,
  ensureRecorderOutputPath,
  toRecorderSessionUpdate,
  type RecorderBounds,
  type RecorderSessionMode,
  type RecorderSessionUpdate
} from '../../shared/screenRecorderSession'
import { processRegistry } from './ProcessRegistry'
import { screenshotService } from './ScreenshotService'

type ScreenRecorderConfig = {
  outputPath: string
  format: string
  fps?: number
  quality?: string
  bounds?: RecorderBounds
  displayId?: string
}

type SelectionPreviewResult = {
  bounds: RecorderBounds
  displayBounds: RecorderBounds
  previewDataUrl: string
}

const INITIAL_RECORDING_TIME = '00:00:00'
const INITIAL_SESSION: RecorderSessionUpdate = {
  status: 'idle',
  mode: 'full',
  outputPath: '',
  recordingTime: INITIAL_RECORDING_TIME,
  selectionBounds: null,
  selectionPreviewDataUrl: null,
  selectedDisplayId: null
}

export class ScreenRecorderService {
  private recorderProcess: ChildProcess | null = null
  private ffmpegInitialized = false
  private mainWindow: BrowserWindow | null = null
  private indicatorWindow: BrowserWindow | null = null
  private borderWindow: BrowserWindow | null = null
  private session: RecorderSessionUpdate = { ...INITIAL_SESSION }

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private getSessionSnapshot(): RecorderSessionUpdate {
    return toRecorderSessionUpdate(this.session)
  }

  private emitSessionUpdate() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('screen-recorder-session-updated', this.getSessionSnapshot())
    }
  }

  private updateSession(
    patch: Partial<Omit<RecorderSessionUpdate, 'selectionBounds'>> & {
      selectionBounds?: RecorderBounds | null
    }
  ) {
    this.session = createRecorderSessionUpdate(this.session, patch)
    this.emitSessionUpdate()
  }

  private setSessionStatus(status: RecorderSessionUpdate['status'], recordingTime?: string) {
    this.updateSession({
      status,
      recordingTime: recordingTime ?? this.session.recordingTime
    })
  }

  getFfmpegPath(): string {
    const isDev = !app.isPackaged
    let selectedPath = ''

    if (isDev) {
      selectedPath = ffmpegStatic as string
    } else {
      const possiblePaths = [
        path.join(process.resourcesPath, 'ffmpeg.exe'),
        path.join(process.resourcesPath, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
        path.join(path.dirname(app.getPath('exe')), 'resources', 'ffmpeg.exe'),
        path.join(path.dirname(app.getPath('exe')), 'ffmpeg.exe'),
        ffmpegStatic as string
      ]

      for (const testPath of possiblePaths) {
        if (testPath && fs.existsSync(testPath)) {
          selectedPath = testPath
          break
        }
      }
    }

    if (!selectedPath) selectedPath = ffmpegStatic as string

    try {
      execSync(`"${selectedPath}" -version`, { stdio: 'ignore', timeout: 2000 })
    } catch (e) {
      console.warn('ScreenRecorderService: FFmpeg path validation warning:', selectedPath)
    }

    return selectedPath
  }

  initFfmpeg() {
    if (this.ffmpegInitialized) return

    const ffmpegPath = this.getFfmpegPath()
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      ffmpeg.setFfmpegPath(ffmpegPath)
      this.ffmpegInitialized = true
    } else {
      console.error('ScreenRecorderService: Failed to initialize FFmpeg')
    }
  }

  private createIndicatorWindow(bounds: RecorderBounds) {
    if (this.indicatorWindow) return

    const { x, y, width } = bounds

    this.indicatorWindow = new BrowserWindow({
      width: 260,
      height: 48,
      x: Math.round(x + width / 2 - 130),
      y: y + 10,
      type: 'toolbar',
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; overflow: hidden; background: transparent; font-family: "Microsoft YaHei", "Segoe UI", sans-serif; }
          .container {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            margin: 0 auto;
            width: fit-content;
            color: white;
            background: rgba(12, 12, 12, 0.86);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 999px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            -webkit-app-region: drag;
          }
          .dot { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; animation: pulse 1s infinite alternate; }
          .time { min-width: 64px; font-family: Consolas, monospace; font-size: 12px; }
          .button {
            border: none;
            border-radius: 999px;
            padding: 6px 10px;
            font-size: 12px;
            color: white;
            cursor: pointer;
            -webkit-app-region: no-drag;
          }
          .button.secondary { background: rgba(255, 255, 255, 0.12); }
          .button.danger { background: #dc2626; }
          @keyframes pulse { 0% { opacity: 0.45; } 100% { opacity: 1; box-shadow: 0 0 8px rgba(239, 68, 68, 0.6); } }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="dot"></div>
          <div>正在录制</div>
          <div class="time" id="time">00:00:00</div>
          <button class="button secondary" id="expand">返回面板</button>
          <button class="button danger" id="stop">停止</button>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          const timeNode = document.getElementById('time');
          document.getElementById('expand').addEventListener('click', () => {
            ipcRenderer.invoke('screen-recorder-expand-panel');
          });
          document.getElementById('stop').addEventListener('click', () => {
            ipcRenderer.invoke('screen-recorder-stop');
          });
          ipcRenderer.on('update-time', (_event, time) => {
            timeNode.innerText = time;
          });
        </script>
      </body>
      </html>
    `

    this.indicatorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)
    this.indicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.indicatorWindow.setIgnoreMouseEvents(false)
  }

  private createBorderWindow(bounds: RecorderBounds) {
    if (this.borderWindow) return

    const padding = 4

    this.borderWindow = new BrowserWindow({
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2,
      type: 'toolbar',
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            margin: 0;
            overflow: hidden;
            background: transparent;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
          }
          .border-box {
            position: absolute;
            inset: 0;
            border: 4px dashed #ef4444;
            box-sizing: border-box;
            background: transparent;
            pointer-events: none;
            animation: border-flash 1s infinite alternate;
          }
          @keyframes border-flash { 0% { border-color: rgba(239, 68, 68, 0.4); } 100% { border-color: rgba(239, 68, 68, 1); } }
        </style>
      </head>
      <body>
        <div class="border-box"></div>
      </body>
      </html>
    `

    this.borderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)
    this.borderWindow.setIgnoreMouseEvents(true, { forward: true })
    this.borderWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  private destroyIndicatorWindow() {
    if (this.indicatorWindow) {
      if (!this.indicatorWindow.isDestroyed()) {
        this.indicatorWindow.close()
      }
      this.indicatorWindow = null
    }

    if (this.borderWindow) {
      if (!this.borderWindow.isDestroyed()) {
        this.borderWindow.close()
      }
      this.borderWindow = null
    }
  }

  private getIndicatorBounds(config: ScreenRecorderConfig): RecorderBounds {
    if (config.bounds) {
      return config.bounds
    }

    if (config.displayId) {
      const matchedDisplay = screen.getAllDisplays().find((display) => display.id.toString() === config.displayId)
      if (matchedDisplay) {
        return matchedDisplay.bounds
      }
    }

    return screen.getPrimaryDisplay().bounds
  }

  private buildCaptureArgs(config: ScreenRecorderConfig): string[] {
    const primaryDisplay = screen.getPrimaryDisplay()
    const fps = config.fps || 30
    const args = ['-y', '-f', 'gdigrab', '-framerate', fps.toString()]

    if (config.bounds) {
      const targetDisplay = screen.getDisplayNearestPoint({
        x: config.bounds.x + config.bounds.width / 2,
        y: config.bounds.y + config.bounds.height / 2
      })
      const scaleFactor = targetDisplay.scaleFactor
      let realX = Math.floor((config.bounds.x - targetDisplay.bounds.x) * scaleFactor + targetDisplay.bounds.x * scaleFactor)
      let realY = Math.floor((config.bounds.y - targetDisplay.bounds.y) * scaleFactor + targetDisplay.bounds.y * scaleFactor)
      let realW = Math.floor(config.bounds.width * scaleFactor)
      let realH = Math.floor(config.bounds.height * scaleFactor)

      realW = realW % 2 === 0 ? realW : realW - 1
      realH = realH % 2 === 0 ? realH : realH - 1

      args.push(
        '-offset_x', realX.toString(),
        '-offset_y', realY.toString(),
        '-video_size', `${realW}x${realH}`,
        '-i', 'desktop'
      )

      return args
    }

    if (config.displayId) {
      const display = screen.getAllDisplays().find((item) => item.id.toString() === config.displayId) || primaryDisplay
      const scaleFactor = display.scaleFactor
      let realX = Math.floor(display.bounds.x * scaleFactor)
      let realY = Math.floor(display.bounds.y * scaleFactor)
      let realW = Math.floor(display.bounds.width * scaleFactor)
      let realH = Math.floor(display.bounds.height * scaleFactor)
      realW = (realW % 2 === 0 ? realW : realW - 1) - 2
      realH = (realH % 2 === 0 ? realH : realH - 1) - 2

      args.push(
        '-offset_x', realX.toString(),
        '-offset_y', realY.toString(),
        '-video_size', `${realW}x${realH}`,
        '-i', 'desktop'
      )

      return args
    }

    const scaleFactor = primaryDisplay.scaleFactor
    const { width, height } = primaryDisplay.size
    let realW = Math.floor(width * scaleFactor)
    let realH = Math.floor(height * scaleFactor)
    realW = (realW % 2 === 0 ? realW : realW - 1) - 2
    realH = (realH % 2 === 0 ? realH : realH - 1) - 2

    args.push(
      '-offset_x', '0',
      '-offset_y', '0',
      '-video_size', `${realW}x${realH}`,
      '-i', 'desktop'
    )

    return args
  }

  private bindRecorderProcess(config: ScreenRecorderConfig) {
    if (!this.recorderProcess || !this.recorderProcess.stderr) {
      return
    }

    this.recorderProcess.stderr.on('data', (data) => {
      const msg = data.toString()
      const timeMatch = msg.match(/time=(\d{2}:\d{2}:\d{2})/)
      if (!timeMatch) {
        return
      }

      const recordingTime = timeMatch[1]
      this.updateSession({ recordingTime })

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('screen-recorder-progress', { timemark: recordingTime })
      }

      if (this.indicatorWindow && !this.indicatorWindow.isDestroyed()) {
        this.indicatorWindow.webContents.send('update-time', recordingTime)
      }
    })

    this.recorderProcess.on('error', (err) => {
      this.recorderProcess = null
      this.destroyIndicatorWindow()
      this.updateSession({ status: 'idle', recordingTime: INITIAL_RECORDING_TIME })

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('screen-recorder-stopped', { success: false, error: err.message })
      }
    })

    this.recorderProcess.on('close', (code) => {
      const wasGracefulStop = this.session.status === 'finishing'
      const wasRecording = this.session.status === 'recording' || wasGracefulStop

      if (wasRecording && !wasGracefulStop && this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('app-notification', {
          type: 'error',
          title: '录制异常中断',
          message: `FFmpeg 进程意外退出 (错误码: ${code})，录制已停止。`,
          duration: 5000
        })
      }

      this.recorderProcess = null
      this.destroyIndicatorWindow()
      this.updateSession({
        status: 'idle',
        recordingTime: INITIAL_RECORDING_TIME
      })

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show()
        const success = wasGracefulStop ? (code === 0 || code === 1 || code === null) : code === 0
        this.mainWindow.webContents.send('screen-recorder-stopped', {
          success,
          outputPath: config.outputPath
        })
      }
    })
  }

  async selectOutput(window: BrowserWindow | null): Promise<IpcResponse<{ canceled: boolean, filePath: string | null }>> {
    try {
      if (!window) return { success: false, error: '窗口不存在' }

      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: '选择保存位置',
        filters: [
          { name: 'MP4 视频', extensions: ['mp4'] },
          { name: 'GIF 动画', extensions: ['gif'] }
        ],
        defaultPath: path.join(app.getPath('desktop'), `recording-${Date.now()}.mp4`)
      })

      return { success: true, data: { canceled, filePath: !canceled ? filePath : null } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async getScreens(): Promise<IpcResponse<any[]>> {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 150, height: 150 } })
      return {
        success: true,
        data: sources.map((source) => ({
          id: source.id,
          name: source.name,
          display_id: source.display_id,
          thumbnail: source.thumbnail.toDataURL()
        }))
      }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  beginSelection() {
    this.updateSession({
      status: 'selecting-area',
      mode: 'area',
      recordingTime: INITIAL_RECORDING_TIME
    })
  }

  cancelSelection() {
    if (this.session.status !== 'selecting-area') {
      return
    }

    this.updateSession({
      status: 'idle',
      recordingTime: INITIAL_RECORDING_TIME
    })
  }

  async prepareSelection(bounds: RecorderBounds): Promise<IpcResponse<SelectionPreviewResult>> {
    try {
      if (this.recorderProcess || this.session.status === 'recording' || this.session.status === 'finishing') {
        return { success: false, error: '录制进行中，无法准备选区' }
      }

      const targetDisplay = screen.getDisplayNearestPoint({
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      })

      const clampedBounds = clampRecorderBounds(bounds, targetDisplay.bounds)
      const previewResult = await screenshotService.capture(clampedBounds)
      if (!previewResult.success || !previewResult.data) {
        return { success: false, error: previewResult.error || '无法生成选区预览' }
      }

      this.updateSession(
        toRecorderSessionUpdate({
          status: 'ready-to-record',
          mode: 'area',
          outputPath: this.session.outputPath,
          recordingTime: INITIAL_RECORDING_TIME,
          selectionBounds: clampedBounds,
          selectionPreviewDataUrl: previewResult.data,
          selectedDisplayId: targetDisplay.id.toString()
        })
      )

      return {
        success: true,
        data: {
          bounds: clampedBounds,
          displayBounds: { ...targetDisplay.bounds },
          previewDataUrl: previewResult.data
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  expandPanel(): IpcResponse {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore()
        }
        this.mainWindow.show()
        this.mainWindow.focus()
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async start(config: ScreenRecorderConfig): Promise<IpcResponse> {
    try {
      if (this.recorderProcess || this.session.status === 'recording' || this.session.status === 'finishing') {
        return { success: false, error: '录制已在进行中' }
      }

      const ffmpegPath = this.getFfmpegPath()
      if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
        return { success: false, error: 'FFmpeg 未正确安装或路径无效' }
      }

      const mode: RecorderSessionMode = config.bounds ? 'area' : 'full'
      const normalizedOutputPath = ensureRecorderOutputPath(config.outputPath, config.format === 'gif' ? 'gif' : 'mp4')
      const sessionUpdate: Partial<Omit<RecorderSessionUpdate, 'selectionBounds'>> & {
        selectionBounds?: RecorderBounds | null
      } = {
        status: 'recording',
        mode,
        outputPath: normalizedOutputPath,
        recordingTime: INITIAL_RECORDING_TIME,
        selectedDisplayId: config.bounds
          ? this.session.selectedDisplayId
          : config.displayId || null
      }

      if (config.bounds) {
        sessionUpdate.selectionBounds = config.bounds
        sessionUpdate.selectionPreviewDataUrl = this.session.selectionPreviewDataUrl
      } else {
        sessionUpdate.selectionBounds = null
        sessionUpdate.selectionPreviewDataUrl = null
      }

      this.updateSession(sessionUpdate)

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.minimize()
      }

      const args = this.buildCaptureArgs({
        ...config,
        outputPath: normalizedOutputPath
      })

      args.push('-draw_mouse', '1')

      if (config.format === 'mp4') {
        const crf = config.quality === 'high' ? '23' : config.quality === 'medium' ? '28' : '32'
        args.push(
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', crf,
          '-pix_fmt', 'yuv420p',
          '-tune', 'zerolatency',
          '-movflags', '+faststart',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          normalizedOutputPath
        )
      } else if (config.format === 'gif') {
        args.push(
          '-f', 'gif',
          '-vf', 'fps=10,scale=trunc(iw/2)*2:trunc(ih/2)*2',
          normalizedOutputPath
        )
      }

      this.recorderProcess = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      processRegistry.register(this.recorderProcess)

      if (!this.recorderProcess || !this.recorderProcess.stdin || !this.recorderProcess.stderr) {
        this.recorderProcess = null
        this.updateSession({ status: 'idle', recordingTime: INITIAL_RECORDING_TIME })
        return { success: false, error: '无法启动录制进程' }
      }

      this.bindRecorderProcess({ ...config, outputPath: normalizedOutputPath })

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('screen-recorder-started')
      }

      const indicatorBounds = this.getIndicatorBounds({ ...config, outputPath: normalizedOutputPath })
      this.createIndicatorWindow(indicatorBounds)
      if (config.bounds) {
        this.createBorderWindow(config.bounds)
      }

      return { success: true }
    } catch (error) {
      this.recorderProcess = null
      this.destroyIndicatorWindow()
      this.updateSession({ status: 'idle', recordingTime: INITIAL_RECORDING_TIME })
      return { success: false, error: (error as Error).message }
    }
  }

  async stop(): Promise<IpcResponse> {
    try {
      if (!this.recorderProcess || this.session.status !== 'recording') {
        return { success: false, error: '没有正在进行的录制' }
      }

      this.setSessionStatus('finishing')

      if (this.recorderProcess.stdin && this.recorderProcess.stdin.writable) {
        const processToKill = this.recorderProcess
        this.recorderProcess.stdin.write('q')
        setTimeout(() => {
          if (this.recorderProcess === processToKill && this.session.status === 'finishing') {
            processToKill.kill('SIGKILL')
          }
        }, 5000)
      } else {
        this.recorderProcess.kill('SIGINT')
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  getStatus(): IpcResponse<{ recording: boolean }> {
    return {
      success: true,
      data: { recording: this.session.status === 'recording' || this.session.status === 'finishing' }
    }
  }

  getDefaultPath(): IpcResponse<string> {
    return { success: true, data: path.join(app.getPath('desktop'), `recording-${Date.now()}.mp4`) }
  }
}

export const screenRecorderService = new ScreenRecorderService()
