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
  private ffmpegInitialized = false
  private mainWindow: BrowserWindow | null = null

  constructor() {}

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

  async selectOutput(window: BrowserWindow | null): Promise<IpcResponse<{ canceled: boolean, filePath: string | null }>> {
    try {
      if (!window) return { success: false, error: '窗口不存在' }
      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: '选择保存位置',
        filters: [
          { name: 'MP4 视频', extensions: ['mp4'] },
          { name: 'GIF 动画', extensions: ['gif'] },
          { name: 'WebM 视频', extensions: ['webm'] }
        ],
        defaultPath: path.join(app.getPath('desktop'), `recording-${Date.now()}.mp4`)
      })
      return { success: true, data: { canceled, filePath: !canceled ? filePath : null } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async getWindows(): Promise<IpcResponse<any[]>> {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 150, height: 150 } })
      return {
        success: true,
        data: sources.map(s => ({
          id: s.id,
          name: s.name,
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
    windowTitle?: string;
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

      if (config.windowTitle) {
        args.push('-i', `title=${config.windowTitle}`)
      } else if (config.bounds) {
        let realX = Math.floor(config.bounds.x * scaleFactor)
        let realY = Math.floor(config.bounds.y * scaleFactor)
        let realW = Math.floor(config.bounds.width * scaleFactor)
        let realH = Math.floor(config.bounds.height * scaleFactor)
        
        realW = realW % 2 === 0 ? realW : realW - 1
        realH = realH % 2 === 0 ? realH : realH - 1
        
        const screenWidth = Math.floor(primaryDisplay.size.width * scaleFactor)
        const screenHeight = Math.floor(primaryDisplay.size.height * scaleFactor)

        if (realX + realW > screenWidth) realW = screenWidth - realX
        if (realY + realH > screenHeight) realH = screenHeight - realY

        args.push(
          '-offset_x', realX.toString(),
          '-offset_y', realY.toString(),
          '-video_size', `${realW}x${realH}`,
          '-i', 'desktop'
        )
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
          '-vf', 'fps=10,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
          config.outputPath
        )
      } else {
        args.push(config.outputPath)
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
        if (timeMatch && this.mainWindow) {
          this.mainWindow.webContents.send('screen-recorder-progress', { timemark: timeMatch[1] })
        }
      })

      this.recorderProcess.on('error', (err) => {
        this.isRecording = false
        this.recorderProcess = null
        if (this.mainWindow) this.mainWindow.webContents.send('screen-recorder-stopped', { success: false, error: err.message })
      })

      this.recorderProcess.on('close', (code) => {
        this.isRecording = false
        this.recorderProcess = null
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.show()
          this.mainWindow.webContents.send('screen-recorder-stopped', { 
            success: code === 0 || code === null, 
            outputPath: config.outputPath 
          })
        }
      })

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('screen-recorder-started')
      }

      return { success: true }
    } catch (error) {
      this.isRecording = false
      this.recorderProcess = null
      return { success: false, error: (error as Error).message }
    }
  }

  async stop(): Promise<IpcResponse> {
    try {
      if (!this.isRecording || !this.recorderProcess) {
        return { success: false, error: '没有正在进行的录制' }
      }

      if (this.recorderProcess.stdin && this.recorderProcess.stdin.writable) {
        this.recorderProcess.stdin.write('q')
        const processToKill = this.recorderProcess
        setTimeout(() => {
          if (this.isRecording && this.recorderProcess === processToKill) {
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
