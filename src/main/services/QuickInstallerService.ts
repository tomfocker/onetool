import { BrowserWindow } from 'electron'
import { spawn, execSync } from 'child_process'
import { IpcResponse } from '../../shared/types'
import { logger } from '../utils/logger'
import { processRegistry } from './ProcessRegistry'

export class QuickInstallerService {
  private mainWindow: BrowserWindow | null = null
  private isInstalling = false

  constructor() { }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private checkWingetAvailable(): boolean {
    try {
      execSync('winget --version', { windowsHide: true })
      return true
    } catch (e) {
      return false
    }
  }

  private async installWinget(): Promise<boolean> {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('quick-installer-log', {
        type: 'info',
        message: '未检测到 winget，正在尝试自动安装 winget 环境...'
      })
    }

    return new Promise((resolve) => {
      // PowerShell script to download and install winget
      // Using ghproxy for better accessibility in China
      const psScript = `
        $OutputEncoding = [System.Text.Encoding]::UTF8
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        
        function Install-Winget {
            Write-Host "开始下载 winget 安装包 (使用国内加速镜像)..."
            $tempDir = Join-Path $env:TEMP "winget-install"
            if (!(Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir }
            
            $urls = @(
                "https://mirror.ghproxy.com/https://github.com/microsoft/winget-cli/releases/latest/download/Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle",
                "https://aka.ms/Microsoft.VCLibs.x64.14.00.Desktop.appx",
                "https://mirror.ghproxy.com/https://github.com/microsoft/microsoft-ui-xaml/releases/download/v2.8.6/Microsoft.UI.Xaml.2.8.x64.appx"
            )
            
            foreach ($url in $urls) {
                $realUrl = $url
                if ($url.StartsWith("https://mirror.ghproxy.com/")) {
                    $realUrl = $url.Replace("https://mirror.ghproxy.com/", "")
                }
                
                $fileName = [System.IO.Path]::GetFileName($realUrl)
                if ($realUrl -like "*aka.ms*VCLibs*") { $fileName = "VCLibs.appx" }
                
                $outPath = Join-Path $tempDir $fileName
                Write-Host "正在下载: $fileName ..."
                try {
                    Invoke-WebRequest -Uri $url -OutFile $outPath -TimeoutSec 300 -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                } catch {
                    Write-Error "下载失败: $fileName. 错误: $($_.Exception.Message)"
                    return
                }
            }
            
            Write-Host "正在安装依赖项 (VCLibs & UI.Xaml)..."
            try {
                Add-AppxPackage -Path (Join-Path $tempDir "VCLibs.appx") -ErrorAction SilentlyContinue
                Add-AppxPackage -Path (Join-Path $tempDir "Microsoft.UI.Xaml.2.8.x64.appx") -ErrorAction SilentlyContinue
                
                Write-Host "正在安装 winget (App Installer)..."
                Add-AppxPackage -Path (Join-Path $tempDir "Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle")
                
                Write-Host "winget 环境部署完成。"
            } catch {
                Write-Error "安装失败: $($_.Exception.Message)"
            }
        }
        Install-Winget
      `

      const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true
      })

      processRegistry.register(ps)

      ps.stdout.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg && this.mainWindow) {
          this.mainWindow.webContents.send('quick-installer-log', {
            type: 'stdout',
            message: msg
          })
        }
      })

      ps.stderr.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg && this.mainWindow) {
          this.mainWindow.webContents.send('quick-installer-log', {
            type: 'stderr',
            message: msg
          })
        }
      })

      ps.on('close', (code) => {
        const success = code === 0 && this.checkWingetAvailable()
        logger.info(`QuickInstaller: Winget installation finished with code ${code}. Success: ${success}`)
        resolve(success)
      })
    })
  }

  async installSoftware(softwareList: { id: string; name: string; source: string }[]): Promise<IpcResponse> {
    if (this.isInstalling) {
      return { success: false, error: '已有安装任务正在进行中' }
    }

    this.isInstalling = true
    logger.info(`QuickInstaller: Starting installation of ${softwareList.length} apps.`)

    try {
      // Check winget
      if (!this.checkWingetAvailable()) {
        const installed = await this.installWinget()
        if (!installed) {
          this.isInstalling = false
          return { success: false, error: '无法安装 winget 环境，请手动安装 Windows App Installer。' }
        }
        
        if (this.mainWindow) {
          this.mainWindow.webContents.send('quick-installer-log', {
            type: 'success',
            message: 'winget 环境安装成功！开始安装选定的软件...'
          })
        }
      }

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
