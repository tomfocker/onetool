import { useState, useRef, useEffect } from 'react'

type SelectionRect = { x: number; y: number; width: number; height: number }
type PointerPosition = { x: number; y: number }
type ViewportSize = { width: number; height: number }
type InteractionMode = 'create' | 'move' | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function isFiniteBounds(value: unknown): value is SelectionRect {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(candidate[key]))
}

function createSelectionRect(start: PointerPosition, current: PointerPosition): SelectionRect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y)
  }
}

function pointInRect(point: PointerPosition, rect: SelectionRect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function clampDraggedSelectionRect(
  rect: SelectionRect,
  delta: PointerPosition,
  viewport: ViewportSize
): SelectionRect {
  const maxX = Math.max(0, viewport.width - rect.width)
  const maxY = Math.max(0, viewport.height - rect.height)

  return {
    ...rect,
    x: clamp(rect.x + delta.x, 0, maxX),
    y: clamp(rect.y + delta.y, 0, maxY)
  }
}

export function deriveInitialRecorderSelectionRect(search: string): SelectionRect | null {
  const query = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(query)
  const rawInitial = params.get('initial')
  if (!rawInitial) {
    return null
  }

  try {
    const parsed = JSON.parse(rawInitial)
    if (!isFiniteBounds(parsed)) {
      return null
    }

    const dx = Number(params.get('dx') ?? 0)
    const dy = Number(params.get('dy') ?? 0)
    return {
      x: parsed.x - dx,
      y: parsed.y - dy,
      width: parsed.width,
      height: parsed.height
    }
  } catch {
    return null
  }
}

export function useRecorderSelection() {
  const [rect, setRect] = useState<SelectionRect | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const startPos = useRef<PointerPosition | null>(null)
  const interactionMode = useRef<InteractionMode>(null)
  const dragOrigin = useRef<{ pointer: PointerPosition; rect: SelectionRect } | null>(null)

  useEffect(() => {
    const originalBg = document.body.style.backgroundColor
    document.body.style.backgroundColor = 'transparent'
    setRect(deriveInitialRecorderSelectionRect(window.location.search))

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electron.screenRecorder.closeSelection(null)
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
      window.electron.screenRecorder.closeSelection(null)
      return
    }

    const currentPointer = { x: e.clientX, y: e.clientY }
    if (rect && pointInRect(currentPointer, rect)) {
      interactionMode.current = 'move'
      dragOrigin.current = {
        pointer: currentPointer,
        rect
      }
      setIsDragging(true)
      return
    }

    interactionMode.current = 'create'
    setIsDragging(true)
    startPos.current = currentPointer
    setRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
  }

  const onMove = (e: React.MouseEvent) => {
    if (!isDragging) return

    if (interactionMode.current === 'move' && dragOrigin.current) {
      const delta = {
        x: e.clientX - dragOrigin.current.pointer.x,
        y: e.clientY - dragOrigin.current.pointer.y
      }
      setRect(clampDraggedSelectionRect(
        dragOrigin.current.rect,
        delta,
        { width: window.innerWidth, height: window.innerHeight }
      ))
      return
    }

    if (!startPos.current) return
    setRect(createSelectionRect(startPos.current, { x: e.clientX, y: e.clientY }))
  }

  const onEnd = () => {
    if (!isDragging || !rect) {
      setIsDragging(false)
      interactionMode.current = null
      dragOrigin.current = null
      startPos.current = null
      return
    }

    setIsDragging(false)
    interactionMode.current = null
    dragOrigin.current = null
    startPos.current = null
    if (rect.width > 10 && rect.height > 10) {
      // 传递坐标回主进程。由于主进程 closeSelectionWindow 逻辑会加上 senderWindow.x/y，
      // 我们直接传当前相对坐标 rect 过去即可获得绝对屏幕坐标。
      window.electron.screenRecorder.closeSelection(rect)
    } else {
      setRect(null)
      // 如果太小也关闭窗口，但不回传数据
      window.electron.screenRecorder.closeSelection(null)
    }
  }

  return { rect, isDragging, onStart, onMove, onEnd }
}
