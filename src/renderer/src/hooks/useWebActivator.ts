import { useState, useCallback, useEffect } from 'react'
import { ActivatorConfig, WindowInfo, ActivatorTargetType as TargetType } from '../../../shared/types'

export { type ActivatorConfig, type WindowInfo, type TargetType }

export function useWebActivator() {
  const [configs, setConfigs] = useState<ActivatorConfig[]>(() => {
    const saved = localStorage.getItem('web-activator-v4')
    if (saved) { try { return JSON.parse(saved) } catch { return [] } }
    return []
  })
  
  const [windowList, setWindowList] = useState<WindowInfo[]>([])
  const [statusMessage, setStatusMessage] = useState<string>('')

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(''), 3000)
  }, [])

  const registerShortcuts = useCallback(async (currentConfigs: ActivatorConfig[]) => {
    if (!window.electron?.webActivator?.registerShortcuts) return
    const result = await window.electron.webActivator.registerShortcuts(currentConfigs)
    if (result.success) showStatus('快捷键配置已更新')
  }, [showStatus])

  const syncVisibility = useCallback(async () => {
    if (!window.electron?.webActivator?.checkVisibility || configs.length === 0) return
    try {
      const res = await window.electron.webActivator.checkVisibility(configs)
      if (res.success && res.data?.results) {
        setConfigs(prev => prev.map((c, idx) => ({ ...c, isActive: res.data!.results[idx] })))
      }
    } catch (e) { console.error('Failed to sync visibility:', e) }
  }, [configs])

  const fetchWindowList = useCallback(async () => {
    if (!window.electron?.webActivator?.getWindowList) return
    const result = await window.electron.webActivator.getWindowList()
    if (result.success && result.data?.windows) {
      setWindowList((result.data.windows as unknown as WindowInfo[]) || [])
    }
  }, [])

  const toggleTarget = async (config: ActivatorConfig) => {
    if (!window.electron?.webActivator?.toggleWindow) return
    try {
      const result = await window.electron.webActivator.toggleWindow({
        titlePattern: config.pattern,
        shortcut: config.shortcut
      })
      if (result.success && result.data) {
        setConfigs(prev => prev.map(c => c.id === config.id ? { ...c, isActive: result.data!.action === 'activated' } : c))
      }
    } catch (error) { console.error(error) }
  }

  useEffect(() => {
    localStorage.setItem('web-activator-v4', JSON.stringify(configs))
  }, [configs])

  useEffect(() => {
    if (configs.length > 0) {
      registerShortcuts(configs)
      syncVisibility()
    }
    const timer = setInterval(syncVisibility, 3000)
    return () => clearInterval(timer)
  }, [registerShortcuts, syncVisibility])

  useEffect(() => {
    if (!window.electron?.webActivator?.onShortcutTriggered) return
    const unsubscribe = window.electron.webActivator.onShortcutTriggered(({ id, action }) => {
      setConfigs(prev => prev.map(c => c.id === id ? { ...c, isActive: action === 'activated' } : c))
    })
    return () => { if (unsubscribe) unsubscribe() }
  }, [])

  return {
    configs, setConfigs,
    windowList, fetchWindowList,
    statusMessage, showStatus,
    registerShortcuts,
    syncVisibility,
    toggleTarget
  }
}
