import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import { GlobalStore } from '../../shared/types'
import { logger } from '../utils/logger'
import { DEFAULT_PINNED_TOOL_IDS } from '../../shared/devEnvironment'

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

const DEFAULT_SETTINGS = {
  recorderHotkey: 'Alt+Shift+R',
  screenshotHotkey: 'Alt+Shift+S',
  screenshotSavePath: '',
  autoSaveScreenshot: false,
  autoCheckForUpdates: true,
  floatBallHotkey: 'Alt+Shift+F',
  clipboardHotkey: 'Alt+Shift+V',
  minimizeToTray: true,
  translateApiUrl: '',
  translateApiKey: '',
  translateModel: ''
}

export class StoreService extends EventEmitter {
  private store: GlobalStore
  private storePath: string
  private isInitialLoad = true

  constructor() {
    super()
    this.storePath = path.join(app.getPath('userData'), 'global-store.json')
    this.store = this.getInitialData()
    this.load()
  }

  private getInitialData(): GlobalStore {
    return {
      settings: { ...DEFAULT_SETTINGS },
      renamePresets: [],
      webActivatorConfigs: [],
      toolUsages: [],
      pinnedToolIds: [...DEFAULT_PINNED_TOOL_IDS],
      windowsManagerFavorites: [...DEFAULT_WINDOWS_MANAGER_FAVORITES],
      clipboardHistory: [],
      version: app.getVersion()
    }
  }

  private load() {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf8')
        const parsed = JSON.parse(data)
        // 合并数据，确保 Schema 升级时的兼容性
        this.store = {
          ...this.getInitialData(),
          ...parsed,
          pinnedToolIds: Array.isArray(parsed.pinnedToolIds)
            ? Array.from(new Set(parsed.pinnedToolIds.filter((item: unknown): item is string => typeof item === 'string'))).slice(0, 6)
            : [...DEFAULT_PINNED_TOOL_IDS],
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
        }

        if (this.store.pinnedToolIds.length === 0) {
          this.store.pinnedToolIds = [...DEFAULT_PINNED_TOOL_IDS]
        }
        logger.info('StoreService: Data loaded successfully.')
      } else {
        this.save()
        logger.info('StoreService: Initial store created.')
      }
    } catch (e) {
      logger.error('StoreService: Failed to load store, resetting to defaults:', e)
      this.store = this.getInitialData()
    } finally {
      this.isInitialLoad = false
    }
  }

  private saveTimer: NodeJS.Timeout | null = null
  private save() {
    this.emit('changed', this.store)

    // Debounce actual disk writes by 1000ms
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }

    this.saveTimer = setTimeout(async () => {
      try {
        await fs.promises.writeFile(this.storePath, JSON.stringify(this.store, null, 2))
        logger.debug('StoreService: Store saved asynchronously')
      } catch (e) {
        logger.error('StoreService: Failed to save store asynchronously:', e)
      }
    }, 1000)
  }

  get<K extends keyof GlobalStore>(key: K): GlobalStore[K] {
    return this.store[key]
  }

  set<K extends keyof GlobalStore>(key: K, value: GlobalStore[K]) {
    this.store[key] = value
    this.save()
  }

  update<K extends keyof GlobalStore>(key: K, updates: Partial<GlobalStore[K]>) {
    if (typeof this.store[key] === 'object' && !Array.isArray(this.store[key])) {
      this.store[key] = { ...this.store[key], ...updates }
      this.save()
    }
  }

  getAll(): GlobalStore {
    return this.store
  }
}

export const storeService = new StoreService()
