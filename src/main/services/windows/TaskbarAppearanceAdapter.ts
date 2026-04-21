import { TranslucentTbAdapter } from './TranslucentTbAdapter'
import { WindowsTaskbarAdapter } from './WindowsTaskbarAdapter'

type TaskbarAppearanceRuntime = {
  platform: NodeJS.Platform
  release: string
}

type TaskbarAppearanceInput = {
  preset: 'default' | 'transparent' | 'blur' | 'acrylic'
  intensity: number
  tintHex: string
}

const MODERN_HELPER_BUILD = 22621
const MODERN_HELPER_MAX_SAFE_BUILD = 26100

function getWindowsBuild(release: string): number {
  const parts = release.split('.')
  const build = Number(parts[parts.length - 1] ?? 0)
  return Number.isFinite(build) ? build : 0
}

export class TaskbarAppearanceAdapter {
  private readonly legacyAdapter: WindowsTaskbarAdapter
  private readonly modernAdapter: TranslucentTbAdapter

  constructor(
    private readonly runtime: TaskbarAppearanceRuntime,
    dependencies: {
      legacyAdapter?: WindowsTaskbarAdapter
      modernAdapter?: TranslucentTbAdapter
    } = {}
  ) {
    this.legacyAdapter = dependencies.legacyAdapter ?? new WindowsTaskbarAdapter()
    this.modernAdapter = dependencies.modernAdapter ?? new TranslucentTbAdapter()
  }

  private getWindowsBuild(): number {
    return getWindowsBuild(this.runtime.release)
  }

  private canApplyModernHelper(): boolean {
    return this.runtime.platform === 'win32' &&
      this.getWindowsBuild() >= MODERN_HELPER_BUILD &&
      this.getWindowsBuild() < MODERN_HELPER_MAX_SAFE_BUILD
  }

  private canRestoreModernHelperState(): boolean {
    return this.runtime.platform === 'win32' && this.getWindowsBuild() >= MODERN_HELPER_BUILD
  }

  async applyAppearance(input: TaskbarAppearanceInput) {
    if (this.canApplyModernHelper()) {
      return this.modernAdapter.applyAppearance(input)
    }

    if (this.runtime.platform === 'win32' && this.getWindowsBuild() >= MODERN_HELPER_MAX_SAFE_BUILD) {
      return {
        success: false,
        error: '当前 Windows 11 24H2 存在已知兼容性问题，TranslucentTB 无法初始化 XAML Diagnostics。'
      }
    }

    return this.legacyAdapter.applyAppearance(input)
  }

  async restoreDefault() {
    return this.canRestoreModernHelperState()
      ? this.modernAdapter.restoreDefault()
      : this.legacyAdapter.restoreDefault()
  }
}
