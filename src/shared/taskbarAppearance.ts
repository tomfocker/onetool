export type TaskbarAppearancePreset = 'default' | 'transparent' | 'blur' | 'acrylic'

export interface TaskbarAppearanceSettings {
  enabled: boolean
  preset: TaskbarAppearancePreset
  intensity: number
  tintHex: string
}

export interface TaskbarAppearancePresetAvailability {
  available: boolean
  reason: string | null
}

export interface TaskbarAppearanceAvailability {
  supported: boolean
  host: {
    platform: NodeJS.Platform
    build: number
    isWindows: boolean
    isWindows11Capable: boolean
    acrylicAvailable: boolean
  }
  presets: Record<TaskbarAppearancePreset, TaskbarAppearancePresetAvailability>
}

function getWindowsBuild(release: string): number {
  const parts = release.split('.')
  const build = Number(parts[parts.length - 1] ?? 0)
  return Number.isFinite(build) ? build : 0
}

export function createDefaultTaskbarAppearanceSettings(): TaskbarAppearanceSettings {
  return {
    enabled: false,
    preset: 'blur',
    intensity: 60,
    tintHex: '#FFFFFF33'
  }
}

export function resolveTaskbarAppearanceAvailability(runtime: {
  platform: NodeJS.Platform
  release: string
}): TaskbarAppearanceAvailability {
  const isWindows = runtime.platform === 'win32'
  const build = getWindowsBuild(runtime.release)
  const isWindows11Capable = isWindows && build >= 22000
  const acrylicAvailable = isWindows11Capable && build >= 22621
  const supported = isWindows11Capable

  return {
    supported,
    host: {
      platform: runtime.platform,
      build,
      isWindows,
      isWindows11Capable,
      acrylicAvailable
    },
    presets: {
      default: {
        available: isWindows,
        reason: isWindows ? null : '仅支持 Windows'
      },
      transparent: {
        available: isWindows11Capable,
        reason: isWindows11Capable ? null : '仅支持 Windows 11'
      },
      blur: {
        available: isWindows11Capable,
        reason: isWindows11Capable ? null : '仅支持 Windows 11'
      },
      acrylic: {
        available: acrylicAvailable,
        reason: acrylicAvailable ? null : '需要较新的 Windows 11 版本'
      }
    }
  }
}
