import { z } from 'zod'
import { createDefaultTaskbarAppearanceSettings } from './taskbarAppearance'
import type { AppSettings } from './types'

export const SETTINGS_SCHEMA_VERSION = 1
const DEFAULT_CALENDAR_REMINDER_LEAD_MINUTES = 10

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
    taskbarAppearanceTint: defaultTaskbarAppearanceSettings.tintHex,
    calendarWidgetEnabled: false,
    calendarWidgetBounds: null,
    calendarWidgetAlwaysOnTop: false,
    calendarWidgetBackgroundMode: 'solid',
    calendarReminderLeadMinutes: DEFAULT_CALENDAR_REMINDER_LEAD_MINUTES
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
  taskbarAppearanceTint: z.string(),
  calendarWidgetEnabled: z.boolean(),
  calendarWidgetBounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }).nullable(),
  calendarWidgetAlwaysOnTop: z.boolean(),
  calendarWidgetBackgroundMode: z.enum(['solid', 'glass']),
  calendarReminderLeadMinutes: z.number().int().min(0).max(1440)
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
