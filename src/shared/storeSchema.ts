import { DEFAULT_PINNED_TOOL_IDS } from './devEnvironment'
import { createDefaultDownloadOrganizerStoredState } from './downloadOrganizer'
import { createDefaultAppSettings, migrateSettings } from './settingsSchema'
import type { GlobalStore } from './types'

const DEFAULT_WINDOWS_MANAGER_FAVORITES = [
  'control',
  'taskmgr',
  'powershell',
  'services',
  'devmgmt',
  'diskmgmt',
  'appwiz',
  'sysdm'
]

export const GLOBAL_STORE_SCHEMA_VERSION = 1

export function createDefaultGlobalStore(appVersion: string): GlobalStore {
  return {
    schemaVersion: GLOBAL_STORE_SCHEMA_VERSION,
    settings: createDefaultAppSettings(),
    renamePresets: [],
    webActivatorConfigs: [],
    toolUsages: [],
    pinnedToolIds: [...DEFAULT_PINNED_TOOL_IDS],
    windowsManagerFavorites: [...DEFAULT_WINDOWS_MANAGER_FAVORITES],
    clipboardHistory: [],
    downloadOrganizer: createDefaultDownloadOrganizerStoredState(),
    version: appVersion
  }
}

export function migrateGlobalStore(
  parsed: Partial<GlobalStore> & Record<string, any>,
  appVersion: string
): GlobalStore {
  const defaults = createDefaultGlobalStore(appVersion)
  const defaultDownloadOrganizer = createDefaultDownloadOrganizerStoredState()

  return {
    ...defaults,
    ...parsed,
    schemaVersion: GLOBAL_STORE_SCHEMA_VERSION,
    version: typeof parsed.version === 'string' && parsed.version.trim().length > 0
      ? parsed.version
      : defaults.version,
    pinnedToolIds: Array.isArray(parsed.pinnedToolIds)
      ? Array.from(new Set(parsed.pinnedToolIds.filter((item: unknown): item is string => typeof item === 'string'))).slice(0, 6)
      : [...DEFAULT_PINNED_TOOL_IDS],
    windowsManagerFavorites: Array.isArray(parsed.windowsManagerFavorites)
      ? parsed.windowsManagerFavorites.filter((item: unknown): item is string => typeof item === 'string')
      : [...DEFAULT_WINDOWS_MANAGER_FAVORITES],
    settings: migrateSettings(parsed.settings),
    downloadOrganizer: {
      ...defaultDownloadOrganizer,
      ...(parsed.downloadOrganizer || {}),
      config: {
        ...defaultDownloadOrganizer.config,
        ...(parsed.downloadOrganizer?.config || {}),
        rules: Array.isArray(parsed.downloadOrganizer?.config?.rules)
          ? parsed.downloadOrganizer.config.rules
          : defaultDownloadOrganizer.config.rules,
        ignoredExtensions: Array.isArray(parsed.downloadOrganizer?.config?.ignoredExtensions)
          ? parsed.downloadOrganizer.config.ignoredExtensions
          : defaultDownloadOrganizer.config.ignoredExtensions
      },
      lastPreviewItems: Array.isArray(parsed.downloadOrganizer?.lastPreviewItems)
        ? parsed.downloadOrganizer.lastPreviewItems
        : [],
      activity: Array.isArray(parsed.downloadOrganizer?.activity)
        ? parsed.downloadOrganizer.activity
        : []
    }
  }
}
