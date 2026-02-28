import { exec, spawn } from 'child_process'
import { logger } from './logger'
import { processRegistry } from '../services/ProcessRegistry'

/**
 * Execute a standard shell command robustly.
 */
export function execCommand(cmd: string, timeoutMs: number = 30000): Promise<string> {
  return new Promise((resolve) => {
    const cp = exec(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        logger.error('Command execution failed:', cmd, error.message)
        resolve('')
      } else {
        resolve(stdout.trim())
      }
    })
    processRegistry.register(cp)
  })
}

/**
 * Execute a PowerShell script robustly, enforcing UTF-8 output encoding.
 */
export function execPowerShell(script: string, timeoutMs: number = 60000): Promise<string> {
  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout | null = null

    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    processRegistry.register(ps)

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    ps.stdout.on('data', (chunk) => stdoutChunks.push(chunk))
    ps.stderr.on('data', (chunk) => stderrChunks.push(chunk))

    ps.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)

      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
      if (code !== 0 && !stdout) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        logger.error(`PowerShell script failed with code ${code}. Error: ${stderr}`)
        resolve('')
      } else {
        resolve(stdout)
      }
    })

    const robustScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`

    ps.stdin.write(robustScript)
    ps.stdin.end()

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        logger.warn(`PowerShell script timed out after ${timeoutMs}ms. Killing process.`)
        ps.kill()
        resolve('')
      }, timeoutMs)
    }
  })
}

/**
 * Execute a PowerShell script securely using -EncodedCommand to bypass stdin parsing issues.
 */
export function execPowerShellEncoded(script: string, timeoutMs: number = 60000): Promise<string> {
  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout | null = null
    const robustScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`;
    const encodedScript = Buffer.from(robustScript, 'utf16le').toString('base64');

    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    processRegistry.register(ps)

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    ps.stdout.on('data', (chunk) => stdoutChunks.push(chunk))
    ps.stderr.on('data', (chunk) => stderrChunks.push(chunk))

    ps.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)

      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
      if (code !== 0 && !stdout) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        logger.error(`PowerShell Encoded script failed with code ${code}. Error: ${stderr}`)
        resolve('')
      } else {
        resolve(stdout)
      }
    })

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        logger.warn(`PowerShell Encoded script timed out after ${timeoutMs}ms. Killing process.`)
        ps.kill()
        resolve('')
      }, timeoutMs)
    }
  })
}
