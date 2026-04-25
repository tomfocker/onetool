import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { app, shell } from 'electron'
import { EventEmitter } from 'events'
import fs from 'fs'
import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import type { IpcResponse } from '../../shared/types'
import type {
  TableOcrInstallStatus,
  TableOcrLogLevel,
  TableOcrRecognizeRequest,
  TableOcrRecognizeResult,
  TableOcrRuntimeStatus
} from '../../shared/tableOcr'
import { trimTableOcrLogs } from '../../shared/tableOcr'
import { processRegistry } from './ProcessRegistry'
import { logger } from '../utils/logger'

const JSON_PREFIX = '__ONETOOL_JSON__'
const LOG_LIMIT = 400
const READY_MARKER_FILENAME = '.runtime-ready'

type ServiceDependencies = {
  runtimeRoot?: string
  userRuntimeRoot?: string
  pathExists?: (targetPath: string) => boolean
  spawnProcess?: typeof spawn
  shellModule?: Pick<typeof shell, 'openPath'>
  appModule?: Pick<typeof app, 'isPackaged' | 'getPath'>
  mkdir?: typeof fsPromises.mkdir
  copyRuntime?: typeof fsPromises.cp
  writeFileSync?: typeof fs.writeFileSync
  unlinkSync?: typeof fs.unlinkSync
  createId?: () => string
  now?: () => number
}

type StructuredPayload = {
  event: 'log' | 'completed' | 'failed'
  level?: 'info' | 'progress' | 'success' | 'error'
  message: string
  ready?: boolean
  missingPackages?: string[]
  outputPath?: string
  htmlPath?: string | null
  jsonPath?: string | null
}

type PythonRunResult = {
  success: boolean
  completed?: StructuredPayload
  failed?: StructuredPayload
  stderr: string[]
}

export class TableOcrService {
  private readonly events = new EventEmitter()
  private readonly runtimeRootOverride?: string
  private readonly userRuntimeRootOverride?: string
  private readonly pathExists: (targetPath: string) => boolean
  private readonly spawnProcess: typeof spawn
  private readonly shellModule: Pick<typeof shell, 'openPath'>
  private readonly appModule: Pick<typeof app, 'isPackaged' | 'getPath'>
  private readonly mkdir: typeof fsPromises.mkdir
  private readonly copyRuntime: typeof fsPromises.cp
  private readonly writeFileSync: typeof fs.writeFileSync
  private readonly unlinkSync: typeof fs.unlinkSync
  private readonly createId: () => string
  private readonly now: () => number
  private installStatus: TableOcrInstallStatus = 'idle'
  private logs: TableOcrRuntimeStatus['logs'] = []
  private lastError: string | null = null
  private currentInstallProcess: ChildProcessWithoutNullStreams | null = null
  private installStdoutBuffer = ''
  private installStderrBuffer = ''
  private isCancellingInstall = false

