import { execFile as defaultExecFile } from 'node:child_process'
import { promisify } from 'node:util'

type ExecFileResult = {
  stdout: string
  stderr: string
}

type ExecFileLike = (
  file: string,
  args: string[],
  options?: {
    windowsHide?: boolean
    maxBuffer?: number
  }
) => Promise<ExecFileResult>

export type WindowsAdminDependencies = {
  execFile?: ExecFileLike
}

const execFileAsync = promisify(defaultExecFile)

function createDefaultExecFile(): ExecFileLike {
  return (file, args, options) =>
    execFileAsync(file, args, {
      windowsHide: options?.windowsHide ?? true,
      maxBuffer: options?.maxBuffer ?? 1024 * 1024
    })
}

export async function isProcessElevated(dependencies: WindowsAdminDependencies = {}): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false
  }

  const execFile = dependencies.execFile ?? createDefaultExecFile()

  try {
    const { stdout } = await execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '[Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent() | ForEach-Object { $_.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }'
      ],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    )

    return /\btrue\b/i.test(stdout)
  } catch {
    return false
  }
}
