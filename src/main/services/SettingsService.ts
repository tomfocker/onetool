import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import type { AppSettings, IpcResponse } from '../../shared/types'

export class SettingsService extends EventEmitter {
  private settings: AppSettings = {
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

  private async saveSettings(): Promise<void> {
    const settingsPath = this.getSettingsPath()
    await fs.promises.writeFile(settingsPath, JSON.stringify(this.settings, null, 2))
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

  async updateSettings(updates: Partial<AppSettings>): Promise<IpcResponse> {
    const previousSettings = this.settings
    this.settings = { ...this.settings, ...updates }

    try {
      await this.saveSettings()
      this.emit('changed', this.settings)
      return { success: true }
    } catch (error) {
      this.settings = previousSettings
      const message = error instanceof Error ? error.message : String(error)
      console.error('SettingsService: Failed to save settings:', error)
      return { success: false, error: message }
    }
  }
}

export const settingsService = new SettingsService()
