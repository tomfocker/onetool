import { useState, useEffect, useCallback } from 'react'
import { useSettings } from './useSettings'

export function useSuperScreenshot() {
  const { settings, updateSettings: updateGlobalSettings } = useSettings()
  const [enhancedMode, setEnhancedMode] = useState(false)
  const [step, setStep] = useState<'idle' | 'capturing-base' | 'capturing-overlay'>('idle')
  const [baseImage, setBaseImage] = useState<string | null>(null)
  const [firstBounds, setFirstBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [baseOpacity, setBaseOpacity] = useState(0.4)
  const [isSavingHotkey, setIsSavingHotkey] = useState(false)
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const [autoCopy, setAutoCopy] = useState(true)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // 映射到全局 settings
  const screenshotHotkey = settings?.screenshotHotkey || 'Alt+Shift+S'
  const autoSave = settings?.autoSaveScreenshot || false
  const savePath = settings?.screenshotSavePath || ''

  const handleReset = useCallback(() => {
    setStep('idle')
    setBaseImage(null)
    setFirstBounds(null)
    setCapturedImage(null)
  }, [])

  const updateSettings = async (newSavePath: string, newAutoSave: boolean) => {
    setIsSavingSettings(true)
    try {
      await updateGlobalSettings({ screenshotSavePath: newSavePath, autoSaveScreenshot: newAutoSave })
      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    } finally {
      setIsSavingSettings(false)
    }
  }

  const saveHotkey = async (hotkey: string) => {
    setIsSavingHotkey(true)
    try {
      const res = await updateGlobalSettings({ screenshotHotkey: hotkey })
      return res
    } catch (e) {
      return { success: false, error: (e as Error).message }
    } finally {
      setIsSavingHotkey(false)
    }
  }

  const compositeImages = async (base: string, overlay: string, secondBounds: any, firstBounds: any, opacity: number) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.src = src
      })
    }

    const imgBase = await loadImage(base)
    const imgOverlay = await loadImage(overlay)

    canvas.width = imgBase.width
    canvas.height = imgBase.height

    ctx.drawImage(imgBase, 0, 0)
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - opacity})`
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const scaleX = canvas.width / firstBounds.width
    const scaleY = canvas.height / firstBounds.height
    
    const relX = (secondBounds.x - firstBounds.x) * scaleX
    const relY = (secondBounds.y - firstBounds.y) * scaleY
    const relW = secondBounds.width * scaleX
    const relH = secondBounds.height * scaleY

    const radius = 12
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 12

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

    ctx.fillStyle = 'white'
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.clip()
    ctx.drawImage(imgOverlay, relX, relY, relW, relH)
    ctx.restore()

    return canvas.toDataURL('image/png')
  }


  return {
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
    isSavingSettings,
    handleReset,
    updateSettings,
    saveHotkey,
    compositeImages
  }
}
