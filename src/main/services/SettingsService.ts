import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import type { AppSettings, IpcResponse } from '../../shared/types'
import { createDefaultAppSettings, migrateSettings } from '../../shared/settingsSchema'

export class SettingsService extends EventEmitter {
  private settings: AppSettings = createDefaultAppSettings()

  constructor() {
    super()
    this.loadSettings()
  }

  private getSettingsPath(): string {
    const userDataPath = app.getPath('userData')
    return path.join(userDataPath, 'settings.json')
  }

  private settingsUpdateQueue: Promise<unknown> = Promise.resolve()

  private async saveSettings(nextSettings: AppSettings): Promise<void> {
    const settingsPath = this.getSettingsPath()
    await fs.promises.writeFile(settingsPath, JSON.stringify(nextSettings, null, 2))
  }

  loadSettings(): void {
    try {
      const settingsPath = this.getSettingsPath()
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8')
        this.settings = migrateSettings(JSON.parse(data))
      }
    } catch (error) {
      console.error('SettingsService: Failed to load settings:', error)
    }
  }

  getSettings(): AppSettings {
    return this.settings
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<IpcResponse> {
    const updateTask = this.settingsUpdateQueue
      .catch(() => undefined)
      .then(async () => {
        const nextSettings = { ...this.settings, ...updates }

        try {
          await this.saveSettings(nextSettings)
          this.settings = nextSettings
          this.emit('changed', this.settings)
          return { success: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error('SettingsService: Failed to save settings:', error)
          return { success: false, error: message }
        }
      })

    this.settingsUpdateQueue = updateTask.then(() => undefined, () => undefined)

    return updateTask
  }
}

export const settingsService = new SettingsService()
