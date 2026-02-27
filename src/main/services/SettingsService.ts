import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'

export interface AppSettings {
  recorderHotkey: string
  screenshotHotkey: string
  screenshotSavePath: string
  autoSaveScreenshot: boolean
}

export class SettingsService extends EventEmitter {
  private settings: AppSettings = {
    recorderHotkey: 'Alt+Shift+R',
    screenshotHotkey: 'Alt+Shift+S',
    screenshotSavePath: '',
    autoSaveScreenshot: false
  }

  constructor() {
    super()
    this.loadSettings()
  }

  private getSettingsPath(): string {
    const userDataPath = app.getPath('userData')
    return path.join(userDataPath, 'settings.json')
  }

  saveSettings(): void {
    try {
      const settingsPath = this.getSettingsPath()
      fs.writeFileSync(settingsPath, JSON.stringify(this.settings, null, 2))
      this.emit('changed', this.settings)
    } catch (error) {
      console.error('SettingsService: Failed to save settings:', error)
    }
  }

  loadSettings(): void {
    try {
      const settingsPath = this.getSettingsPath()
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8')
        this.settings = { ...this.settings, ...JSON.parse(data) }
      }
    } catch (error) {
      console.error('SettingsService: Failed to load settings:', error)
    }
  }

  getSettings(): AppSettings {
    return this.settings
  }

  updateSettings(updates: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...updates }
    this.saveSettings()
  }
}

export const settingsService = new SettingsService()
