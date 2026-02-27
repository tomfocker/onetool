import { useState, useCallback, useEffect } from 'react'

export function useAutoClicker() {
  const [isRunning, setIsRunning] = useState(false)
  const [clickInterval, setClickInterval] = useState(100)
  const [button, setButton] = useState<'left' | 'right' | 'middle'>('left')
  const [shortcut, setShortcut] = useState('F6')
  const [isListeningShortcut, setIsListeningShortcut] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const res = await window.electron.autoClicker.getStatus()
      if (res.success && res.data) {
        setIsRunning(res.data.running)
        if (res.data.config) {
          setClickInterval(res.data.config.interval)
          setButton(res.data.config.button as any)
          setShortcut((res.data.config.shortcut || 'F6').replace('CommandOrControl+', 'Ctrl+'))
        }
      }
    } catch (error) {
      console.error('AutoClickerHook: Failed to get status:', error)
    }
  }, [])

  const startAutoClicker = async () => {
    try {
      const res = await window.electron.autoClicker.start({ interval: clickInterval, button })
      if (res.success) setIsRunning(true)
      return res
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  const stopAutoClicker = async () => {
    try {
      const res = await window.electron.autoClicker.stop()
      if (res.success) setIsRunning(false)
      return res
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  const updateConfig = async (updates: any) => {
    try {
      const res = await window.electron.autoClicker.updateConfig(updates)
      if (res.success) await checkStatus()
      return res
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 2000)
    return () => clearInterval(interval)
  }, [checkStatus])

  useEffect(() => {
    const unsubStarted = (window.electron as any).ipcRenderer?.on('autoclicker-started', () => setIsRunning(true))
    const unsubStopped = (window.electron as any).ipcRenderer?.on('autoclicker-stopped', () => setIsRunning(false))
    return () => {
      if (unsubStarted) unsubStarted()
      if (unsubStopped) unsubStopped()
    }
  }, [])

  return {
    isRunning,
    clickInterval, setClickInterval,
    button, setButton,
    shortcut, setShortcut,
    isListeningShortcut, setIsListeningShortcut,
    startAutoClicker,
    stopAutoClicker,
    updateConfig
  }
}
