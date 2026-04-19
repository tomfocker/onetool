import { app, dialog, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { execPowerShell } from '../utils/processUtils'
import { logger } from '../utils/logger'
import { IpcResponse, SystemConfig } from '../../shared/types'
import {
  normalizeCompositeHardwareName,
  normalizeMonitorEntry,
  pickBestDeviceModel
} from '../../shared/hardwareIdentity'
import { taskQueueService } from './TaskQueueService'

type ElectronDisplay = {
  bounds: { width: number; height: number }
  scaleFactor: number
}

type RawHardwarePayload = {
  cpu?: string
  cspVendor?: string
  cspName?: string
  cspVersion?: string
  csManufacturer?: string
  csModel?: string
  mbManufacturer?: string
  mbProduct?: string
  ram?: string
  gpu?: string
  disk?: string
  mon?: string
  os?: string
}

function getElectronDisplayResolution(display: ElectronDisplay | undefined): string {
  if (!display) {
    return ''
  }

  return `${Math.round(display.bounds.width * display.scaleFactor)}x${Math.round(display.bounds.height * display.scaleFactor)}`
}

function isValidMonitorResolution(value: string | null | undefined): boolean {
  return /^[1-9]\d*x[1-9]\d*$/i.test(String(value || '').trim())
}

function normalizeMonitorValue(rawMonitorText: string | undefined, electronDisplays: ElectronDisplay[]): string {
  const rawLines = rawMonitorText
    ? rawMonitorText.split(/\r?\n/).filter((line: string) => line.includes('|'))
    : []
  const canUseIndexedResolutionFallback = rawLines.length === 1 && electronDisplays.length === 1

  if (rawLines.length > 0) {
    return rawLines.map((line: string, idx: number) => {
      const parts = line.split('|')
      const resolution = isValidMonitorResolution(parts[2])
        ? parts[2]
        : canUseIndexedResolutionFallback
          ? getElectronDisplayResolution(electronDisplays[idx])
          : ''

      return normalizeMonitorEntry({
        manufacturer: parts[0] || '',
        name: parts[1] || '',
        resolution,
      })
    }).join('\n')
  }

  return electronDisplays.map((display, idx) => normalizeMonitorEntry({
    manufacturer: 'Unknown',
    name: `Display ${idx}`,
    resolution: getElectronDisplayResolution(display),
  })).join('\n')
}

export function buildSystemConfigFromHardwarePayload(
  data: RawHardwarePayload,
  electronDisplays: ElectronDisplay[],
): SystemConfig {
  const normalizedMotherboard = normalizeCompositeHardwareName(
    data.mbManufacturer,
    data.mbProduct,
  )
  const deviceModel = pickBestDeviceModel(
    [
      {
        source: 'Win32_ComputerSystemProduct',
        manufacturer: data.cspVendor,
        model: data.cspName,
        version: data.cspVersion,
      },
      {
        source: 'Win32_ComputerSystem',
        manufacturer: data.csManufacturer,
        model: data.csModel,
      },
    ],
    normalizedMotherboard || undefined,
  )

  return {
    cpu: data.cpu || 'Unknown Processor',
    deviceModel,
    motherboard: normalizedMotherboard || 'Unknown Motherboard',
    memory: data.ram || '',
    gpu: data.gpu || 'Unknown GPU',
    monitor: normalizeMonitorValue(data.mon, electronDisplays),
    disk: data.disk || 'Unknown Storage',
    os: data.os || 'Windows',
    installTime: 1770000000000,
  }
}

export class SystemService {
  constructor() { }

  async getSystemConfig(): Promise<IpcResponse<SystemConfig>> {
    return taskQueueService.enqueue('HardwareAudit', async () => {
      try {
        const hwScript = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

# CPU
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name

# Whole-device identity
$csProduct = Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
$mb_raw = Get-CimInstance Win32_BaseBoard | Select-Object -First 1

# Memory
$mem_objs = Get-CimInstance Win32_PhysicalMemory
$total_bytes = 0
foreach($m in $mem_objs) { $total_bytes += [long]$m.Capacity }
$ram_gb = [Math]::Round($total_bytes / 1GB)
$ram_speed = ($mem_objs | Select-Object -First 1).ConfiguredClockSpeed
$ram_manu = ($mem_objs | Select-Object -First 1).Manufacturer
$ram = "$($ram_gb)GB|$($mem_objs.Count)|$($ram_speed)|$($ram_manu)"

# GPU (multiple)
$gpus = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch "Microsoft" -or $_.AdapterRAM -gt 0 } | ForEach-Object { $_.Name }
if (!$gpus) { $gpus = Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name } }
$gpu_str = ($gpus | Select-Object -Unique) -join [char]10

# Disk
$disks = Get-CimInstance Win32_DiskDrive | ForEach-Object { "$($_.Model) ($([Math]::Round($_.Size / 1GB))GB)" }
$disk_str = $disks -join [char]10

# Monitor via WMI
$mon_list = @()
try {
    $params = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction Stop
    $ids    = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -ErrorAction Stop
    for ($i = 0; $i -lt $ids.Count; $i++) {
        $m = $ids[$i]
        $n_bytes = [byte[]]($m.UserFriendlyName | Where-Object { $_ -ne 0 })
        $name = if ($n_bytes) { [System.Text.Encoding]::ASCII.GetString($n_bytes).Trim() } else { "" }
        if (!$name -and $n_bytes) { $name = [System.Text.Encoding]::Unicode.GetString($n_bytes).Trim() }
        $m_bytes = [byte[]]($m.ManufacturerName | Where-Object { $_ -ne 0 })
        $manu = if ($m_bytes) { [System.Text.Encoding]::ASCII.GetString($m_bytes).Trim() } else { "Unknown" }
        $p = $params | Where-Object { $_.InstanceName -eq $m.InstanceName }
        if (!$p -and $params.Count -gt $i) { $p = $params[$i] }
        $native = if ($p -and $p.HorizontalActivePixels -gt 0) { "$($p.HorizontalActivePixels)x$($p.VerticalActivePixels)" } else { "" }
        if ($manu -ne "Unknown" -or $name) {
            $mon_list += "$manu|$name|$native"
        }
    }
} catch {}
if ($mon_list.Count -eq 0) {
    try {
        $pnp_mons = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Service -eq "monitor" }
        foreach ($pm in $pnp_mons) {
            $manu = "Unknown"
            if ($pm.DeviceID -match "DISPLAY\\\\([A-Z]{3})") { $manu = $Matches[1] }
            $model = if ($pm.Name -match "\\((.*)\\)") { $Matches[1] } else { $pm.Name }
            $mon_list += "$manu|$model|"
        }
    } catch {}
}
$mon_str = $mon_list -join [char]10

# OS
$os = (Get-CimInstance Win32_OperatingSystem | Select-Object -First 1).Caption

$info = @{
    cpu=$cpu
    cspVendor=$csProduct.Vendor
    cspName=$csProduct.Name
    cspVersion=$csProduct.Version
    csManufacturer=$cs.Manufacturer
    csModel=$cs.Model
    mbManufacturer=$mb_raw.Manufacturer
    mbProduct=$mb_raw.Product
    ram=$ram
    gpu=$gpu_str
    disk=$disk_str
    mon=$mon_str
    os=$os
}
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
            console.error('SystemService: JSON Parse Error:', e, '\nRaw:', rawResult.slice(0, 500))
          }
        } else {
          console.error('SystemService: No JSON markers found in output. Raw output:', rawResult.slice(0, 500))
        }

        let electronDisplays: ElectronDisplay[] = []
        try {
          const { screen } = require('electron')
          electronDisplays = screen.getAllDisplays() as ElectronDisplay[]
        } catch (e) {}

        return {
          success: true,
          data: buildSystemConfigFromHardwarePayload(data, electronDisplays)
        }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })
  }

  getAutoStartStatus(): IpcResponse<{ enabled: boolean }> {
    try {
      const settings = app.getLoginItemSettings()
      return {
        success: true,
        data: { enabled: settings.openAtLogin }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  setAutoStart(enabled: boolean): IpcResponse {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: false
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async selectFilesAndFolders(window: BrowserWindow | null): Promise<IpcResponse<{ canceled: boolean, filePaths: string[] }>> {
    try {
      if (!window) return { success: false, error: '窗口不存在' }
      const { canceled, filePaths } = await dialog.showOpenDialog(window, {
        properties: ['openFile', 'openDirectory', 'multiSelections'],
        title: '选择文件或文件夹',
        buttonLabel: '选择'
      })
      return { success: true, data: { canceled, filePaths: !canceled ? filePaths : [] } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async selectDirectory(window: BrowserWindow | null): Promise<IpcResponse<{ canceled: boolean, path: string | null }>> {
    try {
      if (!window) return { success: false, error: '窗口不存在' }
      const { canceled, filePaths } = await dialog.showOpenDialog(window, {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择保存目录'
      })
      return { success: true, data: { canceled, path: !canceled ? filePaths[0] : null } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async getRealtimeStats(): Promise<IpcResponse<any>> {
    return taskQueueService.enqueue('RealtimeStats', async () => {
      try {
        const statsScript = `
# CPU Load & Name
$cpuLoad = 0
$cpuName = ""
try {
    $cpuObj = Get-CimInstance Win32_Processor | Select-Object -First 1
    $cpuLoad = $cpuObj.LoadPercentage
    $cpuName = $cpuObj.Name.Trim()
    if (!$cpuLoad) { 
        $cpuLoad = (Get-Counter "\\Processor(_Total)\\% Processor Time" -ErrorAction SilentlyContinue).CounterSamples.CookedValue 
    }
} catch { $cpuLoad = 0 }

# CPU Temp (Active Sensor Hunting)
$cpuTemp = 0
try {
    # 1. Broad scan for all temperature instances
    $candidates = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue 
    $activeTemps = @()
    foreach($c in $candidates) {
        if ($c.CurrentTemperature -gt 0) {
            $val = [Math]::Round(($c.CurrentTemperature / 10) - 273.15, 1)
            # Filter inactive or stuck sensors (common dummy values: 27.8, 28.0, 30.0)
            if ($val -gt 15 -and $val -lt 110 -and $val -ne 27.8 -and $val -ne 28.0) {
                $activeTemps += $val
            }
        }
    }
    
    if ($activeTemps.Count -gt 0) {
        $cpuTemp = ($activeTemps | Measure-Object -Maximum).Maximum
    } else {
        # 2. Performance Counter Fallback
        $perf = Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue
        $pTemps = @()
        foreach($p in $perf) {
            $v = $p.Temperature - 273.15
            if ($v -gt 15 -and $v -lt 110 -and $v -ne 28) { $pTemps += $v }
        }
        if ($pTemps.Count -gt 0) { $cpuTemp = ($pTemps | Measure-Object -Maximum).Maximum }
    }
} catch { $cpuTemp = 0 }

# Memory
$memUsage = 0
$usedMem = 0
$totalMem = 0
try {
    $mem = Get-CimInstance Win32_OperatingSystem
    $totalMem = [Math]::Round($mem.TotalVisibleMemorySize / 1MB, 2)
    $freeMem = [Math]::Round($mem.FreePhysicalMemory / 1MB, 2)
    $usedMem = $totalMem - $freeMem
    $memUsage = [Math]::Round(($usedMem / $totalMem) * 100, 1)
} catch {}

# GPU Load & Temp & Name
$gpuLoad = 0
$gpuTemp = 0
$gpuName = ""
try {
    $gpuObj = Get-CimInstance Win32_VideoController | Where-Object { $_.AdapterRAM -gt 0 } | Select-Object -First 1
    if ($gpuObj) { $gpuName = $gpuObj.Name }

    if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
        $nvi = nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,name --format=csv,noheader,nounits
        if ($nvi) {
            $parts = $nvi.Split(',')
            $gpuLoad = [int]$parts[0].Trim()
            $gpuTemp = [int]$parts[1].Trim()
            if ($parts.Count -gt 2) { $gpuName = $parts[2].Trim() }
        }
    } else {
        $gpuTotal = Get-Counter "\\GPU Engine(*)\\% Utilization" -ErrorAction SilentlyContinue
        if ($gpuTotal -and $gpuTotal.CounterSamples) {
            $gpuLoad = [Math]::Round(($gpuTotal.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum, 1)
            if ($gpuLoad -gt 100) { $gpuLoad = 100 }
        }
    }
} catch { $gpuLoad = 0 }

$results = @{
    cpuLoad = [Math]::Round([double]$cpuLoad, 1)
    cpuTemp = $cpuTemp
    cpuName = $cpuName
    gpuLoad = $gpuLoad
    gpuTemp = $gpuTemp
    gpuName = $gpuName
    memoryUsage = $memUsage
    memoryUsed = $usedMem
    memoryTotal = $totalMem
    netUp = "0 KB/s"
    netDown = "0 KB/s"
}

Write-Output "---STATS_JSON_START---"
$results | ConvertTo-Json -Compress
Write-Output "---STATS_JSON_END---"
`
        const rawResult = await execPowerShell(statsScript)
        const match = rawResult.match(/---STATS_JSON_START---(.*?)---STATS_JSON_END---/s)
        if (match && match[1]) {
          try {
            const data = JSON.parse(match[1].trim())
            return { success: true, data }
          } catch (pe) {
            console.error('SystemService: Stats JSON Parse Error:', pe, rawResult)
          }
        }
        return { success: false, error: '无法解析监控数据' }
      } catch (error) {
        console.error('SystemService: getRealtimeStats Error:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  }

  async executeCommand(command: string): Promise<IpcResponse> {
    try {
      logger.info(`[SystemService] Attempting to launch: ${command}`)

      // 在 Windows 上使用 start 命令启动是打开面板最稳妥的方式
      const child = spawn('cmd.exe', ['/c', 'start', '', command], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })

      child.unref()
      
      return { success: true }
    } catch (error) {
      logger.error(`[SystemService] executeCommand Error:`, error)
      return { success: false, error: (error as Error).message }
    }
  }
}

export const systemService = new SystemService()
