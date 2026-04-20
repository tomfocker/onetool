import { spawn as defaultSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

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
    const child = this.spawn(this.scannerPath, ['scan', '--root', rootPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams

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

      const parseLine = (line: string, lineNumber: number) => {
        if (!line) {
          return
        }

        try {
          onEvent(JSON.parse(line) as NtfsFastScannerBridgeEvent)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          settleReject(new Error(`NtfsFastScannerBridge JSON parse error on line ${lineNumber}: ${line} (${detail})`))
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
          parseLine(line, lineNumber)
          newlineIndex = stdoutBuffer.indexOf('\n')
        }
      })
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString()
      })
      child.on('close', (code) => {
        if (settled) {
          return
        }

        if (cancelled) {
          settleRejectFn?.(new Error('NtfsFastScannerBridge cancelled'))
          return
        }

        if ((code ?? 0) !== 0) {
          const suffix = stderr.trim() ? `: ${stderr.trim()}` : ''
          settleRejectFn?.(new Error(`ntfs-fast-scan exited with code ${code ?? 0}${suffix}`))
          return
        }

        const finalLine = stdoutBuffer.trim()
        if (finalLine) {
          lineNumber += 1
          parseLine(finalLine, lineNumber)
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
