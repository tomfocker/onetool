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
import { WindowsTaskbarAdapter } from './windows/WindowsTaskbarAdapter'

type TaskbarRuntime = {
  platform: NodeJS.Platform
  release: string
}

type TaskbarAppearanceAdapter = {
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
  constructor(
    private readonly adapter: TaskbarAppearanceAdapter = new WindowsTaskbarAdapter(),
    private readonly settings: TaskbarAppearanceSettingsStore = settingsService,
    private readonly runtime: TaskbarRuntime = { platform: process.platform, release: os.release() }
  ) {}

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

    return this.settings.updateSettings({
      taskbarAppearanceEnabled: effectiveInput.preset !== 'default',
      taskbarAppearancePreset: effectiveInput.preset,
      taskbarAppearanceIntensity: effectiveInput.intensity,
      taskbarAppearanceTint: effectiveInput.tintHex
    })
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
