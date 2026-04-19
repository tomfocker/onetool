import { spawn } from 'child_process'
import { execPowerShellEncoded } from '../utils/processUtils'
import { logger } from '../utils/logger'
import { IpcResponse, LocalProxyConfig, LocalProxyStatus, ProxyProtocol } from '../../shared/types'

const INTERNET_SETTINGS_PATH = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''")
}

function refreshWinInetScript(): string {
  return `
Add-Type -Namespace WinInet -Name NativeMethods -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("wininet.dll", SetLastError=true)]
public static extern bool InternetSetOption(System.IntPtr hInternet, int dwOption, System.IntPtr lpBuffer, int dwBufferLength);
"@ | Out-Null
[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
`
}

export class LocalProxyService {
  private parseProxyServer(server: string): Pick<LocalProxyStatus, 'host' | 'port' | 'protocol'> {
    const entries = server
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)

    for (const entry of entries) {
      const typedMatch = entry.match(/^(http|https|socks)=(.+):(\d+)$/i)
      if (typedMatch) {
        const scheme = typedMatch[1].toLowerCase()
        return {
          host: typedMatch[2],
          port: Number(typedMatch[3]),
          protocol: scheme === 'socks' ? 'socks5' : 'http'
        }
      }
    }

    const fallbackMatch = entries[0]?.match(/^(.+):(\d+)$/)
    if (fallbackMatch) {
      return {
        host: fallbackMatch[1],
        port: Number(fallbackMatch[2]),
        protocol: 'http'
      }
    }

    return {
      host: '',
      port: null,
      protocol: 'unknown'
    }
  }

  async getStatus(): Promise<IpcResponse<LocalProxyStatus>> {
    try {
      const script = `
$ErrorActionPreference = 'Stop'
$item = Get-ItemProperty -Path '${INTERNET_SETTINGS_PATH}'
$result = @{
  enabled = [bool]($item.ProxyEnable -eq 1)
  server = [string]($item.ProxyServer)
  override = [string]($item.ProxyOverride)
  autoConfigUrl = if ($null -ne $item.AutoConfigURL -and [string]$item.AutoConfigURL -ne '') { [string]$item.AutoConfigURL } else { $null }
}
Write-Output '---LOCAL_PROXY_JSON_START---'
$result | ConvertTo-Json -Compress
Write-Output '---LOCAL_PROXY_JSON_END---'
`
      const raw = await execPowerShellEncoded(script)
      const match = raw.match(/---LOCAL_PROXY_JSON_START---(.*?)---LOCAL_PROXY_JSON_END---/s)
      if (!match?.[1]) {
        return { success: false, error: '无法读取系统代理状态' }
      }

      const parsed = JSON.parse(match[1].trim()) as {
        enabled: boolean
        server: string
        override: string
        autoConfigUrl: string | null
      }
      const server = parsed.server || ''
      const normalized = this.parseProxyServer(server)

      return {
        success: true,
        data: {
          enabled: Boolean(parsed.enabled),
          server,
          host: normalized.host,
          port: normalized.port,
          protocol: normalized.protocol,
          bypass: (parsed.override || '').split(';').map((item) => item.trim()).filter(Boolean),
          autoConfigUrl: parsed.autoConfigUrl || null
        }
      }
    } catch (error) {
      logger.error('[LocalProxyService] getStatus failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async setConfig(config: LocalProxyConfig): Promise<IpcResponse<LocalProxyStatus>> {
    try {
      const host = config.host.trim()
      const port = Number(config.port)
      const bypass = config.bypass.filter(Boolean).join(';')

      if (!host) {
        return { success: false, error: '代理地址不能为空' }
      }

      if (!Number.isFinite(port) || port <= 0) {
        return { success: false, error: '代理端口无效' }
      }

      const proxyServer =
        config.protocol === 'socks5'
          ? `socks=${host}:${port}`
          : `http=${host}:${port};https=${host}:${port}`

      const script = `
$ErrorActionPreference = 'Stop'
Set-ItemProperty -Path '${INTERNET_SETTINGS_PATH}' -Name ProxyEnable -Value 1
Set-ItemProperty -Path '${INTERNET_SETTINGS_PATH}' -Name ProxyServer -Value '${escapePowerShellString(proxyServer)}'
Set-ItemProperty -Path '${INTERNET_SETTINGS_PATH}' -Name ProxyOverride -Value '${escapePowerShellString(bypass)}'
${refreshWinInetScript()}
Write-Output 'ok'
`
      await execPowerShellEncoded(script)
      return this.getStatus()
    } catch (error) {
      logger.error('[LocalProxyService] setConfig failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async disable(): Promise<IpcResponse<LocalProxyStatus>> {
    try {
      const script = `
$ErrorActionPreference = 'Stop'
Set-ItemProperty -Path '${INTERNET_SETTINGS_PATH}' -Name ProxyEnable -Value 0
${refreshWinInetScript()}
Write-Output 'ok'
`
      await execPowerShellEncoded(script)
      return this.getStatus()
    } catch (error) {
      logger.error('[LocalProxyService] disable failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  openSystemSettings(): IpcResponse {
    try {
      const child = spawn('cmd.exe', ['/c', 'start', '', 'ms-settings:network-proxy'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      child.unref()
      return { success: true }
    } catch (error) {
      logger.error('[LocalProxyService] openSystemSettings failed', error)
      return { success: false, error: (error as Error).message }
    }
  }
}

export const localProxyService = new LocalProxyService()
