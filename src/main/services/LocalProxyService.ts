import net from 'net'
import { spawn } from 'child_process'
import { execCommand, execPowerShellEncoded } from '../utils/processUtils'
import { logger } from '../utils/logger'
import { IpcResponse, LocalProxyConfig, LocalProxyStatus, ProxyProtocol } from '../../shared/types'
import {
  PROXY_DOCTOR_DEFAULT_NO_PROXY,
  PROXY_DOCTOR_LAYER_DEFINITIONS,
  PROXY_DOCTOR_NO_PROXY_KEYS,
  PROXY_DOCTOR_PROXY_KEYS,
  ProxyDoctorLayerId,
  ProxyDoctorLayerStatus,
  ProxyDoctorProbeCheck,
  ProxyDoctorProbeResult,
  ProxyDoctorSnapshot,
  ProxyDoctorTarget,
  buildProxyDoctorReport,
  normalizeProxyDoctorTarget,
  summarizeProxyDoctorLayers
} from '../../shared/proxyDoctor'

const INTERNET_SETTINGS_PATH = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
const LOCAL_PROXY_JSON_START = '---LOCAL_PROXY_JSON_START---'
const LOCAL_PROXY_JSON_END = '---LOCAL_PROXY_JSON_END---'
const LOCAL_PROXY_ENV_JSON_START = '---LOCAL_PROXY_ENV_JSON_START---'
const LOCAL_PROXY_ENV_JSON_END = '---LOCAL_PROXY_ENV_JSON_END---'
const PROXY_DOCTOR_TEST_URL = 'http://www.msftconnecttest.com/connecttest.txt'
const PROXY_DOCTOR_TEST_HOST = 'www.msftconnecttest.com'

type LocalProxyServiceDependencies = {
  execPowerShellEncoded: (script: string, timeoutMs?: number) => Promise<string>
  execCommand: (command: string, timeoutMs?: number) => Promise<string>
  connectToPort: (host: string, port: number, timeoutMs?: number) => Promise<boolean>
  measurePortLatency: (host: string, port: number, timeoutMs?: number) => Promise<ProxyDoctorProbeCheck>
  probeProxyRequest: (target: ProxyDoctorTarget, timeoutMs?: number) => Promise<ProxyDoctorProbeCheck>
  processEnv: NodeJS.ProcessEnv
  spawn: typeof spawn
}

type WinHttpProxy = {
  enabled: boolean
  server: string
  bypass: string
}

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

function commandOutputLooksFailed(output: string): boolean {
  return /is not recognized|not found|fatal:|error:|错误|找不到|不是内部或外部命令|invalid|the syntax of this command is/i.test(output)
}

function isAbsentGitConfigError(error: unknown): boolean {
  const maybeError = error as Error & { code?: unknown; cmd?: unknown }
  if (maybeError?.code !== 5) {
    return false
  }

  const commandText = `${typeof maybeError.cmd === 'string' ? maybeError.cmd : ''}\n${maybeError.message || ''}`
  return /git config --global --unset (?:http\.proxy|https\.proxy)/.test(commandText)
}

function isAbsentGitGetConfigError(error: unknown): boolean {
  const maybeError = error as Error & { code?: unknown; cmd?: unknown }
  if (maybeError?.code !== 1) {
    return false
  }

  const commandText = `${typeof maybeError.cmd === 'string' ? maybeError.cmd : ''}\n${maybeError.message || ''}`
  return /git config --global --get (?:http\.proxy|https\.proxy)/.test(commandText)
}

function testPortConnection(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    let settled = false

    const finish = (result: boolean) => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function measurePortLatency(host: string, port: number, timeoutMs = 2500): Promise<ProxyDoctorProbeCheck> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const socket = net.createConnection({ host, port })
    let settled = false

    const finish = (ok: boolean, error?: string) => {
      if (settled) {
        return
      }

      settled = true
      const latencyMs = ok ? Math.max(1, Date.now() - startedAt) : null
      socket.destroy()
      resolve(error ? { ok, latencyMs, error } : { ok, latencyMs })
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false, '连接超时'))
    socket.once('error', (error) => finish(false, error.message))
  })
}

