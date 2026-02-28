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
            os: data.os || 'Windows'
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
}

export const systemService = new SystemService()
