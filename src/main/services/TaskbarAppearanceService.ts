import os from 'node:os'
import {
  createDefaultTaskbarAppearanceSettings,
  resolveTaskbarAppearanceAvailability,
  type TaskbarAppearanceAvailability,
  type TaskbarAppearancePreset,
  type TaskbarAppearanceSettings
} from '../../shared/taskbarAppearance'
import type { AppSettings, IpcResponse } from '../../shared/types'
import { settingsService } from './SettingsService'
import { TaskbarAppearanceAdapter } from './windows/TaskbarAppearanceAdapter'

type TaskbarRuntime = {
  platform: NodeJS.Platform
  release: string
}

type TaskbarAppearanceAdapterLike = {
  applyAppearance(input: {
    preset: TaskbarAppearancePreset
    intensity: number
    tintHex: string
  }): Promise<IpcResponse>
  restoreDefault(): Promise<IpcResponse>
}

type TaskbarAppearanceSettingsStore = {
  getSettings(): AppSettings
  updateSettings(updates: Partial<AppSettings>): Promise<IpcResponse>
}

type TaskbarAppearanceStatus = {
  support: TaskbarAppearanceAvailability
  settings: TaskbarAppearanceSettings
}

type ApplyTaskbarAppearanceInput = {
  preset: TaskbarAppearancePreset
  intensity: number
  tintHex: string
}

export class TaskbarAppearanceService {
  private readonly adapter: TaskbarAppearanceAdapterLike
  private readonly settings: TaskbarAppearanceSettingsStore
  private readonly runtime: TaskbarRuntime

  constructor(
    adapter?: TaskbarAppearanceAdapterLike,
    settings: TaskbarAppearanceSettingsStore = settingsService,
    runtime: TaskbarRuntime = { platform: process.platform, release: os.release() }
  ) {
    this.runtime = runtime
    this.settings = settings
    this.adapter = adapter ?? new TaskbarAppearanceAdapter(runtime)
  }

  private getPersistedSettings(): TaskbarAppearanceSettings {
    const persisted = this.settings.getSettings()

    return {
      enabled: persisted.taskbarAppearanceEnabled,
      preset: persisted.taskbarAppearancePreset,
      intensity: persisted.taskbarAppearanceIntensity,
      tintHex: persisted.taskbarAppearanceTint
    }
  }

  private getSupport(): TaskbarAppearanceAvailability {
    return resolveTaskbarAppearanceAvailability(this.runtime)
  }

  private getDefaultSettingsUpdate(): Partial<AppSettings> {
    const defaults = createDefaultTaskbarAppearanceSettings()

    return {
      taskbarAppearanceEnabled: false,
      taskbarAppearancePreset: 'default',
      taskbarAppearanceIntensity: defaults.intensity,
      taskbarAppearanceTint: defaults.tintHex
    }
  }

  private getPresetGuardResult(preset: TaskbarAppearancePreset): IpcResponse | null {
    const support = this.getSupport()
    const availability = support.presets[preset]

    if (availability.available) {
      return null
    }

    return {
      success: false,
      error: availability.reason ?? '当前系统不支持任务栏外观'
    }
  }

  getStatus(): IpcResponse<TaskbarAppearanceStatus> {
    return {
      success: true,
      data: {
        support: this.getSupport(),
        settings: this.getPersistedSettings()
      }
    }
  }

  async restoreFromSettings(): Promise<IpcResponse> {
    const persisted = this.getPersistedSettings()
    if (!persisted.enabled) {
      return { success: true }
    }

    if (!this.getSupport().supported) {
      return { success: true }
    }

    const guardResult = this.getPresetGuardResult(persisted.preset)
    const attemptedRestoreInPrimaryPath = persisted.preset === 'default'
    const applyResult = guardResult ?? (
      attemptedRestoreInPrimaryPath
        ? await this.adapter.restoreDefault()
        : await this.adapter.applyAppearance(persisted)
    )

    if (applyResult.success) {
      return applyResult
    }

    if (!attemptedRestoreInPrimaryPath) {
      await this.adapter.restoreDefault()
    }
    const settingsResult = await this.settings.updateSettings(this.getDefaultSettingsUpdate())
    return settingsResult.success ? applyResult : settingsResult
  }

  async applyPreset(input: ApplyTaskbarAppearanceInput): Promise<IpcResponse> {
    const effectiveInput = input.preset === 'default'
      ? {
          preset: 'default' as const,
          intensity: createDefaultTaskbarAppearanceSettings().intensity,
          tintHex: createDefaultTaskbarAppearanceSettings().tintHex
        }
      : input

    const guardResult = this.getPresetGuardResult(effectiveInput.preset)
    if (guardResult) {
      return guardResult
    }

    const adapterResult = effectiveInput.preset === 'default'
      ? await this.adapter.restoreDefault()
      : await this.adapter.applyAppearance(effectiveInput)

    if (!adapterResult.success) {
      return adapterResult
    }

    return this.settings.updateSettings(
      effectiveInput.preset === 'default'
        ? this.getDefaultSettingsUpdate()
        : {
            taskbarAppearanceEnabled: true,
            taskbarAppearancePreset: effectiveInput.preset,
            taskbarAppearanceIntensity: effectiveInput.intensity,
            taskbarAppearanceTint: effectiveInput.tintHex
          }
    )
  }

  async restoreDefault(): Promise<IpcResponse> {
    const defaults = createDefaultTaskbarAppearanceSettings()

    return this.applyPreset({
      preset: 'default',
      intensity: defaults.intensity,
      tintHex: defaults.tintHex
    })
  }
}

export const taskbarAppearanceService = new TaskbarAppearanceService()
