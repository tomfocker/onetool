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
let autoClickerControlFile: string | null = null

ipcMain.handle('autoclicker-start', async (_event, config: { interval: number; button: string }) => {
  try {
    if (autoClickerProcess) {
      autoClickerProcess.kill()
      autoClickerProcess = null
    }
    
    if (autoClickerControlFile && fs.existsSync(autoClickerControlFile)) {
      fs.unlinkSync(autoClickerControlFile)
    }
    
    autoClickerControlFile = path.join(app.getPath('temp'), `clicker-control-${Date.now()}.txt`)
    fs.writeFileSync(autoClickerControlFile, 'RUN')
    
    const downFlag = config.button === 'right' ? 8 : config.button === 'middle' ? 32 : 2
    const upFlag = config.button === 'right' ? 16 : config.button === 'middle' ? 64 : 4
    
    const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class MouseClick {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'@

try {
  Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
} catch {}

$controlFile = "${autoClickerControlFile.replace(/\\/g, '\\\\')}"
$downFlag = ${downFlag}
$upFlag = ${upFlag}
$interval = ${config.interval}

while (Test-Path $controlFile) {
  $content = Get-Content $controlFile -ErrorAction SilentlyContinue
  if ($content -eq "STOP") { break }
  
  [MouseClick]::mouse_event($downFlag, 0, 0, 0, 0)
  [MouseClick]::mouse_event($upFlag, 0, 0, 0, 0)
  
  Start-Sleep -Milliseconds $interval
}

if (Test-Path $controlFile) {
  Remove-Item $controlFile -Force
}
`
    
    autoClickerProcess = spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    
    autoClickerProcess.unref()
    
    console.log('Auto clicker started:', config)
    return { success: true }
  } catch (error) {
    console.error('Auto clicker start error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('autoclicker-stop', async () => {
  try {
    if (autoClickerControlFile && fs.existsSync(autoClickerControlFile)) {
      fs.writeFileSync(autoClickerControlFile, 'STOP')
    }
    
    if (autoClickerProcess) {
      autoClickerProcess.kill()
      autoClickerProcess = null
    }
    
    console.log('Auto clicker stopped')
    return { success: true }
  } catch (error) {
    console.error('Auto clicker stop error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('autoclicker-status', async () => {
  const running = autoClickerProcess !== null || 
    (autoClickerControlFile !== null && fs.existsSync(autoClickerControlFile) && 
     fs.readFileSync(autoClickerControlFile, 'utf-8').trim() === 'RUN')
  return {
    running,
    config: { interval: 100, button: 'left' }
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
    const escapedScript = script.replace(/"/g, '\\"')
    const fullCmd = `powershell -NoProfile -Command "${escapedScript}"`
    exec(fullCmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('PowerShell error:', script, error.message)
        resolve('')
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

ipcMain.handle('get-system-config', async () => {
  try {
    const cpuName = await execPowerShell('(Get-CimInstance Win32_Processor).Name')
    const cpuCores = await execPowerShell('(Get-CimInstance Win32_Processor).NumberOfCores')
    const cpuThreads = await execPowerShell('(Get-CimInstance Win32_Processor).NumberOfLogicalProcessors')
    
    const boardManufacturer = await execPowerShell('(Get-CimInstance Win32_BaseBoard).Manufacturer')
    const boardProduct = await execPowerShell('(Get-CimInstance Win32_BaseBoard).Product')
    const motherboard = (boardManufacturer && boardProduct) 
      ? `${boardManufacturer} ${boardProduct}`.trim() 
      : '未知'

    const memoryCapacity = await execPowerShell('(Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum')
    const memorySpeed = await execPowerShell('(Get-CimInstance Win32_PhysicalMemory)[0].Speed')
    const memoryModules = await execPowerShell('(Get-CimInstance Win32_PhysicalMemory).Count')
    const memoryManufacturer = await execPowerShell("(Get-CimInstance Win32_PhysicalMemory)[0].Manufacturer")
    const memoryPartNumber = await execPowerShell("(Get-CimInstance Win32_PhysicalMemory)[0].PartNumber")
    
    let memoryInfo = '未知'
    if (memoryCapacity) {
      const totalGB = Math.round(parseInt(memoryCapacity) / (1024 * 1024 * 1024))
      const speed = memorySpeed || '未知'
      const manufacturer = memoryManufacturer ? memoryManufacturer.trim() : ''
      const partNumber = memoryPartNumber ? memoryPartNumber.trim() : ''
      const brand = manufacturer || partNumber || ''
      memoryInfo = `${totalGB}GB ${speed}MHz (${memoryModules || 1}条)${brand ? ' ' + brand : ''}`
    }

    const gpuNames = await execPowerShell("(Get-CimInstance Win32_VideoController).Name -join ' / '")
    const gpu = gpuNames || '未知'

    let monitor = '未知'
    try {
      const { screen } = require('electron')
      const displays = screen.getAllDisplays()
      console.log('Electron displays:', displays?.length, displays)
      if (displays && displays.length > 0) {
        monitor = displays.map(d => {
          const width = d.bounds.width
          const height = d.bounds.height
          const scale = d.scaleFactor
          const rotation = d.rotation
          const rotText = rotation === 90 ? ' ↻' : rotation === 270 ? ' ↺' : rotation === 180 ? ' ↷' : ''
          return `${width}x${height}${rotText} (${scale}x缩放)`
        }).join(' / ')
      }
    } catch (e) {
      console.error('Electron screen API error:', e)
    }
    
    if (monitor === '未知') {
      try {
        const monitorData = await execCommand('wmic desktopmonitor get Name,ScreenWidth,ScreenHeight /format:list')
        if (monitorData) {
          const lines = monitorData.split('\n').filter((l: string) => l.trim())
          const monitors: string[] = []
          let currentName = ''
          let currentWidth = ''
          let currentHeight = ''
          for (const line of lines) {
            if (line.startsWith('Name=')) currentName = line.substring(5).trim()
            else if (line.startsWith('ScreenWidth=')) currentWidth = line.substring(12).trim()
            else if (line.startsWith('ScreenHeight=')) {
              currentHeight = line.substring(13).trim()
              if (currentWidth && currentHeight) {
                monitors.push(`${currentWidth}x${currentHeight}`)
              }
              currentName = ''
              currentWidth = ''
              currentHeight = ''
            }
          }
          if (monitors.length > 0) monitor = monitors.join(' / ')
        }
      } catch (e) {
        console.error('WMIC monitor error:', e)
      }
    }
    
    if (monitor === '未知') {
      try {
        const monitorData = await execPowerShell(`
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
            "$($_.Bounds.Width)x$($_.Bounds.Height)"
          } | Join-String -Separator ' / '
        `)
        if (monitorData) monitor = monitorData
      } catch (e) {
        console.error('WinForms monitor error:', e)
      }
    }

    let disk = '未知'
    try {
      const diskData = await execCommand('wmic diskdrive get Model,Size,MediaType,InterfaceType /format:list')
      if (diskData) {
        const lines = diskData.split('\n').filter((l: string) => l.trim())
        const disks: string[] = []
        let currentModel = ''
        let currentSize = ''
        let currentType = ''
        let currentInterface = ''
        for (const line of lines) {
          if (line.startsWith('Model=')) currentModel = line.substring(6).trim()
          else if (line.startsWith('Size=')) currentSize = line.substring(5).trim()
          else if (line.startsWith('MediaType=')) currentType = line.substring(10).trim()
          else if (line.startsWith('InterfaceType=')) {
            currentInterface = line.substring(14).trim()
            if (currentModel && currentSize) {
              const sizeGB = Math.round(parseInt(currentSize) / (1024 * 1024 * 1024))
              const typeInfo = currentType || 'Unknown'
              const interfaceInfo = currentInterface || ''
              disks.push(`${currentModel} (${sizeGB}GB ${typeInfo} ${interfaceInfo})`.trim())
            }
            currentModel = ''
            currentSize = ''
            currentType = ''
            currentInterface = ''
          }
        }
        if (disks.length > 0) disk = disks.join(' / ')
      }
    } catch (e) {
      console.error('WMIC disk error:', e)
    }
    
    if (disk === '未知') {
      try {
        const diskData = await execPowerShell(`
          Get-PhysicalDisk | ForEach-Object { 
            $diskName = $_.FriendlyName
            $diskSize = [math]::Round($_.Size/1GB)
            $diskType = $_.MediaType
            $diskBus = $_.BusType
            "$diskName (" + $diskSize + "GB " + $diskType + " " + $diskBus + ")"
          } | Join-String -Separator ' / '
        `)
        if (diskData) disk = diskData
      } catch (e) {
        console.error('PowerShell disk error:', e)
      }
    }
    
    if (disk === '未知') {
      try {
        const diskData = await execCommand('wmic logicaldisk get Size,FreeSpace,Caption,VolumeName /format:list')
        if (diskData) {
          const lines = diskData.split('\n').filter((l: string) => l.trim())
          const disks: string[] = []
          let currentCaption = ''
          let currentSize = ''
          let currentFree = ''
          let currentName = ''
          for (const line of lines) {
            if (line.startsWith('Caption=')) currentCaption = line.substring(8).trim()
            else if (line.startsWith('Size=')) currentSize = line.substring(5).trim()
            else if (line.startsWith('FreeSpace=')) currentFree = line.substring(10).trim()
            else if (line.startsWith('VolumeName=')) {
              currentName = line.substring(11).trim()
              if (currentCaption && currentSize) {
                const sizeGB = Math.round(parseInt(currentSize) / (1024 * 1024 * 1024))
                const freeGB = currentFree ? Math.round(parseInt(currentFree) / (1024 * 1024 * 1024)) : 0
                disks.push(`${currentCaption} ${currentName} (${sizeGB}GB, ${freeGB}GB可用)`)
              }
              currentCaption = ''
              currentSize = ''
              currentFree = ''
              currentName = ''
            }
          }
          if (disks.length > 0) disk = disks.join(' / ')
        }
      } catch (e) {
        console.error('Logical disk error:', e)
      }
    }

    const audioInfo = await execPowerShell("(Get-CimInstance Win32_SoundDevice).Name -join ' / '")
    const audio = audioInfo || '未知'

    const networkInfo = await execPowerShell("(Get-CimInstance Win32_NetworkAdapter | Where-Object { $_.NetEnabled -eq $true }).Name -join ' / '")
    const network = networkInfo || '未知'

    const osCaption = await execPowerShell("(Get-CimInstance Win32_OperatingSystem).Caption")

    return {
      success: true,
      config: {
        cpu: `${cpuName || '未知'} (${cpuCores || '?'}核${cpuThreads || '?'}线程)`,
        motherboard: motherboard,
        memory: memoryInfo,
        gpu: gpu,
        monitor: monitor,
        disk: disk,
        audio: audio,
        network: network,
        os: osCaption || '未知'
      }
    }
  } catch (error) {
    console.error('Get system config error:', error)
    return {
      success: false,
      error: (error as Error).message,
      config: null
    }
  }
})

interface WindowInfo {
  id: number
  title: string
  processName: string
}

ipcMain.handle('web-activator-get-window-list', async () => {
  try {
    const script = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  }
"@

$windows = @()
[Win32]::EnumWindows({
  param($hwnd, $lParam)
  if ([Win32]::IsWindowVisible($hwnd)) {
    $length = [Win32]::GetWindowTextLength($hwnd)
    if ($length -gt 0) {
      $sb = New-Object System.Text.StringBuilder ($length + 1)
      [Win32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
      $title = $sb.ToString()
      if ($title -and $title -ne 'Program Manager' -and $title -ne 'Microsoft Text Input Application') {
        $pid = 0
        [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
        try {
          $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
          if ($process) {
            $windows += [PSCustomObject]@{
              id = $hwnd.ToInt64()
              title = $title
              processName = $process.ProcessName
            }
          }
        } catch {}
      }
    }
  }
  return $true
}, [IntPtr]::Zero)

$windows | ConvertTo-Json -Depth 2
`
    const result = await execPowerShell(script)
    let windows: WindowInfo[] = []
    if (result) {
      try {
        windows = JSON.parse(result)
        if (!Array.isArray(windows)) {
          windows = [windows]
        }
      } catch (e) {
        console.error('Failed to parse window list:', e)
      }
    }
    return { success: true, windows }
  } catch (error) {
    console.error('Get window list error:', error)
    return { success: false, windows: [], error: (error as Error).message }
  }
})