function probeHttpProxyRequest(target: ProxyDoctorTarget, timeoutMs = 5000): Promise<ProxyDoctorProbeCheck> {
  if (target.protocol !== 'http') {
    return Promise.resolve({
      ok: false,
      latencyMs: null,
      skipped: true,
      error: `${target.protocol.toUpperCase()} 代理暂只测试端口连通`
    })
  }

  return new Promise((resolve) => {
    const startedAt = Date.now()
    const socket = net.createConnection({ host: target.host, port: target.port })
    let settled = false
    let response = ''

    const finish = (check: ProxyDoctorProbeCheck) => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(check)
    }

    const parseStatus = () => {
      const firstLine = response.split(/\r?\n/, 1)[0] || ''
      const match = firstLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)
      if (!match) {
        return false
      }

      const statusCode = Number(match[1])
      const ok = statusCode >= 200 && statusCode < 400
      finish({
        ok,
        latencyMs: Math.max(1, Date.now() - startedAt),
        statusCode,
        error: ok ? undefined : statusCode === 407 ? '代理需要认证' : `代理返回 HTTP ${statusCode}`
      })
      return true
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      socket.write([
        `GET ${PROXY_DOCTOR_TEST_URL} HTTP/1.1`,
        `Host: ${PROXY_DOCTOR_TEST_HOST}`,
        'User-Agent: OneToolProxyDoctor/1.0',
        'Connection: close',
        '',
        ''
      ].join('\r\n'))
    })
    socket.on('data', (chunk) => {
      response += chunk.toString('latin1')
      parseStatus()
    })
    socket.once('end', () => {
      if (!parseStatus()) {
        finish({ ok: false, latencyMs: null, error: '代理没有返回有效 HTTP 响应' })
      }
    })
    socket.once('timeout', () => finish({ ok: false, latencyMs: null, error: '代理请求超时' }))
    socket.once('error', (error) => finish({ ok: false, latencyMs: null, error: error.message }))
  })
}

const defaultDeps: LocalProxyServiceDependencies = {
  execPowerShellEncoded,
  execCommand,
  connectToPort: testPortConnection,
  measurePortLatency,
  probeProxyRequest: probeHttpProxyRequest,
  processEnv: process.env,
  spawn
}

export class LocalProxyService {
  private deps: LocalProxyServiceDependencies

  constructor(deps: Partial<LocalProxyServiceDependencies> = {}) {
    this.deps = { ...defaultDeps, ...deps }
  }

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

  private getLayerDefinition(id: ProxyDoctorLayerId) {
    const definition = PROXY_DOCTOR_LAYER_DEFINITIONS.find((item) => item.id === id)
    if (!definition) {
      throw new Error(`Unknown proxy doctor layer: ${id}`)
    }

    return definition
  }

  private makeLayer(
    id: ProxyDoctorLayerId,
    state: ProxyDoctorLayerStatus['state'],
    currentValue: string,
    detail = ''
  ): ProxyDoctorLayerStatus {
    const definition = this.getLayerDefinition(id)

    return {
      id,
      state,
      title: definition.title,
      currentValue,
      detail,
      actionHint: definition.actionHint,
      canFix: definition.canFix,
      canClear: definition.canClear && state !== 'off'
    }
  }

  private valuesMatchTarget(
    values: Array<string | null | undefined>,
    target: ProxyDoctorTarget,
    expected: 'env' | 'wininet' = 'env',
    requireEveryValue = false
  ): ProxyDoctorLayerStatus['state'] {
    const normalized = values.map((value) => (value || '').trim())
    const filled = normalized.filter((value) => value.length > 0 && value.toLowerCase() !== 'null')

    if (filled.length === 0) {
      return 'off'
    }

    if (requireEveryValue && filled.length !== normalized.length) {
      return 'conflict'
    }

    const targetValue = expected === 'wininet' ? target.winInetServer : target.envValue
    if (expected === 'wininet') {
      return filled.every((value) => this.windowsProxyMatchesTarget(value, target)) ? 'ok' : 'conflict'
    }

    return filled.every((value) => value.toLowerCase() === targetValue.toLowerCase()) ? 'ok' : 'conflict'
  }

