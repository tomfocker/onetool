import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toAbsoluteScreenPosition } from '../../../shared/colorPicker'

interface OverlayColor {
  hex: string
  r: number
  g: number
  b: number
}

const DEFAULT_COLOR: OverlayColor = { hex: '#000000', r: 0, g: 0, b: 0 }

function readColorAtPoint(canvas: HTMLCanvasElement, x: number, y: number): OverlayColor | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return null
  }

  const pixel = ctx.getImageData(x, y, 1, 1).data
  const r = pixel[0]
  const g = pixel[1]
  const b = pixel[2]

  return {
    hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
    r,
    g,
    b
  }
}

export const ColorPickerOverlay: React.FC = () => {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [currentColor, setCurrentColor] = useState<OverlayColor>(DEFAULT_COLOR)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const displayBounds = useMemo(() => {
    const hash = window.location.hash
    const queryString = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
    const params = new URLSearchParams(queryString)

    return {
      x: Number(params.get('dx') ?? 0),
      y: Number(params.get('dy') ?? 0)
    }
  }, [])

  useEffect(() => {
    if (!window.electron?.colorPicker) {
      return
    }

    const unsubscribe = window.electron.colorPicker.onScreenshot((dataUrl) => {
      setScreenshot(dataUrl)
    })

    window.electron.colorPicker.notifyReady()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.electron.colorPicker.cancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const updateColorFromClientPoint = (clientX: number, clientY: number): OverlayColor | null => {
    if (!imageRef.current || !canvasRef.current || !screenshot) {
      return null
    }

    const img = imageRef.current
    const rect = img.getBoundingClientRect()
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    const pixelX = Math.floor((clientX - rect.left) * scaleX)
    const pixelY = Math.floor((clientY - rect.top) * scaleY)
    const color = readColorAtPoint(canvasRef.current, pixelX, pixelY)

    if (color) {
      setCurrentColor((prev) => (prev.hex === color.hex ? prev : color))
    }

    return color
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!screenshot) {
      return
    }

    setMousePos({ x: event.clientX, y: event.clientY })
    updateColorFromClientPoint(event.clientX, event.clientY)
  }

  const handleMouseDown = (event: React.MouseEvent) => {
    if (!screenshot || !window.electron?.colorPicker) {
      return
    }

    const color = updateColorFromClientPoint(event.clientX, event.clientY) ?? currentColor
    const absolutePoint = toAbsoluteScreenPosition(
      { x: event.clientX, y: event.clientY },
      { x: displayBounds.x, y: displayBounds.y, width: 0, height: 0 }
    )

    window.electron.colorPicker.confirm({
      hex: color.hex,
      rgb: `rgb(${color.r}, ${color.g}, ${color.b})`,
      r: color.r,
      g: color.g,
      b: color.b,
      x: absolutePoint.x,
      y: absolutePoint.y
    })
  }

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget
    if (!canvasRef.current) {
      return
    }

    const canvas = canvasRef.current
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight

    const ctx = canvas.getContext('2d')
    ctx?.drawImage(img, 0, 0)
  }

  return (
    <div
      className={`fixed inset-0 overflow-hidden select-none bg-black/20 ${screenshot ? 'cursor-none' : 'cursor-wait'}`}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
    >
      {!screenshot ? (
        <div className="flex h-full items-center justify-center text-white">
          <div className="animate-pulse rounded-2xl border border-white/20 bg-black/60 px-6 py-4 backdrop-blur-xl">
            正在准备取色层... (按 ESC 退出)
          </div>
        </div>
      ) : (
        <>
          <img
            ref={imageRef}
            src={screenshot}
            className="pointer-events-none h-full w-full object-contain"
            alt="screenshot"
            onLoad={onImageLoad}
          />

          <canvas ref={canvasRef} className="hidden" />

          <div
            className="pointer-events-none absolute"
            style={{
              left: mousePos.x + 20,
              top: mousePos.y + 20,
              zIndex: 100
            }}
          >
            <div className="flex flex-col items-center gap-1 rounded-lg border border-white/20 bg-black/80 p-2 shadow-2xl backdrop-blur-md">
              <div
                className="h-8 w-16 rounded border border-white/40"
                style={{ backgroundColor: currentColor.hex }}
              />
              <span className="font-mono text-xs font-bold text-white">{currentColor.hex.toUpperCase()}</span>
              <div className="flex gap-2 font-mono text-[10px] text-white/60">
                <span>R:{currentColor.r}</span>
                <span>G:{currentColor.g}</span>
                <span>B:{currentColor.b}</span>
              </div>
            </div>
          </div>

          <div
            className="pointer-events-none absolute overflow-hidden rounded-full border-4 border-white shadow-2xl"
            style={{
              left: mousePos.x - 60,
              top: mousePos.y - 60,
              width: 120,
              height: 120,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.2)'
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute h-[1px] w-full bg-white/40" />
              <div className="absolute h-full w-[1px] bg-white/40" />
              <div
                className="z-10 h-3 w-3 border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                style={{ backgroundColor: currentColor.hex }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
