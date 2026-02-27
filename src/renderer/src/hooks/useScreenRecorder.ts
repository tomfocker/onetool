import { useState, useRef, useEffect, useCallback } from 'react'

export function useScreenRecorder() {
  const [outputPath, setOutputPath] = useState<string>('')
  const [format, setFormat] = useState<'mp4' | 'gif' | 'webm'>('mp4')
  const [fps, setFps] = useState(30)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium')
  const [recordingMode, setRecordingMode] = useState<'full' | 'area' | 'window'>('full')
  const [selectedWindow, setSelectedWindow] = useState<{ id: string; name: string } | null>(null)
  const [windowList, setWindowList] = useState<Array<{ id: string; name: string; thumbnail: string }>>([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState('00:00:00')
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [recorderHotkey, setRecorderHotkey] = useState('Alt+Shift+R')
  const [isSavingHotkey, setIsSavingHotkey] = useState(false)
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  
  const recordingStartTime = useRef<number | null>(null)
  const recordingInterval = useRef<NodeJS.Timeout | null>(null)

  const startRecordingTimer = useCallback(() => {
    if (recordingInterval.current) clearInterval(recordingInterval.current)
    recordingInterval.current = setInterval(() => {
      if (recordingStartTime.current) {
        const elapsed = Date.now() - recordingStartTime.current
        const hours = Math.floor(elapsed / 3600000)
        const minutes = Math.floor((elapsed % 3600000) / 60000)
        const seconds = Math.floor((elapsed % 60000) / 1000)
        setRecordingTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
      }
    }, 1000)
  }, [])

  const stopRecordingTimer = useCallback(() => {
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current)
      recordingInterval.current = null
    }
    recordingStartTime.current = null
  }, [])

  const handleModeChange = async (mode: 'full' | 'area' | 'window') => {
    setRecordingMode(mode)
    if (mode === 'window' && window.electron?.screenRecorder?.getWindows) {
      const res = await window.electron.screenRecorder.getWindows()
      if (res.success && res.data) setWindowList(res.data)
    } else {
      setSelectedWindow(null)
    }
  }

  const startRecording = useCallback(async () => {
    if (!outputPath) return { success: false, error: '请先选择保存位置' }
    
    const config: any = { outputPath, format, fps, quality }
    if (recordingMode === 'area') {
      if (!selectionRect) return { success: false, error: '请先选择录制区域' }
      config.bounds = selectionRect
    } else if (recordingMode === 'window') {
      if (!selectedWindow) return { success: false, error: '请选择录制窗口' }
      config.windowTitle = selectedWindow.name
    }

    return await window.electron.screenRecorder.startRecording(config)
  }, [outputPath, format, fps, quality, recordingMode, selectionRect, selectedWindow])

  const stopRecording = useCallback(async () => {
    return await window.electron.screenRecorder.stopRecording()
  }, [])

  useEffect(() => {
    const init = async () => {
      if (window.electron?.screenRecorder?.getDefaultPath) {
        const res = await window.electron.screenRecorder.getDefaultPath()
        if (res.success && res.data) setOutputPath(res.data)
      }
      if (window.electron?.screenRecorder?.getHotkey) {
        const res = await window.electron.screenRecorder.getHotkey()
        if (res.success && res.data) setRecorderHotkey(res.data)
      }
    }
    init()

    if (!window.electron?.screenRecorder) return

    const unsubStarted = window.electron.screenRecorder.onStarted(() => {
      setIsRecording(true)
      recordingStartTime.current = Date.now()
      startRecordingTimer()
    })

    const unsubProgress = window.electron.screenRecorder.onProgress((data) => {
      if (data.timemark) setRecordingTime(data.timemark)
    })

    const unsubStopped = window.electron.screenRecorder.onStopped(() => {
      setIsRecording(false)
      stopRecordingTimer()
    })

    return () => {
      unsubStarted()
      unsubProgress()
      unsubStopped()
      stopRecordingTimer()
    }
  }, [startRecordingTimer, stopRecordingTimer])

  return {
    outputPath, setOutputPath,
    format, setFormat,
    fps, setFps,
    quality, setQuality,
    recordingMode, handleModeChange,
    selectedWindow, setSelectedWindow,
    windowList,
    isRecording,
    recordingTime,
    selectionRect, setSelectionRect,
    recorderHotkey, setRecorderHotkey,
    isSavingHotkey, setIsSavingHotkey,
    isRecordingHotkey, setIsRecordingHotkey,
    startRecording,
    stopRecording
  }
}
