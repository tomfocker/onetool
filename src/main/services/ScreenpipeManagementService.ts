import { execFile, spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { IpcResponse } from '../../shared/types'
import {
  createDefaultMemoryDiaryStoredState,
  type MemoryDiaryCliStatus,
  type MemoryDiaryConfig,
  type MemoryDiaryDeploymentLog,
  type MemoryDiaryRuntimeStatus,
  type MemoryDiaryStoredState
} from '../../shared/memoryDiary'
import { storeService } from './StoreService'

type StoreServiceLike = {
  get: (key: 'memoryDiary') => MemoryDiaryStoredState | undefined
  set: (key: 'memoryDiary', value: MemoryDiaryStoredState) => void
}

type ExecFileCallback = (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void
type ExecFileLike = (
  command: string,
  args: string[],
  options: { windowsHide: boolean },
  callback: ExecFileCallback
) => void

type SpawnLike = typeof spawn
type FetchResponseLike = {
  ok: boolean
  status: number
  statusText?: string
  json: () => Promise<unknown>
}
type FetchLike = (
  url: string,
  options?: { headers?: Record<string, string> }
) => Promise<FetchResponseLike>

type ScreenpipeManagementServiceDependencies = {
  storeService?: StoreServiceLike
  execFile?: ExecFileLike
  spawn?: SpawnLike
  fetch?: FetchLike | null
  now?: () => Date
  createId?: () => string
}

type ScreenpipeHealthPayload = {
  status?: unknown
  last_frame_timestamp?: unknown
  last_audio_timestamp?: unknown
  pipeline?: {
    frames_captured?: unknown
    frames_db_written?: unknown
  } | null
  ui_recorder?: {
    running?: unknown
    events_inserted?: unknown
    last_event_at?: unknown
  } | null
}

type ScreenpipeHealthResult =
  | { reachable: true, payload: ScreenpipeHealthPayload }
  | { reachable: false, message: string }

const DEFAULT_SCREENPIPE_COMMAND = 'screenpipe'
const SCREENPIPE_NPM_PACKAGE = 'screenpipe@latest'
const SCREENPIPE_NPM_REGISTRY = 'https://registry.npmjs.org'
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const SCREENPIPE_WINDOWS_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
const SCREENPIPE_RUNTIME_LOG_NOISE = [
  'screenpipe_engine::frame_linker_actor',
  'content dedup:',
  'event_driven_capture',
  'hot_frame_cache',
  'wgc_capture'
]

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }

  return String(error)
}

function isMissingExecutableError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: unknown }).code === 'ENOENT'
  }

  return toErrorMessage(error).includes('ENOENT')
}

function formatScreenpipeErrorMessage(error: unknown, executablePath: string): string {
  if (!isMissingExecutableError(error)) {
    return toErrorMessage(error)
  }

  if (executablePath === DEFAULT_SCREENPIPE_COMMAND) {
    return '找不到 ScreenPipe CLI。请安装 ScreenPipe CLI，或在管理面板填写 screenpipe.exe 路径。'
  }

  return `找不到 ScreenPipe CLI：${executablePath}。请确认 screenpipe.exe 路径有效。`
}

function isUnsupportedRecordSubcommand(output: string): boolean {
  const normalizedOutput = output.toLowerCase()
  return normalizedOutput.includes('unrecognized subcommand') && normalizedOutput.includes('record')
}

function normalizeProcessOutput(output: string | Buffer): string {
  return String(output).trim()
}

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getNumberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  return 0
}

function shouldStoreScreenpipeOutput(message: string): boolean {
  const normalizedMessage = message.toLowerCase()
  return !SCREENPIPE_RUNTIME_LOG_NOISE.some((pattern) => normalizedMessage.includes(pattern))
}

function resolveGlobalScreenpipeExecutablePath(npmPrefix: string): string {
  const trimmedPrefix = npmPrefix.trim()
  if (process.platform === 'win32') {
    const windowsBinaryPath = resolveWindowsScreenpipeBinaryPath(trimmedPrefix)
    if (fs.existsSync(windowsBinaryPath)) {
      return windowsBinaryPath
    }

    return path.join(trimmedPrefix, 'screenpipe.cmd')
  }

  return path.join(trimmedPrefix, 'bin', 'screenpipe')
}

