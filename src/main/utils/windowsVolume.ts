import { execFile as execFileCallback } from 'child_process'
import type { SpaceCleanupDriveRoot, SpaceCleanupDriveType } from '../../shared/spaceCleanup'

export type FastScanMode = 'filesystem' | 'ntfs-fast'

export type FastScanEligibility = {
  mode: FastScanMode
  reason: string | null
}

type ExecFileFn = typeof execFileCallback

type FastScanEligibilityOptions = {
  platform?: NodeJS.Platform
  execFile?: ExecFileFn
  preferNtfsFastForDirectories?: boolean
}

type WindowsDriveRootsOptions = {
  platform?: NodeJS.Platform
  execFile?: ExecFileFn
}

type WindowsLogicalDiskRow = {
  DeviceID?: unknown
  VolumeName?: unknown
  FileSystem?: unknown
  DriveType?: unknown
  Size?: unknown
  FreeSpace?: unknown
}

const DRIVE_ROOT_QUERY_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
  '$OutputEncoding = [Console]::OutputEncoding',
  'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,FileSystem,DriveType,Size,FreeSpace | ConvertTo-Json -Compress'
].join('; ')

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

function isWindowsLocalDrivePath(targetPath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(targetPath)
}

function toVolumeSpecifier(targetPath: string): string {
  return `${targetPath.slice(0, 2)}`
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

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toDriveType(value: unknown): SpaceCleanupDriveType {
  const numeric = typeof value === 'number' ? value : Number(value)

  switch (numeric) {
    case 2:
      return 'removable'
    case 3:
      return 'fixed'
    case 4:
      return 'network'
    case 5:
      return 'cdrom'
    case 6:
      return 'ramdisk'
    default:
      return 'unknown'
  }
}

function normalizeLogicalDiskRows(output: string): WindowsLogicalDiskRow[] {
  const trimmed = output.trim()
  if (!trimmed) {
    return []
  }

  const parsed = JSON.parse(trimmed)
  if (!parsed) {
    return []
  }

  return Array.isArray(parsed) ? parsed : [parsed]
}

function mapLogicalDiskRow(row: WindowsLogicalDiskRow): SpaceCleanupDriveRoot | null {
  const deviceId = toNullableString(row.DeviceID)?.toUpperCase()
  if (!deviceId || !/^[A-Z]:$/.test(deviceId)) {
    return null
  }

  const filesystem = toNullableString(row.FileSystem)
  const driveType = toDriveType(row.DriveType)

  return {
    path: `${deviceId}\\`,
    label: deviceId,
    name: toNullableString(row.VolumeName),
    filesystem,
    driveType,
    totalBytes: toNullableNumber(row.Size),
    freeBytes: toNullableNumber(row.FreeSpace),
    supportsNtfsFast: driveType === 'fixed' && filesystem?.toUpperCase() === 'NTFS'
  }
}

export async function listWindowsDriveRoots(
  options: WindowsDriveRootsOptions = {}
): Promise<SpaceCleanupDriveRoot[]> {
  const platform = options.platform ?? process.platform

  if (platform !== 'win32') {
    return []
  }

  const execFile = options.execFile ?? execFileCallback
  const stdout = await execFileAsync(execFile, 'powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    DRIVE_ROOT_QUERY_SCRIPT
  ])

  return normalizeLogicalDiskRows(stdout)
    .map(mapLogicalDiskRow)
    .filter((root): root is SpaceCleanupDriveRoot => Boolean(root))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export async function getFastScanEligibility(
  targetPath: string,
  options: FastScanEligibilityOptions = {}
): Promise<FastScanEligibility> {
  const platform = options.platform ?? process.platform

  if (platform !== 'win32') {
    return {
      mode: 'filesystem',
      reason: 'NTFS 极速扫描仅支持 Windows'
    }
  }

  const isRootVolume = isWindowsLocalRootVolume(targetPath)
  if (!isRootVolume && (!options.preferNtfsFastForDirectories || !isWindowsLocalDrivePath(targetPath))) {
    return {
      mode: 'filesystem',
      reason: options.preferNtfsFastForDirectories
        ? 'NTFS 极速扫描仅支持本地盘符路径'
        : '文件夹默认使用普通扫描；NTFS 极速扫描默认仅用于本地盘根路径'
    }
  }

  const execFile = options.execFile ?? execFileCallback

  try {
    const stdout = await execFileAsync(execFile, 'fsutil', ['fsinfo', 'volumeinfo', toVolumeSpecifier(targetPath)])
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
      mode: 'ntfs-fast',
      reason: 'fsutil 探测失败，无法预判文件系统；将先尝试 NTFS 极速扫描，失败后自动回退普通扫描'
    }
  }
}
