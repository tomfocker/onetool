import React, { useState, useEffect, useCallback } from 'react'
import { Camera, Layers, Copy, Check, Info, RotateCcw, Save } from 'lucide-react'
import { useSuperScreenshot } from '../hooks/useSuperScreenshot'
import { useNotification } from '../context/NotificationContext'

export const SuperScreenshotTool: React.FC = () => {
  const { showNotification } = useNotification()
  
  const {
    enhancedMode, setEnhancedMode,
    step, setStep,
    baseImage, setBaseImage,
    firstBounds, setFirstBounds,
    baseOpacity, setBaseOpacity,
    screenshotHotkey,
    isSavingHotkey,
    isRecordingHotkey, setIsRecordingHotkey,
    autoCopy, setAutoCopy,
    capturedImage, setCapturedImage,
    autoSave,
    savePath,
    handleReset,
    updateSettings,
    saveHotkey,
    compositeImages
  } = useSuperScreenshot()

  const [localAutoSave, setLocalAutoSave] = useState(false)
  useEffect(() => { if (autoSave !== undefined) setLocalAutoSave(autoSave) }, [autoSave])

  const [tempHotkey, setTempHotkey] = useState('')
  useEffect(() => { if (screenshotHotkey) setTempHotkey(screenshotHotkey) }, [screenshotHotkey])

  const handleSelectPath = async () => {
    if (!window.electron?.screenshot) return
    const res = await window.electron.screenshot.selectDirectory()
    if (res.success && res.data && !res.data.canceled && res.data.path) {
      const updateRes = await updateSettings(res.data.path, localAutoSave)
      if (updateRes.success) showNotification({ type: 'success', message: '保存设置已更新' })
      else showNotification({ type: 'error', message: updateRes.error || '更新失败' })
    }
  }

  const handleHotkeyKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecordingHotkey) return
    e.preventDefault()
    e.stopPropagation()

    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('CommandOrControl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

    let key = e.key.toUpperCase()
    if (key === ' ') key = 'Space'
    if (key === 'ESCAPE') key = 'Esc'
    
    const hotkeyStr = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
    setTempHotkey(hotkeyStr)
    setIsRecordingHotkey(false)
  }, [isRecordingHotkey, setIsRecordingHotkey])

  useEffect(() => {
    if (isRecordingHotkey) window.addEventListener('keydown', handleHotkeyKeyDown)
    else window.removeEventListener('keydown', handleHotkeyKeyDown)
    return () => window.removeEventListener('keydown', handleHotkeyKeyDown)
  }, [isRecordingHotkey, handleHotkeyKeyDown])

  const handleSaveHotkey = async () => {
    const res = await saveHotkey(tempHotkey)
    if (res && res.success) showNotification({ type: 'success', message: '截图热键已更新' })
    else showNotification({ type: 'error', message: res?.error || '设置失败' })
  }

  const handleStartCapture = useCallback(async () => {
    if (step !== 'idle') return
    handleReset()
    setStep('capturing-base')
    await (window.electron as any).ipcRenderer.invoke('recorder-selection-open')
  }, [step, handleReset, setStep])

  const handleDownload = async () => {
    if (!capturedImage || !window.electron?.screenshot) return
    const res = await window.electron.screenshot.saveImage(capturedImage)
    if (res.success) showNotification({ type: 'success', message: '图片已保存' })
    else if (res.error) showNotification({ type: 'error', message: `保存失败: ${res.error}` })
  }

  const handleManualCopy = async () => {
    if (!capturedImage || !window.electron?.screenshot) return
    const res = await window.electron.screenshot.copyToClipboard(capturedImage)
    if (res.success) showNotification({ type: 'success', message: '已复制到剪贴板' })
    else showNotification({ type: 'error', message: '复制失败' })
  }

  useEffect(() => {
    const unsubscribeTrigger = (window.electron as any).ipcRenderer?.on('super-screenshot-trigger', () => {
      handleStartCapture()
    })

    const handleResult = async (_event: any, bounds: any) => {
      if (!bounds) {
        if (step === 'capturing-base') handleReset()
        return
      }

      if (!window.electron?.screenshot) return
      const res = await window.electron.screenshot.capture(bounds)
      if (!res.success || !res.data) {
        showNotification({ type: 'error', message: '截图失败' })
        handleReset()
        return
      }

      const dataUrl = res.data

      if (!enhancedMode) {
        setCapturedImage(dataUrl)
        if (localAutoSave && savePath) {
          const fullPath = `${savePath}\\screenshot-${Date.now()}.png`
          await window.electron.screenshot.saveImage(dataUrl, fullPath)
        }
        if (autoCopy) {
          const copyRes = await window.electron.screenshot.copyToClipboard(dataUrl)
          if (copyRes.success) showNotification({ type: 'success', message: '截图已复制到剪贴板' })
        } else {
          showNotification({ type: 'info', message: '截图成功' })
        }
        setStep('idle')
      } else {
        if (step === 'capturing-base') {
          setBaseImage(dataUrl)
          setFirstBounds(bounds)
          setStep('capturing-overlay')
          showNotification({ type: 'info', message: '请立即选取高亮区域', duration: 2000 })
          setTimeout(() => {
            (window.electron as any).ipcRenderer.invoke('recorder-selection-open', bounds)
          }, 300)
        } else if (step === 'capturing-overlay' && baseImage && firstBounds) {
          const resultDataUrl = await compositeImages(baseImage, dataUrl, bounds, firstBounds, baseOpacity)
          if (resultDataUrl) {
            setCapturedImage(resultDataUrl)
            if (localAutoSave && savePath) {
              const fullPath = `${savePath}\\screenshot-${Date.now()}.png`
              await window.electron.screenshot.saveImage(resultDataUrl, fullPath)
            }
            if (autoCopy) {
              const copyRes = await window.electron.screenshot.copyToClipboard(resultDataUrl)
              if (copyRes.success) showNotification({ type: 'success', message: '聚焦截图已合成并复制！' })
            } else {
              showNotification({ type: 'success', message: '聚焦截图已合成' })
            }
          }
          setStep('idle')
          setBaseImage(null)
          setFirstBounds(null)
        }
      }
    }

    const unsubscribeResult = (window.electron as any).ipcRenderer?.on('recorder-selection-result', handleResult)
    return () => {
      if (unsubscribeTrigger) unsubscribeTrigger()
      if (unsubscribeResult) unsubscribeResult()
    }
  }, [step, enhancedMode, baseImage, firstBounds, baseOpacity, autoCopy, localAutoSave, savePath, showNotification, handleStartCapture, handleReset, compositeImages, setCapturedImage, setBaseImage, setFirstBounds, setStep])

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">
          叠加截图
        </h1>
        <p className="text-muted-foreground">选取区域并复制，支持“聚光灯”叠加高亮效果</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-soft space-y-6">
            <div className="flex items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg shadow-lg shadow-blue-500/40">
                  <Layers className="text-white" size={20} />
                </div>
                <div>
                  <div className="font-bold">开启叠加模式</div>
                  <div className="text-xs text-blue-400/80 font-medium">在底图基础上再次截图</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setEnhancedMode(!enhancedMode)
                  handleReset()
                }}
                className={`w-12 h-6 rounded-full transition-all duration-300 relative ${
                  enhancedMode ? 'bg-blue-500' : 'bg-zinc-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${
                  enhancedMode ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>

            {enhancedMode && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">底图透明度</span>
                    <span className="text-blue-400 font-mono font-bold">{Math.round(baseOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.1"
                    value={baseOpacity}
                    onChange={(e) => setBaseOpacity(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Copy size={16} className="text-muted-foreground" />
                  自动复制
                </div>
                <button
                  onClick={() => setAutoCopy(!autoCopy)}
                  className={`w-10 h-5 rounded-full transition-all duration-300 relative ${
                    autoCopy ? 'bg-cyan-500' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${
                    autoCopy ? 'left-6' : 'left-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Save size={16} className="text-muted-foreground" />
                  自动保存
                </div>
                <button
                  onClick={() => {
                    const nextValue = !localAutoSave
                    setLocalAutoSave(nextValue)
                    updateSettings(savePath, nextValue)
                  }}
                  className={`w-10 h-5 rounded-full transition-all duration-300 relative ${
                    localAutoSave ? 'bg-cyan-500' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${
                    localAutoSave ? 'left-6' : 'left-1'
                  }`} />
                </button>
              </div>

              {localAutoSave && (
                <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest">
                    <span>保存目录</span>
                    <button onClick={handleSelectPath} className="text-blue-400 hover:underline">更改</button>
                  </div>
                  <div className="text-xs truncate font-mono bg-white/5 p-2 rounded border border-white/5">
                    {savePath || '系统图片目录'}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-soft space-y-4">
            <div className="flex items-center gap-2 font-bold mb-2">
              ⌨️ 快捷键
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={isRecordingHotkey ? '等待按键...' : tempHotkey.replace('Control', 'Ctrl').replace('Command', 'Win')}
                readOnly
                onClick={() => setIsRecordingHotkey(true)}
                className={`flex-1 bg-black/20 border-2 rounded-xl px-4 py-2 text-center font-mono font-bold transition-all cursor-pointer ${
                  isRecordingHotkey ? 'border-blue-500 shadow-lg shadow-blue-500/20 text-blue-500 scale-[1.02]' : 'border-white/5 hover:border-white/10'
                }`}
              />
              <button
                onClick={handleSaveHotkey}
                disabled={isSavingHotkey}
                className="px-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-bold text-white transition-all shadow-lg shadow-blue-500/30"
              >
                {isSavingHotkey ? '...' : '保存'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900/50 aspect-video rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center relative overflow-hidden group">
            {capturedImage ? (
              <>
                <img src={capturedImage} className="w-full h-full object-contain" alt="Captured" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <button onClick={handleDownload} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all">
                    <Save size={20} />
                  </button>
                  <button onClick={handleManualCopy} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all">
                    <Copy size={20} />
                  </button>
                  <button onClick={handleReset} className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-400 transition-all">
                    <RotateCcw size={20} />
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center space-y-4 p-8">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <Camera size={32} className="text-zinc-500" />
                </div>
                <div className="text-sm text-zinc-500">
                  {step === 'capturing-base' ? '正在选取底图...' : 
                   step === 'capturing-overlay' ? '正在选取高亮区域...' : 
                   '尚未截图'}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleStartCapture}
            disabled={step !== 'idle'}
            className={`w-full py-6 rounded-2xl font-bold text-xl transition-all duration-500 flex items-center justify-center gap-4 shadow-2xl ${
              step !== 'idle' 
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:scale-[1.02] active:scale-[0.98] shadow-blue-500/20'
            }`}
          >
            <Camera size={24} />
            <span>{step === 'idle' ? '立即开始截图' : '截图中...'}</span>
          </button>

          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
              <Info size={16} />
              使用说明
            </h3>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5" />
                <span>普通模式：直接选取区域并复制。</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5" />
                <span>叠加模式：先截全屏底图，再截局部高亮图，自动合成“聚光灯”效果。</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5" />
                <span>按 ESC 或右键可取消当前截图操作。</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SuperScreenshotTool
