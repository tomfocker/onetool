import { useState, useCallback, useEffect } from 'react'
import { ActivatorConfig, WindowInfo, ActivatorTargetType as TargetType } from '../../../shared/types'

export { type ActivatorConfig, type WindowInfo, type TargetType }

let hasRegisteredInitialShortcuts = false

export function deriveWindowListFetchState(result: {
  success: boolean
  data?: { windows?: WindowInfo[] }
} | null | undefined): { windows: WindowInfo[]; statusMessage: string } {
  if (result?.success) {
    return {
      windows: Array.isArray(result.data?.windows) ? result.data.windows : [],
      statusMessage: ''
    }
  }

  return {
    windows: [],
    statusMessage: '窗口列表获取失败'
  }
}

export function useWebActivator() {
  const [configs, setConfigs] = useState<ActivatorConfig[]>(() => {
    const saved = localStorage.getItem('web-activator-v4')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return Array.isArray(parsed) ? parsed.map((c: any, idx: number) => ({
          ...c,
          id: c.id || `v4-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 11)}`
        })) : []
      } catch { return [] }
    }
    return []
  })

  const [windowList, setWindowList] = useState<WindowInfo[]>([])
  const [statusMessage, setStatusMessage] = useState<string>('')

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(''), 3000)
  }, [])

  const registerShortcuts = useCallback(async (currentConfigs: ActivatorConfig[], showTip: boolean = true) => {
    if (!window.electron?.webActivator?.registerShortcuts) return
    const result = await window.electron.webActivator.registerShortcuts(currentConfigs)
    if (result.success && showTip) showStatus('快捷键配置已更新')
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
    try {
      const result = await window.electron.webActivator.getWindowList()
      const nextState = deriveWindowListFetchState(result as { success: boolean; data?: { windows?: WindowInfo[] } })
      setWindowList(nextState.windows)
      if (nextState.statusMessage) {
        showStatus(nextState.statusMessage)
      }
    } catch {
      setWindowList([])
      showStatus('窗口列表获取失败')
    }
  }, [showStatus])

  const toggleTarget = async (config: ActivatorConfig) => {
    if (!window.electron?.webActivator?.toggleWindow) return
    try {
      const result = await window.electron.webActivator.toggleWindow({
        type: config.type,
        pattern: config.pattern,
        id: config.hwnd
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
    // 初次挂载或完全重置时才自动注册一次
    if (configs.length > 0 && !hasRegisteredInitialShortcuts) {
      hasRegisteredInitialShortcuts = true
      registerShortcuts(configs, false)
    }
    syncVisibility()
    const timer = setInterval(syncVisibility, 3000)
    return () => clearInterval(timer)
  }, [registerShortcuts, syncVisibility, configs.length])

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
