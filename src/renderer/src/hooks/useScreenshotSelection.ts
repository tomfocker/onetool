import { useState, useRef, useEffect } from 'react'

export function useScreenshotSelection() {
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [restrictBounds, setRestrictBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isEnhanced, setIsEnhanced] = useState(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1])
    const restrictStr = params.get('restrict')
    const dx = parseInt(params.get('dx') || '0')
    const dy = parseInt(params.get('dy') || '0')

    const enhancedStr = params.get('enhanced')
    if (enhancedStr === 'true') {
      setIsEnhanced(true)
    }

    if (restrictStr) {
      try {
        const bounds = JSON.parse(decodeURIComponent(restrictStr))
        setRestrictBounds({
          x: bounds.x - dx,
          y: bounds.y - dy,
          width: bounds.width,
          height: bounds.height
        })
      } catch (e) {
        console.error('Failed to parse restrict bounds', e)
      }
    }
  }, [])

  useEffect(() => {
    const originalBg = document.body.style.backgroundColor
    document.body.style.backgroundColor = 'transparent'

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        (window.electron as any).ipcRenderer.invoke('screenshot-selection-close', null)
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
      (window.electron as any).ipcRenderer.invoke('screenshot-selection-close', null)
      return
    }

    let startX = e.clientX
    let startY = e.clientY

    if (restrictBounds) {
      startX = Math.max(restrictBounds.x, Math.min(restrictBounds.x + restrictBounds.width, startX))
      startY = Math.max(restrictBounds.y, Math.min(restrictBounds.y + restrictBounds.height, startY))
    }

    setIsDragging(true)
    startPos.current = { x: startX, y: startY }
    setRect({ x: startX, y: startY, width: 0, height: 0 })
  }

  const onMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos.current) return
    const currentX = e.clientX
    const currentY = e.clientY
    const startX = startPos.current.x
    const startY = startPos.current.y

    let targetX = Math.min(startX, currentX)
    let targetY = Math.min(startY, currentY)
    let targetW = Math.abs(currentX - startX)
    let targetH = Math.abs(currentY - startY)

    // 限制在 restrictBounds 内
    if (restrictBounds) {
      const minX = restrictBounds.x
      const minY = restrictBounds.y
      const maxX = restrictBounds.x + restrictBounds.width
      const maxY = restrictBounds.y + restrictBounds.height

      const clampedStartX = Math.max(minX, Math.min(maxX, startX))
      const clampedStartY = Math.max(minY, Math.min(maxY, startY))
      const clampedCurrentX = Math.max(minX, Math.min(maxX, currentX))
      const clampedCurrentY = Math.max(minY, Math.min(maxY, currentY))

      targetX = Math.min(clampedStartX, clampedCurrentX)
      targetY = Math.min(clampedStartY, clampedCurrentY)
      targetW = Math.abs(clampedCurrentX - clampedStartX)
      targetH = Math.abs(clampedCurrentY - clampedStartY)
    }

    setRect({
      x: targetX,
      y: targetY,
      width: targetW,
      height: targetH
    })
  }

  const onEnd = () => {
    if (!isDragging || !rect) {
      setIsDragging(false)
      return
    }
    setIsDragging(false)
    if (rect.width > 5 && rect.height > 5) {
      (window.electron as any).ipcRenderer.invoke('screenshot-selection-close', rect)
    } else {
      setRect(null)
    }
  }

  return { rect, isDragging, onStart, onMove, onEnd, restrictBounds, isEnhanced }
}
