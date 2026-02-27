import { exec } from 'child_process'
import os from 'os'
import { execCommand, execPowerShell } from '../utils/processUtils'
import { IpcResponse } from '../../shared/types'
import { taskQueueService } from './TaskQueueService'

export class NetworkService {
  constructor() {}

  async ping(host: string): Promise<IpcResponse<{ alive: boolean, time: number | null }>> {
    return new Promise((resolve) => {
      const target = host.replace(/^https?:\/\//, '').split('/')[0]
      const cmd = `chcp 65001 && ping -n 1 -w 2000 ${target}`
      
      exec(cmd, (error, stdout) => {
        if (error) {
          resolve({ success: true, data: { alive: false, time: null } })
          return
        }
        const match = stdout.match(/[=<](\d+)ms/)
        if (match && match[1]) {
          resolve({ success: true, data: { alive: true, time: parseInt(match[1]) } })
        } else {
          resolve({ success: true, data: { alive: false, time: null } })
        }
      })
    })
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
        const wakeCmd = `ping -n 1 -w 500 ${targetSubnet}.255 > nul 2>&1 & ping -n 1 -w 500 ${targetSubnet}.1 > nul 2>&1`
        await execCommand(wakeCmd).catch(() => {})

        const arpOutput = await execCommand('arp -a')
        const lines = arpOutput.split(/[\r\n]+/)
        const rawDevices: Array<{ ip: string; mac: string }> = []
        for (const line of lines) {
          const match = line.trim().match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})/i)
          if (match) {
            const ip = match[1], mac = match[2]
            if (!ip.startsWith('224.') && !ip.startsWith('239.') && !ip.endsWith('.255') && ip.startsWith(targetSubnet + '.')) {
              rawDevices.push({ ip, mac })
            }
          }
        }
        const uniqueList = Array.from(new Map(rawDevices.map(d => [d.ip, d])).values())
        const macVendors: Record<string, string> = {
          'A4-A9-30': '小米 (Xiaomi)', 'EC-4D-3E': '小米 (Xiaomi)', 'C8-5C-CC': '小米 (Xiaomi)', '64-9E-31': '小米 (Xiaomi)',
          '08-3A-F2': '普联 (TP-Link)', '54-48-E6': '普联 (TP-Link)', 'A4-39-B3': '普联 (TP-Link)',
          'F4-F2-6D': 'Apple', 'BC-D1-1F': 'Apple', 'AC-29-3A': 'Apple', 'D8-BB-2C': 'Apple', '60-FB-42': 'Apple',
          'E4-E4-AB': 'Huawei', '28-D2-44': 'Huawei', '80-05-DF': 'Intel', '48-51-B7': 'Intel',
          'B4-2E-99': 'Samsung', 'FC-DB-B3': 'Samsung', '00-0C-29': 'VMware', '08-00-27': 'VirtualBox'
        }

        const devices = await Promise.all(uniqueList.map(async (dev: any) => {
          let name = ''
          if (dev.ip.endsWith('.1')) name = '路由器 (网关)'
          if (!name) {
            try {
              const hostRes = await execPowerShell(`$ErrorActionPreference='SilentlyContinue'; [System.Net.Dns]::GetHostEntry('${dev.ip}').HostName`)
              if (hostRes && hostRes.trim() !== dev.ip) name = hostRes.trim().split('.')[0]
            } catch (e) {}
          }
          if (!name) {
            const prefix = dev.mac.substring(0, 8).toUpperCase()
            name = macVendors[prefix] || ''
          }
          if (!name) {
            const firstByte = parseInt(dev.mac.substring(0, 2), 16)
            if ((firstByte & 0x02) === 2) name = '移动设备 (私有MAC)'
          }
          return { ip: dev.ip, mac: dev.mac, name: name || '未知设备', type: '局域网设备' }
        }))
        return { success: true, data: { devices } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })
  }
}

export const networkService = new NetworkService()
