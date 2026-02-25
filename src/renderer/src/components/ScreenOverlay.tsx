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

async function mockOCRAndTranslate(imageData: ImageData): Promise<{ originalText: string; translatedText: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        originalText: 'This is a sample text for testing',
        translatedText: '这是测试翻译结果'
      })
    }, 1500)
  })
}

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
    const urlParams = new URLSearchParams(window.location.search)
    const screenData = urlParams.get('screen')
    if (screenData) {
      setScreenImage(decodeURIComponent(screenData))
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electron?.screenOverlay?.close?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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

      const imageData = ctx.getImageData(0, 0, width, height)
      const { originalText, translatedText } = await mockOCRAndTranslate(imageData)

      setTranslationResult({
        originalText,
        translatedText,
        position: { x, y, width, height }
      })
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
          className='fixed z-50'
          style={{
            left: translationResult.position.x,
            top: translationResult.position.y,
            minWidth: Math.max(translationResult.position.width, 280)
          }}
        >
          <div className='bg-white/70 dark:bg-black/60 backdrop-blur-2xl rounded-2xl shadow-xl border border-white/30 dark:border-white/10 overflow-hidden transition-all duration-300 hover:shadow-2xl'>
            <div className='flex items-center justify-between p-4 border-b border-white/20 dark:border-white/10'>
              <h3 className='font-semibold text-gray-800 dark:text-white'>翻译结果</h3>
              <div className='flex gap-2'>
                <button
                  onClick={handleReset}
                  className='p-2 rounded-xl hover:bg-white/40 dark:hover:bg-white/10 transition-all duration-200 text-gray-600 dark:text-gray-300'
                  title='重新选择'
                >
                  <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
                  </svg>
                </button>
                <button
                  onClick={handleClose}
                  className='p-2 rounded-xl hover:bg-red-100/50 dark:hover:bg-red-900/20 transition-all duration-200 text-gray-600 dark:text-gray-300 hover:text-red-500'
                  title='关闭'
                >
                  <X className='w-4 h-4' />
                </button>
              </div>
            </div>

            <div className='p-4 space-y-4'>
              <div>
                <p className='text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider'>原文</p>
                <p className='text-gray-800 dark:text-white text-sm leading-relaxed'>
                  {translationResult.originalText}
                </p>
              </div>

              <div className='h-px bg-white/20 dark:bg-white/10' />

              <div>
                <p className='text-xs text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wider'>译文</p>
                <p className='text-gray-900 dark:text-white font-medium text-base leading-relaxed'>
                  {translationResult.translatedText}
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
