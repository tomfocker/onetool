import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { autoUpdater as defaultAutoUpdater } from 'electron-updater'
import { IpcResponse } from '../../shared/types'
import {
  UpdateState,
  createAvailableUpdateState,
  createDownloadingUpdateState,
  createIdleUpdateState
} from '../../shared/appUpdate'

type UpdateInfo = {
  version?: string
  releaseNotes?: string | Array<{ version?: string; note?: string; name?: string; body?: string }> | null
}

type AutoUpdaterLike = {
  on: (event: string, listener: (...args: any[]) => void) => void
  checkForUpdates: () => Promise<{ updateInfo?: UpdateInfo } | null>
  downloadUpdate: () => Promise<void>
  quitAndInstall: (...args: any[]) => void
  autoDownload?: boolean
}

type AppLike = {
  isPackaged: boolean
  getVersion: () => string
}

type UpdateSettings = {
  autoCheckForUpdates?: boolean
}

type AppUpdateServiceDependencies = {
  app?: AppLike
  autoUpdater?: AutoUpdaterLike
  isDevelopment?: boolean
  getSettings?: () => Promise<UpdateSettings> | UpdateSettings
}

function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | null {
  if (typeof releaseNotes === 'string') {
    return releaseNotes
  }

  if (Array.isArray(releaseNotes)) {
    const notes = releaseNotes
      .map((item) => item.note || item.body || item.name || item.version || '')
      .filter(Boolean)

    return notes.length > 0 ? notes.join('\n') : null
  }

  return null
}

function createErrorState(currentVersion: string, errorMessage: string): UpdateState {
  return {
    status: 'error',
    currentVersion,
    latestVersion: null,
    releaseNotes: null,
    progressPercent: null,
    errorMessage
  }
}

function createNotAvailableState(currentVersion: string): UpdateState {
  return {
    status: 'not-available',
    currentVersion,
    latestVersion: null,
    releaseNotes: null,
    progressPercent: null,
    errorMessage: null
  }
}

function createCheckingState(currentVersion: string): UpdateState {
  return {
    status: 'checking',
    currentVersion,
    latestVersion: null,
    releaseNotes: null,
    progressPercent: null,
    errorMessage: null
  }
}

function createDownloadedState(details: {
  currentVersion: string
  latestVersion: string
  releaseNotes: string | null
}): UpdateState {
  return {
    status: 'downloaded',
    currentVersion: details.currentVersion,
    latestVersion: details.latestVersion,
    releaseNotes: details.releaseNotes,
    progressPercent: 100,
    errorMessage: null
  }
}

function sameState(left: UpdateState, right: UpdateState): boolean {
  return (
    left.status === right.status &&
    left.currentVersion === right.currentVersion &&
    left.latestVersion === right.latestVersion &&
    left.releaseNotes === right.releaseNotes &&
    left.progressPercent === right.progressPercent &&
    left.errorMessage === right.errorMessage
  )
}

export class AppUpdateService extends EventEmitter {
  private readonly app: AppLike

  private readonly autoUpdater: AutoUpdaterLike

  private readonly getSettings: () => Promise<UpdateSettings> | UpdateSettings

  private readonly isDevelopment: boolean

  private initialized = false

  private state: UpdateState

  constructor(dependencies: AppUpdateServiceDependencies = {}) {
    super()

    this.app = dependencies.app ?? app
    this.autoUpdater = dependencies.autoUpdater ?? (defaultAutoUpdater as unknown as AutoUpdaterLike)
    this.getSettings = dependencies.getSettings ?? (() => ({ autoCheckForUpdates: true }))
    this.isDevelopment = dependencies.isDevelopment ?? process.env.NODE_ENV !== 'production'
    this.state = createIdleUpdateState(this.app.getVersion())

    this.autoUpdater.autoDownload = false
    this.bindUpdaterEvents()
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  private setState(nextState: UpdateState): void {
    if (sameState(this.state, nextState)) {
      return
    }

    this.state = nextState
    this.emit('state-changed', this.getState())
  }

  private updateFromAvailable(version: string, releaseNotes: string | null): void {
    this.setState(
      createAvailableUpdateState({
        currentVersion: this.state.currentVersion,
        latestVersion: version,
        releaseNotes
      })
    )
  }

  private bindUpdaterEvents(): void {
    this.autoUpdater.on('checking-for-update', () => {
      this.setState(createCheckingState(this.state.currentVersion))
    })

    this.autoUpdater.on('update-available', (info: UpdateInfo) => {
      const latestVersion = info?.version ?? this.state.latestVersion ?? ''
      this.updateFromAvailable(latestVersion, normalizeReleaseNotes(info?.releaseNotes) ?? this.state.releaseNotes)
    })

    this.autoUpdater.on('update-not-available', () => {
      this.setState(createNotAvailableState(this.state.currentVersion))
    })

    this.autoUpdater.on('download-progress', (progress: { percent?: number }) => {
      const latestVersion = this.state.latestVersion ?? ''
      this.setState(
        createDownloadingUpdateState({
          currentVersion: this.state.currentVersion,
          latestVersion,
          progressPercent: progress?.percent ?? 0
        })
      )
    })

    this.autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      const latestVersion = info?.version ?? this.state.latestVersion ?? ''
      this.setState(
        createDownloadedState({
          currentVersion: this.state.currentVersion,
          latestVersion,
          releaseNotes: normalizeReleaseNotes(info?.releaseNotes) ?? this.state.releaseNotes
        })
      )
    })

    this.autoUpdater.on('error', (error: Error | string) => {
      const message = typeof error === 'string' ? error : error?.message || '更新检查失败'
      this.setState(createErrorState(this.state.currentVersion, message))
    })
  }

  private async getAutoCheckEnabled(): Promise<boolean> {
    const settings = await this.getSettings()
    return Boolean(settings?.autoCheckForUpdates)
  }

  private shouldAutoCheckOnStartup(): boolean {
    return this.app.isPackaged && !this.isDevelopment
  }

  async initialize(): Promise<IpcResponse> {
    if (this.initialized) {
      return { success: true }
    }

    this.initialized = true

    if (!this.shouldAutoCheckOnStartup()) {
      return { success: true }
    }

    if (!(await this.getAutoCheckEnabled())) {
      return { success: true }
    }

    return this.checkForUpdates()
  }

  async checkForUpdates(): Promise<IpcResponse> {
    try {
      this.setState(createCheckingState(this.state.currentVersion))
      const result = await this.autoUpdater.checkForUpdates()

      if (!result?.updateInfo) {
        this.setState(createNotAvailableState(this.state.currentVersion))
      }

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState(createErrorState(this.state.currentVersion, message))
      return { success: false, error: message }
    }
  }

  async downloadUpdate(): Promise<IpcResponse> {
    if (this.state.status !== 'available') {
      return { success: false, error: '没有可下载的更新' }
    }

    try {
      await this.autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState(createErrorState(this.state.currentVersion, message))
      return { success: false, error: message }
    }
  }

  async quitAndInstall(): Promise<IpcResponse> {
    if (this.state.status !== 'downloaded') {
      return { success: false, error: '没有可安装的更新' }
    }

    try {
      this.autoUpdater.quitAndInstall()
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState(createErrorState(this.state.currentVersion, message))
      return { success: false, error: message }
    }
  }
}

export const appUpdateService = new AppUpdateService()
