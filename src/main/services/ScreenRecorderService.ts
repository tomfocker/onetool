import { app, BrowserWindow, dialog, desktopCapturer } from 'electron'
import { spawn, ChildProcess, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { IpcResponse } from '../../shared/types'
import { processRegistry } from './ProcessRegistry'

export class ScreenRecorderService {
  private recorderProcess: ChildProcess | null = null
  private isRecording = false
  private isStopping = false
  private ffmpegInitialized = false
  private mainWindow: BrowserWindow | null = null
  private indicatorWindow: BrowserWindow | null = null
  private borderWindow: BrowserWindow | null = null

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
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

  private createIndicatorWindow(bounds: { x: number, y: number, width: number, height: number }) {
    if (this.indicatorWindow) return

    const { x, y, width } = bounds

    this.indicatorWindow = new BrowserWindow({
      width: 200,
      height: 40,
      x: x + width / 2 - 100,
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
          body { margin: 0; overflow: hidden; background: transparent; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
          .container { display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.7); border-radius: 20px; padding: 8px 16px; color: white; border: 1px solid rgba(255,255,255,0.1); width: fit-content; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
          .dot { width: 10px; height: 10px; background-color: #ef4444; border-radius: 50%; margin-right: 8px; animation: pulse 1s infinite alternate; }
          .text { font-size: 12px; font-weight: 600; }
          .time { margin-left: 8px; font-family: monospace; font-size: 12px; opacity: 0.9; }
          @keyframes pulse { 0% { opacity: 0.4; } 100% { opacity: 1; box-shadow: 0 0 8px rgba(239, 68, 68, 0.6); } }
        </style>
      </head>
      <body>
        <div class="container" style="-webkit-app-region: drag;">
          <div class="dot"></div>
          <div class="text">正在录制</div>
          <div class="time" id="time">00:00:00</div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          ipcRenderer.on('update-time', (event, time) => {
            document.getElementById('time').innerText = time;
          });
        </script>
      </body>
      </html>
    `
    this.indicatorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)

    // Allow the window to stay on top across all desktops
    this.indicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.indicatorWindow.setIgnoreMouseEvents(false)
  }

  private createBorderWindow(bounds: { x: number, y: number, width: number, height: number }) {
    if (this.borderWindow) return

    const padding = 4;

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
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
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
        data: sources.map(s => ({
          id: s.id,
          name: s.name,
          display_id: s.display_id,
          thumbnail: s.thumbnail.toDataURL()
        }))
      }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  async start(config: {
    outputPath: string;
    format: string;
    fps?: number;
    quality?: string;
    bounds?: { x: number; y: number; width: number; height: number };
    displayId?: string;
  }): Promise<IpcResponse> {
    try {
      if (this.isRecording || this.recorderProcess) {
        return { success: false, error: '录制已在进行中' }
      }

      const ffmpegPath = this.getFfmpegPath()
      if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
        return { success: false, error: 'FFmpeg 未正确安装或路径无效' }
      }

      this.isRecording = true
      if (this.mainWindow) this.mainWindow.minimize()

      const { screen } = require('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      const scaleFactor = primaryDisplay.scaleFactor
      const fps = config.fps || 30

      const args = ['-y', '-f', 'gdigrab', '-framerate', fps.toString()]

      let indicatorBounds = primaryDisplay.bounds

      if (config.bounds) {
        let realX = Math.floor(config.bounds.x * scaleFactor)
        let realY = Math.floor(config.bounds.y * scaleFactor)
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
        // Indicator should appear attached to the captured area bounds, but restricted to screen max.
        // Screen absolute bounds are roughly config.bounds
        indicatorBounds = { x: config.bounds.x, y: config.bounds.y, width: config.bounds.width, height: config.bounds.height }
        this.createBorderWindow(config.bounds)
      } else if (config.displayId) {
        const display = screen.getAllDisplays().find(d => d.id.toString() === config.displayId) || primaryDisplay
        const dScaleFactor = display.scaleFactor
        let realX = Math.floor(display.bounds.x * dScaleFactor)
        let realY = Math.floor(display.bounds.y * dScaleFactor)
        let realW = Math.floor(display.bounds.width * dScaleFactor)
        let realH = Math.floor(display.bounds.height * dScaleFactor)
        realW = (realW % 2 === 0 ? realW : realW - 1) - 2
        realH = (realH % 2 === 0 ? realH : realH - 1) - 2
        args.push(
          '-offset_x', realX.toString(),
          '-offset_y', realY.toString(),
          '-video_size', `${realW}x${realH}`,
          '-i', 'desktop'
        )
        indicatorBounds = display.bounds
      } else {
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
      }

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
          config.outputPath
        )
      } else if (config.format === 'gif') {
        args.push(
          '-f', 'gif',
          '-vf', 'fps=10,scale=trunc(iw/2)*2:trunc(ih/2)*2',
          config.outputPath
        )
      }

      this.recorderProcess = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      processRegistry.register(this.recorderProcess)

      if (!this.recorderProcess || !this.recorderProcess.stdin || !this.recorderProcess.stderr) {
        this.isRecording = false
        this.recorderProcess = null
        return { success: false, error: '无法启动录制进程' }
      }

      this.recorderProcess.stderr.on('data', (data) => {
        const msg = data.toString()
        const timeMatch = msg.match(/time=(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
          if (this.mainWindow) {
            this.mainWindow.webContents.send('screen-recorder-progress', { timemark: timeMatch[1] })
          }
          if (this.indicatorWindow && !this.indicatorWindow.isDestroyed()) {
            this.indicatorWindow.webContents.send('update-time', timeMatch[1])
          }
        }
      })

      this.recorderProcess.on('error', (err) => {
        this.isRecording = false
        this.recorderProcess = null
        this.destroyIndicatorWindow()
        if (this.mainWindow) this.mainWindow.webContents.send('screen-recorder-stopped', { success: false, error: err.message })
      })

      this.recorderProcess.on('close', (code) => {
        const wasGracefulStop = this.isStopping
        // 仅当不是主动停止时，才视为意外崩溃并发通知
        if (this.isRecording && !wasGracefulStop) {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('app-notification', {
              type: 'error',
              title: '录制异常中断',
              message: `FFmpeg 进程意外退出 (错误码: ${code})，录制已停止。`,
              duration: 5000
            })
          }
        }

        this.isRecording = false
        this.isStopping = false
        this.recorderProcess = null
        this.destroyIndicatorWindow()
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.show()
          // ffmpeg 被 'q' 优雅停止时退出码可能是 0 或 1，都视为成功
          const success = wasGracefulStop ? (code === 0 || code === 1 || code === null) : code === 0
          this.mainWindow.webContents.send('screen-recorder-stopped', {
            success,
            outputPath: config.outputPath
          })
        }
      })

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('screen-recorder-started')
      }
      this.createIndicatorWindow(indicatorBounds)

      return { success: true }
    } catch (error) {
      this.isRecording = false
      this.recorderProcess = null
      this.destroyIndicatorWindow()
      return { success: false, error: (error as Error).message }
    }
  }

  async stop(): Promise<IpcResponse> {
    try {
      if (!this.isRecording || !this.recorderProcess) {
        return { success: false, error: '没有正在进行的录制' }
      }

      // 标记为主动停止，防止 close 事件误报「异常中断」
      this.isStopping = true

      if (this.recorderProcess.stdin && this.recorderProcess.stdin.writable) {
        this.recorderProcess.stdin.write('q')
        const processToKill = this.recorderProcess
        setTimeout(() => {
          if (this.isRecording && this.recorderProcess === processToKill) {
            this.isStopping = false
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
      data: { recording: this.isRecording }
    }
  }

  getDefaultPath(): IpcResponse<string> {
    return { success: true, data: path.join(app.getPath('desktop'), `recording-${Date.now()}.mp4`) }
  }
}

export const screenRecorderService = new ScreenRecorderService()
