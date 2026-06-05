import React, { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FolderOpen, ListVideo, RefreshCw } from 'lucide-react'
import { useScreenRecorder } from '../hooks/useScreenRecorder'
import {
  RECORDER_MIN_SELECTION_SIZE,
  type CompletedRecordingOpenAction,
  type CompletedRecordingTask
} from '../../../shared/screenRecorderSession'
export { RecorderSelectionOverlay } from '../components/RecorderSelectionOverlay'

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

function formatRecordingTaskSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '未知大小'
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
  }

  return `${(sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatRecordingTaskDate(completedAt: string) {
  const completedDate = new Date(completedAt)
  if (Number.isNaN(completedDate.getTime())) {
    return '完成时间未知'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(completedDate)
}

function getRecordingTaskMeta(task: CompletedRecordingTask) {
  const modeLabel = task.mode === 'area' ? '区域录制' : '全屏录制'
  return [
    task.format.toUpperCase(),
    modeLabel,
    task.duration,
    formatRecordingTaskSize(task.sizeBytes),
    formatRecordingTaskDate(task.completedAt)
  ].join(' · ')
}

export const ScreenRecorderTool: React.FC = () => {
  const [toast, setToast] = useState<ToastState | null>(null)
  const [localHotkey, setLocalHotkey] = useState('Alt+Shift+R')
  const [taskPanelOpen, setTaskPanelOpen] = useState(false)

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
    canStartRecording,
    isPreparingSelection,
    selectionValidationError,
    startAreaSelection,
    completedTasks,
    completedTasksLoading,
    loadCompletedTasks,
    openCompletedTask
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
        void loadCompletedTasks()
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
  }, [loadCompletedTasks, sessionStatus, setSelectionRect, showToast, startRecording, stopRecording])

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

  const handleToggleTaskPanel = useCallback(() => {
    setTaskPanelOpen((open) => !open)
    void loadCompletedTasks()
  }, [loadCompletedTasks])

  const handleRefreshTasks = useCallback(() => {
    void loadCompletedTasks()
  }, [loadCompletedTasks])

  const handleOpenCompletedTask = useCallback(async (
    task: CompletedRecordingTask,
    action: CompletedRecordingOpenAction
  ) => {
    const result = await openCompletedTask(task.id, action)
    if (!result.success) {
      showToast(result.error || '打开录制任务失败', 'error')
    }
  }, [openCompletedTask, showToast])

  const formatOptions = [
    { value: 'mp4', label: 'MP4' },
    { value: 'gif', label: 'GIF' }
  ] as const

  const qualityOptions = [
    { value: 'low', label: '低' },
    { value: 'medium', label: '中' },
    { value: 'high', label: '高' }
  ] as const

  const statusCopy = {
    idle: '待开始',
    'selecting-area': '框选中',
    'ready-to-record': '可开始',
    recording: '录制中',
    finishing: '保存中'
  }[sessionStatus]

  const startButtonDisabled = sessionStatus === 'finishing' || isPreparingSelection || !canStartRecording
  const primaryButtonDisabled = sessionStatus === 'recording' ? false : startButtonDisabled
  const primaryButtonLabel = sessionStatus === 'recording'
    ? '停止录制'
    : sessionStatus === 'finishing'
      ? '保存中...'
      : '开始录制'
  const currentTargetLabel = recordingMode === 'full'
    ? selectedScreen?.name || '未选择屏幕'
    : selectionRect
      ? `区域 ${selectionRect.width} × ${selectionRect.height}`
      : '尚未框选区域'
  const qualityLabel = qualityOptions.find((option) => option.value === quality)?.label || '中'
  const outputSummary = `${format.toUpperCase()} · ${fps} FPS · ${qualityLabel}`
  const statusTone = sessionStatus === 'recording'
    ? 'border-red-500/25 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
    : sessionStatus === 'finishing'
      ? 'border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
      : 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-muted-foreground'
  const statusDotTone = sessionStatus === 'recording'
    ? 'bg-red-500 animate-recording-dot'
    : sessionStatus === 'finishing'
      ? 'bg-amber-500 animate-recording-dot'
      : 'bg-zinc-300 dark:bg-white/40'
  const primaryButtonTone = sessionStatus === 'recording'
    ? 'bg-red-500 hover:bg-red-600 text-white'
    : sessionStatus === 'finishing'
      ? 'bg-amber-500/80 text-white cursor-wait'
      : 'bg-red-500 hover:bg-red-600 text-white shadow-[0_16px_30px_-18px_rgba(239,68,68,0.7)]'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-5 py-5 sm:px-6">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">屏幕录制</h1>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${statusTone}`}>
              <span className={`h-2 w-2 rounded-full ${statusDotTone}`} />
              {statusCopy}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="max-w-[18rem] truncate rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
              {currentTargetLabel}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 font-medium text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              {outputSummary}
            </span>
          </div>
        </header>

        <div className="space-y-4 animate-fade-in-up">
          {taskPanelOpen && (
            <section className="rounded-[1.25rem] border border-zinc-200/80 bg-white/75 p-4 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">录制任务</h2>
                <button
                  type="button"
                  onClick={handleRefreshTasks}
                  disabled={completedTasksLoading}
                  title="刷新任务"
                  aria-label="刷新录制任务"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white/80 transition-all hover:border-zinc-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/8 dark:hover:border-white/30"
                >
                  <RefreshCw className={`h-4 w-4 ${completedTasksLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {completedTasks.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-zinc-200 px-4 py-5 text-sm text-muted-foreground dark:border-white/10">
                  {completedTasksLoading ? '刷新中...' : '暂无任务'}
                </div>
              ) : (
                <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1">
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{task.fileName}</p>
                        <p className="text-xs text-muted-foreground mt-1">{getRecordingTaskMeta(task)}</p>
                        <p className="text-[11px] text-muted-foreground/75 mt-1 truncate">{task.outputPath}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleOpenCompletedTask(task, 'file')}
                          title="打开文件"
                          aria-label={`打开文件 ${task.fileName}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white transition-all hover:border-zinc-300 active:scale-[0.98] dark:border-white/10 dark:bg-black/20 dark:hover:border-white/30"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenCompletedTask(task, 'folder')}
                          title="定位文件"
                          aria-label={`定位文件 ${task.fileName}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white transition-all hover:border-zinc-300 active:scale-[0.98] dark:border-white/10 dark:bg-black/20 dark:hover:border-white/30"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="recorder-layout-grid grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <main className="min-w-0 space-y-4">
              <section className="rounded-[1.25rem] border border-zinc-200/80 bg-white/75 p-4 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-red-500 dark:text-red-300">录制设置</p>
                    <h2 className="mt-1 text-lg font-semibold">范围</h2>
                  </div>
                  <div className="recorder-segmented-control grid w-full grid-cols-2 rounded-xl bg-zinc-100 p-1 sm:w-56 dark:bg-white/8">
                    {([
                      { value: 'full', label: '全屏' },
                      { value: 'area', label: '区域' }
                    ] as const).map((modeOption) => (
                      <button
                        key={modeOption.value}
                        type="button"
                        onClick={() => handleModeChange(modeOption.value)}
                        disabled={controlsLocked}
                        className={`h-10 rounded-lg px-3 text-sm font-semibold transition-all active:scale-[0.98] ${recordingMode === modeOption.value
                          ? 'bg-white text-red-500 shadow-sm dark:bg-zinc-950 dark:text-red-300'
                          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                        } ${controlsLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        {modeOption.label}
                      </button>
                    ))}
                  </div>
                </div>

                {recordingMode === 'full' && (
                  <div className="mt-4 animate-fade-in">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-muted-foreground">屏幕</p>
                      {selectedScreen && <p className="text-xs text-muted-foreground">已选: {selectedScreen.name}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {screenList.map((screen) => (
                        <button
                          key={screen.id}
                          type="button"
                          onClick={() => setSelectedScreen(screen)}
                          disabled={controlsLocked}
                          className={`group overflow-hidden rounded-xl border bg-zinc-50/70 text-left transition-all active:scale-[0.99] dark:bg-white/5 ${selectedScreen?.id === screen.id
                            ? 'border-red-500 shadow-[0_16px_32px_-26px_rgba(239,68,68,0.85)]'
                            : 'border-zinc-200/80 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/30'
                          } ${controlsLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <img src={screen.thumbnail} alt={screen.name} className="aspect-video w-full object-cover" />
                          <div className="px-3 py-2">
                            <p className="truncate text-xs font-medium">{screen.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {recordingMode === 'area' && (
                  <div className="mt-4 animate-fade-in rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium">{selectionRect ? currentTargetLabel : '未框选'}</p>
                      <button
                        type="button"
                        onClick={handleStartAreaSelection}
                        disabled={controlsLocked}
                        className="h-10 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white transition-all hover:bg-red-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {selectionRect ? '重选区域' : '框选区域'}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-zinc-200 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/8">
                        最小 {RECORDER_MIN_SELECTION_SIZE} × {RECORDER_MIN_SELECTION_SIZE}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/8">
                        {sessionStatus === 'selecting-area' ? '等待框选' : isPreparingSelection ? '同步中' : '可微调'}
                      </span>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-[1.25rem] border border-zinc-200/80 bg-white/75 p-4 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-red-500 dark:text-red-300">录制设置</p>
                    <h2 className="mt-1 text-lg font-semibold">输出</h2>
                  </div>
                  <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-200">{outputSummary}</p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_150px_1fr]">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">格式</label>
                    <div className="recorder-segmented-control grid grid-cols-2 rounded-xl bg-zinc-100 p-1 dark:bg-white/8">
                      {formatOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFormat(option.value)}
                          disabled={controlsLocked}
                          className={`h-10 rounded-lg px-3 text-sm font-semibold transition-all active:scale-[0.98] ${format === option.value
                            ? 'bg-white text-red-500 shadow-sm dark:bg-zinc-950 dark:text-red-300'
                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                          } ${controlsLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">帧率</label>
                    <select
                      value={fps}
                      onChange={(event) => setFps(parseInt(event.target.value, 10))}
                      disabled={controlsLocked}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium outline-none transition-all focus:border-red-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/8"
                    >
                      {[15, 24, 30, 60].map((value) => (
                        <option key={value} value={value}>{value} FPS</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">质量</label>
                    <div className="recorder-segmented-control grid grid-cols-3 rounded-xl bg-zinc-100 p-1 dark:bg-white/8">
                      {qualityOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setQuality(option.value)}
                          disabled={controlsLocked}
                          className={`h-10 rounded-lg px-2 text-sm font-semibold transition-all active:scale-[0.98] ${quality === option.value
                            ? 'bg-white text-red-500 shadow-sm dark:bg-zinc-950 dark:text-red-300'
                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                          } ${controlsLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs text-muted-foreground">保存到</p>
                    <p className="mt-1 truncate text-sm font-medium">{outputPath || '未选择保存位置'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectOutput}
                    disabled={controlsLocked}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold transition-all hover:border-zinc-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/8 dark:hover:border-white/30"
                  >
                    <FolderOpen className="h-4 w-4" />
                    更改
                  </button>
                </div>

                <div className={`mt-3 rounded-xl border px-3 py-2.5 text-sm ${selectionValidationError
                  ? 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'
                  : 'border-zinc-200 bg-zinc-50/80 text-muted-foreground dark:border-white/10 dark:bg-white/5'
                }`}>
                  {recordingMode === 'area'
                    ? selectionValidationError || (selectionRect ? currentTargetLabel : '请选择区域')
                    : currentTargetLabel}
                </div>
              </section>
            </main>

            <aside className="recorder-action-panel self-start rounded-[1.25rem] border border-zinc-200/80 bg-white/85 p-4 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.5)] xl:sticky xl:top-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">操作台</h2>
                <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone}`}>{statusCopy}</span>
              </div>

              <div className={`mt-4 rounded-xl border px-4 py-4 ${isRecording
                ? 'border-red-500/25 bg-red-50 dark:bg-red-500/10'
                : 'border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/5'
              }`}>
                <p className="text-xs text-muted-foreground">计时</p>
                <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.1em]">{recordingTime}</p>
              </div>

              <button
                type="button"
                onClick={handleToggleRecording}
                disabled={primaryButtonDisabled}
                className={`mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-lg font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${primaryButtonTone}`}
              >
                {primaryButtonLabel}
              </button>

              <div className="mt-4 grid gap-2 text-sm">
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                  <span className="text-xs text-muted-foreground">目标</span>
                  <span className="truncate font-medium">{currentTargetLabel}</span>
                </div>
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                  <span className="text-xs text-muted-foreground">输出</span>
                  <span className="truncate font-medium">{outputSummary}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleTaskPanel}
                className={`mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-all active:scale-[0.98] ${taskPanelOpen
                  ? 'border-red-500/30 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-white/8 dark:hover:border-white/30'
                }`}
              >
                <ListVideo className="h-4 w-4" />
                <span>录制任务</span>
                {completedTasks.length > 0 && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] dark:bg-white/12">
                    {completedTasks.length}
                  </span>
                )}
              </button>

              <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-white/10">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">热键</p>
                  <span className="rounded-full border border-red-500/20 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-500 dark:bg-red-500/15 dark:text-red-300">
                    全局
                  </span>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <input
                    type="text"
                    value={isRecordingHotkey ? '录入中...' : localHotkey.replace('CommandOrControl+', 'Ctrl+')}
                    readOnly
                    onClick={() => {
                      if (!controlsLocked) {
                        setIsRecordingHotkey(true)
                      }
                    }}
                    disabled={controlsLocked}
                    className={`h-11 min-w-0 cursor-pointer rounded-xl border px-3 text-center font-mono text-sm font-semibold outline-none transition-all ${isRecordingHotkey
                      ? 'border-red-500 bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-300'
                      : 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/30'
                    } ${controlsLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={handleSaveHotkey}
                    disabled={controlsLocked || isSavingHotkey || isRecordingHotkey}
                    className="h-11 rounded-xl bg-red-500 px-4 text-sm font-semibold text-white transition-all hover:bg-red-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingHotkey ? '保存中' : '保存'}
                  </button>
                </div>
              </div>
            </aside>
          </div>
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

export default ScreenRecorderTool
