import { z } from 'zod'
import { createDefaultTaskbarAppearanceSettings } from './taskbarAppearance'
import type { AppSettings } from './types'

export const SETTINGS_SCHEMA_VERSION = 1

const defaultTaskbarAppearanceSettings = createDefaultTaskbarAppearanceSettings()

export function createDefaultAppSettings(): AppSettings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    recorderHotkey: 'Alt+Shift+R',
    screenshotHotkey: 'Alt+Shift+S',
    floatBallHotkey: 'Alt+Shift+F',
    clipboardHotkey: 'Alt+Shift+C',
    screenshotSavePath: '',
    autoSaveScreenshot: false,
    autoCheckForUpdates: true,
    minimizeToTray: true,
    translateApiUrl: 'https://api.openai.com/v1',
    translateApiKey: '',
    translateModel: 'gpt-4o',
    taskbarAppearanceEnabled: defaultTaskbarAppearanceSettings.enabled,
    taskbarAppearancePreset: defaultTaskbarAppearanceSettings.preset,
    taskbarAppearanceIntensity: defaultTaskbarAppearanceSettings.intensity,
    taskbarAppearanceTint: defaultTaskbarAppearanceSettings.tintHex
  }
}

const SettingsSchema = z.object({
  schemaVersion: z.number().int().positive(),
  recorderHotkey: z.string(),
  screenshotHotkey: z.string(),
  floatBallHotkey: z.string(),
  clipboardHotkey: z.string(),
  screenshotSavePath: z.string(),
  autoSaveScreenshot: z.boolean(),
  autoCheckForUpdates: z.boolean(),
  minimizeToTray: z.boolean(),
  translateApiUrl: z.string(),
  translateApiKey: z.string(),
  translateModel: z.string(),
  taskbarAppearanceEnabled: z.boolean(),
  taskbarAppearancePreset: z.enum(['default', 'transparent', 'blur', 'acrylic']),
  taskbarAppearanceIntensity: z.number(),
  taskbarAppearanceTint: z.string()
})

export function migrateSettings(parsed: unknown): AppSettings {
  const defaults = createDefaultAppSettings()
  const normalized = {
    ...defaults,
    ...(parsed && typeof parsed === 'object' ? parsed : {}),
    schemaVersion: SETTINGS_SCHEMA_VERSION
  }

  return SettingsSchema.parse(normalized)
}
