import os from 'os'
import { execCommand, execPowerShell } from '../utils/processUtils'
import { IpcResponse } from '../../shared/types'
import { taskQueueService } from './TaskQueueService'

export class NetworkService {
  constructor() { }

  async ping(host: string): Promise<IpcResponse<{ alive: boolean, time: number | null }>> {
    const target = host.replace(/^https?:\/\//, '').split('/')[0]
    // 使用 PowerShell Test-Connection 直接获取 ResponseTime，
    // 避免 cmd 编码问题和正则匹配不准確的问题。
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $r = Test-Connection -ComputerName '${target}' -Count 1 -BufferSize 32 -ErrorAction SilentlyContinue
      if ($r -and $r.StatusCode -eq 0) {
        Write-Output "OK:$($r.ResponseTime)"
      } else {
        Write-Output "FAIL"
      }
    `
    try {
      const output = await execPowerShell(script, 6000)
      const trimmed = output.trim()
      if (trimmed.startsWith('OK:')) {
        const time = parseInt(trimmed.slice(3), 10)
        return { success: true, data: { alive: true, time: isNaN(time) ? null : time } }
      } else {
        return { success: true, data: { alive: false, time: null } }
      }
    } catch {
      return { success: true, data: { alive: false, time: null } }
    }
  }

  /**
   * 批量 ping 多个 host，一次 PowerShell 进程并行完成，
   * 结果以 JSON 返回 { host: string, alive: boolean, time: number | null }[]
   */
  async pingBatch(hosts: string[]): Promise<IpcResponse<Array<{ host: string; alive: boolean; time: number | null }>>> {
    const targets = hosts.map(h => h.replace(/^https?:\/\//, '').split('/')[0])
    const hostsJson = JSON.stringify(targets)
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $hosts = '${hostsJson}' | ConvertFrom-Json
      $jobs = @()
      foreach ($h in $hosts) {
        $jobs += Start-Job -ScriptBlock {
          param($target)
          $r = Test-Connection -ComputerName $target -Count 1 -BufferSize 32 -ErrorAction SilentlyContinue
          if ($r -and $r.StatusCode -eq 0) {
            @{ host = $target; alive = $true; time = [int]$r.ResponseTime }
          } else {
            @{ host = $target; alive = $false; time = $null }
          }
        } -ArgumentList $h
      }
      $results = $jobs | Wait-Job -Timeout 8 | Receive-Job
      $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
      if ($results) { $results | ConvertTo-Json -Compress } else { "[]" }
    `
    try {
      const output = await execPowerShell(script, 12000)
      const trimmed = output.trim()
      // 找到 JSON 起始位置（跳过可能的 BOM 或其他输出）
      const startIdx = trimmed.indexOf('[')
      if (startIdx === -1) return { success: true, data: [] }
      const parsed = JSON.parse(trimmed.slice(startIdx))
      const results = Array.isArray(parsed) ? parsed : [parsed]
      return {
        success: true,
        data: results.map((r: any) => ({
          host: r.host,
          alive: !!r.alive,
          time: r.time != null ? parseInt(r.time, 10) : null
        }))
      }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  async getInfo(): Promise<IpcResponse<{ interfaces: any[] }>> {
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
        if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress } else { "[]" }
      `
      const psResult = await execPowerShell(script)
      let data: any[] = []
      try {
        const startIdx = Math.min(psResult.indexOf('[') !== -1 ? psResult.indexOf('[') : Infinity, psResult.indexOf('{') !== -1 ? psResult.indexOf('{') : Infinity);
        const endIdx = Math.max(psResult.lastIndexOf(']'), psResult.lastIndexOf('}'));
        if (startIdx !== Infinity && endIdx !== -1) {
          const cleanJson = psResult.substring(startIdx, endIdx + 1);
          const parsed = JSON.parse(cleanJson);
          data = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch (e) { console.error('NetworkService: Failed to parse PS JSON:', e); }

      if (data.length === 0) {
        const interfaces = os.networkInterfaces()
        for (const name of Object.keys(interfaces)) {
          const ifaces = interfaces[name]
          if (!ifaces) continue
          for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
              data.push({
                name: name, description: name,
                type: (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wlan')) ? 'Wi-Fi' : '以太网',
                speed: '未知', ip: iface.address
              })
            }
          }
        }
      }
      return { success: true, data: { interfaces: data } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async scanLan(targetSubnet: string): Promise<IpcResponse<{ devices: any[] }>> {
    return taskQueueService.enqueue('LAN_Scan', async () => {
      try {
        if (!targetSubnet) return { success: false, error: '未提供网段信息' }

        // 快速唤醒局域网活跃设备 (广播 + 网关)
        const wakeCmd = `ping -n 1 -w 300 ${targetSubnet}.255 > nul 2>&1 & ping -n 1 -w 300 ${targetSubnet}.1 > nul 2>&1`
        await execCommand(wakeCmd).catch(() => { })

        const arpOutput = await execCommand('arp -a')
        const lines = arpOutput.split(/[\r\n]+/)
        const rawDevices: Array<{ ip: string; mac: string }> = []

        for (const line of lines) {
          const match = line.trim().match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17}|[0-9a-fA-F-]{11,14})/i)
          if (match) {
            const ip = match[1]
            let mac = match[2].replace(/-/g, ':').toUpperCase()
            // 补齐 MAC 地址格式 (部分 ARP 输出可能不规范)
            if (mac.length === 12) mac = mac.match(/.{2}/g)!.join(':')

            if (!ip.startsWith('224.') && !ip.startsWith('239.') && !ip.endsWith('.255') && ip.startsWith(targetSubnet + '.')) {
              rawDevices.push({ ip, mac })
            }
          }
        }

        const uniqueList = Array.from(new Map(rawDevices.map(d => [d.ip, d])).values())
        if (uniqueList.length === 0) return { success: true, data: { devices: [] } }

        // 批量查询主机名，避免启动大量 PowerShell 进程
        const ipsToResolve = uniqueList.map(d => d.ip).join(',')
        const resolveScript = `
          $ErrorActionPreference = 'SilentlyContinue'
          $ips = "${ipsToResolve}".Split(',')
          $results = @{}
          foreach ($ip in $ips) {
              try {
                  $hostName = [System.Net.Dns]::GetHostEntry($ip).HostName
                  if ($hostName -and $hostName -ne $ip) {
                      $results[$ip] = $hostName.Split('.')[0]
                  }
              } catch {}
          }
          if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress } else { "{}" }
        `

        let hostMap: Record<string, string> = {}
        const resolveResult = await execPowerShell(resolveScript, 15000)
        if (resolveResult) {
          try {
            hostMap = JSON.parse(resolveResult)
          } catch (e) {
            // 如果只有一个结果，ConvertTo-Json 可能不会返回标准对象
            console.error('Failed to parse hostname JSON:', e)
          }
        }

        const macVendors: Record<string, string> = {
          'A4:A9:30': 'Xiaomi', 'EC:4D:3E': 'Xiaomi', 'C8:5C:CC': 'Xiaomi', '64:9E:31': 'Xiaomi',
          '08:3A:F2': 'TP-Link', '54:48:E6': 'TP-Link', 'A4:39:B3': 'TP-Link',
          'F4:F2:6D': 'Apple', 'BC:D1:1F': 'Apple', 'AC:29:3A': 'Apple', 'D8:BB:2C': 'Apple', '60:FB:42': 'Apple',
          'E4:E4:AB': 'Huawei', '28:D2:44': 'Huawei', '80:05:DF': 'Intel', '48:51:B7': 'Intel',
          'B4:2E:99': 'Samsung', 'FC:DB:B3': 'Samsung', '00:0C:29': 'VMware', '08:00:27': 'VirtualBox'
        }

        const devices = uniqueList.map((dev: any) => {
          let name = hostMap[dev.ip] || ''
          if (dev.ip.endsWith('.1')) name = name ? `${name} (网关)` : '路由器 (网关)'

          if (!name) {
            const prefix = dev.mac.substring(0, 8).toUpperCase()
            name = macVendors[prefix] || ''
          }

          if (!name) {
            const firstByte = parseInt(dev.mac.substring(0, 2), 16)
            if ((firstByte & 0x02) === 2) name = '移动设备 (私有MAC)'
          }

          return { ip: dev.ip, mac: dev.mac, name: name || '未知设备', type: '局域网设备' }
        })

        return { success: true, data: { devices } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })
  }
}

export const networkService = new NetworkService()
