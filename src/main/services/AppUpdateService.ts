import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { autoUpdater as defaultAutoUpdater } from 'electron-updater'
import { IpcResponse } from '../../shared/types'
import {
  UpdateState,
  createAvailableUpdateState,
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

function createDownloadingState(details: {
  currentVersion: string
  latestVersion: string
  releaseNotes: string | null
  progressPercent: number
}): UpdateState {
  return {
    status: 'downloading',
    currentVersion: details.currentVersion,
    latestVersion: details.latestVersion,
    releaseNotes: details.releaseNotes,
    progressPercent: Math.round(details.progressPercent),
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

function hasActiveDownload(state: UpdateState): boolean {
  return (state.status === 'available' || state.status === 'downloading') && Boolean(state.latestVersion)
}

export class AppUpdateService extends EventEmitter {
  private readonly app: AppLike

  private readonly autoUpdater: AutoUpdaterLike

  private readonly getSettings: () => Promise<UpdateSettings> | UpdateSettings

  private readonly isDevelopment: boolean

  private initialized = false

  private initializationPromise: Promise<IpcResponse> | null = null

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
      const latestVersion = info?.version?.trim() ?? this.state.latestVersion ?? ''
      if (!latestVersion) {
        return
      }

      this.updateFromAvailable(latestVersion, normalizeReleaseNotes(info?.releaseNotes) ?? this.state.releaseNotes)
    })

    this.autoUpdater.on('update-not-available', () => {
      this.setState(createNotAvailableState(this.state.currentVersion))
    })

    this.autoUpdater.on('download-progress', (progress: { percent?: number }) => {
      if (!hasActiveDownload(this.state)) {
        return
      }

      this.setState(createDownloadingState({
        currentVersion: this.state.currentVersion,
        latestVersion: this.state.latestVersion as string,
        releaseNotes: this.state.releaseNotes,
        progressPercent: progress?.percent ?? 0
      }))
    })

    this.autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      if (!hasActiveDownload(this.state)) {
        return
      }

      const latestVersion = info?.version?.trim() ?? this.state.latestVersion ?? ''
      if (!latestVersion) {
        return
      }

      this.setState(createDownloadedState({
        currentVersion: this.state.currentVersion,
        latestVersion,
        releaseNotes: normalizeReleaseNotes(info?.releaseNotes) ?? this.state.releaseNotes
      }))
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

    if (this.initializationPromise) {
      return this.initializationPromise
    }

    this.initializationPromise = (async () => {
      try {
        if (!this.shouldAutoCheckOnStartup()) {
          this.initialized = true
          return { success: true }
        }

        if (!(await this.getAutoCheckEnabled())) {
          this.initialized = true
          return { success: true }
        }

        const result = await this.checkForUpdates()
        if (result.success) {
          this.initialized = true
        }

        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
      } finally {
        this.initializationPromise = null
      }
    })()

    return this.initializationPromise
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
