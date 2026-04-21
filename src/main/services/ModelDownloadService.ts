import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { app, shell } from 'electron'
import { EventEmitter } from 'events'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import type { IpcResponse } from '../../shared/types'
import {
  createDefaultModelDownloadState,
  trimModelDownloadLogs,
  type ModelDownloadLogEntry,
  type ModelDownloadLogLevel,
  type ModelDownloadRequest,
  type ModelDownloadRuntimeState,
  type ModelDownloadState
} from '../../shared/modelDownload'
import { processRegistry } from './ProcessRegistry'
import { logger } from '../utils/logger'

const JSON_PREFIX = '__ONETOOL_JSON__'
const LOG_LIMIT = 400

type ServiceDependencies = {
  runtimeRoot?: string
  pathExists?: (targetPath: string) => boolean
  spawnProcess?: typeof spawn
  shellModule?: Pick<typeof shell, 'openPath'>
  appModule?: Pick<typeof app, 'isPackaged' | 'getPath'>
  mkdir?: typeof fsPromises.mkdir
  createId?: () => string
  now?: () => number
}

type StructuredLogPayload = {
  event: 'log' | 'completed' | 'failed'
  level?: ModelDownloadLogLevel
  message: string
  outputPath?: string
}

export class ModelDownloadService {
  private readonly events = new EventEmitter()
  private readonly runtimeRootOverride?: string
  private readonly pathExists: (targetPath: string) => boolean
  private readonly spawnProcess: typeof spawn
  private readonly shellModule: Pick<typeof shell, 'openPath'>
  private readonly appModule: Pick<typeof app, 'isPackaged' | 'getPath'>
  private readonly mkdir: typeof fsPromises.mkdir
  private readonly createId: () => string
  private readonly now: () => number
  private state: ModelDownloadState
  private currentProcess: ChildProcessWithoutNullStreams | null = null
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private isCancelling = false

  constructor(deps: ServiceDependencies = {}) {
    this.runtimeRootOverride = deps.runtimeRoot
    this.pathExists = deps.pathExists ?? fs.existsSync
    this.spawnProcess = deps.spawnProcess ?? spawn
    this.shellModule = deps.shellModule ?? shell
    this.appModule = deps.appModule ?? app
    this.mkdir = deps.mkdir ?? fsPromises.mkdir
    this.createId = deps.createId ?? (() => `model-download-${this.now()}-${Math.random().toString(16).slice(2, 8)}`)
    this.now = deps.now ?? (() => Date.now())
    this.state = createDefaultModelDownloadState(this.appModule.getPath('downloads'))
    this.refreshRuntimeState()
  }

  onStateChanged(listener: (state: ModelDownloadState) => void) {
    this.events.on('state-changed', listener)
    return () => {
      this.events.off('state-changed', listener)
    }
  }

  getState(): IpcResponse<ModelDownloadState> {
    this.refreshRuntimeState()
    return {
      success: true,
      data: this.cloneState()
    }
  }

