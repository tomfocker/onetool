import { app, dialog, BrowserWindow } from 'electron'
import { execPowerShell } from '../utils/processUtils'
import { IpcResponse, SystemConfig } from '../../shared/types'
import { taskQueueService } from './TaskQueueService'

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

# Motherboard
$mb_raw = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$mb = "$($mb_raw.Manufacturer) $($mb_raw.Product)".Trim()
if (!$mb -or $mb -eq " ") { $mb = "Unknown Motherboard" }

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
            console.error('SystemService: JSON Parse Error:', e, '\nRaw:', rawResult.slice(0, 500))
          }
        } else {
          console.error('SystemService: No JSON markers found in output. Raw output:', rawResult.slice(0, 500))
        }

        let monitorValue = ''
        try {
          const { screen } = require('electron')
          const electronDisplays = screen.getAllDisplays()
          const monLines: string[] = data.mon
            ? data.mon.split(/\r?\n/).filter((l: string) => l.includes('|'))
            : []

          if (monLines.length > 0) {
            // 如果 WMI 返回的行里分辨率为空，用 Electron screen API 按索引补充
            monitorValue = monLines.map((line: string, idx: number) => {
              const parts = line.split('|')
              if (parts.length === 3 && (!parts[2] || parts[2] === '0x0' || /^0x/.test(parts[2])) && electronDisplays[idx]) {
                const d = electronDisplays[idx]
                parts[2] = `${Math.round(d.bounds.width * d.scaleFactor)}x${Math.round(d.bounds.height * d.scaleFactor)}`
              }
              return parts.join('|')
            }).join('\n')
          } else {
            // WMI 完全没有 monitor 数据，用 Electron 回退
            monitorValue = electronDisplays.map((d: any, i: number) =>
              `Unknown|Display ${i}|${Math.round(d.bounds.width * d.scaleFactor)}x${Math.round(d.bounds.height * d.scaleFactor)}`
            ).join('\n')
          }
        } catch (e) {
          monitorValue = data.mon || 'Unknown'
        }

        return {
          success: true,
          data: {
            cpu: data.cpu || 'Unknown Processor',
            motherboard: data.mb || 'Unknown Motherboard',
            memory: data.ram || '',
            gpu: data.gpu || 'Unknown GPU',
            monitor: monitorValue,
            disk: data.disk || 'Unknown Storage',
            os: data.os || 'Windows',
            installTime: 1770000000000 // 这里暂时硬编码一个基准值，实际生产应从持久化存储获取
          }
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
}

export const systemService = new SystemService()