function resolveWindowsScreenpipeBinaryPath(npmPrefix: string): string {
  return path.join(
    npmPrefix,
    'node_modules',
    'screenpipe',
    'node_modules',
    '@screenpipe',
    `cli-win32-${SCREENPIPE_WINDOWS_ARCH}`,
    'bin',
    'screenpipe.exe'
  )
}

function normalizeWindowsScreenpipeExecutablePath(executablePath: string): string {
  if (process.platform !== 'win32' || path.basename(executablePath).toLowerCase() !== 'screenpipe.cmd') {
    return executablePath
  }

  const windowsBinaryPath = resolveWindowsScreenpipeBinaryPath(path.dirname(executablePath))
  return fs.existsSync(windowsBinaryPath) ? windowsBinaryPath : executablePath
}

function getExplicitApiPort(apiUrl: string): string | null {
  try {
    const port = new URL(apiUrl).port
    if (!/^\d+$/.test(port)) {
      return null
    }

    const portNumber = Number(port)
    return portNumber > 0 && portNumber <= 65535 ? port : null
  } catch {
    return null
  }
}

function resolveScreenpipeHealthUrl(apiUrl: string): string {
  const healthUrl = new URL(apiUrl)
  healthUrl.pathname = '/health'
  healthUrl.search = ''
  healthUrl.hash = ''
  return healthUrl.toString()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ScreenpipeManagementService {
  private readonly store: StoreServiceLike
  private readonly execFileFn: ExecFileLike
  private readonly spawnFn: SpawnLike
  private readonly fetchFn: FetchLike | null
  private readonly now: () => Date
  private readonly createId: () => string
  private managedProcess: ChildProcess | null = null

  constructor(dependencies: ScreenpipeManagementServiceDependencies = {}) {
    this.store = dependencies.storeService ?? storeService
    this.execFileFn = dependencies.execFile ?? (execFile as ExecFileLike)
    this.spawnFn = dependencies.spawn ?? spawn
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch
    this.fetchFn = dependencies.fetch === undefined
      ? (typeof globalFetch === 'function' ? globalFetch.bind(globalThis) : null)
      : dependencies.fetch
    this.now = dependencies.now ?? (() => new Date())
    this.createId = dependencies.createId ?? (() => `${Date.now()}-${Math.random().toString(16).slice(2)}`)
  }

  getStoredState(): IpcResponse<MemoryDiaryStoredState> {
    return {
      success: true,
      data: this.getState()
    }
  }

  async getCliStatus(): Promise<IpcResponse<MemoryDiaryCliStatus>> {
    const executablePath = this.getScreenpipeExecutablePath()

    try {
      const { stdout } = await this.execScreenpipe(['--version'], executablePath)
      const version = normalizeProcessOutput(stdout)
      return {
        success: true,
        data: {
          installed: true,
          version: version || null,
          executablePath,
          error: null
        }
      }
    } catch (error) {
      const message = formatScreenpipeErrorMessage(error, executablePath)
      this.appendLog('warning', `ScreenPipe CLI 检测失败：${message}`)
      return {
        success: true,
        data: {
          installed: false,
          version: null,
          executablePath: null,
          error: message
        }
      }
    }
  }

  async getAuthToken(): Promise<IpcResponse<{ apiKey: string }>> {
    try {
      const { stdout } = await this.execScreenpipe(['auth', 'token'])
      const apiKey = normalizeProcessOutput(stdout)
      if (!apiKey) {
        throw new Error('ScreenPipe 没有返回可用的 API token')
      }

      const state = this.getState()
      this.saveState({
        ...state,
        config: {
          ...state.config,
          apiKey
        }
      })
      this.appendLog('success', '已保存 ScreenPipe API token')
      return {
        success: true,
        data: { apiKey }
      }
    } catch (error) {
      const message = toErrorMessage(error)
      this.appendLog('error', `获取 ScreenPipe API token 失败：${message}`)
      return {
        success: false,
        error: message
      }
    }
  }

  async installLatest(): Promise<IpcResponse<MemoryDiaryStoredState>> {
    this.appendLog('info', '正在安装或更新 ScreenPipe CLI')

    try {
      const npmPrefix = await this.getNpmGlobalPrefix()
      await this.installScreenpipePackage()
      const screenpipeExecutablePath = resolveGlobalScreenpipeExecutablePath(npmPrefix)
      const { stdout } = await this.execScreenpipe(['--version'], screenpipeExecutablePath)
      const version = normalizeProcessOutput(stdout)
      const state = this.getState()
      const nextState = {
        ...state,
        config: {
          ...state.config,
          screenpipeExecutablePath
        }
      }

      this.saveState(nextState)
      this.appendLog('success', `ScreenPipe CLI 已安装：${version || screenpipeExecutablePath}`)
      return this.getStoredState()
    } catch (error) {
      const message = toErrorMessage(error)
      this.appendLog('error', `ScreenPipe CLI 安装失败：${message}`)
      return {
        success: false,
        error: message,
        data: this.getState()
      }
    }
  }

  async start(): Promise<IpcResponse<MemoryDiaryRuntimeStatus>> {
    if (this.managedProcess) {
      const status = await this.inspectRuntimeStatus()
      return {
        success: true,
        data: status.apiReachable ? status : this.createRuntimeStatus('running', 'ScreenPipe 已由 onetool 启动')
      }
    }

    try {
      const existingStatus = await this.inspectRuntimeStatus()
      if (existingStatus.apiReachable) {
        this.appendLog('success', '检测到 ScreenPipe API 已运行')
        return {
          success: true,
          data: existingStatus
        }
      }

      const executablePath = this.getScreenpipeExecutablePath()
      const startArgs = await this.getScreenpipeStartArgs(executablePath)
      const child = this.spawnFn(executablePath, startArgs, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.managedProcess = child
      this.appendLog('info', '正在启动 ScreenPipe 采集进程')

      child.stdout?.on('data', (chunk) => {
        const message = normalizeProcessOutput(chunk)
        if (message && shouldStoreScreenpipeOutput(message)) {
          this.appendLog('info', message)
        }
      })
      child.stderr?.on('data', (chunk) => {
        const message = normalizeProcessOutput(chunk)
        if (message && shouldStoreScreenpipeOutput(message)) {
          this.appendLog('warning', message)
        }
      })
      child.on('error', (error) => {
        const message = formatScreenpipeErrorMessage(error, executablePath)
        this.managedProcess = null
        this.appendLog('error', `ScreenPipe 采集进程启动失败：${message}`)
      })
      child.on('close', (code) => {
        this.managedProcess = null
        this.appendLog('info', `ScreenPipe 采集进程已退出，退出码：${code ?? 'unknown'}`)
      })

      return {
        success: true,
        data: await this.waitForRuntimeStatus()
      }
    } catch (error) {
      const executablePath = this.getScreenpipeExecutablePath()
      const message = formatScreenpipeErrorMessage(error, executablePath)
      this.managedProcess = null
      this.appendLog('error', `启动 ScreenPipe 失败：${message}`)
      return {
        success: false,
        error: message,
        data: this.createRuntimeStatus('error', message)
      }
    }
  }

  async stop(): Promise<IpcResponse<MemoryDiaryRuntimeStatus>> {
    if (!this.managedProcess) {
      const message = '当前没有由 onetool 托管的 ScreenPipe 进程'
      this.appendLog('warning', message)
      return {
        success: false,
        error: message,
        data: this.createRuntimeStatus('external-running', message)
      }
    }

    try {
      this.managedProcess.kill()
      this.managedProcess = null
      this.appendLog('success', '已停止由 onetool 启动的 ScreenPipe 采集进程')
      return {
        success: true,
        data: this.createRuntimeStatus('stopped', 'ScreenPipe 已停止')
      }
    } catch (error) {
      const message = toErrorMessage(error)
      this.appendLog('error', `停止 ScreenPipe 失败：${message}`)
      return {
        success: false,
        error: message,
        data: this.createRuntimeStatus('error', message)
      }
    }
  }

  async updateConfig(updates: Partial<MemoryDiaryConfig>): Promise<IpcResponse<MemoryDiaryStoredState>> {
    const state = this.getState()
    const nextState = {
      ...state,
      config: {
        ...state.config,
        ...updates
      }
    }

    this.saveState(nextState)
    this.appendLog('success', '已更新 ScreenPipe 日报设置')
    return this.getStoredState()
  }

  async getRuntimeStatus(): Promise<IpcResponse<MemoryDiaryRuntimeStatus>> {
    return {
      success: true,
      data: await this.inspectRuntimeStatus()
    }
  }

  getLogs(): IpcResponse<MemoryDiaryDeploymentLog[]> {
    return {
      success: true,
      data: this.getState().deploymentLogs
    }
  }

  private getState(): MemoryDiaryStoredState {
    const storedState = this.store.get('memoryDiary')
    return {
      ...createDefaultMemoryDiaryStoredState(),
      ...(storedState || {}),
      config: {
        ...createDefaultMemoryDiaryStoredState().config,
        ...(storedState?.config || {})
      },
      diaryHistory: Array.isArray(storedState?.diaryHistory) ? storedState.diaryHistory : [],
      deploymentLogs: Array.isArray(storedState?.deploymentLogs) ? storedState.deploymentLogs : []
    }
  }

  private createRuntimeStatus(
    state: MemoryDiaryRuntimeStatus['state'],
    message: string | null
  ): MemoryDiaryRuntimeStatus {
    const storedState = this.getState()
    return {
      state,
      apiReachable: false,
      apiUrl: storedState.config.apiUrl,
      apiKeyConfigured: storedState.config.apiKey.trim().length > 0,
      lastCaptureAt: null,
      todayItemCount: 0,
      contentTypeCounts: {
        accessibility: 0,
        ocr: 0,
        audio: 0,
        input: 0
      },
      message
    }
  }

  private async inspectRuntimeStatus(): Promise<MemoryDiaryRuntimeStatus> {
    const storedState = this.getState()
    const health = await this.readScreenpipeHealth(storedState.config)
    if (!health.reachable) {
      const state: MemoryDiaryRuntimeStatus['state'] = this.managedProcess ? 'starting' : 'stopped'
      return this.createRuntimeStatus(state, health.message)
    }

    const { payload } = health
    const framesWritten = getNumberValue(payload.pipeline?.frames_db_written)
    const eventsInserted = getNumberValue(payload.ui_recorder?.events_inserted)
    const statusText = getStringValue(payload.status) || 'reachable'

    return {
      state: this.managedProcess ? 'running' : 'external-running',
      apiReachable: true,
      apiUrl: storedState.config.apiUrl,
      apiKeyConfigured: storedState.config.apiKey.trim().length > 0,
      lastCaptureAt:
        getStringValue(payload.last_frame_timestamp) ||
        getStringValue(payload.ui_recorder?.last_event_at) ||
        getStringValue(payload.last_audio_timestamp),
      todayItemCount: framesWritten + eventsInserted,
      contentTypeCounts: {
        accessibility: eventsInserted,
        ocr: framesWritten,
        audio: 0,
        input: 0
      },
      message: `ScreenPipe API ${statusText}`
    }
  }

  private async readScreenpipeHealth(config: MemoryDiaryConfig): Promise<ScreenpipeHealthResult> {
    if (!this.fetchFn) {
      return {
        reachable: false,
        message: '当前运行环境没有可用的 ScreenPipe 健康检查能力'
      }
    }

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json'
      }
      const apiKey = config.apiKey.trim()
      if (apiKey) {
        headers['x-api-key'] = apiKey
      }

      const response = await this.fetchFn(resolveScreenpipeHealthUrl(config.apiUrl), { headers })
      if (!response.ok) {
        const statusText = response.statusText ? ` ${response.statusText}` : ''
        return {
          reachable: false,
          message: `ScreenPipe API 返回 ${response.status}${statusText}`
        }
      }

      return {
        reachable: true,
        payload: await response.json() as ScreenpipeHealthPayload
      }
    } catch (error) {
      return {
        reachable: false,
        message: `ScreenPipe API 暂不可达：${toErrorMessage(error)}`
      }
    }
  }

  private async waitForRuntimeStatus(timeoutMs = 12000): Promise<MemoryDiaryRuntimeStatus> {
    if (!this.fetchFn) {
      return this.createRuntimeStatus('starting', 'ScreenPipe 正在启动')
    }

    const deadline = Date.now() + timeoutMs
    let status = await this.inspectRuntimeStatus()
    while (!status.apiReachable && Date.now() < deadline) {
      await delay(500)
      status = await this.inspectRuntimeStatus()
    }

    return status.apiReachable ? status : this.createRuntimeStatus('starting', status.message || 'ScreenPipe 正在启动')
  }

  private getScreenpipeExecutablePath(): string {
    const configuredPath = this.getState().config.screenpipeExecutablePath.trim()
    return configuredPath.length > 0
      ? normalizeWindowsScreenpipeExecutablePath(configuredPath)
      : DEFAULT_SCREENPIPE_COMMAND
  }

  private getLegacyScreenpipeRuntimeArgs(): string[] {
    const config = this.getState().config
    const args = ['--fps', '1', '--ocr-engine', 'windows-native', '--disable-telemetry']
    if (!config.includeAudio) {
      args.push('--disable-audio')
    }

    return args
  }

  private getModernScreenpipeRecordArgs(): string[] {
    const config = this.getState().config
    const args = ['--disable-telemetry']
    const port = getExplicitApiPort(config.apiUrl)
    if (port) {
      args.push('--port', port)
    }
    if (!config.includeAudio) {
      args.push('--disable-audio')
    }

    return args
  }

  private getNpmGlobalPrefix(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.execFileFn(NPM_COMMAND, ['prefix', '-g'], { windowsHide: true }, (error, stdout) => {
        if (error) {
          reject(new Error(`npm 不可用：${toErrorMessage(error)}`))
          return
        }

        const prefix = normalizeProcessOutput(stdout)
        if (!prefix) {
          reject(new Error('npm 没有返回全局安装目录'))
          return
        }

        resolve(prefix)
      })
    })
  }

  private installScreenpipePackage(): Promise<void> {
    return new Promise((resolve, reject) => {
      let latestOutput = ''
      const child = this.spawnFn(
        NPM_COMMAND,
        ['install', '-g', SCREENPIPE_NPM_PACKAGE, `--registry=${SCREENPIPE_NPM_REGISTRY}`],
        {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
        }
      )

      child.stdout?.on('data', (chunk) => {
        const message = normalizeProcessOutput(chunk)
        if (message) {
          latestOutput = message
          this.appendLog('info', message)
        }
      })
      child.stderr?.on('data', (chunk) => {
        const message = normalizeProcessOutput(chunk)
        if (message) {
          latestOutput = message
          this.appendLog('warning', message)
        }
      })
      child.on('error', (error) => {
        reject(error)
      })
      child.on('close', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        const detail = latestOutput ? `：${latestOutput}` : ''
        reject(new Error(`安装失败，退出码：${code ?? 'unknown'}${detail}`))
      })
    })
  }

  private async getScreenpipeStartArgs(executablePath: string): Promise<string[]> {
    const supportsRecordSubcommand = await this.screenpipeSupportsRecordSubcommand(executablePath)
    if (supportsRecordSubcommand) {
      return ['record', ...this.getModernScreenpipeRecordArgs()]
    }

    this.appendLog('info', '检测到旧版 ScreenPipe CLI，将使用兼容启动方式')
    return this.getLegacyScreenpipeRuntimeArgs()
  }

  private screenpipeSupportsRecordSubcommand(executablePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.execFileFn(executablePath, ['record', '--help'], { windowsHide: true }, (error, stdout, stderr) => {
        if (!error) {
          resolve(true)
          return
        }

        if (isMissingExecutableError(error)) {
          reject(error)
          return
        }

        const output = [
          toErrorMessage(error),
          normalizeProcessOutput(stdout),
          normalizeProcessOutput(stderr)
        ].join('\n')

        if (isUnsupportedRecordSubcommand(output)) {
          resolve(false)
          return
        }

        reject(error)
      })
    })
  }

  private execScreenpipe(
    args: string[],
    executablePath = this.getScreenpipeExecutablePath()
  ): Promise<{ stdout: string | Buffer, stderr: string | Buffer }> {
    return new Promise((resolve, reject) => {
      this.execFileFn(executablePath, args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }

        resolve({ stdout, stderr })
      })
    })
  }

  private appendLog(level: MemoryDiaryDeploymentLog['level'], message: string) {
    const state = this.getState()
    const log: MemoryDiaryDeploymentLog = {
      id: this.createId(),
      timestamp: this.now().toISOString(),
      level,
      message
    }

    this.saveState({
      ...state,
      deploymentLogs: [log, ...state.deploymentLogs].slice(0, 80)
    })
  }

  private saveState(state: MemoryDiaryStoredState) {
    this.store.set('memoryDiary', state)
  }
}

export const screenpipeManagementService = new ScreenpipeManagementService()
