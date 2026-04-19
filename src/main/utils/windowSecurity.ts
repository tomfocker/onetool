import type { WebPreferences } from 'electron'

export function createIsolatedPreloadWebPreferences(preload: string): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
}
