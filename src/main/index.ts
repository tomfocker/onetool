import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, globalShortcut, clipboard, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess, exec } from 'child_process'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import windowStateKeeper from 'electron-window-state'

function getFfmpegPath(): string {
  const isDev = !app.isPackaged
  
  console.log('=== FFmpeg Path Debug ===')
  console.log('isDev:', isDev)
  console.log('app.isPackaged:', app.isPackaged)
  console.log('process.resourcesPath:', process.resourcesPath)
  console.log('ffmpegStatic:', ffmpegStatic)
  
  if (isDev) {
    const devPath = ffmpegStatic as string
    console.log('Dev mode, using ffmpegStatic:', devPath)
    console.log('Dev path exists:', fs.existsSync(devPath))
    return devPath
  }
  
  const possiblePaths = [
    path.join(process.resourcesPath, 'ffmpeg.exe'),
    path.join(process.resourcesPath, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(path.dirname(app.getPath('exe')), 'resources', 'ffmpeg.exe'),
    path.join(path.dirname(app.getPath('exe')), 'ffmpeg.exe'),
    ffmpegStatic as string
  ]
  
  for (const testPath of possiblePaths) {
    console.log('Checking path:', testPath, 'exists:', fs.existsSync(testPath))
    if (testPath && fs.existsSync(testPath)) {
      console.log('Found FFmpeg at:', testPath)
      return testPath
    }
  }
  
  console.error('FFmpeg not found in any location!')
  return ffmpegStatic as string
}

let ffmpegInitialized = false

function initFfmpeg() {
  if (ffmpegInitialized) return
  
  const ffmpegPath = getFfmpegPath()
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    console.log('Setting FFmpeg path:', ffmpegPath)
    ffmpeg.setFfmpegPath(ffmpegPath)
    ffmpegInitialized = true
  } else {
    console.error('Failed to initialize FFmpeg - path not found or invalid')
  }
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      mainWindow.focus()
    }
  })
}

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let floatBallWindow: BrowserWindow | null = null
let screenOverlayWindow: BrowserWindow | null = null
let isQuitting = false

interface ClipboardItem {
  id: string
  type: 'text' | 'image'
  content: string
  preview?: string
  timestamp: number
  pinned: boolean
}

let clipboardHistory: ClipboardItem[] = []
let lastClipboardContent: string = ''
let clipboardWatcherInterval: NodeJS.Timeout | null = null

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function startClipboardWatcher(): void {
  if (clipboardWatcherInterval) return
  
  lastClipboardContent = clipboard.readText() || ''
  
  clipboardWatcherInterval = setInterval(() => {
    if (!mainWindow) return
    
    const currentText = clipboard.readText()
    const currentImage = clipboard.readImage()
    
    if (currentText && currentText !== lastClipboardContent) {
      lastClipboardContent = currentText
      
      const newItem: ClipboardItem = {
        id: generateId(),
        type: 'text',
        content: currentText,
        timestamp: Date.now(),
        pinned: false
      }
      
      clipboardHistory = [newItem, ...clipboardHistory.filter(item => item.content !== currentText)].slice(0, 100)
      saveClipboardHistory()
      mainWindow.webContents.send('clipboard-change', newItem)
    } else if (!currentText && !currentImage.isEmpty()) {
      const imageSize = currentImage.getSize()
      if (imageSize.width > 0 && imageSize.height > 0) {
        const dataUrl = currentImage.toDataURL()
        
        if (dataUrl !== lastClipboardContent) {
          lastClipboardContent = dataUrl
          
          const newItem: ClipboardItem = {
            id: generateId(),
            type: 'image',
            content: dataUrl,
            timestamp: Date.now(),
            pinned: false
          }
          
          clipboardHistory = [newItem, ...clipboardHistory.filter(item => item.content !== dataUrl)].slice(0, 100)
          saveClipboardHistory()
          mainWindow.webContents.send('clipboard-change', newItem)
        }
      }
    }
  }, 500)
}

function stopClipboardWatcher(): void {
  if (clipboardWatcherInterval) {
    clearInterval(clipboardWatcherInterval)
    clipboardWatcherInterval = null
  }
}

function getClipboardHistoryPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'clipboard-history.json')
}

function saveClipboardHistory(): void {
  try {
    const historyPath = getClipboardHistoryPath()
    fs.writeFileSync(historyPath, JSON.stringify(clipboardHistory, null, 2))
  } catch (error) {
    console.error('Failed to save clipboard history:', error)
  }
}

function loadClipboardHistory(): void {
  try {
    const historyPath = getClipboardHistoryPath()
    if (fs.existsSync(historyPath)) {
      const data = fs.readFileSync(historyPath, 'utf-8')
      clipboardHistory = JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load clipboard history:', error)
    clipboardHistory = []
  }
}

ipcMain.on('get-clipboard-history', (event) => {
  event.reply('clipboard-history', clipboardHistory)
})

ipcMain.on('delete-clipboard-item', (_event, id: string) => {
  clipboardHistory = clipboardHistory.filter(item => item.id !== id)
  saveClipboardHistory()
})

ipcMain.on('toggle-clipboard-pin', (_event, id: string) => {
  const item = clipboardHistory.find(item => item.id === id)
  if (item) {
    item.pinned = !item.pinned
    saveClipboardHistory()
  }
})

ipcMain.on('clear-clipboard-history', () => {
  clipboardHistory = clipboardHistory.filter(item => item.pinned)
  saveClipboardHistory()
})

ipcMain.on('copy-image-to-clipboard', (_event, dataUrl: string) => {
  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    const image = nativeImage.createFromBuffer(buffer)
    clipboard.writeImage(image)
    lastClipboardContent = dataUrl
  } catch (error) {
    console.error('Failed to copy image to clipboard:', error)
  }
})

ipcMain.handle('select-files-folders', async () => {
  console.log('=== select-files-folders IPC CALLED ===')
  try {
    const mainWindow = BrowserWindow.getFocusedWindow()
    console.log('Main window:', mainWindow)
    if (!mainWindow) {
      return { success: false, error: '无法获取主窗口' }
    }

    console.log('Opening dialog...')
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      title: '选择文件或文件夹',
      buttonLabel: '选择'
    })

    console.log('Dialog result - canceled:', canceled, 'filePaths:', filePaths)
    return {
      success: true,
      canceled,
      filePaths: !canceled ? filePaths : []
    }
  } catch (error) {
    console.error('Error in select-files-folders:', error)
    return { success: false, error: (error as Error).message }
  }
})  