  async startDownload(request: ModelDownloadRequest): Promise<IpcResponse<ModelDownloadState>> {
    if (this.currentProcess) {
      return { success: false, error: '已有模型下载任务在运行' }
    }

    const sanitizedRequest: ModelDownloadRequest = {
      ...request,
      repoId: request.repoId.trim(),
      filePath: request.filePath.trim(),
      savePath: request.savePath.trim(),
      hfToken: request.hfToken.trim()
    }

    if (!sanitizedRequest.repoId) {
      return { success: false, error: '请输入仓库 ID' }
    }

    if (!sanitizedRequest.savePath) {
      return { success: false, error: '请选择保存目录' }
    }

    const runtime = this.refreshRuntimeState()
    if (!runtime.ready || !runtime.pythonPath || !runtime.scriptPath || !runtime.resourceRoot) {
      return { success: false, error: '模型下载运行时缺失，请检查打包资源是否完整' }
    }

    await this.mkdir(sanitizedRequest.savePath, { recursive: true })

    const args = [
      '-u',
      runtime.scriptPath,
      '--platform',
      sanitizedRequest.platform,
      '--repo-id',
      sanitizedRequest.repoId,
      '--save-path',
      sanitizedRequest.savePath
    ]

    if (sanitizedRequest.filePath) {
      args.push('--file-path', sanitizedRequest.filePath)
    }

    if (sanitizedRequest.hfToken) {
      args.push('--hf-token', sanitizedRequest.hfToken)
    }

    if (sanitizedRequest.useHfMirror) {
      args.push('--hf-mirror')
    }

    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    this.isCancelling = false
    this.state = {
      ...this.state,
      status: 'running',
      currentRequest: sanitizedRequest,
      logs: [],
      lastError: null,
      lastOutputPath: null,
      runtime
    }
    this.appendLog('info', `已启动 ${sanitizedRequest.platform} 下载任务`)

    try {
      const child = this.spawnProcess(runtime.pythonPath, args, {
        cwd: runtime.resourceRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: 'pipe'
      })

      this.currentProcess = child
      processRegistry.register(child)

      child.stdout.on('data', (chunk: Buffer | string) => {
        this.handleStreamChunk('stdout', String(chunk))
      })

      child.stderr.on('data', (chunk: Buffer | string) => {
        this.handleStreamChunk('stderr', String(chunk))
      })

      child.on('error', (error) => {
        this.state = {
          ...this.state,
          status: 'error',
          currentRequest: null,
          lastError: error.message
        }
        this.currentProcess = null
        this.appendLog('error', error.message)
      })

      child.on('close', (code, signal) => {
        this.flushBuffers()
        const cancelled = this.isCancelling || signal !== null

        if (cancelled) {
          this.state = {
            ...this.state,
            status: 'cancelled',
            currentRequest: null,
            lastError: null
          }
          this.appendLog('info', '下载已取消')
        } else if (code === 0) {
          this.state = {
            ...this.state,
            status: 'success',
            currentRequest: null,
            lastError: null
          }
          if (!this.state.logs.some((item) => item.level === 'success')) {
            this.appendLog('success', '下载完成')
          } else {
            this.emitState()
          }
        } else {
          const errorMessage = this.state.lastError ?? `下载进程退出码异常: ${code ?? 'unknown'}`
          this.state = {
            ...this.state,
            status: 'error',
            currentRequest: null,
            lastError: errorMessage
          }
          this.appendLog('error', errorMessage)
        }

        this.currentProcess = null
        this.isCancelling = false
      })
    } catch (error) {
      this.state = {
        ...this.state,
        status: 'error',
        currentRequest: null,
        lastError: (error as Error).message
      }
      this.currentProcess = null
      this.appendLog('error', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }

    return {
      success: true,
      data: this.cloneState()
    }
  }

  async cancelDownload(): Promise<IpcResponse<ModelDownloadState>> {
    if (!this.currentProcess) {
      return {
        success: false,
        error: '当前没有正在运行的下载任务'
      }
    }

    this.isCancelling = true
    this.currentProcess.kill('SIGTERM')

    return {
      success: true,
      data: this.cloneState()
    }
  }

  async openPath(targetPath?: string): Promise<IpcResponse<{ targetPath: string }>> {
    const resolvedPath = targetPath?.trim() || this.state.lastOutputPath || this.state.currentRequest?.savePath || this.state.defaultSavePath
    const result = await this.shellModule.openPath(resolvedPath)

    if (result) {
      return { success: false, error: result }
    }

    return {
      success: true,
      data: {
        targetPath: resolvedPath
      }
    }
  }

  private refreshRuntimeState(): ModelDownloadRuntimeState {
    const resourceRoot = this.runtimeRootOverride
      ? path.resolve(this.runtimeRootOverride)
      : this.appModule.isPackaged
        ? path.join(process.resourcesPath, 'model-download')
        : path.resolve(__dirname, '../../../resources/model-download')

    const pythonPath = path.join(resourceRoot, 'python', 'python.exe')
    const scriptPath = path.join(resourceRoot, 'downloader.py')
    const ready = this.pathExists(pythonPath) && this.pathExists(scriptPath)

    this.state = {
      ...this.state,
      runtime: {
        ready,
        resourceRoot,
        pythonPath,
        scriptPath
      }
    }

    return this.state.runtime
  }

  private handleStreamChunk(channel: 'stdout' | 'stderr', chunk: string) {
    const next = `${channel === 'stdout' ? this.stdoutBuffer : this.stderrBuffer}${chunk.replace(/\r/g, '\n')}`
    const lines = next.split('\n')
    const remainder = lines.pop() ?? ''

    if (channel === 'stdout') {
      this.stdoutBuffer = remainder
    } else {
      this.stderrBuffer = remainder
    }

    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => this.handleOutputLine(line))
  }

  private flushBuffers() {
    const pending = [this.stdoutBuffer, this.stderrBuffer].map((line) => line.trim()).filter(Boolean)
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    pending.forEach((line) => this.handleOutputLine(line))
  }

  private handleOutputLine(line: string) {
    if (line.startsWith(JSON_PREFIX)) {
      try {
        const payload = JSON.parse(line.slice(JSON_PREFIX.length)) as StructuredLogPayload
        if (payload.event === 'completed') {
          this.state = {
            ...this.state,
            lastOutputPath: payload.outputPath ?? this.state.lastOutputPath,
            lastError: null
          }
          this.appendLog('success', payload.message)
          return
        }

        if (payload.event === 'failed') {
          this.state = {
            ...this.state,
            lastError: payload.message
          }
          this.appendLog('error', payload.message)
          return
        }

        this.appendLog(payload.level ?? 'info', payload.message)
        return
      } catch (error) {
        logger.warn('Failed to parse model download structured log', error)
      }
    }

    this.appendLog('info', line)
  }

  private appendLog(level: ModelDownloadLogLevel, message: string) {
    const entry: ModelDownloadLogEntry = {
      id: this.createId(),
      level,
      message,
      timestamp: new Date(this.now()).toISOString()
    }

    this.state = {
      ...this.state,
      logs: trimModelDownloadLogs([...this.state.logs, entry], LOG_LIMIT)
    }

    this.emitState()
  }

  private emitState() {
    this.events.emit('state-changed', this.cloneState())
  }

  private cloneState(): ModelDownloadState {
    return {
      ...this.state,
      currentRequest: this.state.currentRequest ? { ...this.state.currentRequest } : null,
      runtime: { ...this.state.runtime },
      logs: this.state.logs.map((item) => ({ ...item }))
    }
  }
}

export const modelDownloadService = new ModelDownloadService()
