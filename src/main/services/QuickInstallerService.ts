import { BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'child_process'
import { IpcResponse } from '../../shared/types'
import { logger } from '../utils/logger'
import { processRegistry } from './ProcessRegistry'

export class QuickInstallerService {
  private mainWindow: BrowserWindow | null = null
  private isInstalling = false

  constructor() {}

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  async installSoftware(softwareList: { id: string; name: string; source: string }[]): Promise<IpcResponse> {
    if (this.isInstalling) {
      return { success: false, error: '已有安装任务正在进行中' }
    }

    this.isInstalling = true
    logger.info(`QuickInstaller: Starting installation of ${softwareList.length} apps.`)

    try {
      for (let i = 0; i < softwareList.length; i++) {
        const software = softwareList[i]
        
        // Notify progress
        if (this.mainWindow) {
          this.mainWindow.webContents.send('quick-installer-progress', {
            current: i,
            total: softwareList.length,
            currentName: software.name
          })
          this.mainWindow.webContents.send('quick-installer-log', {
            type: 'info',
            message: `正在准备安装: ${software.name} (${software.id})...`
          })
        }

        const success = await this.runWingetInstall(software)
        
        if (this.mainWindow) {
          this.mainWindow.webContents.send('quick-installer-log', {
            type: success ? 'success' : 'error',
            message: success ? `${software.name} 安装成功` : `${software.name} 安装失败`
          })
        }
      }

      if (this.mainWindow) {
        this.mainWindow.webContents.send('quick-installer-progress', {
          current: softwareList.length,
          total: softwareList.length,
          currentName: '全部完成'
        })
        this.mainWindow.webContents.send('quick-installer-complete', {
          success: true,
          message: '选定的软件已尝试安装完成'
        })
        this.mainWindow.webContents.send('app-notification', {
          type: 'success',
          title: '安装任务完成',
          message: `已完成 ${softwareList.length} 个软件的安装尝试`,
          duration: 5000
        })
      }

      return { success: true }
    } catch (error) {
      logger.error('QuickInstaller: Global error:', error)
      return { success: false, error: (error as Error).message }
    } finally {
      this.isInstalling = false
    }
  }

  private runWingetInstall(software: { id: string; name: string }): Promise<boolean> {
    return new Promise((resolve) => {
      const args = ['install', '--id', software.id, '--silent', '--accept-package-agreements', '--accept-source-agreements']
      
      logger.info(`QuickInstaller: Executing winget ${args.join(' ')}`)
      
      const winget = spawn('winget', args, { windowsHide: true })
      processRegistry.register(winget)

      winget.stdout.on('data', (data) => {
        if (this.mainWindow) {
          this.mainWindow.webContents.send('quick-installer-log', {
            type: 'stdout',
            message: data.toString().trim()
          })
        }
      })

      winget.stderr.on('data', (data) => {
        if (this.mainWindow) {
          this.mainWindow.webContents.send('quick-installer-log', {
            type: 'stderr',
            message: data.toString().trim()
          })
        }
      })

      winget.on('close', (code) => {
        logger.info(`QuickInstaller: winget for ${software.id} closed with code ${code}`)
        resolve(code === 0)
      })

      winget.on('error', (err) => {
        logger.error(`QuickInstaller: Failed to start winget for ${software.id}:`, err)
        resolve(false)
      })
    })
  }
}

export const quickInstallerService = new QuickInstallerService()
