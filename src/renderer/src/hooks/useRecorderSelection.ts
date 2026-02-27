import { useState, useRef, useEffect } from 'react'

export function useRecorderSelection() {
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const originalBg = document.body.style.backgroundColor
    document.body.style.backgroundColor = 'transparent'
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        (window.electron as any).ipcRenderer.invoke('recorder-selection-close', null)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => {
      window.removeEventListener('keydown', handleEsc)
      document.body.style.backgroundColor = originalBg
    }
  }, [])

  const onStart = (e: React.MouseEvent) => {
    if (e.button === 2) {
      (window.electron as any).ipcRenderer.invoke('recorder-selection-close', null)
      return
    }
    setIsDragging(true)
    startPos.current = { x: e.clientX, y: e.clientY }
    setRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
  }

  const onMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos.current) return
    const currentX = e.clientX
    const currentY = e.clientY
    const startX = startPos.current.x
    const startY = startPos.current.y
    
    setRect({
      x: Math.min(startX, currentX),
      y: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY)
    })
  }

  const onEnd = () => {
    if (!isDragging || !rect) {
      setIsDragging(false)
      return
    }
    setIsDragging(false)
    if (rect.width > 10 && rect.height > 10) {
      (window.electron as any).ipcRenderer.invoke('recorder-selection-close', rect)
    } else {
      setRect(null)
    }
  }

  return { rect, isDragging, onStart, onMove, onEnd }
}
