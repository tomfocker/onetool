import { ChildProcess, spawn } from 'child_process'
import { globalShortcut, BrowserWindow } from 'electron'
import { processRegistry } from './ProcessRegistry'

export class AutoClickerService {
  private autoClickerProcess: ChildProcess | null = null
  private config = { interval: 100, button: 'left', shortcut: 'F6' }
  private mainWindow: BrowserWindow | null = null

  constructor() {}

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  stop() {
    if (this.autoClickerProcess) {
      this.autoClickerProcess.kill()
      this.autoClickerProcess = null
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('autoclicker-stopped')
      }
      return true
    }
    return false
  }

  registerShortcuts() {
    try {
      if (this.config.shortcut) {
        globalShortcut.unregister(this.config.shortcut)
      }
      globalShortcut.unregister('F6')
      globalShortcut.unregister('F8')
    } catch (e) {
      console.warn('AutoClickerService: Initial unregister cleanup:', e)
    }

    const mainShortcut = this.config.shortcut || 'F6'
    const isRegistered = globalShortcut.register(mainShortcut, () => {
      console.log(`AutoClickerService: Toggle via ${mainShortcut}`)
      if (this.autoClickerProcess) {
        this.stop()
      } else {
        this.start(this.config)
      }
    })

    if (!isRegistered && mainShortcut !== 'F6') {
      globalShortcut.register('F6', () => {
        if (this.autoClickerProcess) this.stop()
        else this.start(this.config)
      })
    }

    globalShortcut.register('F8', () => {
      console.log('AutoClickerService: Emergency Stop (F8)')
      this.stop()
    })
  }

  start(config: { interval: number; button: string }) {
    try {
      this.stop()
      this.config = { ...this.config, ...config }
      
      const downFlag = config.button === 'right' ? 8 : config.button === 'middle' ? 32 : 2
      const upFlag = config.button === 'right' ? 16 : config.button === 'middle' ? 64 : 4
      
      const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class MouseClick {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'@
try { Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue } catch {}
while ($true) {
  [MouseClick]::mouse_event(${downFlag}, 0, 0, 0, 0)
  [MouseClick]::mouse_event(${upFlag}, 0, 0, 0, 0)
  if (${config.interval} -gt 0) {
    Start-Sleep -Milliseconds ${config.interval}
  }
}
`
      this.autoClickerProcess = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript
      ], { stdio: 'ignore', windowsHide: true })
      processRegistry.register(this.autoClickerProcess)
      
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('autoclicker-started')
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  updateConfig(config: any) {
    const oldShortcut = this.config.shortcut
    this.config = { ...this.config, ...config }
    
    if (config.shortcut && config.shortcut !== oldShortcut) {
      this.registerShortcuts()
    }
    return { success: true }
  }

  getStatus() {
    return {
      running: this.autoClickerProcess !== null,
      config: this.config
    }
  }
}

export const autoClickerService = new AutoClickerService()
