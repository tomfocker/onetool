import React, { useEffect, useCallback, useState } from 'react'
import { useTheme } from '@/context/ThemeContext'
import { useScreenRecorder } from '../hooks/useScreenRecorder'
import { useRecorderSelection } from '../hooks/useRecorderSelection'

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const {
    outputPath, setOutputPath,
    format, setFormat,
    fps, setFps,
    quality, setQuality,
    recordingMode, handleModeChange,
    selectedWindow, setSelectedWindow,
    windowList,
    isRecording,
    recordingTime,
    setSelectionRect,
    recorderHotkey, setRecorderHotkey,
    isSavingHotkey, setIsSavingHotkey,
    isRecordingHotkey, setIsRecordingHotkey,
    startRecording,
    stopRecording
  } = useScreenRecorder()

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)
    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  useEffect(() => {
    if (!window.electron?.screenRecorder) return

    const unsubscribeSelection = (window.electron as any).ipcRenderer?.on('recorder-selection-result', (_event, bounds) => {
      setSelectionRect(bounds)
      showToast('录制区域已设定', 'success')
    })

    const unsubscribeStopped = window.electron.screenRecorder.onStopped((data) => {
      if (data.success) {
        showToast(`录制完成，文件已保存到: ${data.outputPath}`, 'success')
      } else {
        showToast(`录制失败: ${data.error}`, 'error')
      }
    })

    const unsubscribeHotkey = window.electron.screenRecorder.onToggleHotkey?.(() => {
      if (isRecording) {
        stopRecording()
      } else {
        startRecording().then(res => {
          if (!res.success) showToast(res.error || '启动失败', 'error')
        })
      }
    })

    return () => {
      if (unsubscribeSelection) unsubscribeSelection()
      unsubscribeStopped()
      if (unsubscribeHotkey) unsubscribeHotkey()
    }
  }, [isRecording, startRecording, stopRecording, setSelectionRect, showToast])

  const handleSelectOutput = async () => {
    try {
      const result = await window.electron.screenRecorder.selectOutput()
      if (result.success && result.data && !result.data.canceled && result.data.filePath) {
        setOutputPath(result.data.filePath)
      }
    } catch (error) {
      showToast(`选择文件失败: ${(error as Error).message}`, 'error')
    }
  }

  const handleSaveHotkey = async () => {
    if (!window.electron?.screenRecorder?.setHotkey) return
    setIsSavingHotkey(true)
    try {
      const result = await window.electron.screenRecorder.setHotkey(recorderHotkey)
      if (result.success) showToast('热键设置已更新', 'success')
      else showToast(`热键设置失败: ${result.error}`, 'error')
    } catch (error) {
      showToast(`设置出错: ${(error as Error).message}`, 'error')
    } finally {
      setIsSavingHotkey(false)
    }
  }

  const handleToggleRecording = async () => {
    if (isRecording) {
      const res = await stopRecording()
      if (!res.success) showToast(res.error || '停止失败', 'error')
    } else {
      const res = await startRecording()
      if (!res.success) showToast(res.error || '启动失败', 'error')
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
                  className={`p-4 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${
                    recordingMode === mode 
                      ? 'border-red-500 bg-red-500/5 text-red-500 shadow-lg shadow-red-500/10' 
                      : 'border-white/10 hover:border-white/30 bg-white/5'
                  }`}
                >
                  <span className="text-2xl">
                    {mode === 'full' ? '🖥️' : mode === 'area' ? '📐' : '🪟'}
                  </span>
                  <span className="font-medium">
                    {mode === 'full' ? '全屏录制' : mode === 'area' ? '区域录制' : '窗口录制'}
                  </span>
                </button>
              ))}
            </div>

            {recordingMode === 'window' && (
              <div className="space-y-3 animate-fade-in">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span>✨</span> 请选择要录制的窗口
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-1 scrollbar-thin">
                  {windowList.map((win) => (
                    <button
                      key={win.id}
                      onClick={() => setSelectedWindow(win)}
                      className={`group relative rounded-lg overflow-hidden border-2 transition-all ${
                        selectedWindow?.id === win.id ? 'border-red-500 shadow-md' : 'border-transparent hover:border-white/20'
                      }`}
                    >
                      <img src={win.thumbnail} alt={win.name} className="w-full aspect-video object-cover" />
                      <div className={`absolute inset-0 bg-black/60 flex items-end p-2 transition-opacity ${
                        selectedWindow?.id === win.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        <p className="text-[10px] text-white truncate w-full">{win.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recordingMode === 'area' && (
              <div className="animate-fade-in flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="space-y-1">
                  <p className="text-sm font-medium">区域录制</p>
                  <p className="text-xs text-muted-foreground italic">
                    点击按钮后在屏幕上拖拽选择一个矩形区域
                  </p>
                </div>
                <button
                  onClick={() => (window.electron as any).ipcRenderer.invoke('recorder-selection-open')}
                  className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-all text-sm font-medium"
                >
                  重新选择区域
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>⚙️</span> 输出设置
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">保存位置</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={outputPath}
                      readOnly
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
                      placeholder="未选择保存位置"
                    />
                    <button
                      onClick={handleSelectOutput}
                      className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                    >
                      📁
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">格式</label>
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                      {formatOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setFormat(opt.value as any)}
                          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                            format === opt.value ? 'bg-red-500 text-white shadow-sm' : 'hover:bg-white/5'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">帧率 (FPS)</label>
                    <select
                      value={fps}
                      onChange={(e) => setFps(parseInt(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none appearance-none"
                    >
                      {[15, 24, 30, 60].map(f => (
                        <option key={f} value={f}>{f} FPS</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">录制画质</label>
                  <div className="grid grid-cols-3 gap-2">
                    {qualityOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setQuality(opt.value as any)}
                        className={`py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                          quality === opt.value ? 'border-red-500 bg-red-500/5 text-red-500' : 'border-white/5 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>⌨️</span> 热键设置
              </h2>
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">开始/停止录制</span>
                    <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">全局生效</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={isRecordingHotkey ? '正在录入...' : recorderHotkey.replace('CommandOrControl+', 'Ctrl+')}
                        readOnly
                        onClick={() => setIsRecordingHotkey(true)}
                        className={`w-full bg-black/20 border-2 rounded-xl px-4 py-3 text-center font-mono font-bold transition-all cursor-pointer ${
                          isRecordingHotkey ? 'border-red-500 shadow-lg shadow-red-500/20 text-red-500 scale-[1.02]' : 'border-white/10 hover:border-white/30'
                        }`}
                      />
                      {!isRecordingHotkey && (
                        <div className="absolute top-1/2 -translate-y-1/2 right-3 text-white/20">
                          🖱️
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSaveHotkey}
                      disabled={isSavingHotkey || isRecordingHotkey}
                      className="px-4 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 rounded-xl font-bold text-white transition-all shadow-lg shadow-red-500/30"
                    >
                      {isSavingHotkey ? '...' : '保存'}
                    </button>
                  </div>
                  
                  <p className="text-[10px] text-muted-foreground text-center italic">
                    {isRecordingHotkey ? '请在键盘上按下组合键' : '点击输入框可重新设置快捷键'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-xl">
                    💡
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-red-400 mb-0.5">温馨提示</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      录制过程中如果遇到卡顿，建议尝试降低 FPS 或切换到 MP4 格式。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={handleToggleRecording}
              className={`w-full py-6 rounded-2xl font-bold text-xl transition-all duration-500 flex items-center justify-center gap-4 group ${
                isRecording 
                  ? 'bg-red-500 text-white animate-pulse-glow shadow-2xl shadow-red-500/40' 
                  : 'bg-white hover:bg-gray-100 text-black shadow-xl hover:shadow-2xl'
              }`}
            >
              {isRecording ? (
                <>
                  <div className="w-4 h-4 bg-white rounded-sm animate-recording-dot" />
                  <span>停止录制 ({recordingTime})</span>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 bg-red-500 rounded-full group-hover:scale-125 transition-transform" />
                  <span>开始录制</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-purple-400 mb-2 flex items-center gap-2">
              <span>📘</span> 录制建议
            </h3>
            <ul className="text-xs text-muted-foreground space-y-2">
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
