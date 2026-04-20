import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { execSync, spawn } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import type { IpcResponse } from '../../shared/types'
import {
  DEV_ENVIRONMENT_IDS,
  DEV_ENVIRONMENT_WINGET_TARGETS,
  getDevEnvironmentSummary,
  type DevEnvironmentId,
  type DevEnvironmentManager,
  type DevEnvironmentOverview,
  type DevEnvironmentRecord
} from '../../shared/devEnvironment'
import { logger } from '../utils/logger'
import { wslService } from './WslService'

type ManagedEnvironmentId = Extract<DevEnvironmentId, 'nodejs' | 'git' | 'python' | 'go' | 'java'>
type OperationAction = 'install' | 'update'

const LINKED_ENVIRONMENT_CONFIG: Record<'npm' | 'pip', { parentId: DevEnvironmentId; manager: DevEnvironmentManager }> = {
  npm: { parentId: 'nodejs', manager: 'bundled-with-node' },
  pip: { parentId: 'python', manager: 'bundled-with-python' }
}

function parseVersion(id: DevEnvironmentId, output: string) {
  const text = output.trim()
  if (!text) return null

  if (id === 'nodejs') return text.replace(/^v/i, '')
  if (id === 'npm') return text.match(/\d+\.\d+\.\d+/)?.[0] ?? null
  if (id === 'git') return text.match(/(\d+\.\d+\.\d+(?:\.\w+\.\d+)?)/)?.[1] ?? null
  if (id === 'python') return text.match(/Python\s+(\d+\.\d+\.\d+)/i)?.[1] ?? null
  if (id === 'pip') return text.match(/pip\s+(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? null
  if (id === 'go') return text.match(/go version go(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? null
  if (id === 'java') return text.match(/version\s+"([^"]+)"/i)?.[1] ?? null

  return null
}

function getVersionCommand(id: Exclude<DevEnvironmentId, 'wsl'>) {
  if (id === 'nodejs') return 'node --version'
  if (id === 'npm') return 'npm --version'
  if (id === 'git') return 'git --version'
  if (id === 'python') return 'python --version'
  if (id === 'pip') return 'pip --version'
  if (id === 'go') return 'go version'
  return 'java -version 2>&1'
}

function getResolvedPath(commandName: string) {
  try {
    const output = execSync(`where.exe ${commandName}`, { windowsHide: true }).toString().trim()
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] ?? null
  } catch {
    return null
  }
}

function hasWingetUpgrade(output: string) {
  const text = output.trim()
  if (!text) return false
  if (/No available upgrade found/i.test(text)) return false
  if (/No installed package found/i.test(text)) return false
  return true
}

export class DevEnvironmentService extends EventEmitter {
  private mainWindow: BrowserWindow | null = null
  private currentProcess: ChildProcessWithoutNullStreams | null = null

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private emitLog(type: 'stdout' | 'stderr' | 'info' | 'error' | 'success', message: string) {
    this.emit('log', { type, message })
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('dev-environment-log', { type, message })
    }
  }

  private emitProgress(current: number, total: number, currentName: string) {
    this.emit('progress', { current, total, currentName })
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('dev-environment-progress', { current, total, currentName })
    }
  }

  private emitComplete(success: boolean, message: string) {
    this.emit('complete', { success, message })
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('dev-environment-operation-complete', { success, message })
    }
  }

  private isWingetAvailable() {
    try {
      execSync('winget --version', { windowsHide: true })
      return true
    } catch {
      return false
    }
  }

  private inspectManagedEnvironment(id: Exclude<DevEnvironmentId, 'npm' | 'pip' | 'wsl'>, wingetAvailable: boolean): DevEnvironmentRecord {
    const commandName = id === 'nodejs' ? 'node' : id
    const resolvedPath = getResolvedPath(commandName)
    const notes: string[] = []

    try {
      const versionOutput = execSync(getVersionCommand(id), { windowsHide: true }).toString()
      const detectedVersion = parseVersion(id, versionOutput)
      if (!detectedVersion) {
        return {
          id,
          status: 'broken',
          detectedVersion: null,
          resolvedPath,
          manager: 'winget',
          canInstall: false,
          canUpdate: false,
          notes: ['命令可执行，但版本输出无法解析']
        }
      }

      let status: DevEnvironmentRecord['status'] = 'installed'
      let canUpdate = false
      if (wingetAvailable) {
        const wingetId = DEV_ENVIRONMENT_WINGET_TARGETS[id]
        if (wingetId) {
          try {
            const upgradeOutput = execSync(`winget upgrade --id ${wingetId} --accept-source-agreements`, { windowsHide: true }).toString()
            if (hasWingetUpgrade(upgradeOutput)) {
              status = 'available-update'
              canUpdate = true
            }
          } catch {
            notes.push('当前安装来源未映射到 winget 升级通道')
          }
        }
      }

      return {
        id,
        status,
        detectedVersion,
        resolvedPath,
        manager: 'winget',
        canInstall: false,
        canUpdate,
        notes
      }
    } catch (error) {
      if (!resolvedPath) {
        return {
          id,
          status: 'missing',
          detectedVersion: null,
          resolvedPath: null,
          manager: 'winget',
          canInstall: wingetAvailable,
          canUpdate: false,
          notes: []
        }
      }

      return {
        id,
        status: 'broken',
        detectedVersion: null,
        resolvedPath,
        manager: 'winget',
        canInstall: false,
        canUpdate: false,
        notes: [(error instanceof Error ? error.message : String(error))]
      }
    }
  }

  private buildLinkedEnvironment(id: 'npm' | 'pip', parent: DevEnvironmentRecord): DevEnvironmentRecord {
    const config = LINKED_ENVIRONMENT_CONFIG[id]
    const commandName = id
    const resolvedPath = getResolvedPath(commandName)

    try {
      const versionOutput = execSync(getVersionCommand(id), { windowsHide: true }).toString()
      const detectedVersion = parseVersion(id, versionOutput)
      return {
        id,
        status: detectedVersion ? 'linked' : 'broken',
        detectedVersion,
        resolvedPath,
        manager: config.manager,
        canInstall: false,
        canUpdate: false,
        notes: detectedVersion ? [`随 ${config.parentId === 'nodejs' ? 'Node.js' : 'Python'} 提供`] : ['版本输出无法解析']
      }
    } catch {
      return {
        id,
        status: parent.status === 'missing' ? 'missing' : 'linked',
        detectedVersion: null,
        resolvedPath,
        manager: config.manager,
        canInstall: false,
        canUpdate: false,
        notes: [`随 ${config.parentId === 'nodejs' ? 'Node.js' : 'Python'} 提供`]
      }
    }
  }

  private async buildWslRecord(): Promise<DevEnvironmentRecord> {
    try {
      const result = await wslService.getOverview()
      if (!result.success || !result.data) {
        return {
          id: 'wsl',
          status: 'external',
          detectedVersion: null,
          resolvedPath: null,
          manager: 'external-wsl',
          canInstall: false,
          canUpdate: false,
          notes: [result.error || '当前无法读取 WSL 状态']
        }
      }

      const overview = result.data
      return {
        id: 'wsl',
        status: 'external',
        detectedVersion: overview.defaultDistro ?? null,
        resolvedPath: null,
        manager: 'external-wsl',
        canInstall: false,
        canUpdate: false,
        notes: overview.available
          ? [`已安装 ${overview.distros.length} 个发行版`]
          : ['WSL 未启用']
      }
    } catch (error) {
      return {
        id: 'wsl',
        status: 'external',
        detectedVersion: null,
        resolvedPath: null,
        manager: 'external-wsl',
        canInstall: false,
        canUpdate: false,
        notes: [error instanceof Error ? error.message : String(error)]
      }
    }
  }

  async inspectOne(id: DevEnvironmentId): Promise<IpcResponse<DevEnvironmentRecord>> {
    const wingetAvailable = this.isWingetAvailable()
    if (id === 'npm') {
      return { success: true, data: this.buildLinkedEnvironment('npm', this.inspectManagedEnvironment('nodejs', wingetAvailable)) }
    }
    if (id === 'pip') {
      return { success: true, data: this.buildLinkedEnvironment('pip', this.inspectManagedEnvironment('python', wingetAvailable)) }
    }
    if (id === 'wsl') {
      return { success: true, data: await this.buildWslRecord() }
    }
    return { success: true, data: this.inspectManagedEnvironment(id, wingetAvailable) }
  }

  async inspectAll(): Promise<IpcResponse<DevEnvironmentOverview>> {
    const wingetAvailable = this.isWingetAvailable()
    const records: DevEnvironmentRecord[] = []

    const nodejsRecord = this.inspectManagedEnvironment('nodejs', wingetAvailable)
    const pythonRecord = this.inspectManagedEnvironment('python', wingetAvailable)

    for (const id of DEV_ENVIRONMENT_IDS) {
      if (id === 'nodejs') {
        records.push(nodejsRecord)
      } else if (id === 'python') {
        records.push(pythonRecord)
      } else if (id === 'npm') {
        records.push(this.buildLinkedEnvironment('npm', nodejsRecord))
      } else if (id === 'pip') {
        records.push(this.buildLinkedEnvironment('pip', pythonRecord))
      } else if (id === 'wsl') {
        records.push(await this.buildWslRecord())
      } else {
        records.push(this.inspectManagedEnvironment(id, wingetAvailable))
      }
    }

    return {
      success: true,
      data: {
        records,
        summary: getDevEnvironmentSummary(records),
        checkedAt: new Date().toISOString(),
        wingetAvailable
      }
    }
  }

  private runWingetAction(action: OperationAction, id: ManagedEnvironmentId): Promise<IpcResponse> {
    if (!this.isWingetAvailable()) {
      return Promise.resolve({ success: false, error: '未检测到 winget，无法执行安装或更新' })
    }

    const wingetId = DEV_ENVIRONMENT_WINGET_TARGETS[id]
    if (!wingetId) {
      return Promise.resolve({ success: false, error: '当前环境不支持通过 winget 管理' })
    }

    const args = action === 'install'
      ? ['install', '--id', wingetId, '--accept-package-agreements', '--accept-source-agreements', '--silent']
      : ['upgrade', '--id', wingetId, '--accept-package-agreements', '--accept-source-agreements', '--silent']

    this.emitLog('info', `正在${action === 'install' ? '安装' : '更新'} ${id}...`)

    return new Promise((resolve) => {
      this.currentProcess = spawn('winget', args, { windowsHide: true }) as ChildProcessWithoutNullStreams

      this.currentProcess.stdout.on('data', (data) => {
        const message = data.toString().trim()
        if (message) this.emitLog('stdout', message)
      })
      this.currentProcess.stderr.on('data', (data) => {
        const message = data.toString().trim()
        if (message) this.emitLog('stderr', message)
      })

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null
        if (code === 0) {
          const message = `${id} ${action === 'install' ? '安装' : '更新'}完成`
          this.emitLog('success', message)
          this.emitComplete(true, message)
          resolve({ success: true })
          return
        }

        const message = `${id} ${action === 'install' ? '安装' : '更新'}失败`
        this.emitLog('error', message)
        this.emitComplete(false, message)
        resolve({ success: false, error: message })
      })

      this.currentProcess.on('error', (error) => {
        this.currentProcess = null
        const message = error instanceof Error ? error.message : String(error)
        this.emitLog('error', message)
        this.emitComplete(false, message)
        resolve({ success: false, error: message })
      })
    })
  }

  install(id: DevEnvironmentId): Promise<IpcResponse> {
    if (id === 'npm' || id === 'pip' || id === 'wsl') {
      return Promise.resolve({ success: false, error: `${id} 不支持独立安装` })
    }
    return this.runWingetAction('install', id)
  }

  update(id: DevEnvironmentId): Promise<IpcResponse> {
    if (id === 'npm' || id === 'pip' || id === 'wsl') {
      return Promise.resolve({ success: false, error: `${id} 不支持独立更新` })
    }
    return this.runWingetAction('update', id)
  }

  async updateAll(): Promise<IpcResponse> {
    const inspectResult = await this.inspectAll()
    if (!inspectResult.success || !inspectResult.data) {
      return { success: false, error: inspectResult.error || '无法读取开发环境状态' }
    }

    const updatable = inspectResult.data.records.filter((record) => record.status === 'available-update' && record.canUpdate)
    if (updatable.length === 0) {
      return { success: true, data: { updated: 0 } }
    }

    for (let index = 0; index < updatable.length; index += 1) {
      const record = updatable[index]
      this.emitProgress(index + 1, updatable.length, record.id)
      const result = await this.update(record.id)
      if (!result.success) {
        return result
      }
    }

    return { success: true, data: { updated: updatable.length } }
  }

  openRelatedTool(id: DevEnvironmentId): IpcResponse<{ toolId: string }> {
    if (id !== 'wsl') {
      return { success: false, error: '当前环境没有关联工具' }
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('open-tool', 'wsl-manager')
    }

    return { success: true, data: { toolId: 'wsl-manager' } }
  }
}

export const devEnvironmentService = new DevEnvironmentService()
