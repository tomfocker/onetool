import { execFile as execFileCallback } from 'child_process'

export type FastScanMode = 'filesystem' | 'ntfs-fast'

export type FastScanEligibility = {
  mode: FastScanMode
  reason: string | null
}

type ExecFileFn = typeof execFileCallback

function execFileAsync(execFile: ExecFileFn, file: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (error: unknown, stdout?: unknown) => {
      if (settled) {
        return
      }

      settled = true

      if (error) {
        reject(error)
        return
      }

      resolve(String(stdout ?? ''))
    }

    const result = execFile(file, args as string[], { windowsHide: true }, (error, stdout) => {
      done(error, stdout)
    })

    const maybePromise = result as unknown
    if (
      maybePromise &&
      typeof maybePromise === 'object' &&
      'then' in maybePromise &&
      typeof (maybePromise as Promise<{ stdout?: unknown }>).then === 'function'
    ) {
      ;(maybePromise as Promise<{ stdout?: unknown }>).then((value) => {
        done(null, value?.stdout)
      }, (error) => {
        done(error)
      })
    }
  })
}

function isWindowsLocalRootVolume(targetPath: string): boolean {
  return /^[A-Za-z]:[\\/]+$/.test(targetPath)
}

function extractFilesystemName(output: string): string | null {
  const normalized = output.replace(/\u0000/g, '')
  const knownFilesystems = ['exFAT', 'NTFS', 'ReFS', 'FAT32', 'FAT']

  for (const filesystem of knownFilesystems) {
    if (new RegExp(`\\b${filesystem}\\b`, 'i').test(normalized)) {
      return filesystem
    }
  }

  return null
}

export async function getFastScanEligibility(
  targetPath: string,
  options: {
    platform?: NodeJS.Platform
    execFile?: ExecFileFn
  } = {}
): Promise<FastScanEligibility> {
  const platform = options.platform ?? process.platform

  if (platform !== 'win32') {
    return {
      mode: 'filesystem',
      reason: 'NTFS 极速扫描仅支持 Windows'
    }
  }

  if (!isWindowsLocalRootVolume(targetPath)) {
    return {
      mode: 'filesystem',
      reason: 'NTFS 极速扫描仅支持本地盘根路径'
    }
  }

  const execFile = options.execFile ?? execFileCallback

  try {
    const stdout = await execFileAsync(execFile, 'fsutil', ['fsinfo', 'volumeinfo', targetPath])
    const filesystem = extractFilesystemName(stdout)

    if (filesystem?.toUpperCase() !== 'NTFS') {
      return {
        mode: 'filesystem',
        reason: filesystem
          ? `NTFS 极速扫描仅支持 NTFS，当前文件系统为 ${filesystem}`
          : 'NTFS 极速扫描仅支持 NTFS，当前文件系统未知'
      }
    }

    return {
      mode: 'ntfs-fast',
      reason: null
    }
  } catch {
    return {
      mode: 'filesystem',
      reason: 'NTFS 极速扫描仅支持 NTFS，fsutil 探测失败，当前文件系统未知'
    }
  }
}
