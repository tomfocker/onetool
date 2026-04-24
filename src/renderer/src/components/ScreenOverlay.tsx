import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Loader2, Copy, Check } from 'lucide-react'
import type { ScreenOverlayLineResult, ScreenOverlayMode, ScreenOverlaySessionStartPayload } from '../../../shared/llm'
import { buildOcrExtractedText, getOcrCanvasMetrics } from '../../../shared/screenOverlay'

interface SelectionState {
  isSelecting: boolean
  startX: number
  startY: number
  endX: number
  endY: number
}

type OverlayScale = {
  x: number
  y: number
}

function resolveOverlayMode(): ScreenOverlayMode {
  const query = window.location.hash.split('?')[1] ?? ''
  const mode = new URLSearchParams(query).get('mode')
  return mode === 'ocr' ? 'ocr' : 'translate'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export const ScreenOverlay: React.FC = () => {
  const [mode, setMode] = useState<ScreenOverlayMode>(() => resolveOverlayMode())
  const [screenImage, setScreenImage] = useState<string | null>(null)
  const [selection, setSelection] = useState<SelectionState>({
    isSelecting: false, startX: 0, startY: 0, endX: 0, endY: 0
  })
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [overlayScale, setOverlayScale] = useState<OverlayScale>({ x: 1, y: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overlayResults, setOverlayResults] = useState<ScreenOverlayLineResult[] | null>(null)
  const [ocrExtractedText, setOcrExtractedText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const resetOverlayState = useCallback((nextMode?: ScreenOverlayMode) => {
    if (nextMode) {
      setMode(nextMode)
    }
    setSelection({ isSelecting: false, startX: 0, startY: 0, endX: 0, endY: 0 })
    setSelectionRect(null)
    setOverlayResults(null)
    setOcrExtractedText(null)
    setError(null)
    setIsLoading(false)
    setCopied(false)
    setOverlayScale({ x: 1, y: 1 })
  }, [])

  useEffect(() => {
    if (!window.electron?.screenOverlay) return
    const unsubscribe = window.electron.screenOverlay.onScreenshot((dataUrl) => {
      setScreenImage(dataUrl)
    })
    const unsubscribeSessionStart = window.electron.screenOverlay.onSessionStart((payload: ScreenOverlaySessionStartPayload) => {
      resetOverlayState(payload.mode)
    })
    window.electron.screenOverlay.notifyReady()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsubscribe()
      unsubscribeSessionStart()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [resetOverlayState])

  const getSelectionRect = () => {
    const x = Math.min(selection.startX, selection.endX)
    const y = Math.min(selection.startY, selection.endY)
    const width = Math.abs(selection.endX - selection.startX)
    const height = Math.abs(selection.endY - selection.startY)
    return { x, y, width, height }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      handleClose()
      return
    }

    if (isLoading || overlayResults || ocrExtractedText) return
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
      const metrics = getOcrCanvasMetrics({
        selectionWidth: width,
        selectionHeight: height,
        naturalScaleX: scaleX,
        naturalScaleY: scaleY
      })
      setOverlayScale({ x: metrics.resultScaleX, y: metrics.resultScaleY })
      canvas.width = metrics.canvasWidth
      canvas.height = metrics.canvasHeight
      ctx.drawImage(img, x * scaleX, y * scaleY, width * scaleX, height * scaleY, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL('image/png')
      const res = await window.electron.translate.translateImage(dataUrl, mode)

      if (res?.success && res.data) {
        if (mode === 'ocr') {
          setOcrExtractedText(buildOcrExtractedText(res.data))
        } else {
          setOverlayResults(res.data)
        }
      } else {
        setError(res?.error || '识别失败')
      }
    } catch (caughtError) {
      setError((caughtError as Error).message || '网络请求异常')
    } finally {
      setIsLoading(false)
    }
  }, [mode, selection.endX, selection.endY, selection.isSelecting, selection.startX, selection.startY])

  const handleClose = () => {
    resetOverlayState(mode)
    window.electron?.screenOverlay?.close?.()
  }

  const handleCopy = async () => {
    if (!ocrExtractedText) return
    await navigator.clipboard.writeText(ocrExtractedText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const handleReset = () => resetOverlayState(mode)

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
      onContextMenu={(e) => {
        e.preventDefault()
        handleClose()
      }}
    >
      {screenImage && (
        <img ref={imageRef} src={screenImage} alt='' className='fixed inset-0 w-full h-full object-cover pointer-events-none' />
      )}

      <div className='fixed inset-0 bg-black/30 pointer-events-none' />

      {hasSelection && !overlayResults && !ocrExtractedText && (
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
            <h3 className='text-lg font-bold mb-2'>{mode === 'translate' ? '翻译出现错误' : '文字提取出现错误'}</h3>
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
            <p className='text-foreground text-lg font-medium'>{mode === 'translate' ? '正在识别和翻译...' : '正在识别文字...'}</p>
          </div>
        </div>
      )}

      {overlayResults && selectionRect && (
        <div className='fixed pointer-events-none' style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.width, height: selectionRect.height }}>
          {overlayResults.map((line, idx) => {
            const rawLeft = line.x / overlayScale.x
            const rawTop = line.y / overlayScale.y
            const rawWidth = line.width / overlayScale.x
            const rawHeight = line.height / overlayScale.y
            const displayText = line.translatedText || line.text
            const boxWidth = clamp(Math.max(rawWidth, displayText.length > 16 ? 180 : 120), 80, Math.max(selectionRect.width - rawLeft, 80))
            const boxHeight = Math.max(rawHeight, displayText.length > 30 ? 52 : 32)
            const fontSize = clamp(rawHeight * 0.58, 12, 28)
            return (
              <div
                key={idx}
                className='absolute group pointer-events-auto'
                style={{
                  left: clamp(rawLeft, 0, Math.max(selectionRect.width - boxWidth, 0)),
                  top: clamp(rawTop, 0, Math.max(selectionRect.height - boxHeight, 0)),
                  width: boxWidth,
                  minHeight: boxHeight
                }}
              >
                <div className='rounded-xl bg-white/88 dark:bg-black/72 backdrop-blur-md shadow-lg border border-black/5 dark:border-white/10 px-3 py-2'>
                  <p
                    className='text-gray-900 dark:text-white font-medium leading-tight whitespace-pre-wrap break-words'
                    title={displayText}
                    style={{ fontSize }}
                  >
                    {displayText}
                  </p>
                </div>
                <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50'>
                  <div className='bg-zinc-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap border border-white/10'>
                    {line.text}
                  </div>
                </div>
              </div>
            )
          })}

          <button
            className='absolute -top-4 -right-4 w-8 h-8 rounded-full bg-zinc-900/60 backdrop-blur text-white flex items-center justify-center shadow pointer-events-auto hover:bg-zinc-900 transition-colors'
            onClick={handleReset}
          >
            <X className='w-4 h-4' />
          </button>
        </div>
      )}

      {ocrExtractedText && (
        <div className='fixed inset-0 flex items-center justify-center z-50 p-4'>
          <div className='w-full max-w-2xl rounded-3xl border border-white/20 bg-white/88 p-6 shadow-2xl backdrop-blur-2xl dark:bg-zinc-950/88 dark:border-white/10'>
            <div className='flex items-start justify-between gap-4 mb-4'>
              <div>
                <p className='text-xs uppercase tracking-[0.2em] text-blue-500'>OCR</p>
                <h3 className='text-xl font-bold mt-1'>提取到的文字</h3>
                <p className='text-sm text-muted-foreground mt-1'>当前模式不会调用 LLM，你可以直接复制结果。</p>
              </div>
              <button
                className='w-9 h-9 rounded-full bg-zinc-900/70 text-white flex items-center justify-center hover:bg-zinc-900 transition-colors'
                onClick={handleReset}
              >
                <X className='w-4 h-4' />
              </button>
            </div>

            <div className='rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 max-h-[50vh] overflow-auto'>
              <pre className='whitespace-pre-wrap break-words text-sm leading-7 text-zinc-900 dark:text-zinc-100 font-sans'>
                {ocrExtractedText}
              </pre>
            </div>

            <div className='flex gap-3 mt-5'>
              <button
                onClick={handleCopy}
                className='flex-1 h-12 rounded-2xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2'
              >
                {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                {copied ? '已复制' : '复制文字'}
              </button>
              <button
                onClick={handleReset}
                className='flex-1 h-12 rounded-2xl bg-secondary hover:bg-secondary/80 font-semibold transition-colors'
              >
                重新框选
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
