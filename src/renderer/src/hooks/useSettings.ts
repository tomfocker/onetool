import { useState, useEffect, useCallback } from 'react'
import { AppSettings, IpcResponse } from '../../../shared/types'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await window.electron.settings.getAll()
      if (res.success && res.data) {
        setSettings(res.data)
      }
    } catch (e) {
      console.error('useSettings: Failed to fetch settings:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateSettings = async (updates: Partial<AppSettings>) => {
    try {
      const res = await window.electron.settings.update(updates)
      if (res.success) {
        // 更新本地状态，虽然 onChanged 也会更新，但这里主动更新体验更即时
        setSettings(prev => prev ? { ...prev, ...updates } : null)
      }
      return res
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  useEffect(() => {
    fetchSettings()

    // 订阅全局变更
    const unsubscribe = window.electron.settings.onChanged((newSettings: AppSettings) => {
      setSettings(newSettings)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [fetchSettings])

  return {
    settings,
    isLoading,
    updateSettings,
    refresh: fetchSettings
  }
}
