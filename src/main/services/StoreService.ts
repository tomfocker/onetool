import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import { GlobalStore } from '../../shared/types'
import { logger } from '../utils/logger'

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
      settings: {
        recorderHotkey: 'Alt+Shift+R',
        screenshotHotkey: 'Alt+Shift+S',
        screenshotSavePath: '',
        autoSaveScreenshot: false
      },
      renamePresets: [],
      webActivatorConfigs: [],
      toolUsages: [],
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
        this.store = { ...this.getInitialData(), ...parsed }
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

  private save() {
    try {
      // 异步写入以提高性能，但在退出前必须同步保存一次
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2))
      this.emit('changed', this.store)
    } catch (e) {
      logger.error('StoreService: Failed to save store:', e)
    }
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