  private windowsProxyMatchesTarget(server: string, target: ProxyDoctorTarget): boolean {
    const trimmed = server.trim()
    if (!trimmed) {
      return false
    }

    if (trimmed.toLowerCase() === target.winInetServer.toLowerCase()) {
      return true
    }

    const expectedServer = `${target.host}:${target.port}`.toLowerCase()
    const entries = trimmed
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)

    if (entries.length === 1) {
      const fallbackMatch = entries[0].match(/^(.+):(\d+)$/)
      if (fallbackMatch && !entries[0].includes('=')) {
        return target.protocol !== 'socks5' && `${fallbackMatch[1]}:${fallbackMatch[2]}`.toLowerCase() === expectedServer
      }
    }

    const typedEntries = new Map<string, string>()
    for (const entry of entries) {
      const typedMatch = entry.match(/^(http|https|socks)=(.+):(\d+)$/i)
      if (typedMatch) {
        typedEntries.set(typedMatch[1].toLowerCase(), `${typedMatch[2]}:${typedMatch[3]}`.toLowerCase())
      }
    }

    if (target.protocol === 'socks5') {
      return typedEntries.get('socks') === expectedServer
    }

    return typedEntries.get('http') === expectedServer && typedEntries.get('https') === expectedServer
  }

  private parseJsonBetweenMarkers<T>(text: string, start: string, end: string): T | null {
    const startIndex = text.indexOf(start)
    const endIndex = text.indexOf(end)
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return null
    }

    try {
      return JSON.parse(text.slice(startIndex + start.length, endIndex).trim()) as T
    } catch {
      return null
    }
  }

  private parseWinHttpProxy(output: string): WinHttpProxy {
    const directAccess = /direct access|no proxy server|直接访问|没有代理服务器|无代理/i.test(output)
    if (directAccess) {
      return { enabled: false, server: '', bypass: '' }
    }

    const serverMatch = output.match(/(?:Proxy Server\(s\)|代理服务器)\s*:\s*(.+)/i)
    const bypassMatch = output.match(/(?:Bypass List|绕过列表|例外)\s*:\s*(.+)/i)
    const server = (serverMatch?.[1] || '').trim()
    const bypass = (bypassMatch?.[1] || '').trim()

    return { enabled: server.length > 0, server, bypass }
  }

  private async readUserProxyEnv(): Promise<Record<string, string>> {
    const keys = [...PROXY_DOCTOR_PROXY_KEYS, ...PROXY_DOCTOR_NO_PROXY_KEYS]
    const script = `
$ErrorActionPreference = 'Stop'
$result = @{}
${keys.map((key) => `$value = [Environment]::GetEnvironmentVariable('${key}', 'User'); if ($null -ne $value -and [string]$value -ne '') { $result['${key}'] = [string]$value }`).join('\n')}
Write-Output '${LOCAL_PROXY_ENV_JSON_START}'
$result | ConvertTo-Json -Compress
Write-Output '${LOCAL_PROXY_ENV_JSON_END}'
`
    const raw = await this.deps.execPowerShellEncoded(script)
    return this.parseJsonBetweenMarkers<Record<string, string>>(raw, LOCAL_PROXY_ENV_JSON_START, LOCAL_PROXY_ENV_JSON_END) || {}
  }

  private async buildWinInetLayer(target: ProxyDoctorTarget): Promise<ProxyDoctorLayerStatus> {
    const status = await this.getStatus()
    if (!status.success || !status.data) {
      return this.makeLayer('wininet', 'error', '', status.error || '无法读取 Windows 系统代理')
    }

    if (!status.data.enabled) {
      return this.makeLayer('wininet', 'off', '', status.data.autoConfigUrl ? `PAC: ${status.data.autoConfigUrl}` : '')
    }

    const state = this.valuesMatchTarget([status.data.server], target, 'wininet')
    const detail = status.data.bypass.length > 0 ? `绕过: ${status.data.bypass.join(';')}` : ''
    return this.makeLayer('wininet', state, status.data.server, detail)
  }

  private async buildWinHttpLayer(target: ProxyDoctorTarget): Promise<ProxyDoctorLayerStatus> {
    try {
      const output = await this.deps.execCommand('netsh winhttp show proxy')
      const parsed = this.parseWinHttpProxy(output)
      if (!parsed.enabled) {
        return this.makeLayer('winhttp', 'off', '', '')
      }

      const state = this.valuesMatchTarget([parsed.server], target, 'wininet')
      return this.makeLayer('winhttp', state, parsed.server, parsed.bypass ? `绕过: ${parsed.bypass}` : '')
    } catch (error) {
      return this.makeLayer('winhttp', 'error', '', (error as Error).message)
    }
  }

  private async buildEnvLayer(target: ProxyDoctorTarget): Promise<ProxyDoctorLayerStatus> {
    const env = await this.readUserProxyEnv()
    const values = PROXY_DOCTOR_PROXY_KEYS.map((key) => env[key])
    const state = this.valuesMatchTarget(values, target, 'env', true)
    const currentValue = PROXY_DOCTOR_PROXY_KEYS
      .filter((key) => env[key])
      .map((key) => `${key}=${env[key]}`)
      .join('; ')
    const noProxy = PROXY_DOCTOR_NO_PROXY_KEYS
      .filter((key) => env[key])
      .map((key) => `${key}=${env[key]}`)
      .join('; ')

    return this.makeLayer('env', state, currentValue, noProxy)
  }

  private async buildToolLayer(id: 'git' | 'npm', target: ProxyDoctorTarget): Promise<ProxyDoctorLayerStatus> {
    const commands = id === 'git'
      ? ['git config --global --get http.proxy', 'git config --global --get https.proxy']
      : ['npm config get proxy', 'npm config get https-proxy']

    const results = await Promise.all(commands.map(async (command) => {
      try {
        return { value: await this.deps.execCommand(command), error: null as Error | null }
      } catch (error) {
        if (id === 'git' && isAbsentGitGetConfigError(error)) {
          return { value: '', error: null }
        }

        return { value: '', error: error as Error }
      }
    }))

    if (results.every((result) => result.error)) {
      return this.makeLayer(id, 'unavailable', '', results.map((result) => result.error?.message).filter(Boolean).join('; '))
    }

    const values = results.map((result) => result.value)
    const labels = id === 'git' ? ['http.proxy', 'https.proxy'] : ['proxy', 'https-proxy']
    const currentValue = values
      .map((value, index) => ({ key: labels[index], value: value.trim() }))
      .filter((item) => item.value && item.value.toLowerCase() !== 'null')
      .map((item) => `${item.key}=${item.value}`)
      .join('; ')
    const state = this.valuesMatchTarget(values, target, 'env', true)

    return this.makeLayer(id, state, currentValue, '')
  }

  private buildCurrentProcessLayer(target: ProxyDoctorTarget): ProxyDoctorLayerStatus {
    const values = PROXY_DOCTOR_PROXY_KEYS.map((key) => this.deps.processEnv[key])
    const state = this.valuesMatchTarget(values, target)
    const currentValue = PROXY_DOCTOR_PROXY_KEYS
      .filter((key) => this.deps.processEnv[key])
      .map((key) => `${key}=${this.deps.processEnv[key]}`)
      .join('; ')

    return this.makeLayer('process', state, currentValue, '当前 OneTool 进程可见的环境变量，仅用于诊断参考')
  }

  private buildCodexLayer(): ProxyDoctorLayerStatus {
    return this.makeLayer('codex', 'unavailable', '', '当前版本暂不扫描 Codex 子进程代理环境')
  }

  private validateBypassEntries(bypass: string[]) {
    const unsafe = bypass.find((item) => item !== '<local>' && /["&|<>^`]/.test(item))
    if (unsafe) {
      throw new Error(`Invalid bypass entry: ${unsafe}`)
    }
  }

  private async execMutatingCommand(command: string) {
    const output = await this.deps.execCommand(command, 10000)
    if (commandOutputLooksFailed(output)) {
      throw new Error(output.trim())
    }

    return output
  }

  private async setWinHttpProxy(target: ProxyDoctorTarget, bypass: string[]) {
    this.validateBypassEntries(bypass)
    const bypassList = bypass.filter(Boolean).join(';')
    return this.execMutatingCommand(`netsh winhttp set proxy proxy-server="${target.winInetServer}" bypass-list="${bypassList}"`)
  }

  private async resetWinHttpProxy() {
    return this.execMutatingCommand('netsh winhttp reset proxy')
  }

  private async setUserProxyEnv(target: ProxyDoctorTarget) {
    const script = `
$ErrorActionPreference = 'Stop'
${PROXY_DOCTOR_PROXY_KEYS.map((key) => `[System.Environment]::SetEnvironmentVariable('${key}', '${escapePowerShellString(target.envValue)}', 'User')`).join('\n')}
${PROXY_DOCTOR_NO_PROXY_KEYS.map((key) => `[System.Environment]::SetEnvironmentVariable('${key}', '${PROXY_DOCTOR_DEFAULT_NO_PROXY}', 'User')`).join('\n')}
Write-Output 'ok'
`
    return this.deps.execPowerShellEncoded(script)
  }

  private async clearUserProxyEnv() {
    const names = [...PROXY_DOCTOR_PROXY_KEYS, ...PROXY_DOCTOR_NO_PROXY_KEYS]
    const script = `
$ErrorActionPreference = 'Stop'
${names.map((key) => `[System.Environment]::SetEnvironmentVariable('${key}', $null, 'User')`).join('\n')}
Write-Output 'ok'
`
    return this.deps.execPowerShellEncoded(script)
  }

  private async setGitProxy(target: ProxyDoctorTarget) {
    await this.execMutatingCommand(`git config --global http.proxy ${target.envValue}`)
    await this.execMutatingCommand(`git config --global https.proxy ${target.envValue}`)
  }

  private async clearGitProxy() {
    await this.clearGitProxyKey('http.proxy')
    await this.clearGitProxyKey('https.proxy')
  }

  private async clearGitProxyKey(key: 'http.proxy' | 'https.proxy') {
    try {
      await this.execMutatingCommand(`git config --global --unset ${key}`)
    } catch (error) {
      if (isAbsentGitConfigError(error)) {
        return
      }

      throw error
    }
  }

  private async setNpmProxy(target: ProxyDoctorTarget) {
    await this.execMutatingCommand(`npm config set proxy ${target.envValue}`)
    await this.execMutatingCommand(`npm config set https-proxy ${target.envValue}`)
  }

  private async clearNpmProxy() {
    await this.execMutatingCommand('npm config delete proxy')
    await this.execMutatingCommand('npm config delete https-proxy')
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
Write-Output '${LOCAL_PROXY_JSON_START}'
$result | ConvertTo-Json -Compress
Write-Output '${LOCAL_PROXY_JSON_END}'
`
      const parsed = this.parseJsonBetweenMarkers<{
        enabled: boolean
        server: string
        override: string
        autoConfigUrl: string | null
      }>(await this.deps.execPowerShellEncoded(script), LOCAL_PROXY_JSON_START, LOCAL_PROXY_JSON_END)
      if (!parsed) {
        return { success: false, error: '无法读取系统代理状态' }
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
      const output = await this.deps.execPowerShellEncoded(script)
      if (output.trim() !== 'ok') {
        return { success: false, error: '代理设置应用失败' }
      }
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
      const output = await this.deps.execPowerShellEncoded(script)
      if (output.trim() !== 'ok') {
        return { success: false, error: '代理设置应用失败' }
      }
      return this.getStatus()
    } catch (error) {
      logger.error('[LocalProxyService] disable failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  openSystemSettings(): IpcResponse {
    try {
      const child = this.deps.spawn('cmd.exe', ['/c', 'start', '', 'ms-settings:network-proxy'], {
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

  async doctorScan(targetInput: string): Promise<IpcResponse<ProxyDoctorSnapshot>> {
    try {
      const target = normalizeProxyDoctorTarget(targetInput)
      const [portOpen, wininet, winhttp, env, git, npm] = await Promise.all([
        this.deps.connectToPort(target.host, target.port),
        this.buildWinInetLayer(target),
        this.buildWinHttpLayer(target),
        this.buildEnvLayer(target),
        this.buildToolLayer('git', target),
        this.buildToolLayer('npm', target)
      ])
      const layers = [
        wininet,
        winhttp,
        env,
        git,
        npm,
        this.buildCurrentProcessLayer(target),
        this.buildCodexLayer()
      ]
      const generatedAt = new Date().toISOString()
      const log = ['扫描完成']
      const summary = summarizeProxyDoctorLayers(layers)
      const snapshotWithoutReport = {
        target,
        summary,
        portOpen,
        generatedAt,
        layers,
        log
      }
      const snapshot: ProxyDoctorSnapshot = {
        ...snapshotWithoutReport,
        reportText: buildProxyDoctorReport(snapshotWithoutReport)
      }

      return { success: true, data: snapshot }
    } catch (error) {
      logger.error('[LocalProxyService] doctorScan failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async doctorProbe(targetInput: string): Promise<IpcResponse<ProxyDoctorProbeResult>> {
    try {
      const target = normalizeProxyDoctorTarget(targetInput)
      const [port, proxy] = await Promise.all([
        this.deps.measurePortLatency(target.host, target.port),
        this.deps.probeProxyRequest(target)
      ])

      return {
        success: true,
        data: {
          target,
          generatedAt: new Date().toISOString(),
          testUrl: PROXY_DOCTOR_TEST_URL,
          port,
          proxy
        }
      }
    } catch (error) {
      logger.error('[LocalProxyService] doctorProbe failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async doctorApplyAll(request: { target: string; bypass: string[] }): Promise<IpcResponse<ProxyDoctorSnapshot>> {
    try {
      const target = normalizeProxyDoctorTarget(request.target)
      const bypass = request.bypass || []
      this.validateBypassEntries(bypass)
      const winInetResult = await this.setConfig({
        host: target.host,
        port: target.port,
        protocol: target.protocol === 'socks5' ? 'socks5' : 'http',
        bypass
      })
      if (!winInetResult.success) {
        return { success: false, error: winInetResult.error }
      }

      await this.setWinHttpProxy(target, bypass)
      await this.setUserProxyEnv(target)
      await this.setGitProxy(target)
      await this.setNpmProxy(target)

      return this.doctorScan(target.url)
    } catch (error) {
      logger.error('[LocalProxyService] doctorApplyAll failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async doctorClearAll(): Promise<IpcResponse> {
    try {
      const winInetResult = await this.disable()
      if (!winInetResult.success) {
        return { success: false, error: winInetResult.error }
      }

      await this.resetWinHttpProxy()
      await this.clearUserProxyEnv()
      await this.clearGitProxy()
      await this.clearNpmProxy()

      return { success: true }
    } catch (error) {
      logger.error('[LocalProxyService] doctorClearAll failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async doctorFixLayer(layerId: ProxyDoctorLayerId, targetInput: string, bypass: string[] = []): Promise<IpcResponse> {
    try {
      const target = normalizeProxyDoctorTarget(targetInput)
      if (layerId === 'wininet') {
        return this.setConfig({
          host: target.host,
          port: target.port,
          protocol: target.protocol === 'socks5' ? 'socks5' : 'http',
          bypass
        })
      }

      if (layerId === 'winhttp') {
        await this.setWinHttpProxy(target, bypass)
      } else if (layerId === 'env') {
        await this.setUserProxyEnv(target)
      } else if (layerId === 'git') {
        await this.setGitProxy(target)
      } else if (layerId === 'npm') {
        await this.setNpmProxy(target)
      }

      return { success: true }
    } catch (error) {
      logger.error('[LocalProxyService] doctorFixLayer failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async doctorClearLayer(layerId: ProxyDoctorLayerId): Promise<IpcResponse> {
    try {
      if (layerId === 'wininet') {
        return this.disable()
      }

      if (layerId === 'winhttp') {
        await this.resetWinHttpProxy()
      } else if (layerId === 'env') {
        await this.clearUserProxyEnv()
      } else if (layerId === 'git') {
        await this.clearGitProxy()
      } else if (layerId === 'npm') {
        await this.clearNpmProxy()
      }

      return { success: true }
    } catch (error) {
      logger.error('[LocalProxyService] doctorClearLayer failed', error)
      return { success: false, error: (error as Error).message }
    }
  }
}

export const localProxyService = new LocalProxyService()
