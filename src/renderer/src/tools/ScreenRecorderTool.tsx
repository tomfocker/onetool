import React, { useCallback, useEffect, useState } from 'react'
import { useScreenRecorder } from '../hooks/useScreenRecorder'
import { useRecorderSelection } from '../hooks/useRecorderSelection'
import { RECORDER_MIN_SELECTION_SIZE } from '../../../shared/screenRecorderSession'

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
    0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.22); }
    50% { box-shadow: 0 0 36px rgba(239, 68, 68, 0.38); }
  }

  @keyframes recording-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }

  .animate-fade-in {
    animation: fade-in 0.24s ease-out forwards;
  }

  .animate-fade-in-up {
    animation: fade-in-up 0.28s ease-out forwards;
  }

  .animate-pulse-glow {
    animation: pulse-glow 1.8s ease-in-out infinite;
  }

  .animate-recording-dot {
    animation: recording-dot 1s ease-in-out infinite;
  }
`

type ToastState = { message: string; type: 'success' | 'error' }

export const ScreenRecorderTool: React.FC = () => {
  const [toast, setToast] = useState<ToastState | null>(null)
  const [localHotkey, setLocalHotkey] = useState('Alt+Shift+R')

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const {
    outputPath, setOutputPath,
    format, setFormat,
    fps, setFps,
    quality, setQuality,
    recordingMode, handleModeChange,
    selectedScreen, setSelectedScreen,
    screenList,
    isRecording,
    recordingTime,
    selectionRect, setSelectionRect,
    recorderHotkey, setRecorderHotkey,
    isSavingHotkey, setIsSavingHotkey,
    isRecordingHotkey, setIsRecordingHotkey,
    startRecording,
    stopRecording,
    sessionStatus,
    controlsLocked,
    showPreStartControls,
    showRecordingControls,
    canStartRecording,
    isPreparingSelection,
    selectionValidationError,
    startAreaSelection
  } = useScreenRecorder()

  useEffect(() => {
    setLocalHotkey(recorderHotkey)
  }, [recorderHotkey])

  useEffect(() => {
    if (controlsLocked && isRecordingHotkey) {
      setIsRecordingHotkey(false)
    }
  }, [controlsLocked, isRecordingHotkey, setIsRecordingHotkey])

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)
    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  const handleHotkeyKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isRecordingHotkey) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const modifiers: string[] = []
    if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl')
    if (event.altKey) modifiers.push('Alt')
    if (event.shiftKey) modifiers.push('Shift')

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      return
    }

    let key = event.key.toUpperCase()
    if (key === ' ') key = 'Space'
    if (key === 'ESCAPE') key = 'Esc'

    const nextHotkey = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
    setLocalHotkey(nextHotkey)
    setIsRecordingHotkey(false)
  }, [isRecordingHotkey, setIsRecordingHotkey])

  useEffect(() => {
    if (isRecordingHotkey) {
      window.addEventListener('keydown', handleHotkeyKeyDown)
    } else {
      window.removeEventListener('keydown', handleHotkeyKeyDown)
    }

    return () => {
      window.removeEventListener('keydown', handleHotkeyKeyDown)
    }
  }, [handleHotkeyKeyDown, isRecordingHotkey])

  useEffect(() => {
    if (!window.electron?.screenRecorder) {
      return
    }

    const unsubscribeSelection = window.electron.screenRecorder.onSelectionResult(async (bounds) => {
      if (!bounds || typeof bounds.width !== 'number') {
        return
      }

      const result = await setSelectionRect(bounds)
      if (result.success) return

      showToast(result.error || '更新录制区域失败', 'error')
    })

    const unsubscribeStopped = window.electron.screenRecorder.onStopped((data) => {
      if (data.success) {
        showToast(`录制完成，文件已保存到: ${data.outputPath}`, 'success')
      } else {
        showToast(`录制失败: ${data.error}`, 'error')
      }
    })

    const unsubscribeHotkey = window.electron.screenRecorder.onToggleHotkey?.(() => {
      if (sessionStatus === 'recording') {
        void stopRecording()
        return
      }

      if (sessionStatus === 'finishing') {
        return
      }

      void startRecording().then((result) => {
        if (!result.success) {
          showToast(result.error || '启动失败', 'error')
        }
      })
    })

    return () => {
      unsubscribeSelection()
      unsubscribeStopped()
      if (unsubscribeHotkey) unsubscribeHotkey()
    }
  }, [sessionStatus, setSelectionRect, showToast, startRecording, stopRecording])

  const handleSelectOutput = async () => {
    try {
      const result = await window.electron.screenRecorder.selectOutput(format)
      if (result.success && result.data && !result.data.canceled && result.data.filePath) {
        setOutputPath(result.data.filePath)
      }
    } catch (error) {
      showToast(`选择文件失败: ${(error as Error).message}`, 'error')
    }
  }

  const handleSaveHotkey = async () => {
    if (!window.electron?.screenRecorder?.setHotkey) {
      return
    }

    setIsSavingHotkey(true)
    try {
      const result = await window.electron.screenRecorder.setHotkey(localHotkey)
      if (result.success) {
        setRecorderHotkey(localHotkey)
        showToast('录制热键已更新', 'success')
      } else {
        showToast(`热键设置失败: ${result.error}`, 'error')
      }
    } catch (error) {
      showToast(`设置出错: ${(error as Error).message}`, 'error')
    } finally {
      setIsSavingHotkey(false)
    }
  }

  const handleStartAreaSelection = async () => {
    const result = await startAreaSelection()
    if (!result?.success) {
      showToast(result?.error || '无法打开框选区域', 'error')
    }
  }

  const handleToggleRecording = async () => {
    if (sessionStatus === 'recording') {
      const result = await stopRecording()
      if (!result.success) {
        showToast(result.error || '停止失败', 'error')
      }
      return
    }

    const result = await startRecording()
    if (!result.success) {
      showToast(result.error || '启动失败', 'error')
    }
  }

  const formatOptions = [
    { value: 'mp4', label: 'MP4', desc: '高兼容视频' },
    { value: 'gif', label: 'GIF', desc: '短动画导出' }
  ] as const

  const qualityOptions = [
    { value: 'low', label: '低', desc: '更小文件' },
    { value: 'medium', label: '中', desc: '均衡设置' },
    { value: 'high', label: '高', desc: '更清晰画质' }
  ] as const

  const statusCopy = {
    idle: '准备新的录制任务',
    'selecting-area': '正在等待框选录制区域',
    'ready-to-record': recordingMode === 'area' ? '区域预览已就绪，可以开始录制' : '录制参数已确认，可以开始录制',
    recording: '正在录制中，主页面现在作为录制控制台',
    finishing: '正在结束录制，请稍候保存完成'
  }[sessionStatus]

  const startButtonDisabled = sessionStatus === 'finishing' || isPreparingSelection || !canStartRecording
  const stopButtonDisabled = sessionStatus === 'finishing'
  const currentTargetLabel = recordingMode === 'full'
    ? selectedScreen?.name || '未选择屏幕'
    : selectionRect
      ? `区域 ${selectionRect.width} × ${selectionRect.height}`
      : '尚未框选区域'
  const areaReadinessCopy = selectionRect
    ? selectionValidationError || '虚线框已在屏幕上显示，可直接开始。'
    : '请先框选录制区域。'

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute top-0 left-0 w-80 h-80 bg-red-500/6 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 py-8 relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">
            屏幕录制
          </h1>
          <p className="text-muted-foreground">录制屏幕内容并导出为 MP4 或 GIF</p>
        </div>

        <div className="space-y-6 animate-fade-in-up">
          <section className="bg-card rounded-2xl border border-white/15 dark:border-white/10 shadow-soft p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-red-400 mb-1">1. 录制目标</p>
                <h2 className="text-xl font-semibold">先确定录制范围</h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">当前目标</p>
                <p className="text-sm font-medium">{currentTargetLabel}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { value: 'full', label: '全屏录制', desc: '录制整个屏幕' },
                { value: 'area', label: '区域录制', desc: '先框选，再精调区域' }
              ] as const).map((modeOption) => (
                <button
                  key={modeOption.value}
                  onClick={() => handleModeChange(modeOption.value)}
                  disabled={controlsLocked}
                  className={`rounded-xl border px-4 py-4 text-left transition-all ${recordingMode === modeOption.value
                    ? 'border-red-500 bg-red-500/8 shadow-lg shadow-red-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/30'
                  } ${controlsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <p className="text-base font-semibold">{modeOption.label}</p>
                  <p className="text-sm text-muted-foreground mt-1">{modeOption.desc}</p>
                </button>
              ))}
            </div>

            {recordingMode === 'full' && (
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">选择要录制的屏幕</p>
                  {selectedScreen && <p className="text-xs text-muted-foreground">已选: {selectedScreen.name}</p>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {screenList.map((screen) => (
                    <button
                      key={screen.id}
                      onClick={() => setSelectedScreen(screen)}
                      disabled={controlsLocked}
                      className={`group rounded-xl overflow-hidden border transition-all ${selectedScreen?.id === screen.id
                        ? 'border-red-500 shadow-md shadow-red-500/10'
                        : 'border-white/10 hover:border-white/30'
                      } ${controlsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <img src={screen.thumbnail} alt={screen.name} className="w-full aspect-video object-cover" />
                      <div className="px-3 py-2 bg-black/30 text-left">
                        <p className="text-xs font-medium truncate">{screen.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recordingMode === 'area' && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4 animate-fade-in">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">面板驱动区域录制</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      先点击“框选区域”，之后可直接拖动屏幕上的虚线框挪动位置。
                    </p>
                  </div>
                  <button
                    onClick={handleStartAreaSelection}
                    disabled={controlsLocked}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {selectionRect ? '重选区域' : '框选区域'}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="px-2 py-1 rounded-full bg-white/8 border border-white/10">
                    最小尺寸 {RECORDER_MIN_SELECTION_SIZE} × {RECORDER_MIN_SELECTION_SIZE}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-white/8 border border-white/10">
                    {sessionStatus === 'selecting-area' ? '等待框选中' : isPreparingSelection ? '正在同步虚线框' : '支持 1px 微调'}
                  </span>
                </div>
              </div>
            )}
          </section>

          <section className="bg-card rounded-2xl border border-white/15 dark:border-white/10 shadow-soft p-6 space-y-5">
            <div>
              <p className="text-sm font-semibold text-red-400 mb-1">2. 录制确认</p>
              <h2 className="text-xl font-semibold">确认输出和区域细节</h2>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-6">
              <div className="space-y-5">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">保存位置</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={outputPath}
                        readOnly
                        className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        placeholder="未选择保存位置"
                      />
                      <button
                        onClick={handleSelectOutput}
                        disabled={controlsLocked}
                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                      >
                        选择
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">格式</label>
                      <div className="grid grid-cols-2 gap-2">
                        {formatOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setFormat(option.value)}
                            disabled={controlsLocked}
                            className={`rounded-lg border px-3 py-2 text-left transition-all ${format === option.value
                              ? 'border-red-500 bg-red-500/8'
                              : 'border-white/10 bg-white/5 hover:border-white/30'
                            } ${controlsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <p className="text-sm font-semibold">{option.label}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{option.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">帧率</label>
                      <select
                        value={fps}
                        onChange={(event) => setFps(parseInt(event.target.value, 10))}
                        disabled={controlsLocked}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60"
                      >
                        {[15, 24, 30, 60].map((value) => (
                          <option key={value} value={value}>{value} FPS</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">质量</label>
                      <div className="grid grid-cols-3 gap-2">
                        {qualityOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setQuality(option.value)}
                            disabled={controlsLocked}
                            className={`rounded-lg border px-2 py-2 text-center transition-all ${quality === option.value
                              ? 'border-red-500 bg-red-500/8'
                              : 'border-white/10 bg-white/5 hover:border-white/30'
                            } ${controlsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <p className="text-sm font-semibold">{option.label}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{option.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {recordingMode === 'area' ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">区域确认</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          虚线框会保留在屏幕实际位置，坐标调整后会实时同步。
                        </p>
                      </div>
                      <button
                        onClick={handleStartAreaSelection}
                        disabled={controlsLocked}
                        className="px-3 py-2 rounded-lg border border-white/15 bg-white/8 text-sm hover:border-white/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                      >
                        重选区域
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-muted-foreground">
                        {sessionStatus === 'selecting-area'
                          ? '正在等待新的框选结果。'
                          : selectionRect
                            ? `当前区域 ${selectionRect.x}, ${selectionRect.y} · ${selectionRect.width} × ${selectionRect.height}。可直接拖动屏幕上的虚线框调整位置。`
                            : '还没有选定区域。'}
                      </div>
                      <div className={`rounded-xl border px-3 py-3 text-sm ${selectionValidationError
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        : 'border-white/10 bg-white/5 text-muted-foreground'
                      }`}>
                        {selectionValidationError
                          ? selectionValidationError
                          : `当前选区已满足最小尺寸 ${RECORDER_MIN_SELECTION_SIZE}px。`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 animate-fade-in">
                    <p className="text-sm font-semibold">全屏确认</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs text-muted-foreground mb-1">录制目标</p>
                        <p className="text-sm font-medium">{selectedScreen?.name || '未选择屏幕'}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs text-muted-foreground mb-1">输出格式</p>
                        <p className="text-sm font-medium">{format.toUpperCase()} · {fps} FPS</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs text-muted-foreground mb-1">画质策略</p>
                        <p className="text-sm font-medium">
                          {quality === 'high' ? '高质量' : quality === 'medium' ? '中等质量' : '低质量'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      全屏模式会按当前确认的屏幕输出 MP4 或 GIF，录制开始后可直接在下方停止。
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-5">
                {showPreStartControls && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold">开始录制</p>
                      <p className="text-xs text-muted-foreground mt-1">在开始前确认当前录制目标和输出设置。</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {recordingMode === 'area' ? areaReadinessCopy : '全屏参数已确认，可直接开始。'}
                    </p>

                    <button
                      onClick={handleToggleRecording}
                      disabled={startButtonDisabled}
                      className="w-full py-4 rounded-2xl font-semibold text-lg transition-all flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-black disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <span className="w-3 h-3 bg-red-500 rounded-full" />
                      开始录制
                    </button>
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">热键设置</p>
                      <p className="text-xs text-muted-foreground mt-1">保留全局开始/停止录制热键</p>
                    </div>
                    <span className="text-[10px] bg-red-500/15 text-red-300 px-2 py-1 rounded-full border border-red-500/20 uppercase tracking-wider">
                      全局生效
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={isRecordingHotkey ? '正在录入...' : localHotkey.replace('CommandOrControl+', 'Ctrl+')}
                      readOnly
                      onClick={() => {
                        if (!controlsLocked) {
                          setIsRecordingHotkey(true)
                        }
                      }}
                      disabled={controlsLocked}
                      className={`flex-1 bg-black/20 border-2 rounded-xl px-4 py-3 text-center font-mono font-bold transition-all cursor-pointer ${isRecordingHotkey
                        ? 'border-red-500 shadow-lg shadow-red-500/20 text-red-400'
                        : 'border-white/10 hover:border-white/30'
                      } ${controlsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    />
                    <button
                      onClick={handleSaveHotkey}
                      disabled={controlsLocked || isSavingHotkey || isRecordingHotkey}
                      className="px-4 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold transition-all"
                    >
                      {isSavingHotkey ? '保存中' : '保存'}
                    </button>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {controlsLocked
                      ? '录制进行中时无法修改热键。'
                      : isRecordingHotkey
                        ? '按下新的组合键完成录入。'
                        : '点击输入框后，按下新的组合键。'}
                  </p>
                </div>

                <div className="rounded-xl border border-orange-500/20 bg-orange-500/8 p-4 space-y-2">
                  <p className="text-sm font-semibold text-orange-200">录制建议</p>
                  <ul className="text-xs text-muted-foreground space-y-2">
                    <li>MP4 适合长时间录制，兼容性最好。</li>
                    <li>GIF 适合短片段演示，体积通常更大。</li>
                    <li>如果画面卡顿，优先降低 FPS 或质量等级。</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {showRecordingControls && (
            <section className="bg-card rounded-2xl border border-white/15 dark:border-white/10 shadow-soft p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-red-400 mb-1">3. 录制中控制</p>
                <h2 className="text-xl font-semibold">开始后在这里控制录制</h2>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-xs font-medium border ${sessionStatus === 'recording'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : sessionStatus === 'finishing'
                  ? 'border-orange-500/30 bg-orange-500/10 text-orange-200'
                  : 'border-white/10 bg-white/5 text-muted-foreground'
              }`}>
                {statusCopy}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-4">
              <div className={`rounded-2xl border p-5 ${isRecording
                ? 'border-red-500/25 bg-red-500/10 animate-pulse-glow'
                : 'border-white/10 bg-white/5'
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-3.5 h-3.5 rounded-full ${sessionStatus === 'recording' ? 'bg-red-400 animate-recording-dot' : sessionStatus === 'finishing' ? 'bg-orange-300 animate-recording-dot' : 'bg-white/40'}`} />
                  <div>
                    <p className="text-sm font-semibold">
                      {sessionStatus === 'recording' ? '录制进行中' : sessionStatus === 'finishing' ? '正在收尾保存' : '等待开始'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{statusCopy}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">录制计时</p>
                  <p className="text-3xl font-semibold tracking-[0.15em]">{recordingTime}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-muted-foreground mb-1">当前模式</p>
                    <p className="text-sm font-medium">{recordingMode === 'full' ? '全屏录制' : '区域录制'}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-muted-foreground mb-1">输出文件</p>
                    <p className="text-sm font-medium truncate">{outputPath || '未选择保存位置'}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold mb-2">录制中提示</p>
                  <ul className="text-xs text-muted-foreground space-y-2">
                    <li>目标: {currentTargetLabel}</li>
                    <li>格式: {format.toUpperCase()} · {fps} FPS</li>
                    <li>{sessionStatus === 'finishing' ? '正在等待编码与文件写入完成。' : '使用下方按钮停止录制并返回文件。'}</li>
                  </ul>
                </div>

                <button
                  onClick={handleToggleRecording}
                  disabled={stopButtonDisabled}
                  className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all flex items-center justify-center gap-3 ${sessionStatus === 'recording'
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : sessionStatus === 'finishing'
                      ? 'bg-orange-500/70 text-white cursor-wait'
                      : 'bg-white hover:bg-gray-100 text-black disabled:opacity-60 disabled:cursor-not-allowed'
                  }`}
                >
                  {sessionStatus === 'recording' ? (
                    <>
                      <span className="w-3 h-3 bg-white rounded-sm animate-recording-dot" />
                      停止录制
                    </>
                  ) : sessionStatus === 'finishing' ? (
                    '正在结束录制…'
                  ) : (
                    <>
                      <span className="w-3 h-3 bg-red-500 rounded-full" />
                      开始录制
                    </>
                  )}
                </button>
              </div>
            </div>
            </section>
          )}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg z-50 ${toast.type === 'success' ? 'bg-green-500/90' : 'bg-red-500/90'}`}>
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
  const { rect, onStart, onMove, onEnd } = useRecorderSelection()

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
      onContextMenu={(event) => event.preventDefault()}
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
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
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
