import { execFile, spawn, type ChildProcess } from 'child_process'
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

type ScreenpipeManagementServiceDependencies = {
  storeService?: StoreServiceLike
  execFile?: ExecFileLike
  spawn?: SpawnLike
  now?: () => Date
  createId?: () => string
}

const DEFAULT_SCREENPIPE_COMMAND = 'screenpipe'

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

export class ScreenpipeManagementService {
  private readonly store: StoreServiceLike
  private readonly execFileFn: ExecFileLike
  private readonly spawnFn: SpawnLike
  private readonly now: () => Date
  private readonly createId: () => string
  private managedProcess: ChildProcess | null = null

  constructor(dependencies: ScreenpipeManagementServiceDependencies = {}) {
    this.store = dependencies.storeService ?? storeService
    this.execFileFn = dependencies.execFile ?? (execFile as ExecFileLike)
    this.spawnFn = dependencies.spawn ?? spawn
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

  async start(): Promise<IpcResponse<MemoryDiaryRuntimeStatus>> {
    if (this.managedProcess) {
      return {
        success: true,
        data: this.createRuntimeStatus('running', 'ScreenPipe 已由 onetool 启动')
      }
    }

    try {
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
        if (message) {
          this.appendLog('info', message)
        }
      })
      child.stderr?.on('data', (chunk) => {
        const message = normalizeProcessOutput(chunk)
        if (message) {
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
        data: this.createRuntimeStatus('starting', 'ScreenPipe 正在启动')
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

  private getScreenpipeExecutablePath(): string {
    const configuredPath = this.getState().config.screenpipeExecutablePath.trim()
    return configuredPath.length > 0 ? configuredPath : DEFAULT_SCREENPIPE_COMMAND
  }

  private async getScreenpipeStartArgs(executablePath: string): Promise<string[]> {
    const supportsRecordSubcommand = await this.screenpipeSupportsRecordSubcommand(executablePath)
    if (supportsRecordSubcommand) {
      return ['record']
    }

    this.appendLog('info', '检测到旧版 ScreenPipe CLI，将使用兼容启动方式')
    return []
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