async function toggleWindowByTitle(
  titlePattern: string, 
  browserType: string = 'any'
): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    const browserProcessMap: Record<string, string[]> = {
      chrome: ['chrome', 'google chrome'],
      edge: ['msedge', 'microsoft edge'],
      firefox: ['firefox', 'mozilla firefox'],
      brave: ['brave'],
      opera: ['opera', 'operagx'],
      vivaldi: ['vivaldi'],
      ie: ['iexplore', 'internet explorer'],
      any: ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'iexplore', 'application', 'browser']
    }
    
    const targetProcesses = browserProcessMap[browserType] || browserProcessMap['any']
    const processFilter = targetProcesses.map(p => `$processName -like '*${p}*'`).join(' -or ')
    
    const findWindowScript = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  }
"@

$pattern = "${titlePattern}"
$foundHwnd = $null
$foundTitle = $null

[Win32]::EnumWindows({
  param($hwnd, $lParam)
  if ([Win32]::IsWindowVisible($hwnd)) {
    $length = [Win32]::GetWindowTextLength($hwnd)
    if ($length -gt 0) {
      $sb = New-Object System.Text.StringBuilder ($length + 1)
      [Win32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
      $title = $sb.ToString()
      
      if ($title -and $title -like "*$pattern*") {
        $winPid = 0
        [Win32]::GetWindowThreadProcessId($hwnd, [ref]$winPid) | Out-Null
        try {
          $process = Get-Process -Id $winPid -ErrorAction SilentlyContinue
          if ($process) {
            $processName = $process.ProcessName.ToLower()
            $processFilterResult = ${processFilter}
            if ($processFilterResult) {
              $foundHwnd = $hwnd
              $foundTitle = $title
              return $false
            }
          }
        } catch {}
      }
    }
  }
  return $true
}, [IntPtr]::Zero)

if ($foundHwnd) {
  $isMinimized = [Win32]::IsIconic($foundHwnd)
  $foregroundHwnd = [Win32]::GetForegroundWindow()
  
  if ($isMinimized -or $foregroundHwnd -ne $foundHwnd) {
    [Win32]::ShowWindow($foundHwnd, 9)
    [Win32]::SetForegroundWindow($foundHwnd)
    Write-Output "activated"
  } else {
    [Win32]::ShowWindow($foundHwnd, 6)
    Write-Output "minimized"
  }
} else {
  Write-Output "not_found"
}
`
    const result = await execPowerShell(findWindowScript)
    const action = result.trim()
    
    if (action === 'not_found') {
      return { success: false, error: '未找到匹配的窗口' }
    }
    
    return { success: true, action }
  } catch (error) {
    console.error('Toggle window error:', error)
    return { success: false, error: (error as Error).message }
  }
}

ipcMain.handle('web-activator-toggle-window', async (_event, { titlePattern, browserType }: { titlePattern: string; browserType?: string }) => {
  return await toggleWindowByTitle(titlePattern, browserType || 'any')
})

ipcMain.handle('web-activator-register-shortcuts', async (_event, configs: Array<{ id: string; name: string; titlePattern: string; browserType?: string; shortcut: string }>) => {
  try {
    globalShortcut.unregisterAll()
    
    for (const config of configs) {
      if (!config.shortcut || config.shortcut === 'Alt+') continue
      
      const success = globalShortcut.register(config.shortcut, async () => {
        try {
          const result = await toggleWindowByTitle(config.titlePattern, config.browserType || 'any')
          if (mainWindow && result.success) {
            mainWindow.webContents.send('web-activator-shortcut-triggered', {
              id: config.id,
              action: result.action
            })
          }
        } catch (error) {
          console.error('Toggle window error:', error)
        }
      })
      
      if (!success) {
        console.warn(`Failed to register shortcut: ${config.shortcut}`)
      }
    }
    
    return { success: true }
  } catch (error) {
    console.error('Register shortcuts error:', error)
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
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
    file: 'window-state.json'
  })

  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../resources/icon.png')
  
  let windowIcon: nativeImage | undefined
  if (fs.existsSync(iconPath)) {
    windowIcon = nativeImage.createFromPath(iconPath)
  }

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindowState.manage(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
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

let colorPickerWindow: BrowserWindow | null = null

ipcMain.handle('color-picker:start', async () => {
  try {
    if (colorPickerWindow) {
      colorPickerWindow.close()
      colorPickerWindow = null
    }

    const { screen } = require('electron')
    const displays = screen.getAllDisplays()
    let totalWidth = 0
    let totalHeight = 0
    
    displays.forEach(display => {
      const right = display.bounds.x + display.bounds.width
      const bottom = display.bounds.y + display.bounds.height
      if (right > totalWidth) totalWidth = right
      if (bottom > totalHeight) totalHeight = bottom
    })

    colorPickerWindow = new BrowserWindow({
      width: totalWidth,
      height: totalHeight,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })

    colorPickerWindow.setIgnoreMouseEvents(false)
    colorPickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    
    colorPickerWindow.loadURL(`data:text/html,
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { 
              width: 100%; 
              height: 100%; 
              cursor: crosshair;
              background: transparent;
              overflow: hidden;
            }
            #info {
              position: fixed;
              padding: 12px 16px;
              background: rgba(0, 0, 0, 0.85);
              color: white;
              border-radius: 10px;
              font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
              font-size: 14px;
              pointer-events: none;
              white-space: nowrap;
              display: none;
              z-index: 9999;
              box-shadow: 0 4px 20px rgba(0,0,0,0.4);
              border: 1px solid rgba(255,255,255,0.1);
              backdrop-filter: blur(10px);
            }
            #preview {
              display: inline-block;
              width: 28px;
              height: 28px;
              border: 2px solid rgba(255,255,255,0.9);
              border-radius: 6px;
              vertical-align: middle;
              margin-right: 12px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            #hex {
              vertical-align: middle;
              font-weight: 600;
              font-family: 'Consolas', 'Monaco', monospace;
              font-size: 15px;
            }
            #rgb {
              display: block;
              margin-top: 6px;
              font-size: 12px;
              opacity: 0.8;
              margin-left: 40px;
            }
            #tip {
              position: fixed;
              bottom: 30px;
              left: 50%;
              transform: translateX(-50%);
              padding: 10px 20px;
              background: rgba(0, 0, 0, 0.75);
              color: rgba(255,255,255,0.9);
              border-radius: 25px;
              font-family: 'Segoe UI', -apple-system, sans-serif;
              font-size: 13px;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255,255,255,0.1);
            }
          </style>
        </head>
        <body>
          <div id="info">
            <span id="preview"></span>
            <span id="hex">#000000</span>
            <span id="rgb">RGB(0, 0, 0)</span>
          </div>
          <div id="tip">按 ESC 取消 | 点击确认选择</div>
          <script>
            const { ipcRenderer } = require('electron');
            
            let currentColor = '#000000';
            let currentRgb = 'RGB(0, 0, 0)';
            let isPicking = true;
            let lastX = 0, lastY = 0;
            let throttleTimer = null;
            
            document.body.addEventListener('mousemove', (e) => {
              if (!isPicking) return;
              
              lastX = e.screenX;
              lastY = e.screenY;
              
              if (!throttleTimer) {
                throttleTimer = setTimeout(() => {
                  throttleTimer = null;
                  ipcRenderer.send('color-picker:move', { x: lastX, y: lastY });
                }, 30);
              }
              
              const info = document.getElementById('info');
              const preview = document.getElementById('preview');
              const hex = document.getElementById('hex');
              const rgb = document.getElementById('rgb');
              
              preview.style.backgroundColor = currentColor;
              hex.textContent = currentColor.toUpperCase();
              rgb.textContent = currentRgb;
              info.style.display = 'block';
              
              let infoX = e.clientX + 25;
              let infoY = e.clientY + 25;
              
              if (infoX + 220 > window.innerWidth) {
                infoX = e.clientX - 200;
              }
              if (infoY + 80 > window.innerHeight) {
                infoY = e.clientY - 90;
              }
              
              info.style.left = infoX + 'px';
              info.style.top = infoY + 'px';
            });
            
            document.body.addEventListener('click', (e) => {
              if (!isPicking) return;
              isPicking = false;
              ipcRenderer.send('color-picker:select', { x: e.screenX, y: e.screenY, color: currentColor });
            });
            
            document.body.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                isPicking = false;
                ipcRenderer.send('color-picker:cancel');
              }
            });
            
            ipcRenderer.on('color-update', (event, data) => {
              currentColor = data.hex;
              currentRgb = data.rgb;
            });
          </script>
        </body>
      </html>
    `)

    colorPickerWindow.on('closed', () => {
      colorPickerWindow = null
    })

    return { success: true }
  } catch (error) {
    console.error('Start color picker error:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.on('color-picker:move', async (_event, { x, y }) => {
  try {
    const script = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class CPAPI {
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
  }
"@
$dc = [CPAPI]::GetDC([IntPtr]::Zero)
$color = [CPAPI]::GetPixel($dc, ${x}, ${y})
[CPAPI]::ReleaseDC([IntPtr]::Zero, $dc) | Out-Null
$r = ($color -band 0xFF)
$g = (($color -shr 8) -band 0xFF)
$b = (($color -shr 16) -band 0xFF)
"{0},{1},{2},{3:X2}{4:X2}{5:X2}" -f $r, $g, $b, $r, $g, $b
`
    const result = await execPowerShell(script)
    const parts = result.trim().split(',')
    if (parts.length >= 4) {
      const r = parseInt(parts[0])
      const g = parseInt(parts[1])
      const b = parseInt(parts[2])
      const hex = `#${parts[3].toLowerCase()}`
      const rgb = `RGB(${r}, ${g}, ${b})`
      
      if (colorPickerWindow) {
        colorPickerWindow.webContents.send('color-update', { hex, rgb, r, g, b })
      }
      if (mainWindow) {
        mainWindow.webContents.send('color-picker:color', { hex, rgb, r, g, b, x, y })
      }
    }
  } catch (error) {
    console.error('Color picker move error:', error)
  }
})

