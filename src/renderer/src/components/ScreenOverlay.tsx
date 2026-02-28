import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Loader2 } from 'lucide-react'

interface SelectionState {
  isSelecting: boolean
  startX: number
  startY: number
  endX: number
  endY: number
}

interface TranslationResult {
  originalText: string
  translatedText: string
  position: { x: number; y: number; width: number; height: number }
}

// 不再使用 mockOCRAndTranslate，将直接在事件处理函数中调用真实 API

export const ScreenOverlay: React.FC = () => {
  const [screenImage, setScreenImage] = useState<string | null>(null)
  const [selection, setSelection] = useState<SelectionState>({
    isSelecting: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    // 【修改点】：不再从 URL 中读取 base64 数据，避免超长 URL 导致渲染进程卡死
    if (!window.electron?.screenOverlay) return

    // 1. 监听主进程发来的截图数据
    const unsubscribe = window.electron.screenOverlay.onScreenshot((dataUrl) => {
      setScreenImage(dataUrl)
    })

    // 2. 监听器就绪后，通知主进程可以发送截图了
    window.electron.screenOverlay.notifyReady()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electron?.screenOverlay?.close?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const getSelectionRect = () => {
    const x = Math.min(selection.startX, selection.endX)
    const y = Math.min(selection.startY, selection.endY)
    const width = Math.abs(selection.endX - selection.startX)
    const height = Math.abs(selection.endY - selection.startY)
    return { x, y, width, height }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isLoading || translationResult) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setSelection({
      isSelecting: true,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selection.isSelecting) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setSelection(prev => ({
      ...prev,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top
    }))
  }

  const handleMouseUp = useCallback(async () => {
    if (!selection.isSelecting) return
    setSelection(prev => ({ ...prev, isSelecting: false }))

    const { x, y, width, height } = getSelectionRect()
    if (width < 10 || height < 10) return

    setIsLoading(true)

    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx || !imageRef.current) return

      canvas.width = width
      canvas.height = height

      const img = imageRef.current
      const scaleX = img.naturalWidth / img.clientWidth
      const scaleY = img.naturalHeight / img.clientHeight

      ctx.drawImage(
        img,
        x * scaleX,
        y * scaleY,
        width * scaleX,
        height * scaleY,
        0,
        0,
        width,
        height
      )

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      const res = await window.electron.translate.translateImage(dataUrl)

      if (res && res.success && res.data) {
        setTranslationResult({
          originalText: res.data.originalText,
          translatedText: res.data.translatedText,
          position: { x, y, width, height }
        })
      } else {
        console.error('OCR/Translation failed:', res?.error)
      }
    } catch (error) {
      console.error('OCR/Translation error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [selection.isSelecting, selection.startX, selection.startY, selection.endX, selection.endY])

  const handleClose = () => {
    window.electron?.screenOverlay?.close?.()
  }

  const handleReset = () => {
    setSelection({
      isSelecting: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0
    })
    setTranslationResult(null)
    setIsLoading(false)
  }

  const { x, y, width, height } = getSelectionRect()
  const hasSelection = width > 0 && height > 0

  return (
    <div
      ref={containerRef}
      className='fixed inset-0 w-screen h-screen overflow-hidden cursor-crosshair select-none'
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {screenImage && (
        <img
          ref={imageRef}
          src={screenImage}
          alt='Screen capture'
          className='fixed inset-0 w-full h-full object-cover pointer-events-none'
        />
      )}

      <div className='fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-none' />

      {hasSelection && !translationResult && (
        <>
          <div
            className='fixed bg-transparent pointer-events-none'
            style={{
              top: 0,
              left: 0,
              width: x,
              height: '100vh'
            }}
          />
          <div
            className='fixed bg-transparent pointer-events-none'
            style={{
              top: 0,
              left: x + width,
              width: `calc(100vw - ${x + width}px)`,
              height: '100vh'
            }}
          />
          <div
            className='fixed bg-transparent pointer-events-none'
            style={{
              top: 0,
              left: x,
              width: width,
              height: y
            }}
          />
          <div
            className='fixed bg-transparent pointer-events-none'
            style={{
              top: y + height,
              left: x,
              width: width,
              height: `calc(100vh - ${y + height}px)`
            }}
          />

          <div
            className='fixed border-2 border-white/80 shadow-lg pointer-events-none'
            style={{
              left: x,
              top: y,
              width: width,
              height: height
            }}
          >
            <div className='absolute -top-1 -left-1 w-3 h-3 bg-white rounded-full' />
            <div className='absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full' />
            <div className='absolute -bottom-1 -left-1 w-3 h-3 bg-white rounded-full' />
            <div className='absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-full' />
          </div>
        </>
      )}

      {isLoading && (
        <div className='fixed inset-0 flex items-center justify-center z-50'>
          <div className='bg-white/70 backdrop-blur-2xl rounded-2xl p-8 shadow-xl border border-white/30'>
            <Loader2 className='w-10 h-10 animate-spin text-blue-500 mx-auto mb-4' />
            <p className='text-gray-700 text-lg font-medium'>正在识别和翻译...</p>
          </div>
        </div>
      )}

      {translationResult && (
        <div
          className='fixed z-50 pointer-events-auto'
          style={{
            left: translationResult.position.x,
            top: translationResult.position.y,
            width: translationResult.position.width,
            height: translationResult.position.height
          }}
        >
          {/* 这里是沉浸式卡片的 UI */}
          <div className='absolute inset-0 bg-white/80 dark:bg-[#1e1e1e]/90 backdrop-blur-3xl shadow-xl overflow-hidden transition-all duration-300 rounded overflow-y-auto hidden-scrollbar flex flex-col justify-center items-center border border-black/5 dark:border-white/10 group'>
            {/* 关闭按钮（默认隐藏，鼠标移入卡片时显示在右上角） */}
            <div className='absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10'>
              <button
                onClick={(e) => { e.stopPropagation(); handleReset() }}
                className='p-1.5 rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 hover:text-red-500 transition-colors'
                title='重新框选'
              >
                <X className='w-3 h-3' />
              </button>
            </div>
            {/* 翻译文字展示（尽量铺满原本区域） */}
            <div className='p-2 w-full text-center'>
              <p className='text-gray-900 dark:text-white font-medium text-[15px] leading-relaxed select-text cursor-text'>
                {translationResult.translatedText}
              </p>
              <div className='mt-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                <p className='text-[10px] text-gray-500 dark:text-gray-400 select-text'>
                  {translationResult.originalText}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasSelection && !isLoading && !translationResult && (
        <div className='fixed inset-0 flex items-center justify-center pointer-events-none z-40'>
          <div className='bg-white/60 backdrop-blur-xl rounded-2xl px-8 py-4 shadow-lg border border-white/30'>
            <p className='text-gray-700 text-lg font-medium'>
              拖动鼠标选择要翻译的区域，或按 ESC 退出
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
