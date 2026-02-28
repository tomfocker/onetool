import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { IpcResponse } from '../../shared/types'
import { processRegistry } from './ProcessRegistry'

export class ScreenSaverService {
  constructor() { }

  async start(): Promise<IpcResponse> {
    try {
      // Actually app.isPackaged is better. Let's use a simpler way since we are in main.
      const isPackaged = (require('electron')).app.isPackaged

      let screensaverPath: string
      if (!isPackaged) {
        screensaverPath = path.join(__dirname, '../../resources/FlipIt.scr')
      } else {
        screensaverPath = path.join(process.resourcesPath, 'FlipIt.scr')
      }

      if (fs.existsSync(screensaverPath)) {
        const child = spawn('cmd.exe', ['/c', 'start', '', screensaverPath, '/s'], {
          detached: true,
          windowsHide: true
        })
        processRegistry.register(child)
        child.on('error', (err) => {
          console.error('ScreenSaverService: spawn error:', err)
        })
        return { success: true }
      } else {
        return { success: false, error: '屏保文件不存在: ' + screensaverPath }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const screenSaverService = new ScreenSaverService()
