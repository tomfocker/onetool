import { spawn as defaultSpawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

export type NtfsFastScannerBridgeEvent = {
  type: string
  [key: string]: unknown
}

export type NtfsFastScannerBridgeDependencies = {
  scannerPath: string
  spawn?: typeof defaultSpawn
}

export type NtfsFastScannerRunHandle = {
  done: Promise<void>
  cancel: () => void
}

export class NtfsFastScannerBridge {
  private readonly scannerPath: string
  private readonly spawn: typeof defaultSpawn

  constructor(dependencies: NtfsFastScannerBridgeDependencies) {
    this.scannerPath = dependencies.scannerPath
    this.spawn = dependencies.spawn ?? defaultSpawn
  }

  start(rootPath: string, onEvent: (event: NtfsFastScannerBridgeEvent) => void): NtfsFastScannerRunHandle {
    type ScannerChildProcess = ChildProcessByStdio<null, Readable, Readable>

    const child = this.spawn(this.scannerPath, ['scan', '--root', rootPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    }) as unknown as ScannerChildProcess

    let stderr = ''
    let stdoutBuffer = ''
    let settled = false
    let cancelled = false
    let settleRejectFn: ((error: Error) => void) | null = null

    const done = new Promise<void>((resolve, reject) => {
      settleRejectFn = (error: Error) => {
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

      const settleReject = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        reject(error)
      }

      const errorDetail = (error: unknown): string => {
        if (error && typeof error === 'object' && 'message' in error) {
          const message = (error as { message?: unknown }).message
          if (typeof message === 'string') {
            return message
          }
        }

        return String(error)
      }

      const parseJsonLine = (line: string, lineNumber: number): NtfsFastScannerBridgeEvent | null => {
        if (!line) {
          return null
        }

        try {
          return JSON.parse(line) as NtfsFastScannerBridgeEvent
        } catch (error) {
          const detail = errorDetail(error)
          settleReject(new Error(`NtfsFastScannerBridge JSON parse error on line ${lineNumber}: ${line} (${detail})`))
          return null
        }
      }

      const deliverEvent = (event: NtfsFastScannerBridgeEvent, lineNumber: number) => {
        if (settled) {
          return
        }

        try {
          onEvent(event)
        } catch (error) {
          const detail = errorDetail(error)
          settleReject(new Error(`NtfsFastScannerBridge event callback error on line ${lineNumber}: ${detail}`))
        }
      }

      let lineNumber = 0

      child.on('error', (error) => {
        settleReject(error instanceof Error ? error : new Error(String(error)))
      })
      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutBuffer += chunk.toString()

        let newlineIndex = stdoutBuffer.indexOf('\n')
        while (newlineIndex !== -1 && !settled) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim()
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
          lineNumber += 1
          const parsedEvent = parseJsonLine(line, lineNumber)
          if (parsedEvent) {
            deliverEvent(parsedEvent, lineNumber)
          }
          newlineIndex = stdoutBuffer.indexOf('\n')
        }
      })
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString()
      })
      child.on('close', (code, signal) => {
        if (settled) {
          return
        }

        if (cancelled) {
          settleRejectFn?.(new Error('NtfsFastScannerBridge cancelled'))
          return
        }

        if (signal != null) {
          const suffix = stderr.trim() ? `: ${stderr.trim()}` : ''
          settleRejectFn?.(new Error(`NtfsFastScannerBridge terminated by signal ${signal}${suffix}`))
          return
        }

        if ((code ?? 0) !== 0) {
          const suffix = stderr.trim() ? `: ${stderr.trim()}` : ''
          settleRejectFn?.(new Error(`ntfs-fast-scan exited with code ${code}${suffix}`))
          return
        }

        const finalLine = stdoutBuffer.trim()
        if (finalLine) {
          lineNumber += 1
          const parsedEvent = parseJsonLine(finalLine, lineNumber)
          if (parsedEvent) {
            deliverEvent(parsedEvent, lineNumber)
          }
          if (settled) {
            return
          }
        }

        settleResolve()
      })
    })

    return {
      done,
      cancel: () => {
        if (settled) {
          return
        }
        cancelled = true
        try {
          child.kill()
        } catch (error) {
          if (!settled) {
            settled = true
            throw error
          }
        } finally {
          if (!settled) {
            settleRejectFn?.(new Error('NtfsFastScannerBridge cancelled'))
          }
        }
      }
    }
  }
}
