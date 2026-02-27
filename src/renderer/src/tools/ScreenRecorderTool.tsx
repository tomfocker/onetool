import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '@/context/ThemeContext'

const styles = `
  @keyframes fade-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }

  @keyframes fade-in-up {
    0% { opacity: 0; transform: translateY(0.5rem); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.3); }
    50% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.6); }
  }

  @keyframes recording-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .animate-fade-in {
    animation: fade-in 0.3s ease-out forwards;
  }

  .animate-fade-in-up {
    animation: fade-in-up 0.4s ease-out forwards;
  }

  .animate-pulse-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }

  .animate-recording-dot {
    animation: recording-dot 1s ease-in-out infinite;
  }

  .format-button-active {
    background: linear-gradient(135deg, #6d2eb8 0%, #8848d6 100%);
    border-color: #8848d6;
  }
`

export const ScreenRecorderTool: React.FC = () => {
  const { theme } = useTheme()
  const [outputPath, setOutputPath] = useState<string>('')
  const [format, setFormat] = useState<'mp4' | 'gif' | 'webm'>('mp4')
  const [fps, setFps] = useState(30)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium')
  const [recordingMode, setRecordingMode] = useState<'full' | 'area' | 'window'>('full')
  const [selectedWindow, setSelectedWindow] = useState<{ id: string; name: string } | null>(null)
  const [windowList, setWindowList] = useState<Array<{ id: string; name: string; thumbnail: string }>>([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState('00:00:00')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [recorderHotkey, setRecorderHotkey] = useState('Alt+Shift+R')
  const [isSavingHotkey, setIsSavingHotkey] = useState(false)
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  
  const recordingStartTime = useRef<number | null>(null)
  const recordingInterval = useRef<NodeJS.Timeout | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const handleModeChange = async (mode: 'full' | 'area' | 'window') => {
    setRecordingMode(mode)
    if (mode === 'window') {
      const windows = await (window.electron.screenRecorder as any).getWindows()
      setWindowList(windows)
    } else {
      setSelectedWindow(null)
    }
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecordingHotkey) return
    
    e.preventDefault()
    e.stopPropagation()

    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('Control')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    if (e.metaKey) modifiers.push('Command')

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return
    }

    let key = e.key.toUpperCase()
    if (key === ' ') key = 'Space'
    if (key === 'ESCAPE') key = 'Esc'
    if (key === 'ARROWUP') key = 'Up'
    if (key === 'ARROWDOWN') key = 'Down'
    if (key === 'ARROWLEFT') key = 'Left'
    if (key === 'ARROWRIGHT') key = 'Right'
    
    const hotkeyStr = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
    setRecorderHotkey(hotkeyStr)
    setIsRecordingHotkey(false)
  }, [isRecordingHotkey])

  useEffect(() => {
    if (isRecordingHotkey) {
      window.addEventListener('keydown', handleKeyDown)
    } else {
      window.removeEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRecordingHotkey, handleKeyDown])

  const handleSaveHotkey = async () => {
    if (!window.electron?.screenRecorder?.setHotkey) return
    
    setIsSavingHotkey(true)
    try {
      const result = await window.electron.screenRecorder.setHotkey(recorderHotkey)
      if (result.success) {
        showToast('热键设置已更新', 'success')
      } else {
        showToast(`热键设置失败: ${result.error}`, 'error')
        if (window.electron.screenRecorder.getHotkey) {
          const current = await window.electron.screenRecorder.getHotkey()
          setRecorderHotkey(current)
        }
      }
    } catch (error) {
      showToast(`设置出错: ${(error as Error).message}`, 'error')
    } finally {
      setIsSavingHotkey(false)
    }
  }

  const startRecordingTimer = useCallback(() => {
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current)
    }
    recordingInterval.current = setInterval(() => {
      if (recordingStartTime.current) {
        const elapsed = Date.now() - recordingStartTime.current
        const hours = Math.floor(elapsed / 3600000)
        const minutes = Math.floor((elapsed % 3600000) / 60000)
        const seconds = Math.floor((elapsed % 60000) / 1000)
        setRecordingTime(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        )
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

  const handleSelectOutput = useCallback(async () => {
    try {
      if (!window.electron?.screenRecorder) {
        showToast('API 不可用', 'error')
        return
      }
      const result = await window.electron.screenRecorder.selectOutput()
      if (result.success && !result.canceled && result.filePath) {
        setOutputPath(result.filePath)
      }
    } catch (error) {
      showToast(`选择文件失败: ${(error as Error).message}`, 'error')
    }
  }, [showToast])

  const handleStartRecording = useCallback(async () => {
    try {
      if (!outputPath) {
        showToast('请先选择保存位置', 'error')
        return
      }
      
      const config: any = {
        outputPath,
        format,
        fps,
        quality
      }

      if (recordingMode === 'area') {
        if (!selectionRect) {
          showToast('请先选择录制区域', 'error')
          return
        }
        config.bounds = selectionRect
      } else if (recordingMode === 'window') {
        if (!selectedWindow) {
          showToast('请选择录制窗口', 'error')
          return
        }
        config.windowTitle = selectedWindow.name
      }

      if (!window.electron?.screenRecorder) {
        showToast('API 不可用', 'error')
        return
      }
      const result = await window.electron.screenRecorder.startRecording(config)
      if (!result.success) {
        showToast(`启动录制失败: ${result.error}`, 'error')
      }
    } catch (error) {
      showToast(`启动录制失败: ${(error as Error).message}`, 'error')
    }
  }, [outputPath, format, fps, quality, recordingMode, selectionRect, selectedWindow, showToast])

  const handleStopRecording = useCallback(async () => {
    try {
      if (!window.electron?.screenRecorder) {
        showToast('API 不可用', 'error')
        return
      }
      const result = await window.electron.screenRecorder.stopRecording()
      if (!result.success) {
        showToast(`停止录制失败: ${result.error}`, 'error')
      }
    } catch (error) {
      showToast(`停止录制失败: ${(error as Error).message}`, 'error')
    }
  }, [showToast])

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)
    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  useEffect(() => {
    const initDefaultPath = async () => {
      if (window.electron?.screenRecorder?.getDefaultPath) {
        const path = await window.electron.screenRecorder.getDefaultPath()
        setOutputPath(path)
      }
      if (window.electron?.screenRecorder?.getHotkey) {
        const hotkey = await window.electron.screenRecorder.getHotkey()
        setRecorderHotkey(hotkey)
      }
    }
    initDefaultPath()

    if (!window.electron?.screenRecorder) return

    const unsubscribeSelection = (window.electron as any).ipcRenderer?.on('recorder-selection-result', (_event, bounds) => {
      setSelectionRect(bounds)
      showToast('录制区域已设定', 'success')
    })

    const unsubscribeStarted = window.electron.screenRecorder.onStarted(() => {
      setIsRecording(true)
      recordingStartTime.current = Date.now()
      startRecordingTimer()
      showToast('录制已开始', 'success')
    })

    const unsubscribeProgress = window.electron.screenRecorder.onProgress((data) => {
      if (data.timemark) {
        setRecordingTime(data.timemark)
      }
    })

    const unsubscribeStopped = window.electron.screenRecorder.onStopped((data) => {
      setIsRecording(false)
      stopRecordingTimer()
      if (data.success) {
        showToast(`录制完成，文件已保存到: ${data.outputPath}`, 'success')
      } else {
        showToast(`录制失败: ${data.error}`, 'error')
      }
    })

    const unsubscribeError = (window.electron.screenRecorder as any).onError?.((data: { message: string }) => {
      showToast(`录制中出错: ${data.message}`, 'error')
    })

    const unsubscribeHotkey = window.electron.screenRecorder.onToggleHotkey?.(() => {
      if (isRecording) {
        handleStopRecording()
      } else {
        handleStartRecording()
      }
    })

    return () => {
      if (unsubscribeSelection) unsubscribeSelection()
      unsubscribeStarted()
      unsubscribeProgress()
      unsubscribeStopped()
      if (unsubscribeError) unsubscribeError()
      if (unsubscribeHotkey) unsubscribeHotkey()
    }
  }, [isRecording, handleStartRecording, handleStopRecording, startRecordingTimer, stopRecordingTimer, showToast])

  const handleOpenSelection = async () => {
    if ((window.electron as any).ipcRenderer) {
      await (window.electron as any).ipcRenderer.invoke('recorder-selection-open')
    }
  }

  const formatOptions = [
    { value: 'mp4', label: 'MP4', desc: '高质量视频' },
    { value: 'gif', label: 'GIF', desc: '动画格式' },
    { value: 'webm', label: 'WebM', desc: '开源视频格式' }
  ]

  const qualityOptions = [
    { value: 'low', label: '低质量', desc: '文件更小' },
    { value: 'medium', label: '中等质量', desc: '平衡选择' },
    { value: 'high', label: '高质量', desc: '更好的画质' }
  ]

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-red-500/5 dark:bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 py-8 relative z-10">
        <div className="text-center mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-red-400 to-purple-500 bg-clip-text text-transparent">
            屏幕录制
          </h1>
          <p className="text-muted-foreground">录制屏幕为 MP4、GIF 或 WebM 格式</p>
        </div>

        <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>🎯</span> 录制模式
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {(['full', 'area', 'window'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  disabled={isRecording}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                    recordingMode === mode
                      ? 'format-button-active text-white'
                      : 'bg-white/30 dark:bg-white/5 border-white/20 dark:border-white/10 hover:border-purple-500/30'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="font-medium">
                    {mode === 'full' ? '全屏录制' : mode === 'area' ? '区域录制' : '窗口录制'}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    {mode === 'full' ? '录制整个桌面' : mode === 'area' ? '拖拽选择区域' : '录制特定应用'}
                  </div>
                </button>
              ))}
            </div>

            {recordingMode === 'window' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-2 border border-white/10 rounded-xl mb-6">
                {windowList.map((win) => (
                  <button
                    key={win.id}
                    onClick={() => setSelectedWindow(win)}
                    className={`p-2 rounded-lg border transition-all text-left group ${
                      selectedWindow?.id === win.id
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <img src={win.thumbnail} className="w-full h-24 object-contain mb-2 rounded bg-black/20" alt={win.name} />
                    <div className="text-xs truncate font-medium group-hover:text-purple-400">{win.name}</div>
                  </button>
                ))}
              </div>
            )}

            {recordingMode === 'area' && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-muted-foreground">录制区域</label>
                  {selectionRect && (
                    <span className="text-xs text-purple-400">
                      {selectionRect.width} x {selectionRect.height} (at {selectionRect.x}, {selectionRect.y})
                    </span>
                  )}
                </div>
                {!selectionRect ? (
                  <button
                    onClick={handleOpenSelection}
                    className="w-full p-8 border-2 border-dashed border-white/20 rounded-xl hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-muted-foreground"
                  >
                    点击此处开启全屏选区 (支持跨窗口选择)
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleOpenSelection}
                      className="flex-1 p-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition-colors"
                    >
                      重新选择区域
                    </button>
                    <button
                      onClick={() => setSelectionRect(null)}
                      className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm transition-colors"
                    >
                      清除
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-muted-foreground mb-2">保存位置</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={outputPath}
                  readOnly
                  placeholder="选择文件保存位置..."
                  className="flex-1 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  onClick={handleSelectOutput}
                  disabled={isRecording}
                  className="px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors text-white"
                >
                  选择
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-muted-foreground mb-3">输出格式</label>
              <div className="grid grid-cols-3 gap-3">
                {formatOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFormat(opt.value as any)}
                    disabled={isRecording}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      format === opt.value
                        ? 'format-button-active text-white'
                        : 'bg-white/30 dark:bg-white/5 border-white/20 dark:border-white/10 hover:border-purple-500/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">帧率 (FPS)</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value))}
                  disabled={isRecording}
                  className="w-full bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value={15}>15 FPS</option>
                  <option value={24}>24 FPS</option>
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">画质</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as any)}
                  disabled={isRecording}
                  className="w-full bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {qualityOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>🎬</span> 录制控制
            </h2>

            {isRecording ? (
              <div className="text-center py-8 animate-pulse-glow rounded-xl border-2 border-red-500/50 bg-red-500/10">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="w-4 h-4 bg-red-500 rounded-full animate-recording-dot" />
                  <span className="text-xl font-semibold text-red-400">正在录制</span>
                </div>
                <div className="text-4xl font-mono text-foreground">
                  {recordingTime}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 rounded-xl border-2 border-dashed border-white/20 dark:border-white/10 bg-white/30 dark:bg-white/5">
                <svg className="w-16 h-16 mx-auto mb-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-muted-foreground">点击下方按钮开始录制</p>
              </div>
            )}

            <div className="flex justify-center gap-4 mt-6">
              {!isRecording ? (
                <button
                  onClick={handleStartRecording}
                  disabled={!outputPath}
                  className="px-8 py-4 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-white transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx={12} cy={12} r={10} />
                  </svg>
                  开始录制
                </button>
              ) : (
                <button
                  onClick={handleStopRecording}
                  className="px-8 py-4 bg-gray-600 hover:bg-gray-500 rounded-xl font-semibold text-white transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x={6} y={6} width={12} height={12} rx={1} />
                  </svg>
                  停止录制
                </button>
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>⌨️</span> 热键设置
            </h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div 
                  onClick={() => setIsRecordingHotkey(true)}
                  className={`flex-1 bg-white/50 dark:bg-white/10 border ${
                    isRecordingHotkey 
                      ? 'border-red-500 ring-2 ring-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                      : 'border-white/20 dark:border-white/10'
                  } rounded-xl px-4 py-3 cursor-pointer transition-all duration-200 flex items-center justify-between group`}
                >
                  <span className={`font-mono ${isRecordingHotkey ? 'text-red-500 animate-pulse' : 'text-foreground'}`}>
                    {isRecordingHotkey ? '请按下按键...' : recorderHotkey}
                  </span>
                  {!isRecordingHotkey && (
                    <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      点击录制
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSaveHotkey}
                  disabled={isSavingHotkey || isRecording || isRecordingHotkey}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors text-white whitespace-nowrap"
                >
                  {isSavingHotkey ? '保存中...' : '确认修改'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                点击上方区域后直接按下你想要的热键（如 Ctrl+Shift+S）。支持大部分组合键。
              </p>
            </div>
          </div>

          <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>ℹ️</span> 提示
            </h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>使用热键 <kbd className="px-1.5 py-0.5 bg-white/10 rounded border border-white/20 font-sans text-xs">Alt + Shift + R</kbd> 快速开始/停止录制</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>录制过程中请保持窗口可见，以确保录制质量</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>GIF 格式适合短时间录制，文件体积会比较大</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>MP4 格式是最常用的视频格式，兼容性最好</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>WebM 格式是开源格式，文件体积更小</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg animate-slide-in-right z-50 ${
          toast.type === 'success' ? 'bg-green-500/90' : 'bg-red-500/90'
        }`}>
          <div className="flex items-center gap-2 text-white">
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export const RecorderSelectionOverlay: React.FC = () => {
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    // 强制透明背景，防止 Electron 窗口继承全局样式
    const originalBg = document.body.style.backgroundColor
    document.body.style.backgroundColor = 'transparent'
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        (window.electron as any).ipcRenderer.invoke('recorder-selection-close', null)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => {
      window.removeEventListener('keydown', handleEsc)
      document.body.style.backgroundColor = originalBg
    }
  }, [])

  const onStart = (e: React.MouseEvent) => {
    // 右键点击直接退出选区
    if (e.button === 2) {
      (window.electron as any).ipcRenderer.invoke('recorder-selection-close', null)
      return
    }
    setIsDragging(true)
    startPos.current = { x: e.clientX, y: e.clientY }
    setRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
  }

  const onMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos.current) return
    const currentX = e.clientX
    const currentY = e.clientY
    const startX = startPos.current.x
    const startY = startPos.current.y
    
    setRect({
      x: Math.min(startX, currentX),
      y: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY)
    })
  }

  const onEnd = () => {
    if (!isDragging || !rect) {
      setIsDragging(false)
      return
    }
    setIsDragging(false)
    if (rect.width > 10 && rect.height > 10) {
      (window.electron as any).ipcRenderer.invoke('recorder-selection-close', rect)
    } else {
      setRect(null)
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] cursor-crosshair select-none overflow-hidden bg-transparent"
      style={{ 
        width: '100vw', 
        height: '100vh',
        backgroundColor: rect ? 'transparent' : 'rgba(0,0,0,0.2)' 
      }}
      onMouseDown={onStart}
      onMouseMove={onMove}
      onMouseUp={onEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-black/80 text-white px-6 py-3 rounded-2xl text-sm font-medium border border-white/20 shadow-2xl pointer-events-none z-[100] animate-fade-in whitespace-nowrap">
        请在当前屏幕拖拽选择录制区域 (Esc 或 右键取消)
      </div>

      {rect && (
        <div 
          className="absolute border-2 border-red-500 bg-transparent transition-none"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)' // 完美的、无偏移的遮罩方案
          }}
        >
          <div className="absolute -top-8 left-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1 font-mono">
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </div>
          <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-red-500" />
          <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-red-500" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-red-500" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-red-500" />
        </div>
      )}
    </div>
  )
}

export default ScreenRecorderTool
