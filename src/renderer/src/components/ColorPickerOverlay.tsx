import React, { useState, useEffect, useRef, useCallback } from 'react'

export const ColorPickerOverlay: React.FC = () => {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [currentColor, setCurrentColor] = useState({ hex: '#000000', r: 0, g: 0, b: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!window.electron?.colorPicker) return

    const unsubscribe = window.electron.colorPicker.onScreenshot((dataUrl) => {
      setScreenshot(dataUrl)
    })

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electron.colorPicker.cancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      unsubscribe()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!imageRef.current || !canvasRef.current || !screenshot) return

    const img = imageRef.current
    const canvas = canvasRef.current
    const rect = img.getBoundingClientRect()
    
    // 计算坐标映射比例（逻辑像素 -> 原始截图像素）
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    
    const x = Math.floor((e.clientX - rect.left) * scaleX)
    const y = Math.floor((e.clientY - rect.top) * scaleY)
    
    setMousePos({ x: e.clientX, y: e.clientY })

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    try {
      // 检查边界
      if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
        const pixel = ctx.getImageData(x, y, 1, 1).data
        const r = pixel[0]
        const g = pixel[1]
        const b = pixel[2]
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        
        setCurrentColor(prev => {
          if (prev.hex === hex) return prev
          return { hex, r, g, b }
        })
      }
    } catch (err) {
      console.error('Pick color error:', err)
    }
  }, [screenshot])

  const handleMouseDown = useCallback(() => {
    if (screenshot && window.electron?.colorPicker) {
      window.electron.colorPicker.confirm({
        hex: currentColor.hex,
        rgb: `rgb(${currentColor.r}, ${currentColor.g}, ${currentColor.b})`,
        r: currentColor.r,
        g: currentColor.g,
        b: currentColor.b,
        x: mousePos.x,
        y: mousePos.y
      })
    }
  }, [screenshot, currentColor, mousePos])

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (canvasRef.current) {
      const canvas = canvasRef.current
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0)
    }
  }, [])

  // 即使没有截图，也显示一个透明层用于捕获 ESC
  return (
    <div 
      className={`fixed inset-0 overflow-hidden select-none bg-black/20 ${screenshot ? 'cursor-none' : 'cursor-wait'}`}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
    >
      {!screenshot ? (
        <div className="flex flex-col items-center justify-center h-full text-white">
          <div className="bg-black/60 px-6 py-4 rounded-2xl border border-white/20 backdrop-blur-xl animate-pulse">
             正在准备取色层... (按 ESC 退出)
          </div>
        </div>
      ) : (
        <>
          <img
            ref={imageRef}
            src={screenshot}
            className="w-full h-full object-contain pointer-events-none"
            alt="screenshot"
            onLoad={onImageLoad}
          />
          
          <canvas ref={canvasRef} className="hidden" />

          {/* 放大镜 UI */}
          <div 
            className="absolute pointer-events-none"
            style={{
              left: mousePos.x + 20,
              top: mousePos.y + 20,
              zIndex: 100
            }}
          >
            <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/20 p-2 flex flex-col items-center gap-1 shadow-2xl">
              <div 
                className="w-16 h-8 rounded border border-white/40"
                style={{ backgroundColor: currentColor.hex }}
              />
              <span className="text-white font-mono text-xs font-bold">{currentColor.hex.toUpperCase()}</span>
              <div className="flex gap-2 text-[10px] font-mono text-white/60">
                <span>R:{currentColor.r}</span>
                <span>G:{currentColor.g}</span>
                <span>B:{currentColor.b}</span>
              </div>
            </div>
          </div>

          <div
            className="absolute rounded-full border-4 border-white shadow-2xl overflow-hidden pointer-events-none"
            style={{
              left: mousePos.x - 60,
              top: mousePos.y - 60,
              width: 120,
              height: 120,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.2)`
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="absolute w-full h-[1px] bg-white/40" />
                <div className="absolute h-full w-[1px] bg-white/40" />
                <div 
                    className="w-3 h-3 border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] z-10"
                    style={{ backgroundColor: currentColor.hex }}
                />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
