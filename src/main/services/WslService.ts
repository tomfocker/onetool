import { app } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { processRegistry } from './ProcessRegistry'
import { execPowerShellEncoded } from '../utils/processUtils'
import { logger } from '../utils/logger'
import {
  IpcResponse,
  WslBackupFormat,
  WslBackupInfo,
  WslOverview,
  WslRestoreMode,
  WslSpaceReclaimResult
} from '../../shared/types'
import { decodeWslText, parseWslListVerbose, parseWslVersionInfo } from './wslUtils'

interface WslCommandResult {
  code: number | null
  stdout: string
  stderr: string
}

interface WslRegistryEntry {
  name: string
  basePath: string | null
  vhdPath: string | null
  osVersion: string | null
  flavor: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function sanitizeFileNameSegment(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function buildTimestampForFile(date: Date = new Date()): string {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

function buildBackupId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class WslService {
  private getStorageRoots() {
    const baseRoot = path.join(app.getPath('documents'), 'OneTool', 'WSL')
    return {
      baseRoot,
      backupRoot: path.join(baseRoot, 'Backups'),
      restoreRoot: path.join(baseRoot, 'Restores')
    }
  }

  private backupMetadataPath(filePath: string): string {
    return `${filePath}.onetool.json`
  }

  private async ensureStorageRoots(): Promise<void> {
    const { backupRoot, restoreRoot } = this.getStorageRoots()
    await fs.promises.mkdir(backupRoot, { recursive: true })
    await fs.promises.mkdir(restoreRoot, { recursive: true })
  }

  private async runWsl(args: string[], timeoutMs: number = 120000): Promise<WslCommandResult> {
    return await new Promise((resolve) => {
      let settled = false
      let timeoutId: NodeJS.Timeout | null = null

      const child = processRegistry.register(spawn('wsl.exe', args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }))

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []

      const finish = (result: WslCommandResult) => {
        if (settled) {
          return
        }

        settled = true
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        resolve(result)
      }

      child.stdout?.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)))
      child.stderr?.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)))

      child.on('error', (error) => {
        finish({
          code: null,
          stdout: '',
          stderr: error.message
        })
      })

      child.on('close', (code) => {
        finish({
          code,
          stdout: decodeWslText(Buffer.concat(stdoutChunks)),
          stderr: decodeWslText(Buffer.concat(stderrChunks))
        })
      })

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          try {
            child.kill()
          } catch {
            // ignore
          }

          finish({
            code: null,
            stdout: decodeWslText(Buffer.concat(stdoutChunks)),
            stderr: `WSL 命令执行超时: wsl.exe ${args.join(' ')}`
          })
        }, timeoutMs)
      }
    })
  }

  private async runWslOrThrow(args: string[], timeoutMs: number = 120000): Promise<string> {
    const result = await this.runWsl(args, timeoutMs)

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `WSL 命令执行失败: wsl.exe ${args.join(' ')}`)
    }

    return result.stdout || result.stderr
  }

  private async getRegistryDistros(): Promise<Map<string, WslRegistryEntry>> {
    const script = `
$ErrorActionPreference = 'Stop'
$entries = Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss' -ErrorAction SilentlyContinue |
  Where-Object { $_.PSChildName -match '^\\{.+\\}$' } |
  ForEach-Object {
    $props = Get-ItemProperty $_.PSPath
    [PSCustomObject]@{
      name = $props.DistributionName
      basePath = $props.BasePath
      vhdPath = if ($props.BasePath -and $props.VhdFileName) { Join-Path $props.BasePath $props.VhdFileName } else { $null }
      osVersion = $props.OsVersion
      flavor = $props.Flavor
    }
  }

$entries | ConvertTo-Json -Compress -Depth 4
`

    const raw = await execPowerShellEncoded(script)
    if (!raw.trim()) {
      return new Map()
    }

    try {
      const parsed = ensureArray(JSON.parse(raw) as WslRegistryEntry | WslRegistryEntry[])
      const result = new Map<string, WslRegistryEntry>()

      for (const entry of parsed) {
        if (entry?.name) {
          result.set(entry.name, entry)
        }
      }

      return result
    } catch (error) {
      logger.warn('[WslService] failed to parse registry distro info', error)
      return new Map()
    }
  }

  private async listManagedBackupsInternal(): Promise<WslBackupInfo[]> {
    await this.ensureStorageRoots()
    const { backupRoot } = this.getStorageRoots()
    const entries = await fs.promises.readdir(backupRoot, { withFileTypes: true })
    const backups: WslBackupInfo[] = []

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.onetool.json')) {
        continue
      }

      const metadataPath = path.join(backupRoot, entry.name)

      try {
        const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8')) as WslBackupInfo
        const stat = await fs.promises.stat(metadata.filePath)
        backups.push({
          ...metadata,
          sizeBytes: stat.size
        })
      } catch (error) {
        logger.warn('[WslService] skipping invalid backup metadata', { metadataPath, error })
      }
    }

    backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return backups
  }

  async getBackups(): Promise<IpcResponse<WslBackupInfo[]>> {
    try {
      return {
        success: true,
        data: await this.listManagedBackupsInternal()
      }
    } catch (error) {
      logger.error('[WslService] getBackups failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async getOverview(): Promise<IpcResponse<WslOverview>> {
    try {
      await this.ensureStorageRoots()

      const versionPromise = this.runWsl(['--version'])
      const statusPromise = this.runWsl(['--status'])
      const listPromise = this.runWsl(['--list', '--verbose'])
      const registryPromise = this.getRegistryDistros()

      const [versionResult, statusResult, listResult, registryMap] = await Promise.all([
        versionPromise,
        statusPromise,
        listPromise,
        registryPromise
      ])

      if (versionResult.code === null && statusResult.code === null && listResult.code === null) {
        return {
          success: false,
          error: versionResult.stderr || statusResult.stderr || listResult.stderr || '当前系统未检测到 WSL。'
        }
      }

      const parsedList = parseWslListVerbose(listResult.stdout || listResult.stderr)
      const rawStatus = statusResult.stdout || statusResult.stderr
      const versionInfo = parseWslVersionInfo([versionResult.stdout, statusResult.stdout].filter(Boolean).join('\n'))
      const { backupRoot, restoreRoot } = this.getStorageRoots()

      const distros = await Promise.all(parsedList.distros.map(async (distro) => {
        const registryEntry = registryMap.get(distro.name)
        let vhdSizeBytes: number | null = null

        if (registryEntry?.vhdPath && fs.existsSync(registryEntry.vhdPath)) {
          try {
            vhdSizeBytes = (await fs.promises.stat(registryEntry.vhdPath)).size
          } catch {
            vhdSizeBytes = null
          }
        }

        return {
          ...distro,
          basePath: registryEntry?.basePath || null,
          vhdPath: registryEntry?.vhdPath || null,
          vhdSizeBytes,
          osVersion: registryEntry?.osVersion || null,
          flavor: registryEntry?.flavor || null
        }
      }))

      const overview: WslOverview = {
        available: true,
        message: parsedList.distros.length === 0 ? '尚未安装任何 WSL 发行版。' : null,
        defaultDistro: parsedList.defaultDistro,
        runningCount: distros.filter((distro) => distro.isRunning).length,
        distros,
        rawStatus,
        versionInfo,
        backupRoot,
        restoreRoot
      }

      logger.info('[WslService] getOverview parsed result', {
        available: overview.available,
        defaultDistro: overview.defaultDistro,
        runningCount: overview.runningCount,
        distros: overview.distros
      })

      return { success: true, data: overview }
    } catch (error) {
      logger.error('[WslService] getOverview failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  private async runAndRefreshOverview(args: string[]): Promise<IpcResponse<WslOverview>> {
    try {
      await this.runWslOrThrow(args)
      await sleep(500)
      return await this.getOverview()
    } catch (error) {
      logger.error('[WslService] runAndRefreshOverview failed', { args, error })
      return { success: false, error: (error as Error).message }
    }
  }

  async setDefault(name: string): Promise<IpcResponse<WslOverview>> {
    return await this.runAndRefreshOverview(['--set-default', name])
  }

  async terminate(name: string): Promise<IpcResponse<WslOverview>> {
    return await this.runAndRefreshOverview(['--terminate', name])
  }

  async shutdownAll(): Promise<IpcResponse<WslOverview>> {
    return await this.runAndRefreshOverview(['--shutdown'])
  }

  async createBackup(name: string, format: WslBackupFormat): Promise<IpcResponse<WslBackupInfo[]>> {
    try {
      const overviewResponse = await this.getOverview()
      const distro = overviewResponse.data?.distros.find((item) => item.name === name)
      if (!distro) {
        return { success: false, error: `未找到发行版：${name}` }
      }

      await this.ensureStorageRoots()
      const { backupRoot } = this.getStorageRoots()

      if (distro.isRunning) {
        await this.runWslOrThrow(['--terminate', name])
        await sleep(400)
      }

      const extension = format === 'vhd' ? 'vhdx' : 'tar'
      const fileName = `${sanitizeFileNameSegment(name)}-${buildTimestampForFile()}.${extension}`
      const filePath = path.join(backupRoot, fileName)

      await this.runWslOrThrow(['--export', name, filePath, '--format', format === 'vhd' ? 'vhd' : 'tar'], 15 * 60 * 1000)

      const stat = await fs.promises.stat(filePath)
      const backup: WslBackupInfo = {
        id: buildBackupId(),
        distroName: name,
        sourceVersion: distro.version,
        format,
        fileName,
        filePath,
        sizeBytes: stat.size,
        createdAt: new Date().toISOString()
      }

      await fs.promises.writeFile(this.backupMetadataPath(filePath), JSON.stringify(backup, null, 2), 'utf8')
      logger.info('[WslService] backup created', backup)

      return {
        success: true,
        data: await this.listManagedBackupsInternal()
      }
    } catch (error) {
      logger.error('[WslService] createBackup failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async deleteBackup(id: string): Promise<IpcResponse<WslBackupInfo[]>> {
    try {
      const backups = await this.listManagedBackupsInternal()
      const target = backups.find((backup) => backup.id === id)
      if (!target) {
        return { success: false, error: '未找到要删除的备份。' }
      }

      await fs.promises.rm(target.filePath, { force: true })
      await fs.promises.rm(this.backupMetadataPath(target.filePath), { force: true })

      return {
        success: true,
        data: await this.listManagedBackupsInternal()
      }
    } catch (error) {
      logger.error('[WslService] deleteBackup failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async restoreBackup(id: string, mode: WslRestoreMode, targetName?: string): Promise<IpcResponse<WslOverview>> {
    try {
      const backups = await this.listManagedBackupsInternal()
      const backup = backups.find((item) => item.id === id)
      if (!backup) {
        return { success: false, error: '未找到指定备份。' }
      }

      const overviewResponse = await this.getOverview()
      const existingDistros = new Set((overviewResponse.data?.distros || []).map((item) => item.name))

      const resolvedTargetName = mode === 'replace'
        ? backup.distroName
        : (targetName?.trim() || `${backup.distroName}-restored-${buildTimestampForFile().slice(9)}`)

      if (mode === 'copy' && existingDistros.has(resolvedTargetName)) {
        return { success: false, error: `发行版 ${resolvedTargetName} 已存在，请换一个恢复名称。` }
      }

      if (mode === 'replace' && !existingDistros.has(backup.distroName)) {
        return { success: false, error: `要覆盖恢复的发行版 ${backup.distroName} 当前不存在。` }
      }

      const { restoreRoot } = this.getStorageRoots()
      await fs.promises.mkdir(restoreRoot, { recursive: true })

      if (mode === 'replace') {
        await this.runWsl(['--terminate', backup.distroName])
        await this.runWslOrThrow(['--unregister', backup.distroName])
      }

      const installLocation = path.join(restoreRoot, `${sanitizeFileNameSegment(resolvedTargetName)}-${buildTimestampForFile()}`)
      const importArgs = ['--import', resolvedTargetName, installLocation, backup.filePath]

      if (backup.format === 'vhd') {
        importArgs.push('--vhd')
      } else {
        importArgs.push('--version', String(backup.sourceVersion))
      }

      await this.runWslOrThrow(importArgs, 15 * 60 * 1000)
      await sleep(500)
      return await this.getOverview()
    } catch (error) {
      logger.error('[WslService] restoreBackup failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async reclaimSpace(name: string): Promise<IpcResponse<WslSpaceReclaimResult>> {
    try {
      const overviewResponse = await this.getOverview()
      const distro = overviewResponse.data?.distros.find((item) => item.name === name)
      if (!distro?.vhdPath) {
        return { success: false, error: `未找到 ${name} 的虚拟磁盘路径。` }
      }

      const beforeBytes = (await fs.promises.stat(distro.vhdPath)).size
      const trimResult = await this.runWsl(
        ['-d', name, '-u', 'root', '--exec', 'sh', '-lc', 'sync; command -v fstrim >/dev/null 2>&1 && fstrim -av || true'],
        120000
      )
      const trimOutput = trimResult.stdout || trimResult.stderr

      await this.runWslOrThrow(['--manage', name, '--set-sparse', 'true'])
      await this.runWslOrThrow(['--shutdown'])
      await sleep(1200)

      const afterBytes = (await fs.promises.stat(distro.vhdPath)).size

      return {
        success: true,
        data: {
          distroName: name,
          vhdPath: distro.vhdPath,
          beforeBytes,
          afterBytes,
          reclaimedBytes: Math.max(beforeBytes - afterBytes, 0),
          sparseEnabled: true,
          trimAttempted: true,
          trimOutput
        }
      }
    } catch (error) {
      logger.error('[WslService] reclaimSpace failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  launchShell(name: string): IpcResponse {
    try {
      const child = spawn('cmd.exe', ['/c', 'start', '', 'wsl.exe', '-d', name], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      child.unref()
      return { success: true }
    } catch (error) {
      logger.error('[WslService] launchShell failed', error)
      return { success: false, error: (error as Error).message }
    }
  }
}

export const wslService = new WslService()
