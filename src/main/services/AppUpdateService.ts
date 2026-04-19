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
  autoInstallOnAppQuit?: boolean
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
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  getSettings?: () => Promise<UpdateSettings> | UpdateSettings
}

const UNSUPPORTED_AUTO_UPDATE_RUNTIME_ERROR = '当前运行环境不支持自动更新'

export function isSupportedAutoUpdateRuntime(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  isDevelopment: boolean
): boolean {
  return platform === 'win32' && isPackaged && !isDevelopment
}

export function isPortableWindowsRuntime(env: {
  PORTABLE_EXECUTABLE_FILE?: string
  PORTABLE_EXECUTABLE_DIR?: string
}): boolean {
  return Boolean(env.PORTABLE_EXECUTABLE_FILE || env.PORTABLE_EXECUTABLE_DIR)
}

export function shouldTriggerAutoCheckOnSettingsChange(
  previousAutoCheckEnabled: boolean,
  nextAutoCheckEnabled: boolean,
  isPackaged: boolean,
  isDevelopment: boolean,
  platform: NodeJS.Platform
): boolean {
  return nextAutoCheckEnabled && !previousAutoCheckEnabled && isSupportedAutoUpdateRuntime(platform, isPackaged, isDevelopment)
}

export function registerAutoUpdateSettingsChangeHandler(deps: {
  settingsService: {
    getSettings: () => UpdateSettings
    on: (event: 'changed', listener: (settings: UpdateSettings) => void) => void
  }
  appUpdateService: {
    checkForUpdates: () => Promise<IpcResponse> | IpcResponse | void
  }
  runtime: {
    platform: NodeJS.Platform
    isPackaged: boolean
    isDevelopment: boolean
  }
}): void {
  let autoCheckForUpdatesEnabled = Boolean(deps.settingsService.getSettings().autoCheckForUpdates)

  deps.settingsService.on('changed', (newSettings) => {
    const nextAutoCheckForUpdatesEnabled = Boolean(newSettings.autoCheckForUpdates)

    if (
      shouldTriggerAutoCheckOnSettingsChange(
        autoCheckForUpdatesEnabled,
        nextAutoCheckForUpdatesEnabled,
        deps.runtime.isPackaged,
        deps.runtime.isDevelopment,
        deps.runtime.platform
      )
    ) {
      void deps.appUpdateService.checkForUpdates()
    }

    autoCheckForUpdatesEnabled = nextAutoCheckForUpdatesEnabled
  })
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

function createErrorStateFromCurrentState(state: UpdateState, errorMessage: string): UpdateState {
  return {
    status: 'error',
    currentVersion: state.currentVersion,
    latestVersion: state.latestVersion,
    releaseNotes: state.releaseNotes,
    progressPercent: state.progressPercent,
    errorMessage
  }
}

function getErrorMessage(error: unknown, fallbackMessage = '更新检查失败'): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallbackMessage
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

function shouldPreserveActionableCheckState(state: UpdateState): boolean {
  return hasActiveDownload(state) || state.status === 'downloaded'
}

export class AppUpdateService extends EventEmitter {
  private readonly app: AppLike

  private readonly autoUpdater: AutoUpdaterLike

  private readonly getSettings: () => Promise<UpdateSettings> | UpdateSettings

  private readonly isDevelopment: boolean

  private readonly platform: NodeJS.Platform

  private readonly env: NodeJS.ProcessEnv

  private initialized = false

  private initializationPromise: Promise<IpcResponse> | null = null

  private checkForUpdatesPromise: Promise<IpcResponse> | null = null

  private state: UpdateState

  private beforeQuitAndInstall: () => void | (() => void) = () => undefined

  constructor(dependencies: AppUpdateServiceDependencies = {}) {
    super()

    this.app = dependencies.app ?? app
    this.autoUpdater = dependencies.autoUpdater ?? (defaultAutoUpdater as unknown as AutoUpdaterLike)
    this.getSettings = dependencies.getSettings ?? (() => ({ autoCheckForUpdates: true }))
    this.isDevelopment = dependencies.isDevelopment ?? !this.app.isPackaged
    this.platform = dependencies.platform ?? process.platform
    this.env = dependencies.env ?? process.env
    this.state = createIdleUpdateState(this.app.getVersion())

    this.autoUpdater.autoDownload = false
    this.autoUpdater.autoInstallOnAppQuit = false
    this.bindUpdaterEvents()
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  setBeforeQuitAndInstall(handler: (() => void | (() => void)) | null | undefined): void {
    this.beforeQuitAndInstall = handler ?? (() => undefined)
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
      const message = getErrorMessage(error)
      this.setState(createErrorStateFromCurrentState(this.state, message))
    })
  }

  private async getAutoCheckEnabled(): Promise<boolean> {
    const settings = await this.getSettings()
    return Boolean(settings?.autoCheckForUpdates)
  }

  private shouldAutoCheckOnStartup(): boolean {
    return (
      isSupportedAutoUpdateRuntime(this.platform, this.app.isPackaged, this.isDevelopment) &&
      !isPortableWindowsRuntime({
        PORTABLE_EXECUTABLE_FILE: this.env.PORTABLE_EXECUTABLE_FILE,
        PORTABLE_EXECUTABLE_DIR: this.env.PORTABLE_EXECUTABLE_DIR
      })
    )
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
    if (!this.shouldAutoCheckOnStartup()) {
      this.setState(createErrorStateFromCurrentState(this.state, UNSUPPORTED_AUTO_UPDATE_RUNTIME_ERROR))
      return {
        success: false,
        error: UNSUPPORTED_AUTO_UPDATE_RUNTIME_ERROR
      }
    }

    if (this.checkForUpdatesPromise) {
      return this.checkForUpdatesPromise
    }

    this.checkForUpdatesPromise = (async () => {
      const preCheckState = this.getState()

      try {
        this.setState(createCheckingState(this.state.currentVersion))
        const result = await this.autoUpdater.checkForUpdates()

        if (!result?.updateInfo) {
          this.setState(createNotAvailableState(this.state.currentVersion))
        }

        return { success: true }
      } catch (error) {
        const message = getErrorMessage(error)
        const errorStateBase = shouldPreserveActionableCheckState(preCheckState)
          ? preCheckState
          : this.state
        this.setState(createErrorStateFromCurrentState(errorStateBase, message))
        return { success: false, error: message }
      } finally {
        this.checkForUpdatesPromise = null
      }
    })()

    return this.checkForUpdatesPromise
  }

  async downloadUpdate(): Promise<IpcResponse> {
    if (this.state.status !== 'available') {
      return { success: false, error: '没有可下载的更新' }
    }

    try {
      await this.autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const message = getErrorMessage(error)
      this.setState(createErrorStateFromCurrentState(this.state, message))
      return { success: false, error: message }
    }
  }

  async quitAndInstall(): Promise<IpcResponse> {
    if (this.state.status !== 'downloaded') {
      return { success: false, error: '没有可安装的更新' }
    }

    let rollbackQuitPreparation: (() => void) | undefined

    try {
      const maybeRollback = this.beforeQuitAndInstall()
      rollbackQuitPreparation = typeof maybeRollback === 'function' ? maybeRollback : undefined
      this.autoUpdater.quitAndInstall()
      return { success: true }
    } catch (error) {
      rollbackQuitPreparation?.()
      const message = getErrorMessage(error)
      this.setState(createErrorStateFromCurrentState(this.state, message))
      return { success: false, error: message }
    }
  }
}

export const appUpdateService = new AppUpdateService()