ipcMain.on('color-picker:select', async (_event, { x, y }) => {
  try {
    const script = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class CPAPI {
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
  }
"@
$dc = [CPAPI]::GetDC([IntPtr]::Zero)
$color = [CPAPI]::GetPixel($dc, ${x}, ${y})
[CPAPI]::ReleaseDC([IntPtr]::Zero, $dc) | Out-Null
$r = ($color -band 0xFF)
$g = (($color -shr 8) -band 0xFF)
$b = (($color -shr 16) -band 0xFF)
"{0},{1},{2},{3:X2}{4:X2}{5:X2}" -f $r, $g, $b, $r, $g, $b
`
    const result = await execPowerShell(script)
    const parts = result.trim().split(',')
    if (parts.length >= 4 && mainWindow) {
      const r = parseInt(parts[0])
      const g = parseInt(parts[1])
      const b = parseInt(parts[2])
      const hex = `#${parts[3].toLowerCase()}`
      const rgb = `RGB(${r}, ${g}, ${b})`
      
      mainWindow.webContents.send('color-picker:selected', { hex, rgb, r, g, b, x, y })
    }
  } catch (error) {
    console.error('Color picker select error:', error)
  }
  
  if (colorPickerWindow) {
    colorPickerWindow.close()
    colorPickerWindow = null
  }
})

ipcMain.on('color-picker:cancel', () => {
  if (colorPickerWindow) {
    colorPickerWindow.close()
    colorPickerWindow = null
  }
  if (mainWindow) {
    mainWindow.webContents.send('color-picker:canceled')
  }
})

ipcMain.handle('color-picker:stop', async () => {
  if (colorPickerWindow) {
    colorPickerWindow.close()
    colorPickerWindow = null
  }
  return { success: true }
})

async function captureScreen(): Promise<string | null> {
  try {
    const { desktopCapturer, screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { scaleFactor, bounds } = primaryDisplay

    const sources = await Promise.race([
      desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(bounds.width * scaleFactor),
          height: Math.round(bounds.height * scaleFactor)
        }
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Screenshot timeout')), 3000)
      )
    ])

    if (sources && sources.length > 0) {
      return sources[0].thumbnail.toDataURL()
    }
    return null
  } catch (error) {
    console.error('Capture screen error:', error)
    return null
  }
}

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
  createTray()
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
