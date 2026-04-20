import { spawn as defaultSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export type NtfsFastScannerBridgeEvent = {
  type: string
  [key: string]: unknown
}

export type NtfsFastScannerBridgeDependencies = {
  scannerPath: string
  spawn?: typeof defaultSpawn
}

export class NtfsFastScannerBridge {
  private readonly scannerPath: string
  private readonly spawn: typeof defaultSpawn

  constructor(dependencies: NtfsFastScannerBridgeDependencies) {
    this.scannerPath = dependencies.scannerPath
    this.spawn = dependencies.spawn ?? defaultSpawn
  }

  async start(rootPath: string, onEvent: (event: NtfsFastScannerBridgeEvent) => void): Promise<void> {
    const child = this.spawn(this.scannerPath, ['scan', '--root', rootPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams

    let stderr = ''
    let stdoutBuffer = ''

    return await new Promise<void>((resolve, reject) => {
      const finishWithError = (error: Error) => {
        reject(error)
      }

      child.on('error', finishWithError)
      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutBuffer += chunk.toString()

        let newlineIndex = stdoutBuffer.indexOf('\n')
        while (newlineIndex !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim()
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)

          if (line) {
            onEvent(JSON.parse(line) as NtfsFastScannerBridgeEvent)
          }

          newlineIndex = stdoutBuffer.indexOf('\n')
        }
      })
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString()
      })
      child.on('close', (code) => {
        if (stdoutBuffer.trim()) {
          onEvent(JSON.parse(stdoutBuffer.trim()) as NtfsFastScannerBridgeEvent)
        }

        if ((code ?? 0) !== 0) {
          const suffix = stderr.trim() ? `: ${stderr.trim()}` : ''
          reject(new Error(`ntfs-fast-scan exited with code ${code ?? 0}${suffix}`))
          return
        }

        resolve()
      })
    })
  }
}
