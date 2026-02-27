import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Camera, Layers, Copy, Check, Info, RotateCcw, Save } from 'lucide-react'

export const SuperScreenshotTool: React.FC = () => {
  const [enhancedMode, setEnhancedMode] = useState(false)
  const [step, setStep] = useState<'idle' | 'capturing-base' | 'capturing-overlay'>('idle')
  const [baseImage, setBaseImage] = useState<string | null>(null)
  const [firstBounds, setFirstBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [baseOpacity, setBaseOpacity] = useState(0.4)
  const [screenshotHotkey, setScreenshotHotkey] = useState('Alt+Shift+S')
  const [isSavingHotkey, setIsSavingHotkey] = useState(false)
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const [autoCopy, setAutoCopy] = useState(true)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [autoSave, setAutoSave] = useState(false)
  const [savePath, setSavePath] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const handleReset = useCallback(() => {
    setStep('idle')
    setBaseImage(null)
    setFirstBounds(null)
    setCapturedImage(null)
  }, [])

  useEffect(() => {
    const loadScreenshotSettings = async () => {
      if (!(window.electron as any).ipcRenderer) return
      const settings = await (window.electron as any).ipcRenderer.invoke('screenshot-settings-get')
      setSavePath(settings.savePath)
      setAutoSave(settings.autoSave)
    }
    loadScreenshotSettings()
  }, [])

  const handleUpdateSettings = async (newSavePath: string, newAutoSave: boolean) => {
    if (!(window.electron as any).ipcRenderer) return
    setIsSavingSettings(true)
    try {
      await (window.electron as any).ipcRenderer.invoke('screenshot-settings-set', {
        savePath: newSavePath,
        autoSave: newAutoSave
      })
      setSavePath(newSavePath)
      setAutoSave(newAutoSave)
      showToast('保存设置已更新', 'success')
    } catch (error) {
      showToast('保存设置失败', 'error')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleSelectPath = async () => {
    if (!(window.electron as any).ipcRenderer) return
    const result = await (window.electron as any).ipcRenderer.invoke('select-directory')
    if (result.success && !result.canceled) {
      handleUpdateSettings(result.path, autoSave)
    }
  }

  const handleHotkeyKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecordingHotkey) return
    e.preventDefault()
    e.stopPropagation()

    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('Control')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    if (e.metaKey) modifiers.push('Command')

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

    let key = e.key.toUpperCase()
    if (key === ' ') key = 'Space'
    if (key === 'ESCAPE') key = 'Esc'
    
    const hotkeyStr = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
    setScreenshotHotkey(hotkeyStr)
    setIsRecordingHotkey(false)
  }, [isRecordingHotkey])

  useEffect(() => {
    if (isRecordingHotkey) {
      window.addEventListener('keydown', handleHotkeyKeyDown)
    } else {
      window.removeEventListener('keydown', handleHotkeyKeyDown)
    }
    return () => window.removeEventListener('keydown', handleHotkeyKeyDown)
  }, [isRecordingHotkey, handleHotkeyKeyDown])

  const handleSaveHotkey = async () => {
    if (!(window.electron as any).ipcRenderer) return
    setIsSavingHotkey(true)
    try {
      const result = await (window.electron as any).ipcRenderer.invoke('screenshot-hotkey-set', screenshotHotkey)
      if (result.success) {
        showToast('截图热键已更新', 'success')
      } else {
        showToast(`设置失败: ${result.error}`, 'error')
        const current = await (window.electron as any).ipcRenderer.invoke('screenshot-hotkey-get')
        setScreenshotHotkey(current)
      }
    } catch (error) {
      showToast('设置出错', 'error')
    } finally {
      setIsSavingHotkey(false)
    }
  }

  const compositeAndCopy = async (base: string, overlay: string, secondBounds: any) => {
    if (!firstBounds) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.src = src
      })
    }

    try {
      const imgBase = await loadImage(base)
      const imgOverlay = await loadImage(overlay)

      // 使用底图的真实分辨率
      canvas.width = imgBase.width
      canvas.height = imgBase.height

      // 1. 绘制完整底图（不透明）
      ctx.drawImage(imgBase, 0, 0)

      // 2. 铺一层半透明黑色遮罩，实现“变暗”效果
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - baseOpacity})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 3. 计算缩放比（用于换算相对坐标）
      const scaleX = canvas.width / firstBounds.width
      const scaleY = canvas.height / firstBounds.height
      
      const relX = (secondBounds.x - firstBounds.x) * scaleX
      const relY = (secondBounds.y - firstBounds.y) * scaleY
      const relW = secondBounds.width * scaleX
      const relH = secondBounds.height * scaleY

      // 4. 在底图上方绘制带有圆角和投影的高亮图块
      const radius = 12 // 圆角半径

      // 开启投影
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 12

      // 创建带圆角的剪裁路径
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(relX + radius, relY)
      ctx.lineTo(relX + relW - radius, relY)
      ctx.quadraticCurveTo(relX + relW, relY, relX + relW, relY + radius)
      ctx.lineTo(relX + relW, relY + relH - radius)
      ctx.quadraticCurveTo(relX + relW, relY + relH, relX + relW - radius, relY + relH)
      ctx.lineTo(relX + radius, relY + relH)
      ctx.quadraticCurveTo(relX, relY + relH, relX, relY + relH - radius)
      ctx.lineTo(relX, relY + radius)
      ctx.quadraticCurveTo(relX, relY, relX + radius, relY)
      ctx.closePath()

      // 为了让阴影正确渲染，我们先填充一个和图块一样大小的路径
      ctx.fillStyle = 'white'
      ctx.fill()
      
      // 关闭阴影避免影响图片本身
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0

      // 剪裁并在其中绘制图片
      ctx.clip()
      ctx.drawImage(imgOverlay, relX, relY, relW, relH)
      ctx.restore()

      const resultDataUrl = canvas.toDataURL('image/png')
      setCapturedImage(resultDataUrl)

      if (autoSave && savePath) {
        const fullPath = (window as any).electron.ipcRenderer.sendSync ? null : `${savePath}\\screenshot-${Date.now()}.png`
        await (window.electron as any).ipcRenderer.invoke('save-image', resultDataUrl, fullPath)
      }

      if (autoCopy) {
        const success = await (window.electron as any).ipcRenderer.invoke('copy-to-clipboard-image', resultDataUrl)
        if (success) {
          showToast('聚焦截图已合成并复制！', 'success')
        } else {
          showToast('复制失败', 'error')
        }
      } else {
        showToast('聚焦截图已合成', 'success')
      }
    } catch (e) {
      console.error('Composite error:', e)
      showToast('图像合成失败', 'error')
    } finally {
      setStep('idle')
      setBaseImage(null)
      setFirstBounds(null)
    }
  }

  const handleStartCapture = useCallback(async () => {
    if (step !== 'idle') return
    handleReset()
    setStep('capturing-base')
    await (window.electron as any).ipcRenderer.invoke('recorder-selection-open')
  }, [step, handleReset])

  const handleDownload = async () => {
    if (!capturedImage) return
    const result = await (window.electron as any).ipcRenderer.invoke('save-image', capturedImage)
    if (result.success) {
      showToast('图片已保存', 'success')
    } else if (result.error) {
      showToast(`保存失败: ${result.error}`, 'error')
    }
  }

  const handleManualCopy = async () => {
    if (!capturedImage) return
    const success = await (window.electron as any).ipcRenderer.invoke('copy-to-clipboard-image', capturedImage)
    if (success) {
      showToast('已复制到剪贴板', 'success')
    } else {
      showToast('复制失败', 'error')
    }
  }

  useEffect(() => {
    const init = async () => {
      if ((window.electron as any).ipcRenderer) {
        const current = await (window.electron as any).ipcRenderer.invoke('screenshot-hotkey-get')
        setScreenshotHotkey(current)
      }
    }
    init()

    const unsubscribeTrigger = (window.electron as any).ipcRenderer?.on('super-screenshot-trigger', () => {
      handleStartCapture()
    })

    const handleResult = async (_event: any, bounds: any) => {
      if (!bounds) {
        if (step === 'capturing-base') handleReset()
        return
      }

      const dataUrl = await (window.electron as any).ipcRenderer.invoke('screenshot-capture', bounds)
      
      if (!dataUrl) {
        showToast('截图失败', 'error')
        handleReset()
        return
      }

      if (!enhancedMode) {
        setCapturedImage(dataUrl)
        
        if (autoSave && savePath) {
          const fullPath = `${savePath}\\screenshot-${Date.now()}.png`
          await (window.electron as any).ipcRenderer.invoke('save-image', dataUrl, fullPath)
        }

        if (autoCopy) {
          const success = await (window.electron as any).ipcRenderer.invoke('copy-to-clipboard-image', dataUrl)
          if (success) showToast('截图已复制到剪贴板', 'success')
        } else {
          showToast('截图成功', 'success')
        }
        setStep('idle')
      } else {
        if (step === 'capturing-base') {
          setBaseImage(dataUrl)
          setFirstBounds(bounds)
          setStep('capturing-overlay')
          showToast('请立即选取高亮区域', 'success')
          setTimeout(() => {
            (window.electron as any).ipcRenderer.invoke('recorder-selection-open', bounds)
          }, 300)
        } else if (step === 'capturing-overlay' && baseImage) {
          await compositeAndCopy(baseImage, dataUrl, bounds)
        }
      }
    }

    const unsubscribeResult = (window.electron as any).ipcRenderer?.on('recorder-selection-result', handleResult)
    
    return () => {
      if (unsubscribeTrigger) unsubscribeTrigger()
      if (unsubscribeResult) unsubscribeResult()
    }
  }, [step, enhancedMode, baseImage, firstBounds, baseOpacity, autoCopy, autoSave, savePath, showToast, handleStartCapture, handleReset])

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
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all focus:outline-none ${
                  enhancedMode ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-white/10'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  enhancedMode ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500 rounded-lg shadow-lg shadow-green-500/40">
                  <Copy className="text-white" size={20} />
                </div>
                <div>
                  <div className="font-bold">自动复制</div>
                  <div className="text-xs text-green-400/80 font-medium">截图完成后自动写入剪贴板</div>
                </div>
              </div>
              <button
                onClick={() => setAutoCopy(!autoCopy)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all focus:outline-none ${
                  autoCopy ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-white/10'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  autoCopy ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500 rounded-lg shadow-lg shadow-purple-500/40">
                    <Save className="text-white" size={20} />
                  </div>
                  <div>
                    <div className="font-bold">自动保存</div>
                    <div className="text-xs text-purple-400/80 font-medium">截图完成后自动保存到本地</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!savePath && !autoSave) {
                      if (!(window.electron as any).ipcRenderer) return
                      const result = await (window.electron as any).ipcRenderer.invoke('select-directory')
                      if (result.success && !result.canceled) {
                        handleUpdateSettings(result.path, true)
                      }
                    } else {
                      handleUpdateSettings(savePath, !autoSave)
                    }
                  }}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all focus:outline-none ${
                    autoSave ? 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-white/10'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    autoSave ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              <div className="flex gap-2 items-center mt-1">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground overflow-hidden truncate">
                  {savePath || '未设置保存路径'}
                </div>
                <button
                  onClick={handleSelectPath}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-medium transition-colors whitespace-nowrap"
                >
                  更改目录
                </button>
              </div>
            </div>

            {enhancedMode && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">背景亮度 (底图)</span>
                    <span className="text-blue-400">{Math.round(baseOpacity * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" max="0.9" step="0.1"
                    value={baseOpacity}
                    onChange={(e) => setBaseOpacity(parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleStartCapture}
              disabled={step !== 'idle'}
              className={`w-full py-5 rounded-xl font-bold flex items-center justify-center gap-3 transition-all duration-300 ${
                step !== 'idle'
                  ? 'bg-white/5 text-muted-foreground cursor-wait' 
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/30'
              }`}
            >
              <Camera size={22} />
              <span className="text-lg">
                {step === 'idle' ? '开始截图' : step === 'capturing-base' ? '正在截取底图...' : '正在截取高亮...'}
              </span>
            </button>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-soft">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <span>⌨️</span> 截图热键
            </h2>
            <div className="flex gap-3">
              <div 
                onClick={() => setIsRecordingHotkey(true)}
                className={`flex-1 bg-white/5 dark:bg-white/5 border ${
                  isRecordingHotkey ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-white/10'
                } rounded-xl px-4 py-3 cursor-pointer transition-all flex items-center justify-between group`}
              >
                <span className={`font-mono text-sm ${isRecordingHotkey ? 'text-blue-400 animate-pulse' : 'text-foreground'}`}>
                  {isRecordingHotkey ? '请按下按键...' : screenshotHotkey}
                </span>
              </div>
              <button
                onClick={handleSaveHotkey}
                disabled={isSavingHotkey || step !== 'idle' || isRecordingHotkey}
                className="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors"
              >
                {isSavingHotkey ? '...' : '保存'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-soft flex flex-col items-center text-center">
          {step === 'idle' && !capturedImage ? (
            <div className="my-auto space-y-4">
              <div className="w-24 h-24 rounded-3xl bg-blue-500/10 flex items-center justify-center mx-auto rotate-12">
                <Copy size={40} className="text-blue-400 opacity-40" />
              </div>
              <div className="space-y-2">
                <p className="font-bold text-lg text-muted-foreground">预览区</p>
                <p className="text-xs text-muted-foreground/60 max-w-[200px]">
                  {enhancedMode ? '叠加模式开启：将连续触发两次选区' : '普通模式：截图后自动复制'}
                </p>
              </div>
            </div>
          ) : step !== 'idle' ? (
            <div className="my-auto space-y-6 animate-pulse">
              <div className="w-20 h-20 rounded-full border-4 border-t-blue-500 border-r-blue-500/30 border-b-blue-500/10 border-l-blue-500/50 animate-spin mx-auto" />
              <div className="space-y-2">
                <p className="font-bold text-blue-400">
                  {step === 'capturing-base' ? '正在截取底图...' : '正在截取高亮区...'}
                </p>
                <p className="text-xs text-muted-foreground">请在屏幕上完成操作</p>
              </div>
              <button onClick={handleReset} className="text-[10px] text-red-400/60 hover:text-red-400 underline uppercase tracking-widest">
                放弃本次截图
              </button>
            </div>
          ) : capturedImage ? (
            <div className="w-full h-full flex flex-col space-y-4">
              <div className="flex-1 min-h-0 bg-white/5 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center">
                <img 
                  src={capturedImage} 
                  alt="Captured screenshot" 
                  className="max-w-full max-h-full object-contain shadow-2xl shadow-black/50" 
                />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={handleManualCopy}
                  className="flex flex-col items-center gap-2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all group"
                >
                  <Copy size={18} className="text-blue-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-tight">复制</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="flex flex-col items-center gap-2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all group"
                >
                  <Camera size={18} className="text-green-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-tight">下载</span>
                </button>
                <button
                  onClick={handleReset}
                  className="flex flex-col items-center gap-2 p-3 bg-white/10 hover:bg-red-500/20 rounded-xl transition-all group"
                >
                  <RotateCcw size={18} className="text-red-400 group-hover:rotate-180 transition-transform duration-500" />
                  <span className="text-[10px] font-bold uppercase tracking-tight">重置</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-10 right-10 px-6 py-4 rounded-2xl shadow-2xl animate-slide-in-right z-50 flex items-center gap-3 ${
          toast.type === 'success' ? 'bg-blue-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <Check size={20} className="text-white" /> : <Info size={20} className="text-white" />}
          <span className="text-white font-bold">{toast.message}</span>
        </div>
      )}
    </div>
  )
}
