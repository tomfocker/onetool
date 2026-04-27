import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile as defaultExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { NtfsFastScannerBridgeEvent, NtfsFastScannerRunHandle } from './NtfsFastScannerBridge'

type ElevatedLaunchResult = {
  pid: number | null
}

type ElevatedLaunchFn = (manifestPath: string, helperScriptPath: string) => Promise<ElevatedLaunchResult>
type KillProcessFn = (pid: number) => Promise<void>

export type ElevatedNtfsScanRunnerDependencies = {
  fsPromises?: typeof fs
  osModule?: typeof os
  pathModule?: typeof path
  launchElevated?: ElevatedLaunchFn
  killProcess?: KillProcessFn
  pollIntervalMs?: number
  scannerPath?: string
  helperScriptPath?: string
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
}

type RunnerManifest = {
  scannerPath: string
  rootPath: string
  eventsPath: string
  stderrPath: string
  exitCodePath: string
}

const execFileAsync = promisify(defaultExecFile)

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) {
      return message
    }
  }

  return String(error)
}

function isRetryableFileReadError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  const code = (error as { code?: unknown }).code
  return code === 'EBUSY' || code === 'EPERM'
}

function toPowerShellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function resolveSpaceScanResource(pathModule: typeof path, resourceName: string) {
  const isPackaged = typeof app?.isPackaged === 'boolean' ? app.isPackaged : false

  if (!isPackaged) {
    return pathModule.join(process.cwd(), 'resources', 'space-scan', resourceName)
  }

  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : process.cwd()
  return pathModule.join(resourcesPath, 'space-scan', resourceName)
}

async function assertFileExists(fsPromises: typeof fs, filePath: string, label: string): Promise<void> {
  try {
    await fsPromises.access(filePath)
  } catch {
    throw new Error(`${label}不存在：${filePath}`)
  }
}

async function defaultLaunchElevated(manifestPath: string, helperScriptPath: string): Promise<ElevatedLaunchResult> {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `$manifestPath = ${toPowerShellSingleQuoted(manifestPath)}`,
    `$helperScriptPath = ${toPowerShellSingleQuoted(helperScriptPath)}`,
    "$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $helperScriptPath, '-ManifestPath', $manifestPath)",
    "$process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments -PassThru",
    'Write-Output $process.Id'
  ].join('; ')

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    )

    const pid = Number.parseInt(stdout.trim(), 10)
    return {
      pid: Number.isFinite(pid) ? pid : null
    }
  } catch (error) {
    const message = getErrorMessage(error)
    if (/canceled by the user|operation was canceled|已取消/i.test(message)) {
      throw new Error('管理员权限请求已取消')
    }
    throw error
  }
}

async function defaultKillProcess(pid: number): Promise<void> {
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }
  )
}

export class ElevatedNtfsScanRunner {
  private readonly fsPromises: typeof fs
  private readonly osModule: typeof os
  private readonly pathModule: typeof path
  private readonly launchElevated: ElevatedLaunchFn
  private readonly killProcess: KillProcessFn
  private readonly pollIntervalMs: number
  private readonly scannerPath: string
  private readonly helperScriptPath: string
  private readonly setIntervalFn: typeof setInterval
  private readonly clearIntervalFn: typeof clearInterval

  constructor(dependencies: ElevatedNtfsScanRunnerDependencies = {}) {
    this.fsPromises = dependencies.fsPromises ?? fs
    this.osModule = dependencies.osModule ?? os
    this.pathModule = dependencies.pathModule ?? path
    this.launchElevated = dependencies.launchElevated ?? defaultLaunchElevated
    this.killProcess = dependencies.killProcess ?? defaultKillProcess
    this.pollIntervalMs = dependencies.pollIntervalMs ?? 150
    this.scannerPath = dependencies.scannerPath ?? resolveSpaceScanResource(this.pathModule, 'ntfs-fast-scan.exe')
    this.helperScriptPath =
      dependencies.helperScriptPath ?? resolveSpaceScanResource(this.pathModule, 'run-elevated-ntfs-fast-scan.ps1')
    this.setIntervalFn = dependencies.setIntervalFn ?? setInterval
    this.clearIntervalFn = dependencies.clearIntervalFn ?? clearInterval
  }

