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

const WINDOWS_11_BUILD = 22000
const MODERN_HELPER_BUILD = 22621
const MODERN_HELPER_MAX_SAFE_BUILD = 26100

function getWindowsBuild(release: string): number {
  const parts = release.split('.')
  const build = Number(parts[parts.length - 1] ?? 0)
  return Number.isFinite(build) ? build : 0
}

function getWindowsOnlyReason(isWindows: boolean, isWindows11Capable: boolean): string {
  if (!isWindows) {
    return '仅支持 Windows'
  }

  if (!isWindows11Capable) {
    return '仅支持 Windows 11'
  }

  return '当前系统暂不支持任务栏外观增强'
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
  const isWindows11Capable = isWindows && build >= WINDOWS_11_BUILD
  const helperCompatible = isWindows11Capable &&
    build >= MODERN_HELPER_BUILD &&
    build < MODERN_HELPER_MAX_SAFE_BUILD
  const hasKnown24H2CompatibilityIssue = isWindows11Capable && build >= MODERN_HELPER_MAX_SAFE_BUILD
  const acrylicAvailable = helperCompatible
  const supported = isWindows11Capable && !hasKnown24H2CompatibilityIssue
  const unsupportedReason = hasKnown24H2CompatibilityIssue
    ? '当前 Windows 11 24H2 存在已知兼容性问题，暂不支持任务栏材质增强。'
    : getWindowsOnlyReason(isWindows, isWindows11Capable)

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
        available: supported,
        reason: supported ? null : unsupportedReason
      },
      blur: {
        available: supported,
        reason: supported ? null : unsupportedReason
      },
      acrylic: {
        available: acrylicAvailable,
        reason: acrylicAvailable
          ? null
          : (
              hasKnown24H2CompatibilityIssue
                ? unsupportedReason
                : '需要较新的 Windows 11 版本'
            )
      }
    }
  }
}