  constructor(deps: ServiceDependencies = {}) {
    this.runtimeRootOverride = deps.runtimeRoot
    this.userRuntimeRootOverride = deps.userRuntimeRoot
    this.pathExists = deps.pathExists ?? fs.existsSync
    this.spawnProcess = deps.spawnProcess ?? spawn
    this.shellModule = deps.shellModule ?? shell
    this.appModule = deps.appModule ?? app
    this.mkdir = deps.mkdir ?? fsPromises.mkdir
    this.copyRuntime = deps.copyRuntime ?? fsPromises.cp
    this.writeFileSync = deps.writeFileSync ?? fs.writeFileSync
    this.unlinkSync = deps.unlinkSync ?? fs.unlinkSync
    this.createId = deps.createId ?? (() => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`)
    this.now = deps.now ?? (() => Date.now())
  }

  onStateChanged(listener: (state: TableOcrRuntimeStatus) => void) {
    this.events.on('state-changed', listener)
    return () => {
      this.events.off('state-changed', listener)
    }
  }

  async getStatus(): Promise<IpcResponse<TableOcrRuntimeStatus>> {
    const runtime = this.refreshRuntimeState()
    if (!runtime.pythonPath || !runtime.scriptPath || runtime.missingRuntimeFiles.length > 0) {
      return { success: true, data: runtime }
    }

    try {
      const result = await this.runPython(runtime, ['--check'])
      const completed = result.completed
      return {
        success: true,
        data: {
          ...runtime,
          ready: Boolean(completed?.ready),
          missingPackages: completed?.missingPackages ?? []
        }
      }
    } catch (error) {
      logger.warn('[TableOcrService] Runtime check failed', error)
      return {
        success: true,
        data: {
          ...runtime,
          ready: false,
          missingPackages: []
        }
      }
    }
  }

  async recognize(request: TableOcrRecognizeRequest): Promise<IpcResponse<TableOcrRecognizeResult>> {
    const inputPath = request.inputPath?.trim()
    const imageDataUrl = request.imageDataUrl?.trim()

    if (!inputPath && !imageDataUrl) {
      return { success: false, error: '请选择图片后再识别表格' }
    }

    const runtime = this.refreshRuntimeState()
    if (!runtime.pythonPath || !runtime.scriptPath || runtime.missingRuntimeFiles.length > 0) {
      return { success: false, error: `表格 OCR 运行时缺失: ${runtime.missingRuntimeFiles.join(', ')}` }
    }

    const outputDirectory = request.outputDirectory?.trim() || path.join(this.appModule.getPath('downloads'), 'OneTool Table OCR')
    await this.mkdir(outputDirectory, { recursive: true })

    let tempInputPath: string | null = null
    try {
      const resolvedInputPath = inputPath || this.writeDataUrlToTempFile(imageDataUrl || '')
      tempInputPath = inputPath ? null : resolvedInputPath

      const args = ['--input', resolvedInputPath, '--output-dir', outputDirectory]
      if (request.fileName?.trim()) {
        args.push('--file-name', request.fileName.trim())
      }

      const result = await this.runPython(runtime, args)
      if (!result.success || !result.completed?.outputPath) {
        return { success: false, error: result.failed?.message || result.stderr.at(-1) || '表格识别失败' }
      }

      return {
        success: true,
        data: {
          outputPath: result.completed.outputPath,
          outputDirectory,
          htmlPath: result.completed.htmlPath ?? null,
          jsonPath: result.completed.jsonPath ?? null
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    } finally {
      if (tempInputPath && this.pathExists(tempInputPath)) {
        try {
          this.unlinkSync(tempInputPath)
        } catch (error) {
          logger.warn('[TableOcrService] Failed to remove temp input', error)
        }
      }
    }
  }

  async openPath(targetPath: string): Promise<IpcResponse<{ targetPath: string }>> {
    const result = await this.shellModule.openPath(targetPath)
    if (result) {
      return { success: false, error: result }
    }
    return { success: true, data: { targetPath } }
  }

  async prepareRuntime(mirror: 'cn' | 'default' = 'cn'): Promise<IpcResponse<TableOcrRuntimeStatus>> {
    if (this.currentInstallProcess) {
      return { success: false, error: '表格 OCR 运行时正在准备中' }
    }

    const runtime = this.refreshRuntimeState()
    if (!runtime.resourceRoot || !runtime.userRuntimeRoot || !runtime.installScriptPath) {
      return { success: false, error: '表格 OCR 运行时路径缺失' }
    }

    const resourceRoot = runtime.resourceRoot
    const userRuntimeRoot = runtime.userRuntimeRoot
    const installScriptPath = runtime.installScriptPath

    if (!this.pathExists(installScriptPath)) {
      return { success: false, error: '表格 OCR 安装脚本缺失: install_runtime.py' }
    }

    const sourcePythonPath = this.resolveSourcePythonPath(runtime)
    if (!sourcePythonPath || !this.pathExists(sourcePythonPath)) {
      return { success: false, error: '可复制的 Python 运行时缺失' }
    }

    const targetPythonDir = path.join(userRuntimeRoot, 'python')
    const targetPythonPath = path.join(targetPythonDir, 'python.exe')

    try {
      this.clearRuntimeReadyMarker(userRuntimeRoot)

      if (!this.pathExists(targetPythonPath)) {
        await this.mkdir(targetPythonDir, { recursive: true })
        await this.copyRuntime(path.dirname(sourcePythonPath), targetPythonDir, { recursive: true })
      }

      this.installStatus = 'running'
      this.logs = []
      this.lastError = null
      this.installStdoutBuffer = ''
      this.installStderrBuffer = ''
      this.isCancellingInstall = false
      this.appendLog('info', '开始准备本地表格 OCR 运行时')

      const child = this.spawnProcess(targetPythonPath, ['-u', installScriptPath, '--mirror', mirror], {
        cwd: resourceRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: 'pipe'
      }) as ChildProcessWithoutNullStreams

      this.currentInstallProcess = child
      processRegistry.register(child)

      child.stdout.on('data', (chunk) => this.handleInstallChunk('stdout', chunk))
      child.stderr.on('data', (chunk) => this.handleInstallChunk('stderr', chunk))
      child.on('error', (error) => {
        this.installStatus = 'error'
        this.currentInstallProcess = null
        this.lastError = error.message
        this.appendLog('error', error.message)
      })
      child.on('close', (code, signal) => {
        this.flushInstallBuffers()
        const cancelled = this.isCancellingInstall || signal !== null
        this.currentInstallProcess = null
        this.isCancellingInstall = false

        if (cancelled) {
          this.installStatus = 'cancelled'
          this.lastError = null
          this.appendLog('info', '运行时准备已取消')
          return
        }

        if (code === 0 && !this.lastError) {
          this.markRuntimeReady(userRuntimeRoot)
          this.installStatus = 'success'
          this.emitState()
          return
        }

        const errorMessage = this.lastError ?? `运行时准备进程退出码异常: ${code ?? 'unknown'}`
        this.installStatus = 'error'
        this.lastError = errorMessage
        this.appendLog('error', errorMessage)
      })

      return { success: true, data: this.refreshRuntimeState() }
    } catch (error) {
      this.installStatus = 'error'
      this.lastError = (error as Error).message
      this.appendLog('error', this.lastError)
      return { success: false, error: this.lastError }
    }
  }

  async cancelPrepare(): Promise<IpcResponse<TableOcrRuntimeStatus>> {
    if (!this.currentInstallProcess) {
      return { success: false, error: '当前没有正在准备的表格 OCR 运行时' }
    }

    this.isCancellingInstall = true
    this.currentInstallProcess.kill('SIGTERM')
    return { success: true, data: this.refreshRuntimeState() }
  }

  private refreshRuntimeState(): TableOcrRuntimeStatus {
    const resourceRoot = this.resolveResourceRoot()

    const userRuntimeRoot = this.userRuntimeRootOverride
      ? path.resolve(this.userRuntimeRootOverride)
      : path.join(this.appModule.getPath('userData'), 'table-ocr-runtime')
    const scriptPath = path.join(resourceRoot, 'table_ocr.py')
    const installScriptPath = path.join(resourceRoot, 'install_runtime.py')
    const userPythonPath = path.join(userRuntimeRoot, 'python', 'python.exe')
    const localPythonPath = path.join(resourceRoot, 'python', 'python.exe')
    const sharedPythonPath = this.appModule.isPackaged
      ? path.join(process.resourcesPath, 'model-download', 'python', 'python.exe')
      : path.resolve(resourceRoot, '../model-download/python/python.exe')
    const pythonPath = this.pathExists(userPythonPath)
      ? userPythonPath
      : this.pathExists(localPythonPath)
        ? localPythonPath
        : sharedPythonPath

    const missingRuntimeFiles = [
      [pythonPath, 'python.exe'],
      [scriptPath, 'table_ocr.py']
    ]
      .filter(([targetPath]) => !this.pathExists(targetPath))
      .map(([, name]) => name)

    const runtimeFilesReady = missingRuntimeFiles.length === 0
    const readyMarkerPath = path.join(userRuntimeRoot, READY_MARKER_FILENAME)
    const runtimeMarkedReady = this.pathExists(readyMarkerPath)

    return {
      ready: runtimeFilesReady && runtimeMarkedReady && this.installStatus !== 'running',
      resourceRoot,
      userRuntimeRoot,
      pythonPath,
      scriptPath,
      installScriptPath,
      missingPackages: [],
      missingRuntimeFiles,
      installStatus: this.installStatus,
      logs: this.cloneLogs(),
      lastError: this.lastError
    }
  }

  private runPython(runtime: TableOcrRuntimeStatus, args: string[]): Promise<PythonRunResult> {
    if (!runtime.pythonPath || !runtime.scriptPath || !runtime.resourceRoot) {
      return Promise.resolve({ success: false, stderr: ['表格 OCR 运行时缺失'] })
    }

    const pythonPath = runtime.pythonPath
    const scriptPath = runtime.scriptPath
    const resourceRoot = runtime.resourceRoot

    return new Promise((resolve, reject) => {
      let stdoutBuffer = ''
      let stderrBuffer = ''
      const stderrLines: string[] = []
      let completed: StructuredPayload | undefined
      let failed: StructuredPayload | undefined

      const child = this.spawnProcess(pythonPath, ['-u', scriptPath, ...args], {
        cwd: resourceRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: 'pipe'
      }) as ChildProcessWithoutNullStreams

      processRegistry.register(child)

      const handleLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return

        if (!trimmed.startsWith(JSON_PREFIX)) {
          stderrLines.push(trimmed)
          return
        }

        try {
          const payload = JSON.parse(trimmed.slice(JSON_PREFIX.length)) as StructuredPayload
          if (payload.event === 'completed') {
            completed = payload
          } else if (payload.event === 'failed') {
            failed = payload
          }
        } catch (error) {
          stderrLines.push(trimmed)
        }
      }

      const flush = (channel: 'stdout' | 'stderr') => {
        const pending = channel === 'stdout' ? stdoutBuffer : stderrBuffer
        if (pending.trim()) {
          handleLine(pending)
        }
        if (channel === 'stdout') {
          stdoutBuffer = ''
        } else {
          stderrBuffer = ''
        }
      }

      const handleChunk = (channel: 'stdout' | 'stderr', chunk: Buffer | string) => {
        const next = `${channel === 'stdout' ? stdoutBuffer : stderrBuffer}${String(chunk).replace(/\r/g, '\n')}`
        const lines = next.split('\n')
        const remainder = lines.pop() ?? ''
        lines.forEach(handleLine)
        if (channel === 'stdout') {
          stdoutBuffer = remainder
        } else {
          stderrBuffer = remainder
        }
      }

      child.stdout.on('data', (chunk) => handleChunk('stdout', chunk))
      child.stderr.on('data', (chunk) => handleChunk('stderr', chunk))
      child.on('error', reject)
      child.on('close', (code) => {
        flush('stdout')
        flush('stderr')
        if (failed) {
          resolve({ success: false, failed, completed, stderr: stderrLines })
          return
        }
        if (code !== 0) {
          resolve({ success: false, completed, stderr: stderrLines })
          return
        }
        resolve({ success: Boolean(completed), completed, stderr: stderrLines })
      })
    })
  }

  private writeDataUrlToTempFile(imageDataUrl: string): string {
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
    const tempInputPath = path.join(os.tmpdir(), `onetool-table-ocr-${this.createId()}.png`)
    this.writeFileSync(tempInputPath, Buffer.from(base64Data, 'base64'))
    return tempInputPath
  }

  private resolveSourcePythonPath(runtime: TableOcrRuntimeStatus): string | null {
    if (!runtime.resourceRoot) return null

    const localPythonPath = path.join(runtime.resourceRoot, 'python', 'python.exe')
    const sharedPythonPath = this.appModule.isPackaged
      ? path.join(process.resourcesPath, 'model-download', 'python', 'python.exe')
      : path.resolve(runtime.resourceRoot, '../model-download/python/python.exe')

    if (this.pathExists(localPythonPath)) {
      return localPythonPath
    }

    if (this.pathExists(sharedPythonPath)) {
      return sharedPythonPath
    }

    return null
  }

  private markRuntimeReady(userRuntimeRoot: string) {
    try {
      const markerPath = path.join(userRuntimeRoot, READY_MARKER_FILENAME)
      this.writeFileSync(markerPath, JSON.stringify({ readyAt: new Date(this.now()).toISOString() }))
    } catch (error) {
      logger.warn('[TableOcrService] Failed to write runtime ready marker', error)
    }
  }

  private clearRuntimeReadyMarker(userRuntimeRoot: string) {
    try {
      const markerPath = path.join(userRuntimeRoot, READY_MARKER_FILENAME)
      if (this.pathExists(markerPath)) {
        this.unlinkSync(markerPath)
      }
    } catch (error) {
      logger.warn('[TableOcrService] Failed to clear runtime ready marker', error)
    }
  }

  private resolveResourceRoot(): string {
    if (this.runtimeRootOverride) {
      return path.resolve(this.runtimeRootOverride)
    }

    if (this.appModule.isPackaged) {
      return path.join(process.resourcesPath, 'table-ocr')
    }

    const candidates = [
      path.resolve(process.cwd(), 'resources/table-ocr'),
      path.resolve(__dirname, '../../resources/table-ocr'),
      path.resolve(__dirname, '../../../resources/table-ocr')
    ]

    return candidates.find((candidate) => this.pathExists(path.join(candidate, 'table_ocr.py'))) ?? candidates[0]
  }

  private handleInstallChunk(channel: 'stdout' | 'stderr', chunk: Buffer | string) {
    const next = `${channel === 'stdout' ? this.installStdoutBuffer : this.installStderrBuffer}${String(chunk).replace(/\r/g, '\n')}`
    const lines = next.split('\n')
    const remainder = lines.pop() ?? ''

    if (channel === 'stdout') {
      this.installStdoutBuffer = remainder
    } else {
      this.installStderrBuffer = remainder
    }

    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => this.handleInstallLine(line))
  }

  private flushInstallBuffers() {
    const pending = [this.installStdoutBuffer, this.installStderrBuffer].map((line) => line.trim()).filter(Boolean)
    this.installStdoutBuffer = ''
    this.installStderrBuffer = ''
    pending.forEach((line) => this.handleInstallLine(line))
  }

  private handleInstallLine(line: string) {
    if (!line.startsWith(JSON_PREFIX)) {
      this.appendLog('info', line)
      return
    }

    try {
      const payload = JSON.parse(line.slice(JSON_PREFIX.length)) as StructuredPayload
      if (payload.event === 'failed') {
        this.lastError = payload.message
        this.appendLog('error', payload.message)
        return
      }

      this.appendLog(payload.level ?? (payload.event === 'completed' ? 'success' : 'info'), payload.message)
    } catch (error) {
      logger.warn('[TableOcrService] Failed to parse runtime install log', error)
      this.appendLog('info', line)
    }
  }

  private appendLog(level: TableOcrLogLevel, message: string) {
    const entry = {
      id: this.createId(),
      level,
      message,
      timestamp: new Date(this.now()).toISOString()
    }

    this.logs = trimTableOcrLogs([...this.logs, entry], LOG_LIMIT)
    this.emitState()
  }

  private emitState() {
    this.events.emit('state-changed', this.refreshRuntimeState())
  }

  private cloneLogs() {
    return this.logs.map((item) => ({ ...item }))
  }
}

export const tableOcrService = new TableOcrService()