  async start(
    rootPath: string,
    onEvent: (event: NtfsFastScannerBridgeEvent) => void
  ): Promise<NtfsFastScannerRunHandle> {
    await assertFileExists(this.fsPromises, this.scannerPath, 'NTFS 极速扫描器')
    await assertFileExists(this.fsPromises, this.helperScriptPath, 'NTFS 极速扫描提权脚本')

    const workDir = await this.fsPromises.mkdtemp(this.pathModule.join(this.osModule.tmpdir(), 'space-cleanup-fast-scan-'))
    const eventsPath = this.pathModule.join(workDir, 'events.jsonl')
    const stderrPath = this.pathModule.join(workDir, 'stderr.log')
    const exitCodePath = this.pathModule.join(workDir, 'exit-code.txt')
    const manifestPath = this.pathModule.join(workDir, 'scan-manifest.json')

    const manifest: RunnerManifest = {
      scannerPath: this.scannerPath,
      rootPath,
      eventsPath,
      stderrPath,
      exitCodePath
    }

    await this.fsPromises.mkdir(workDir, { recursive: true })
    await this.fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

    const launchResult = await this.launchElevated(manifestPath, this.helperScriptPath)

    let settled = false
    let cancelled = false
    let consumedLength = 0
    let stdoutBuffer = ''
    let lineNumber = 0
    let pendingPoll: Promise<void> | null = null
    let settleRejectFn: ((error: Error) => void) | null = null

    const parseJsonLine = (line: string): NtfsFastScannerBridgeEvent | null => {
      const trimmed = line.trim()
      if (!trimmed) {
        return null
      }

      try {
        return JSON.parse(trimmed) as NtfsFastScannerBridgeEvent
      } catch (error) {
        throw new Error(
          `ElevatedNtfsScanRunner JSON parse error on line ${lineNumber}: ${trimmed} (${getErrorMessage(error)})`
        )
      }
    }

    const consumePendingLines = (contentChunk: string) => {
      stdoutBuffer += contentChunk

      let newlineIndex = stdoutBuffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex)
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        lineNumber += 1
        const event = parseJsonLine(line)
        if (event) {
          onEvent(event)
        }
        newlineIndex = stdoutBuffer.indexOf('\n')
      }
    }

    const done = new Promise<void>((resolve, reject) => {
      settleRejectFn = (error) => {
        if (settled) {
          return
        }
        settled = true
        reject(error)
      }

      const settleResolve = () => {
        if (settled) {
          return
        }
        settled = true
        resolve()
      }

      const pollOnce = async () => {
        try {
          let eventsFileBusy = false
          const content = await this.fsPromises.readFile(eventsPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
            if (error?.code === 'ENOENT') {
              return null
            }
            if (isRetryableFileReadError(error)) {
              eventsFileBusy = true
              return null
            }
            throw error
          })
          if (content != null && content.length > consumedLength) {
            const nextChunk = content.slice(consumedLength)
            consumedLength = content.length
            consumePendingLines(nextChunk)
          }

          const exitCodeRaw = await this.fsPromises.readFile(exitCodePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
            if (error?.code === 'ENOENT') {
              return null
            }
            if (isRetryableFileReadError(error)) {
              return null
            }
            throw error
          })

          if (exitCodeRaw == null || eventsFileBusy) {
            return
          }

          const trailingLine = stdoutBuffer.trim()
          if (trailingLine) {
            lineNumber += 1
            const event = parseJsonLine(trailingLine)
            stdoutBuffer = ''
            if (event) {
              onEvent(event)
            }
          }

          if (cancelled) {
            settleRejectFn?.(new Error('NtfsFastScannerBridge cancelled'))
            return
          }

          const stderr = await this.fsPromises.readFile(stderrPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
            if (error?.code === 'ENOENT') {
              return ''
            }
            if (isRetryableFileReadError(error)) {
              return null
            }
            throw error
          })
          if (stderr == null) {
            return
          }

          const exitCode = Number.parseInt(exitCodeRaw.trim(), 10)
          if (!Number.isFinite(exitCode) || exitCode !== 0) {
            const suffix = stderr.trim() ? `: ${stderr.trim()}` : ''
            settleRejectFn?.(new Error(`ntfs-fast-scan exited with code ${Number.isFinite(exitCode) ? exitCode : 1}${suffix}`))
            return
          }

          settleResolve()
        } catch (error) {
          settleRejectFn?.(error instanceof Error ? error : new Error(String(error)))
        }
      }

      const interval = this.setIntervalFn(() => {
        if (settled || pendingPoll) {
          return
        }
        pendingPoll = pollOnce().finally(() => {
          pendingPoll = null
          if (settled) {
            this.clearIntervalFn(interval)
          }
        })
      }, this.pollIntervalMs)

      void pollOnce().finally(() => {
        if (settled) {
          this.clearIntervalFn(interval)
        }
      })
    })

    return {
      done,
      cancel: () => {
        if (settled) {
          return
        }
        cancelled = true
        if (launchResult.pid != null) {
          void this.killProcess(launchResult.pid).catch(() => {})
        }
        settleRejectFn?.(new Error('NtfsFastScannerBridge cancelled'))
      }
    }
  }
}
