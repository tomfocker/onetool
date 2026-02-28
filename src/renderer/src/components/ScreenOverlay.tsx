import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Loader2 } from 'lucide-react'

interface SelectionState {
  isSelecting: boolean
  startX: number
  startY: number
  endX: number
  endY: number
}

interface TranslatedLine {
  index: number
  text: string
  translatedText: string
}

export const ScreenOverlay: React.FC = () => {
  const [screenImage, setScreenImage] = useState<string | null>(null)
  const [selection, setSelection] = useState<SelectionState>({
    isSelecting: false, startX: 0, startY: 0, endX: 0, endY: 0
  })
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [translationResults, setTranslationResults] = useState<TranslatedLine[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!window.electron?.screenOverlay) return
    const unsubscribe = window.electron.screenOverlay.onScreenshot((dataUrl) => {
      setScreenImage(dataUrl)
    })
    window.electron.screenOverlay.notifyReady()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.electron?.screenOverlay?.close?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => { unsubscribe(); window.removeEventListener('keydown', handleKeyDown) }
  }, [])

  const getSelectionRect = () => {
    const x = Math.min(selection.startX, selection.endX)
    const y = Math.min(selection.startY, selection.endY)
    const width = Math.abs(selection.endX - selection.startX)
    const height = Math.abs(selection.endY - selection.startY)
    return { x, y, width, height }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isLoading || translationResults) return
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
    if (width < 5 || height < 5) return

    setSelectionRect({ x, y, width, height })
    setIsLoading(true)
    setError(null)

    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx || !imageRef.current) return
      const img = imageRef.current
      const scaleX = img.naturalWidth / img.clientWidth
      const scaleY = img.naturalHeight / img.clientHeight
      canvas.width = width * scaleX
      canvas.height = height * scaleY
      ctx.drawImage(img, x * scaleX, y * scaleY, width * scaleX, height * scaleY, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL('image/png')
      const res = await window.electron.translate.translateImage(dataUrl)

      if (res?.success && res.data) {
        setTranslationResults(res.data)
      } else {
        setError(res?.error || '识别失败')
      }
    } catch (error) {
      setError((error as Error).message || '网络请求异常')
    } finally {
      setIsLoading(false)
    }
  }, [selection.isSelecting, selection.startX, selection.startY, selection.endX, selection.endY])

  const handleClose = () => window.electron?.screenOverlay?.close?.()

  const handleReset = () => {
    setSelection({ isSelecting: false, startX: 0, startY: 0, endX: 0, endY: 0 })
    setSelectionRect(null)
    setTranslationResults(null)
    setError(null)
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
        <img ref={imageRef} src={screenImage} alt='' className='fixed inset-0 w-full h-full object-cover pointer-events-none' />
      )}

      <div className='fixed inset-0 bg-black/30 pointer-events-none' />

      {hasSelection && !translationResults && (
        <div className='fixed border-2 border-white/80 shadow-lg pointer-events-none' style={{ left: x, top: y, width, height }}>
          <div className='absolute -top-1 -left-1 w-3 h-3 bg-white rounded-full' />
          <div className='absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full' />
          <div className='absolute -bottom-1 -left-1 w-3 h-3 bg-white rounded-full' />
          <div className='absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-full' />
        </div>
      )}

      {error && (
        <div className='fixed inset-0 flex items-center justify-center z-50 p-4'>
          <div className='bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl rounded-2xl p-6 shadow-2xl border border-red-500/20 max-w-sm w-full text-center'>
            <div className='w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4'>
              <X className='w-6 h-6 text-red-500' />
            </div>
            <h3 className='text-lg font-bold mb-2'>翻译出现错误</h3>
            <p className='text-sm text-muted-foreground mb-6 line-clamp-3'>"{error}"</p>
            <div className='flex gap-3'>
              <button onClick={handleReset} className='flex-1 h-11 bg-secondary hover:bg-secondary/80 rounded-xl text-sm font-bold transition-all'>重试</button>
              <button onClick={handleClose} className='flex-1 h-11 bg-red-500 text-white rounded-xl text-sm font-bold transition-all'>退出</button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className='fixed inset-0 flex items-center justify-center z-50'>
          <div className='bg-white/80 dark:bg-zinc-800/80 backdrop-blur-2xl rounded-2xl p-8 shadow-xl border border-white/20'>
            <Loader2 className='w-10 h-10 animate-spin text-primary mx-auto mb-4' />
            <p className='text-foreground text-lg font-medium'>正在识别和翻译...</p>
          </div>
        </div>
      )}

      {/* 翻译结果：在选区内按行均匀分布 */}
      {translationResults && selectionRect && (
        <div className='fixed pointer-events-none' style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.width, height: selectionRect.height }}>
          {/* 选区背景层 */}
          <div className='absolute inset-0 bg-white/85 dark:bg-black/75 backdrop-blur-sm rounded' />

          {translationResults.map((line, idx) => {
            const total = translationResults.length
            const lineHeight = selectionRect.height / total
            const lineTop = idx * lineHeight
            return (
              <div
                key={idx}
                className='absolute w-full group pointer-events-auto'
                style={{ top: lineTop, height: lineHeight }}
              >
                <div className='w-full h-full flex items-center justify-center px-2 border-b border-black/5 dark:border-white/5 last:border-0'>
                  <p className='text-[13px] text-gray-900 dark:text-white font-medium text-center leading-snug line-clamp-2' title={line.translatedText}>
                    {line.translatedText}
                  </p>
                  {/* 悬浮显示原文 */}
                  <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50'>
                    <div className='bg-zinc-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap border border-white/10'>
                      {line.text}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* 关闭按钮 */}
          <button
            className='absolute -top-4 -right-4 w-8 h-8 rounded-full bg-zinc-900/60 backdrop-blur text-white flex items-center justify-center shadow pointer-events-auto hover:bg-zinc-900 transition-colors'
            onClick={handleReset}
          >
            <X className='w-4 h-4' />
          </button>
        </div>
      )}

      {!selection.isSelecting && !isLoading && !translationResults && (
        <div className='fixed inset-0 flex items-center justify-center pointer-events-none z-40'>
          <div className='bg-white/60 dark:bg-black/40 backdrop-blur-xl rounded-2xl px-8 py-4 shadow-lg border border-white/30 dark:border-white/10'>
            <p className='text-foreground text-lg font-medium'>选择翻译区域（ESC 退出）</p>
          </div>
        </div>
      )}
    </div>
  )
}
