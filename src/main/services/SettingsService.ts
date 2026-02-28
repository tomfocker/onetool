import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'

export interface AppSettings {
  recorderHotkey: string
  screenshotHotkey: string
  floatBallHotkey: string
  clipboardHotkey: string
  screenshotSavePath: string
  autoSaveScreenshot: boolean
  translateApiUrl: string
  translateApiKey: string
  translateModel: string
}

export class SettingsService extends EventEmitter {
  private settings: AppSettings = {
    recorderHotkey: 'Alt+Shift+R',
    screenshotHotkey: 'Alt+Shift+S',
    floatBallHotkey: 'Alt+Shift+F',
    clipboardHotkey: 'Alt+Shift+C',
    screenshotSavePath: '',
    autoSaveScreenshot: false,
    translateApiUrl: 'https://api.openai.com/v1',
    translateApiKey: '',
    translateModel: 'gpt-4o'
  }

  constructor() {
    super()
    this.loadSettings()
  }

  private getSettingsPath(): string {
    const userDataPath = app.getPath('userData')
    return path.join(userDataPath, 'settings.json')
  }

  private saveTimer: NodeJS.Timeout | null = null
  saveSettings(): void {
    this.emit('changed', this.settings)

    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }

    this.saveTimer = setTimeout(async () => {
      try {
        const settingsPath = this.getSettingsPath()
        await fs.promises.writeFile(settingsPath, JSON.stringify(this.settings, null, 2))
      } catch (error) {
        console.error('SettingsService: Failed to save settings asynchronously:', error)
      }
    }, 1000)
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