ipcMain.handle('start-screen-saver', async () => {
  try {
    const isDev = !app.isPackaged
    let screensaverPath: string
    
    if (isDev) {
      screensaverPath = path.join(__dirname, '../../resources/FlipIt.scr')
    } else {
      screensaverPath = path.join(process.resourcesPath, 'FlipIt.scr')
    }
    
    console.log('屏保文件路径:', screensaverPath)
    console.log('文件是否存在:', fs.existsSync(screensaverPath))
    
    if (fs.existsSync(screensaverPath)) {
      const child = spawn('cmd.exe', ['/c', 'start', '', screensaverPath, '/s'], {
        detached: true,
        windowsHide: true
      })
      child.on('error', (err) => {
        console.error('启动屏保进程错误:', err)
      })
      return { success: true }
    } else {
      return { success: false, error: '屏保文件不存在: ' + screensaverPath }
    }
  } catch (error) {
    console.error('启动屏保错误:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('rename-files', async (_event, { files, mode, options }) => {
  try {
    const results: Array<{ oldPath: string; newPath: string; success: boolean; error?: string }> = []
    
    for (const file of files) {
      let newName = ''
      const dirName = path.dirname(file)
      const baseName = path.basename(file)
      const ext = path.extname(file)
      const nameWithoutExt = path.basename(file, ext)
      
      switch (mode) {
        case 'sequential':
          const { baseName: seqBase, startNum } = options
          const index = files.indexOf(file)
          newName = `${seqBase}${startNum + index}${ext}`
          break
        
        case 'replace':
          const { find, replace } = options
          newName = baseName.replace(find, replace)
          break
        
        case 'prefix_suffix':
          const { prefix, suffix } = options
          newName = `${prefix}${nameWithoutExt}${suffix}${ext}`
          break
        
        case 'custom':
          const { newNames } = options
          const fileIndex = files.indexOf(file)
          newName = newNames[fileIndex] || baseName
          break
      }
      
      const newPath = path.join(dirName, newName)
      
      if (fs.existsSync(newPath) && newPath !== file) {
        results.push({
          oldPath: file,
          newPath: newPath,
          success: false,
          error: '目标文件已存在'
        })
        continue
      }
      
      fs.renameSync(file, newPath)
      results.push({
        oldPath: file,
        newPath: newPath,
        success: true
      })
    }
    
    return { success: true, results }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

function getAllFiles(dir: string): string[] {
  let files: string[] = []
  const items = fs.readdirSync(dir, { withFileTypes: true })
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      files = [...files, ...getAllFiles(fullPath)]
    } else if (item.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

ipcMain.handle('get-file-info', async (_event, filePaths) => {
  try {
    const fileInfo: Array<{ path: string; name: string; size: number; mtime: Date }> = []
    
    for (const filePath of filePaths) {
      const stats = fs.statSync(filePath)
      
      if (stats.isDirectory()) {
        const filesInDir = getAllFiles(filePath)
        for (const file of filesInDir) {
          const fileStats = fs.statSync(file)
          fileInfo.push({
            path: file,
            name: path.basename(file),
            size: fileStats.size,
            mtime: fileStats.mtime
          })
        }
      } else if (stats.isFile()) {
        fileInfo.push({
          path: filePath,
          name: path.basename(filePath),
          size: stats.size,
          mtime: stats.mtime
        })
      }
    }
    
    return { success: true, fileInfo }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

let serverProcess: ChildProcess | null = null
let clientProcess: ChildProcess | null = null
const CAPS_WRITER_PATH = 'c:\\CapsWriter-Offline'

ipcMain.handle('capswriter-start-server', async () => {
  try {
    if (serverProcess) {
      return { success: false, error: '服务端已在运行' }
    }

    const serverExe = path.join(CAPS_WRITER_PATH, 'start_server.exe')
    if (!fs.existsSync(serverExe)) {
      return { success: false, error: `找不到服务端文件: ${serverExe}` }
    }

    serverProcess = spawn(serverExe, [], {
      cwd: CAPS_WRITER_PATH,
      detached: false,
      stdio: 'pipe'
    })

    serverProcess.on('close', () => {
      serverProcess = null
    })

    serverProcess.on('error', () => {
      serverProcess = null
    })

    return { success: true }
  } catch (error) {
    serverProcess = null
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('capswriter-start-client', async () => {
  try {
    if (clientProcess) {
      return { success: false, error: '客户端已在运行' }
    }

    const clientExe = path.join(CAPS_WRITER_PATH, 'start_client.exe')
    if (!fs.existsSync(clientExe)) {
      return { success: false, error: `找不到客户端文件: ${clientExe}` }
    }

    clientProcess = spawn(clientExe, [], {
      cwd: CAPS_WRITER_PATH,
      detached: false,
      stdio: 'pipe'
    })

    clientProcess.on('close', () => {
      clientProcess = null
    })

    clientProcess.on('error', () => {
      clientProcess = null
    })

    return { success: true }
  } catch (error) {
    clientProcess = null
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('capswriter-stop-server', async () => {
  try {
    if (serverProcess) {
      serverProcess.kill()
      serverProcess = null
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('capswriter-stop-client', async () => {
  try {
    if (clientProcess) {
      clientProcess.kill()
      clientProcess = null
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('capswriter-get-status', async () => {
  return {
    success: true,
    serverRunning: serverProcess !== null,
    clientRunning: clientProcess !== null
  }
})

ipcMain.handle('capswriter-start-all', async () => {
  try {
    let serverSuccess = true
    let clientSuccess = true
    let serverError: string | undefined
    let clientError: string | undefined

    if (!serverProcess) {
      const serverExe = path.join(CAPS_WRITER_PATH, 'start_server.exe')
      if (!fs.existsSync(serverExe)) {
        serverSuccess = false
        serverError = `找不到服务端文件: ${serverExe}`
      } else {
        serverProcess = spawn(serverExe, [], {
          cwd: CAPS_WRITER_PATH,
          detached: false,
          stdio: 'pipe'
        })
        serverProcess.on('close', () => { serverProcess = null })
        serverProcess.on('error', () => { serverProcess = null })
      }
    }

    if (!clientProcess) {
      const clientExe = path.join(CAPS_WRITER_PATH, 'start_client.exe')
      if (!fs.existsSync(clientExe)) {
        clientSuccess = false
        clientError = `找不到客户端文件: ${clientExe}`
      } else {
        clientProcess = spawn(clientExe, [], {
          cwd: CAPS_WRITER_PATH,
          detached: false,
          stdio: 'pipe'
        })
        clientProcess.on('close', () => { clientProcess = null })
        clientProcess.on('error', () => { clientProcess = null })
      }
    }

    return {
      success: serverSuccess && clientSuccess,
      serverSuccess,
      clientSuccess,
      serverError,
      clientError
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('capswriter-stop-all', async () => {
  try {
    if (serverProcess) {
      serverProcess.kill()
      serverProcess = null
    }
    if (clientProcess) {
      clientProcess.kill()
      clientProcess = null
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

let autoClickerProcess: ChildProcess | null = null
let autoClickerConfig = { interval: 100, button: 'left', shortcut: 'F6' }

function stopAutoClicker() {
  if (autoClickerProcess) {
    autoClickerProcess.kill()
    autoClickerProcess = null
    if (mainWindow) {
      mainWindow.webContents.send('autoclicker-stopped')
    }
    return true
  }
  return false
}

function registerAutoClickerShortcuts() {
  // 1. 先尝试注销所有可能相关的快捷键，防止冲突
  try {
    // 注销当前配置的键
    if (autoClickerConfig.shortcut) {
      globalShortcut.unregister(autoClickerConfig.shortcut)
    }
    // 注销默认的 F6 和 F8，防止之前的残留
    globalShortcut.unregister('F6')
    globalShortcut.unregister('F8')
  } catch (e) {
    console.warn('Initial unregister cleanup:', e)
  }

  // 2. 注册主切换快捷键
  const mainShortcut = autoClickerConfig.shortcut || 'F6'
  const isRegistered = globalShortcut.register(mainShortcut, () => {
    console.log(`Action: Toggle AutoClicker via ${mainShortcut}`)
    if (autoClickerProcess) {
      stopAutoClicker()
    } else {
      startAutoClicker(autoClickerConfig)
    }
  })

  if (!isRegistered) {
    console.error(`CRITICAL: Failed to register ${mainShortcut}. It might be held by the OS or another app.`)
    // 尝试保底：如果用户设定的键失败了，尝试强制注册 F6
    if (mainShortcut !== 'F6') {
      globalShortcut.register('F6', () => {
        if (autoClickerProcess) stopAutoClicker()
        else startAutoClicker(autoClickerConfig)
      })
    }
  }

  // 3. 注册紧急停止键 (F8) - 始终静默存在
  globalShortcut.register('F8', () => {
    console.log('Action: Emergency Stop (F8)')
    stopAutoClicker()
  })
}

function startAutoClicker(config: { interval: number; button: string }) {
  try {
    stopAutoClicker()
    autoClickerConfig = { ...autoClickerConfig, ...config }
    
    const downFlag = config.button === 'right' ? 8 : config.button === 'middle' ? 32 : 2
    const upFlag = config.button === 'right' ? 16 : config.button === 'middle' ? 64 : 4
    
    // 修复：直接将变量注入脚本，并增加一个极短的强制延迟确保点击被系统识别
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
    autoClickerProcess = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript
    ], { stdio: 'ignore', windowsHide: true })
    
    if (mainWindow) {
      mainWindow.webContents.send('autoclicker-started')
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

ipcMain.handle('autoclicker-start', async (_event, config: { interval: number; button: string }) => {
  return startAutoClicker(config)
})

ipcMain.handle('autoclicker-stop', async () => {
  stopAutoClicker()
  return { success: true }
})

ipcMain.handle('autoclicker-update-config', async (_event, config: any) => {
  const oldShortcut = autoClickerConfig.shortcut
  autoClickerConfig = { ...autoClickerConfig, ...config }
  
  if (config.shortcut && config.shortcut !== oldShortcut) {
    registerAutoClickerShortcuts()
  }
  return { success: true }
})

ipcMain.handle('autoclicker-status', async () => {
  return {
    running: autoClickerProcess !== null,
    config: autoClickerConfig
  }
})

ipcMain.handle('autostart-get-status', async () => {
  try {
    const settings = app.getLoginItemSettings()
    return {
      success: true,
      enabled: settings.openAtLogin
    }
  } catch (error) {
    return {
      success: false,
      enabled: false,
      error: (error as Error).message
    }
  }
})

ipcMain.handle('autostart-set', async (_event, enabled: boolean) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    }
  }
})

function execCommand(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Command error:', cmd, error.message)
        resolve('')
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

function execPowerShell(script: string): Promise<string> {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    ps.stdout.on('data', (chunk) => stdoutChunks.push(chunk))
    ps.stderr.on('data', (chunk) => stderrChunks.push(chunk))

    ps.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
      if (code !== 0 && !stdout) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        console.error(`PS Error: ${stderr}`)
        resolve('')
      } else {
        resolve(stdout)
      }
    })

    ps.stdin.write(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`)
    ps.stdin.end()
  })
}

ipcMain.handle('get-system-config', async () => {
  try {
    const hwScript = `
$ErrorActionPreference = 'SilentlyContinue'

# CPU
$cpu = (Get-WmiObject Win32_Processor | Select-Object -First 1).Name

# Motherboard (Double check)
$mb_raw = Get-WmiObject Win32_BaseBoard | Select-Object -First 1
$mb = "$($mb_raw.Manufacturer) $($mb_raw.Product)".Trim()
if (!$mb -or $mb -eq " ") { $mb = (Get-CimInstance Win32_BaseBoard | % { "$($_.Manufacturer) $($_.Product)" }) }

# RAM (格式: 容量|条数|频率|厂商)
$mem_objs = Get-WmiObject Win32_PhysicalMemory
$total_bytes = 0
foreach($m in $mem_objs) { $total_bytes += [long]$m.Capacity }
$ram_gb = [Math]::Round($total_bytes / 1GB)
$ram_speed = ($mem_objs | Select-Object -First 1).ConfiguredClockSpeed
$ram_manu = ($mem_objs | Select-Object -First 1).Manufacturer
$ram = "$($ram_gb)GB|$($mem_objs.Count)|$($ram_speed)|$($ram_manu)"

# GPU (Formatted list)
$gpus = (Get-WmiObject Win32_VideoController | ForEach-Object { $_.Name }) | Select-Object -Unique
$gpu_str = $gpus -join "\n"

# Disk (Formatted list)
$disks = (Get-WmiObject Win32_DiskDrive | ForEach-Object { "$($_.Model) ($([Math]::Round($_.Size / 1GB))GB)" })
$disk_str = $disks -join "\n"

# Monitor (极致普适性探测)
$mon_list = @()
try {
    # 优先：获取物理参数
    $params = Get-WmiObject -Namespace root\\wmi -Class WmiMonitorBasicDisplayParams
    # 优先：获取硬件固件报告的型号
    $ids = Get-WmiObject -Namespace root\\wmi -Class WmiMonitorID
    
    for ($i=0; $i -lt $ids.Count; $i++) {
        $m = $ids[$i]
        # 尝试解码物理名称 (Unicode 或 ASCII)
        $n_bytes = [byte[]]($m.UserFriendlyName -filter {$_ -ne 0})
        $name = if ($n_bytes) { [System.Text.Encoding]::ASCII.GetString($n_bytes).Trim() } else { "" }
        if (!$name -and $n_bytes) { $name = [System.Text.Encoding]::Unicode.GetString($n_bytes).Trim() }
        
        $m_bytes = [byte[]]($m.ManufacturerName -filter {$_ -ne 0})
        $manu = if ($m_bytes) { [System.Text.Encoding]::ASCII.GetString($m_bytes).Trim() } else { "Unknown" }
        
        # 尝试匹配该实例的分辨率
        $p = $params | Where-Object { $_.InstanceName -eq $m.InstanceName }
        if (!$p -and $params.Count -gt $i) { $p = $params[$i] } # 索引兜底
        $native = if ($p) { "$($p.HorizontalActivePixels)x$($p.VerticalActivePixels)" } else { "" }
        
        if ($manu -ne "Unknown" -or $name) {
            $mon_list += "$manu|$name|$native"
        }
    }
} catch {}

# 备选：如果 WmiMonitorID 全军覆没，使用 PnPEntity
if ($mon_list.Count -eq 0) {
    try {
        $pnp_mons = Get-WmiObject Win32_PnPEntity | Where-Object { $_.Service -eq "monitor" }
        foreach ($pm in $pnp_mons) {
            $manu = "Unknown"
            if ($pm.DeviceID -match "DISPLAY\\\\([A-Z]{3})") { $manu = $matches[1] }
            $model = if ($pm.Name -match "\\((.*)\\)") { $matches[1] } else { $pm.Name }
            $mon_list += "$manu|$model|"
        }
    } catch {}
}
$mon_str = $mon_list -join "\`n"

# OS
$os = (Get-WmiObject Win32_OperatingSystem | Select-Object -First 1).Caption

$info = @{ cpu=$cpu; mb=$mb; ram=$ram; gpu=$gpu_str; disk=$disk_str; mon=$mon_str; os=$os }
Write-Output "---HW_JSON_START---"
$info | ConvertTo-Json -Compress
Write-Output "---HW_JSON_END---"
`
    const rawResult = await execPowerShell(hwScript)
    let data: any = {}
    
    const match = rawResult.match(/---HW_JSON_START---(.*?)---HW_JSON_END---/s)
    if (match && match[1]) {
      try {
        data = JSON.parse(match[1].trim())
      } catch (e) {
        console.error('JSON Parse Error:', e)
      }
    }

    // 显示器最终对齐 (优先使用 PowerShell 采集的物理层数据)
    let monitorValue = ''
    try {
      const monLines = data.mon ? data.mon.split(/[\r\n]+/).filter((l: string) => l.includes('|')) : []
      if (monLines.length > 0) {
        monitorValue = monLines.join('\n')
      } else {
        // 彻底失效才回退到 Electron
        const { screen } = require('electron')
        monitorValue = screen.getAllDisplays().map((d, i) => `Unknown|Display ${i}|${Math.round(d.bounds.width * d.scaleFactor)}x${Math.round(d.bounds.height * d.scaleFactor)}`).join('\n')
      }
    } catch (e) {
      monitorValue = data.mon || 'Unknown'
    }

    return {
      success: true,
      config: {
        cpu: data.cpu || 'Unknown Processor',
        motherboard: data.mb || 'Unknown Motherboard',
        memory: data.ram || '',
        gpu: data.gpu || 'Unknown GPU',
        monitor: monitorValue,
        disk: data.disk || 'Unknown Storage',
        os: data.os || 'Windows'
      }
    }
  } catch (error) {
    return { success: false, error: (error as Error).message, config: null }
  }
})

interface WindowInfo {
  id: number
  title: string
  processName: string
}

ipcMain.handle('web-activator-get-window-list', async () => {
  try {
    // 优化：返回更多信息，包括 HWND
    const script = `
      Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object @{N='id';E={$_.Id}}, @{N='title';E={$_.MainWindowTitle}}, @{N='processName';E={$_.ProcessName}}, @{N='hwnd';E={$_.MainWindowHandle.ToInt64()}} | ConvertTo-Json
    `
    const result = await execPowerShell(script)
    let windows: any[] = []
    if (result) {
      try {
        const parsed = JSON.parse(result)
        windows = Array.isArray(parsed) ? parsed : [parsed]
      } catch (e) {
        console.error('Failed to parse window list JSON:', e)
      }
    }
    return { success: true, windows }
  } catch (error) {
    console.error('Get window list error:', error)
    return { success: false, windows: [], error: (error as Error).message }
  }
})

async function toggleApp(pattern: string, hwndId?: number): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    const escapedPattern = pattern.replace(/"/g, '`"')
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
          [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
        }
"@
      $proc = $null
      $targetHwnd = [IntPtr]::Zero

      # 1. 优先尝试句柄
      if ("${hwndId || 0}" -ne "0") {
          $h = [IntPtr]${hwndId || 0}
          if ([Win32]::IsWindow($h)) {
              $targetHwnd = $h
              [uint32]$pId = 0
              [Win32]::GetWindowThreadProcessId($h, [ref]$pId)
              $proc = Get-Process -Id $pId -ErrorAction SilentlyContinue
          }
      }

      # 2. 回退到进程匹配
      if (!$proc -or $targetHwnd -eq [IntPtr]::Zero) {
          $procs = Get-Process | Where-Object { ($_.MainWindowTitle -match "${escapedPattern}" -or $_.ProcessName -match "${escapedPattern}") -and $_.MainWindowHandle -ne [IntPtr]::Zero }
          $proc = $procs | Select-Object -First 1
          if ($proc) { $targetHwnd = $proc.MainWindowHandle }
      }

      if ($targetHwnd -ne [IntPtr]::Zero) {
          $fgHwnd = [Win32]::GetForegroundWindow()
          $fgRoot = [Win32]::GetAncestor($fgHwnd, 2) # GA_ROOT
          $targetRoot = [Win32]::GetAncestor($targetHwnd, 2)

          if (($fgHwnd -eq $targetHwnd -or $fgRoot -eq $targetRoot -or $fgRoot -eq $targetHwnd) -and -not [Win32]::IsIconic($targetHwnd)) {
              [Win32]::ShowWindow($targetHwnd, 6) | Out-Null # SW_MINIMIZE
              "minimized"
          } else {
              [Win32]::ShowWindow($targetHwnd, 9) | Out-Null # SW_RESTORE
              [Win32]::ShowWindow($targetHwnd, 5) | Out-Null # SW_SHOW
              [Win32]::SetForegroundWindow($targetHwnd) | Out-Null
              "activated"
          }
      } else { "not_found" }
    `
    const result = await execPowerShell(script)
    if (result.includes('activated')) return { success: true, action: 'activated' }
    if (result.includes('minimized')) return { success: true, action: 'minimized' }
    return { success: false, error: '未找到匹配的窗口' }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

async function toggleTab(pattern: string): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    const escapedPattern = pattern.replace(/"/g, '`"')
    // 浏览器标签通常通过标题匹配
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
        }
"@
      # 寻找标题匹配的浏览器窗口 (Chrome, Edge, Firefox 等)
      $proc = Get-Process | Where-Object { $_.MainWindowTitle -match "${escapedPattern}" -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
      
      if ($proc) {
          $hwnd = $proc.MainWindowHandle
          $fgHwnd = [Win32]::GetForegroundWindow()
          $fgRoot = [Win32]::GetAncestor($fgHwnd, 2)
          $targetRoot = [Win32]::GetAncestor($hwnd, 2)

          if (($fgHwnd -eq $hwnd -or $fgRoot -eq $targetRoot -or $fgRoot -eq $hwnd) -and -not [Win32]::IsIconic($hwnd)) {
              [Win32]::ShowWindow($hwnd, 6) | Out-Null
              "minimized"
          } else {
              [Win32]::ShowWindow($hwnd, 9) | Out-Null
              [Win32]::ShowWindow($hwnd, 5) | Out-Null
              [Win32]::SetForegroundWindow($hwnd) | Out-Null
              "activated"
          }
      } else { "not_found" }
    `
    const result = await execPowerShell(script)
    if (result.includes('activated')) return { success: true, action: 'activated' }
    if (result.includes('minimized')) return { success: true, action: 'minimized' }
    return { success: false, error: '未找到匹配的标签窗口' }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

let webActivatorShortcuts = new Set<string>()

ipcMain.handle('web-activator-check-visibility', async (_event, configs: Array<{ type: 'app' | 'tab'; pattern: string; hwnd?: number }>) => {
  const results = await Promise.all(configs.map(async (config) => {
    const escapedPattern = config.pattern.replace(/"/g, '`"')
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
          [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
        }
"@
      $targetHwnd = [IntPtr]::Zero
      if ("${config.hwnd || 0}" -ne "0") {
          $h = [IntPtr]${config.hwnd || 0}
          if ([Win32]::IsWindow($h)) { $targetHwnd = $h }
      }
      if ($targetHwnd -eq [IntPtr]::Zero) {
          $proc = Get-Process | Where-Object { ($_.MainWindowTitle -match "${escapedPattern}" -or $_.ProcessName -match "${escapedPattern}") -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
          if ($proc) { $targetHwnd = $proc.MainWindowHandle }
      }

      if ($targetHwnd -ne [IntPtr]::Zero) {
          $fgHwnd = [Win32]::GetForegroundWindow()
          $fgRoot = [Win32]::GetAncestor($fgHwnd, 2)
          $targetRoot = [Win32]::GetAncestor($targetHwnd, 2)
          $isActive = ($fgHwnd -eq $targetHwnd -or $fgRoot -eq $targetRoot -or $fgRoot -eq $targetHwnd) -and -not [Win32]::IsIconic($targetHwnd)
          if ($isActive) { "active" } else { "inactive" }
      } else { "not_found" }
    `
    const result = await execPowerShell(script)
    return result.trim() === 'active'
  }))
  return results
})

ipcMain.handle('web-activator-toggle-window', async (_event, config: { type: 'app' | 'tab', pattern: string, id?: number }) => {
  if (config.type === 'app') return await toggleApp(config.pattern, config.id)
  return await toggleTab(config.pattern)
})

ipcMain.handle('web-activator-register-shortcuts', async (_event, configs: Array<{ id: string; type: 'app' | 'tab'; pattern: string; shortcut: string; hwnd?: number }>) => {
  try {
    console.log(`WebActivator: Registering ${configs.length} shortcuts...`)
    // 仅注销之前由 WebActivator 注册的快捷键
    webActivatorShortcuts.forEach(s => {
      try { 
        globalShortcut.unregister(s)
        console.log(`WebActivator: Unregistered ${s}`)
      } catch (e) { console.error(`WebActivator: Unregister error for ${s}:`, e) }
    })
    webActivatorShortcuts.clear()
    
    let successCount = 0
    for (const config of configs) {
      if (!config.shortcut || config.shortcut.endsWith('+') || config.shortcut === 'Alt') continue
      
      const normalizedShortcut = config.shortcut.replace('Ctrl', 'CommandOrControl')
      
      const success = globalShortcut.register(normalizedShortcut, async () => {
        console.log(`WebActivator: Shortcut triggered: ${normalizedShortcut} (ID: ${config.id})`)
        // 使用存储的 hwnd (句柄) 或 pattern
        const result = config.type === 'app' ? await toggleApp(config.pattern, config.hwnd) : await toggleTab(config.pattern)
        if (mainWindow) {
          mainWindow.webContents.send('web-activator-shortcut-triggered', {
            id: config.id,
            action: result.success ? result.action : 'not_found'
          })
        }
      })
      
      if (success) {
        webActivatorShortcuts.add(normalizedShortcut)
        successCount++
        console.log(`WebActivator: Registered ${normalizedShortcut}`)
      } else {
        console.warn(`WebActivator: Failed to register ${normalizedShortcut}. Already in use?`)
      }
    }
    return { success: true, registeredCount: successCount }
  } catch (error) {
    console.error('WebActivator: Registration error:', error)
    return { success: false, error: (error as Error).message }
  }
})

function createTray(): void {
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')
  
  let icon: nativeImage
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  } else {
    icon = nativeImage.createEmpty()
    const size = { width: 16, height: 16 }
    icon.addRepresentation({
      width: size.width,
      height: size.height,
      buffer: createTrayIconBuffer()
    })
  }
  
  tray = new Tray(icon)
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: '隐藏主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.hide()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出程序',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  
  tray.setToolTip('onetool')
  tray.setContextMenu(contextMenu)
  
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
  
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

function createFloatBallWindow(): void {
  if (floatBallWindow) {
    return
  }

  floatBallWindow = new BrowserWindow({
    width: 60,
    height: 60,
    x: 100,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  floatBallWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    floatBallWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/floatball`)
  } else {
    floatBallWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/floatball'
    })
  }

  floatBallWindow.on('closed', () => {
    floatBallWindow = null
  })
}

ipcMain.on('floatball-move', (_event, { x, y }) => {
  if (floatBallWindow) {
    floatBallWindow.setPosition(x, y)
  }
})

ipcMain.on('floatball-resize', (_event, { width, height }) => {
  if (floatBallWindow) {
    floatBallWindow.setSize(width, height)
  }
})

ipcMain.on('ondragstart', (event, filePath) => {
  const icon = nativeImage.createFromPath(filePath)
  event.sender.startDrag({
    file: filePath,
    icon: icon
  })
})

ipcMain.on('floatball-toggle-visibility', (_event, visible) => {
  if (visible) {
    if (!floatBallWindow) {
      createFloatBallWindow()
    } else {
      floatBallWindow.show()
    }
  } else {
    if (floatBallWindow) {
      floatBallWindow.hide()
    }
  }
})

function createTrayIconBuffer(): Buffer {
  const size = 16
  const pngData: number[] = []
  
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  pngData.push(...signature)
  
  function writeChunk(type: string, data: number[]): void {
    const length = data.length
    pngData.push((length >> 24) & 0xFF)
    pngData.push((length >> 16) & 0xFF)
    pngData.push((length >> 8) & 0xFF)
    pngData.push(length & 0xFF)
    
    for (let i = 0; i < type.length; i++) {
      pngData.push(type.charCodeAt(i))
    }
    pngData.push(...data)
    
    const crcData = [...type.split('').map(c => c.charCodeAt(0)), ...data]
    const crc = calculateCRC32(crcData)
    pngData.push((crc >> 24) & 0xFF)
    pngData.push((crc >> 16) & 0xFF)
    pngData.push((crc >> 8) & 0xFF)
    pngData.push(crc & 0xFF)
  }
  
  const ihdrData = [
    (size >> 24) & 0xFF, (size >> 16) & 0xFF, (size >> 8) & 0xFF, size & 0xFF,
    (size >> 24) & 0xFF, (size >> 16) & 0xFF, (size >> 8) & 0xFF, size & 0xFF,
    8, 6, 0, 0, 0
  ]
  writeChunk('IHDR', ihdrData)
  
  const rawData: number[] = []
  for (let y = 0; y < size; y++) {
    rawData.push(0)
    for (let x = 0; x < size; x++) {
      const cx = size / 2
      const cy = size / 2
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      const radius = size / 2 - 1
      
      if (dist <= radius) {
        const edgeDist = radius - dist
        const alpha = Math.min(255, Math.floor(edgeDist * 50 + 200))
        rawData.push(70, 130, 180, alpha)
      } else {
        rawData.push(0, 0, 0, 0)
      }
    }
  }
  
  const zlib = require('zlib')
  const compressed = zlib.deflateSync(Buffer.from(rawData))
  writeChunk('IDAT', Array.from(compressed))
  
  writeChunk('IEND', [])
  
  return Buffer.from(pngData)
}

function calculateCRC32(data: number[]): number {
  let crc = 0xFFFFFFFF
  const table: number[] = []
  
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table.push(c)
  }
  
  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function createWindow(): void {
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')
  
  let windowIcon: nativeImage | undefined
  if (fs.existsSync(iconPath)) {
    windowIcon = nativeImage.createFromPath(iconPath)
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    center: true,
    resizable: true,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    // 移除隐藏逻辑，改为直接退出以方便调试
    app.quit()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let isRecording = false
let recordingCommand: any = null

ipcMain.handle('screen-recorder-select-output', async () => {
  try {
    const mainWindow = BrowserWindow.getFocusedWindow()
    if (!mainWindow) {
      return { success: false, error: '无法获取主窗口' }
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '选择保存位置',
      filters: [
        { name: 'MP4 视频', extensions: ['mp4'] },
        { name: 'GIF 动画', extensions: ['gif'] },
        { name: 'WebM 视频', extensions: ['webm'] }
      ],
      defaultPath: path.join(app.getPath('desktop'), `recording-${Date.now()}.mp4`)
    })

    return {
      success: true,
      canceled,
      filePath: !canceled ? filePath : null
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('screen-recorder-start', async (_event, { outputPath, format, fps = 30, quality = 'medium' }: { outputPath: string; format: string; fps?: number; quality?: string }) => {
  try {
    if (isRecording) {
      return { success: false, error: '录制已在进行中' }
    }

    const ffmpegPath = getFfmpegPath()
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      return { success: false, error: 'FFmpeg 未正确安装或路径无效' }
    }
    
    console.log('Using FFmpeg path:', ffmpegPath)

    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      return { success: false, error: '输出目录不存在' }
    }

    try {
      fs.accessSync(outputDir, fs.constants.W_OK)
    } catch {
      return { success: false, error: '没有写入权限，请选择其他目录' }
    }

    isRecording = true

    let command = ffmpeg()
      .input('desktop')
      .inputFormat('gdigrab')
      .inputOptions([
        `-framerate ${fps}`,
        '-draw_mouse 1'
      ])

    if (format === 'mp4') {
      const crf = quality === 'high' ? 23 : quality === 'medium' ? 28 : 32
      command = command
        .outputOptions([
          '-vcodec libx264',
          `-crf ${crf}`,
          '-pix_fmt yuv420p',
          '-preset ultrafast'
        ])
        .format('mp4')
    } else if (format === 'gif') {
      command = command
        .outputOptions([
          '-vf',
          'fps=10,scale=iw:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'
        ])
        .format('gif')
    } else if (format === 'webm') {
      const crf = quality === 'high' ? 30 : quality === 'medium' ? 35 : 40
      command = command
        .outputOptions([
          '-vcodec libvpx',
          `-crf ${crf}`,
          '-b:v 0',
          '-cpu-used 4'
        ])
        .format('webm')
    }

    command = command.save(outputPath)
    recordingCommand = command

    command.on('start', (commandLine) => {
      console.log('FFmpeg 命令:', commandLine)
      if (mainWindow) {
        mainWindow.webContents.send('screen-recorder-started')
      }
    })

    command.on('progress', (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('screen-recorder-progress', {
          timemark: progress.timemark
        })
      }
    })

    command.on('end', () => {
      isRecording = false
      recordingCommand = null
      if (mainWindow) {
        mainWindow.webContents.send('screen-recorder-stopped', { success: true, outputPath })
      }
    })

    command.on('error', (err) => {
      console.error('FFmpeg 错误:', err)
      isRecording = false
      recordingCommand = null
      let errorMessage = err.message
      if (err.message.includes('Permission denied') || err.message.includes('Access is denied')) {
        errorMessage = '没有写入权限，请尝试选择其他目录或以管理员身份运行程序'
      } else if (err.message.includes('No such file or directory')) {
        errorMessage = '文件路径无效，请重新选择保存位置'
      } else if (err.message.includes('gdigrab') || err.message.includes('desktop')) {
        errorMessage = '无法访问屏幕，请检查是否有其他程序占用屏幕'
      }
      if (mainWindow) {
        mainWindow.webContents.send('screen-recorder-stopped', { success: false, error: errorMessage })
      }
    })

    return { success: true }
  } catch (error) {
    isRecording = false
    recordingCommand = null
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('screen-recorder-stop', async () => {
  try {
    if (!isRecording) {
      return { success: false, error: '没有正在进行的录制' }
    }

    if (recordingCommand && recordingCommand.ffmpegProc) {
      recordingCommand.ffmpegProc.kill('SIGINT')
    }
    isRecording = false
    recordingCommand = null

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('screen-recorder-status', async () => {
  return {
    recording: isRecording
  }
})

let colorPickerTimer: NodeJS.Timeout | null = null
let colorPickerActive = false
let isColorPicking = false
let lastColorPickerX = -1
let lastColorPickerY = -1
let lastColorR = -1
let lastColorG = -1
let lastColorB = -1

const getMouseAndColor = async (): Promise<{ x: number; y: number; r: number; g: number; b: number } | null> => {
  const script = `
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
$pos = [System.Windows.Forms.Control]::MousePosition
$bmp = New-Object System.Drawing.Bitmap(1, 1)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($pos, [System.Drawing.Point]::Empty, [System.Drawing.Size]::new(1, 1))
$pixel = $bmp.GetPixel(0, 0)
$g.Dispose()
$bmp.Dispose()
Write-Output "$($pos.X),$($pos.Y),$($pixel.R),$($pixel.G),$($pixel.B)"
`
  try {
    const result = await execPowerShell(script)
    const lines = result.trim().split(/\r?\n/)
    const lastLine = lines[lines.length - 1]
    const parts = lastLine.split(',')
    if (parts.length >= 5) {
      return {
        x: parseInt(parts[0]),
        y: parseInt(parts[1]),
        r: parseInt(parts[2]),
        g: parseInt(parts[3]),
        b: parseInt(parts[4])
      }
    }
  } catch (e) {
    console.error('getMouseAndColor error:', e)
  }
  return null
}

const runColorPickerLoop = async () => {
  if (!colorPickerActive || !mainWindow) {
    isColorPicking = false
    return
  }

  isColorPicking = true
  try {
    const data = await getMouseAndColor()
    if (data && colorPickerActive && mainWindow) {
      // 验证数据有效性
      const isValid = !isNaN(data.x) && !isNaN(data.y) && 
                    !isNaN(data.r) && !isNaN(data.g) && !isNaN(data.b)
      
      if (isValid) {
        // 确保颜色值在合理范围内
        const r = Math.max(0, Math.min(255, data.r))
        const g = Math.max(0, Math.min(255, data.g))
        const b = Math.max(0, Math.min(255, data.b))

        const hasMoved = data.x !== lastColorPickerX || data.y !== lastColorPickerY
        const hasColorChanged = r !== lastColorR || g !== lastColorG || b !== lastColorB

        if (hasMoved || hasColorChanged) {
          lastColorPickerX = data.x
          lastColorPickerY = data.y
          lastColorR = r
          lastColorG = g
          lastColorB = b
          
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
          const rgb = `RGB(${r}, ${g}, ${b})`
          
          mainWindow.webContents.send('color-picker:update', {
            hex,
            r,
            g,
            b,
            rgb,
            x: data.x,
            y: data.y
          })
        }
      }
    }
  } catch (error) {
    console.error('Color picker loop error:', error)
  }

  if (colorPickerActive) {
    colorPickerTimer = setTimeout(runColorPickerLoop, 100)
  } else {
    isColorPicking = false
  }
}

const startColorPicker = () => {
  if (colorPickerActive) return
  
  colorPickerActive = true
  runColorPickerLoop()
}

const stopColorPicker = () => {
  colorPickerActive = false
  if (colorPickerTimer) {
    clearTimeout(colorPickerTimer)
    colorPickerTimer = null
  }
}

let colorPickerWindow: BrowserWindow | null = null

function createColorPickerWindow(): void {
  if (colorPickerWindow) {
    return
  }

  const { screen } = require('electron')
  const cursorPoint = screen.getCursorScreenPoint()
  const displays = screen.getAllDisplays()
  const targetDisplay = displays.find(d =>
    cursorPoint.x >= d.bounds.x &&
    cursorPoint.x < d.bounds.x + d.bounds.width &&
    cursorPoint.y >= d.bounds.y &&
    cursorPoint.y < d.bounds.y + d.bounds.height
  ) || screen.getPrimaryDisplay()

  const { x, y, width, height } = targetDisplay.bounds

  colorPickerWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    cursor: 'none', // 隐藏系统光标，我们自己画放大镜
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  colorPickerWindow.setIgnoreMouseEvents(false)
  colorPickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    colorPickerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/color-picker-overlay`)
  } else {
    colorPickerWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/color-picker-overlay'
    })
  }

  colorPickerWindow.on('closed', () => {
    colorPickerWindow = null
  })
}

ipcMain.handle('color-picker:enable', async () => {
  startColorPicker()
  return { success: true }
})

ipcMain.handle('color-picker:disable', async () => {
  stopColorPicker()
  return { success: true }
})

let colorPickerWindows: BrowserWindow[] = []

async function captureAllScreens(): Promise<Map<number, string>> {
  const { desktopCapturer, screen } = require('electron')
  const displays = screen.getAllDisplays()
  const screenshotMap = new Map<number, string>()

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: 1,
        height: 1
      }
    })

    for (const display of displays) {
      const source = sources.find(s => s.display_id === display.id.toString()) || 
                     sources[displays.indexOf(display)]

      if (source) {
        const qualitySources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.round(display.bounds.width * display.scaleFactor),
            height: Math.round(display.bounds.height * display.scaleFactor)
          }
        })
        const match = qualitySources.find(s => s.id === source.id)
        if (match) {
          screenshotMap.set(display.id, match.thumbnail.toDataURL())
        }
      }
    }
  } catch (error) {
    console.error('Capture all screens error:', error)
  }
  return screenshotMap
}

ipcMain.handle('color-picker:pick', async () => {
  const { screen } = require('electron')
  const displays = screen.getAllDisplays()
  
  const screenshotMap = await captureAllScreens()

  colorPickerWindows = displays.map(display => {
    const { x, y, width, height } = display.bounds
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/color-picker-overlay`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/color-picker-overlay'
      })
    }

    win.webContents.once('did-finish-load', () => {
      const dataUrl = screenshotMap.get(display.id)
      if (dataUrl) {
        win.webContents.send('color-picker:screenshot', dataUrl)
      }
    })

    return win
  })

  setTimeout(() => {
    colorPickerWindows.forEach(win => win.show())
    if (mainWindow) mainWindow.hide()
  }, 100)

  return new Promise((resolve) => {
    const onPicked = (_event, data) => {
      cleanup()
      resolve({ success: true, color: data })
    }
    const onCancelled = () => {
      cleanup()
      resolve({ success: false, error: 'Cancelled' })
    }
    
    const cleanup = () => {
      ipcMain.removeListener('color-picker:confirm-pick', onPicked)
      ipcMain.removeListener('color-picker:cancel-pick', onCancelled)
      colorPickerWindows.forEach(win => {
        if (!win.isDestroyed()) win.close()
      })
      colorPickerWindows = []
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    }

    ipcMain.once('color-picker:confirm-pick', onPicked)
    ipcMain.once('color-picker:cancel-pick', onCancelled)
  })
})

ipcMain.on('color-picker:confirm-pick', (_event, data) => {
  if (colorPickerWindows.length > 0) {
    // 这个事件会被上面的 once 监听到
  }
  stopColorPicker()
  if (mainWindow) {
    mainWindow.webContents.send('color-picker:selected', data)
  }
})

ipcMain.on('color-picker:cancel-pick', () => {
  stopColorPicker()
})

ipcMain.handle('network:ping', async (_event, host: string) => {
  return new Promise((resolve) => {
    const target = host.replace(/^https?:\/\//, '').split('/')[0]
    // 强制使用 chcp 65001 确保输出为 UTF-8，解决中文匹配问题
    const cmd = `chcp 65001 && ping -n 1 -w 2000 ${target}`
    
    exec(cmd, (error, stdout) => {
      if (error) {
        resolve({ success: false, latency: null })
        return
      }

      // 更加宽松的正则，匹配任何数字后紧跟 ms 的情况
      const match = stdout.match(/[=<](\d+)ms/)
      if (match && match[1]) {
        resolve({ success: true, latency: parseInt(match[1]) })
      } else {
        resolve({ success: false, latency: null })
      }
    })
  })
})

ipcMain.handle('network:get-info', async () => {
  try {
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $results = @()
      $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
      foreach ($adapter in $adapters) {
          $ipInfo = Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
          if ($ipInfo) {
              $ip = if ($ipInfo.IPAddress -is [array]) { $ipInfo.IPAddress[0] } else { $ipInfo.IPAddress }
              $results += @{
                  name = $adapter.Name
                  description = $adapter.InterfaceDescription
                  ip = $ip
                  speed = $adapter.LinkSpeed
                  type = if ($adapter.MediaType -match 'Native 802.11|Wi-Fi|Wireless') { 'Wi-Fi' } else { '以太网' }
              }
          }
      }
      if ($results.Count -gt 0) {
          $results | ConvertTo-Json -Compress
      } else {
          "[]"
      }
    `
    const psResult = await execPowerShell(script)
    let data: any[] = []
    
    try {
      const startIdx = Math.min(
        psResult.indexOf('[') !== -1 ? psResult.indexOf('[') : Infinity,
        psResult.indexOf('{') !== -1 ? psResult.indexOf('{') : Infinity
      );
      const endIdx = Math.max(psResult.lastIndexOf(']'), psResult.lastIndexOf('}'));
      
      if (startIdx !== Infinity && endIdx !== -1) {
        const cleanJson = psResult.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(cleanJson);
        data = Array.isArray(parsed) ? parsed : [parsed];
      }
    } catch (e) {
      console.error('Failed to parse PS JSON:', e);
    }

    if (data.length === 0) {
      const os = require('os')
      const interfaces = os.networkInterfaces()
      for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name]
        if (!ifaces) continue
        for (const iface of ifaces) {
          if (iface.family === 'IPv4' && !iface.internal) {
            data.push({
              name: name,
              description: name,
              type: (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wlan')) ? 'Wi-Fi' : '以太网',
              speed: '未知',
              ip: iface.address
            })
          }
        }
      }
    }

    return { success: true, info: data }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('network:scan-lan', async (_event, targetSubnet: string) => {
  console.log('--- Network LAN Scan Started for Subnet:', targetSubnet, '---')
  try {
    if (!targetSubnet) {
      return { success: false, error: '未提供网段信息' }
    }

    const wakeCmd = `ping -n 1 -w 500 ${targetSubnet}.255 > nul 2>&1 & ping -n 1 -w 500 ${targetSubnet}.1 > nul 2>&1`
    await execCommand(wakeCmd).catch(() => {})

    const arpOutput = await execCommand('arp -a')
    const lines = arpOutput.split(/\r?\n/)
    const rawDevices: Array<{ ip: string; mac: string }> = []
    
    for (const line of lines) {
      const cleanLine = line.trim()
      if (!cleanLine) continue
      const match = cleanLine.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})/i)
      if (match) {
        const ip = match[1]
        const mac = match[2]
        if (!ip.startsWith('224.') && !ip.startsWith('239.') && !ip.endsWith('.255') && ip.startsWith(targetSubnet + '.')) {
          rawDevices.push({ ip, mac })
        }
      }
    }
    
    const uniqueMap = new Map()
    for (const item of rawDevices) {
      uniqueMap.set(item.ip, item)
    }
    const uniqueList = Array.from(uniqueMap.values())

    const macVendors: Record<string, string> = {
      'A4-A9-30': '小米 (Xiaomi)', 'EC-4D-3E': '小米 (Xiaomi)', 'C8-5C-CC': '小米 (Xiaomi)', '64-9E-31': '小米 (Xiaomi)',
      '08-3A-F2': '普联 (TP-Link)', '54-48-E6': '普联 (TP-Link)', 'A4-39-B3': '普联 (TP-Link)',
      'F4-F2-6D': 'Apple', 'BC-D1-1F': 'Apple', 'AC-29-3A': 'Apple', 'D8-BB-2C': 'Apple', '60-FB-42': 'Apple',
      'E4-E4-AB': 'Huawei', '28-D2-44': 'Huawei', '80-05-DF': 'Intel', '48-51-B7': 'Intel',
      'B4-2E-99': 'Samsung', 'FC-DB-B3': 'Samsung', '00-0C-29': 'VMware', '08-00-27': 'VirtualBox'
    }

    const devices = await Promise.all(uniqueList.map(async (dev: any) => {
      let name = ''
      
      // 1. 如果是网关 IP，直接尝试标记
      if (dev.ip.endsWith('.1')) {
        name = '路由器 (网关)'
      }

      // 2. 尝试执行带超时的指令获取 Hostname
      if (!name) {
        try {
          // 使用 powershell 的 Test-Connection 替代 ping -a 获得更稳健的结果，且自带超时控制
          const hostRes = await execPowerShell(`$ErrorActionPreference='SilentlyContinue'; [System.Net.Dns]::GetHostEntry('${dev.ip}').HostName`)
          if (hostRes && hostRes.trim() !== dev.ip) {
            name = hostRes.trim().split('.')[0]
          }
        } catch (e) {}
      }

      // 3. 查厂商库
      if (!name) {
        const macPrefix = dev.mac.substring(0, 8).toUpperCase()
        name = macVendors[macPrefix] || ''
      }

      // 4. 判断是否为“私有/随机 MAC”
      if (!name) {
        const firstByte = parseInt(dev.mac.substring(0, 2), 16)
        if ((firstByte & 0x02) === 2) {
          name = '移动设备 (私有MAC)'
        }
      }
      
      return { 
        ip: dev.ip, 
        mac: dev.mac, 
        name: name || '未知设备',
        type: '局域网设备'
      }
    }))
    
    return { success: true, devices }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('screen-overlay-start', async () => {
  try {
    if (screenOverlayWindow) {
      screenOverlayWindow.close()
      screenOverlayWindow = null
    }

    const { screen } = require('electron')
    const cursorPoint = screen.getCursorScreenPoint()
    const displays = screen.getAllDisplays()
    const targetDisplay = displays.find(d =>
      cursorPoint.x >= d.bounds.x &&
      cursorPoint.x < d.bounds.x + d.bounds.width &&
      cursorPoint.y >= d.bounds.y &&
      cursorPoint.y < d.bounds.y + d.bounds.height
    ) || screen.getPrimaryDisplay()

    const { x, y, width, height } = targetDisplay.bounds

    screenOverlayWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    screenOverlayWindow.setIgnoreMouseEvents(false)
    screenOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const screenDataUrl = await captureScreen()

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const url = new URL(`${process.env['ELECTRON_RENDERER_URL']}#/screen-overlay`)
      if (screenDataUrl) {
        url.searchParams.set('screen', encodeURIComponent(screenDataUrl))
      }
      screenOverlayWindow.loadURL(url.toString())
    } else {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Screen Overlay</title>
        </head>
        <body>
          <div id="root"></div>
          <script>
            window.screenOverlayData = {
              screenDataUrl: ${JSON.stringify(screenDataUrl)}
            }
          </script>
          <script src="../renderer/assets/index-*.js"></script>
        </body>
        </html>
      `
      screenOverlayWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/screen-overlay',
        search: screenDataUrl ? `?screen=${encodeURIComponent(screenDataUrl)}` : ''
      })
    }

    screenOverlayWindow.on('closed', () => {
      screenOverlayWindow = null
    })

    return { success: true, screenDataUrl }
  } catch (error) {
    console.error('Start screen overlay error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('screen-overlay-close', async () => {
  try {
    if (screenOverlayWindow) {
      screenOverlayWindow.close()
      screenOverlayWindow = null
    }
    return { success: true }
  } catch (error) {
    console.error('Close screen overlay error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('window-minimize', async () => {
  if (mainWindow) {
    mainWindow.minimize()
    return { success: true }
  }
  return { success: false }
})

ipcMain.handle('window-maximize', async () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return { success: true, maximized: false }
    } else {
      mainWindow.maximize()
      return { success: true, maximized: true }
    }
  }
  return { success: false }
})

ipcMain.handle('window-close', async () => {
  if (mainWindow) {
    mainWindow.close()
    return { success: true }
  }
  return { success: false }
})

ipcMain.handle('window-is-maximized', async () => {
  if (mainWindow) {
    return { maximized: mainWindow.isMaximized() }
  }
  return { maximized: false }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.onetool')
  
  initFfmpeg()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAutoClickerShortcuts()

  // 延迟一秒再次尝试注册，防止启动冲突
  setTimeout(() => {
    if (!globalShortcut.isRegistered(autoClickerConfig.shortcut || 'F6')) {
      registerAutoClickerShortcuts()
    }
  }, 1000)

  globalShortcut.register('Alt+Shift+T', async () => {
    console.log('Global shortcut Alt+Shift+T pressed')
    try {
      if (screenOverlayWindow) {
        screenOverlayWindow.close()
        screenOverlayWindow = null
      }

      const { screen } = require('electron')
      const cursorPoint = screen.getCursorScreenPoint()
      const displays = screen.getAllDisplays()
      const targetDisplay = displays.find(d =>
        cursorPoint.x >= d.bounds.x &&
        cursorPoint.x < d.bounds.x + d.bounds.width &&
        cursorPoint.y >= d.bounds.y &&
        cursorPoint.y < d.bounds.y + d.bounds.height
      ) || screen.getPrimaryDisplay()

      const { x, y, width, height } = targetDisplay.bounds

      screenOverlayWindow = new BrowserWindow({
        x,
        y,
        width,
        height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false
        }
      })

      screenOverlayWindow.setIgnoreMouseEvents(false)
      screenOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

      const screenDataUrl = await captureScreen()

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const url = new URL(`${process.env['ELECTRON_RENDERER_URL']}#/screen-overlay`)
        if (screenDataUrl) {
          url.searchParams.set('screen', encodeURIComponent(screenDataUrl))
        }
        screenOverlayWindow.loadURL(url.toString())
      } else {
        screenOverlayWindow.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: '/screen-overlay',
          search: screenDataUrl ? `?screen=${encodeURIComponent(screenDataUrl)}` : ''
        })
      }

      screenOverlayWindow.on('closed', () => {
        screenOverlayWindow = null
      })
    } catch (error) {
      console.error('Start screen overlay via shortcut error:', error)
    }
  })

  createWindow()
  // createTray() // 暂时禁用托盘功能以便调试
  createFloatBallWindow()
  loadClipboardHistory()
  startClipboardWatcher()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  isQuitting = true
  if (serverProcess) {
    serverProcess.kill()
  }
  if (clientProcess) {
    clientProcess.kill()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
