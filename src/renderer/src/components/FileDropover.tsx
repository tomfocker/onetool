import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Trash2, File, Folder } from 'lucide-react'
import { buildStoredFiles } from '../../../shared/fileDropover'
import type { RealtimeStats } from '../../../shared/types'
import floatBallIcon from '@/assets/floatball-icon.png'

interface StoredFile {
  id: string
  path: string
  name: string
  isDirectory: boolean
}

export const FileDropover: React.FC = () => {
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isPanelRendering, setIsPanelRendering] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [autoRemoveAfterDrag, setAutoRemoveAfterDrag] = useState(false)
  const [dockState, setDockState] = useState<'free' | 'docked' | 'peek' | 'dragging'>('docked')
  const [dockSide, setDockSide] = useState<'docked-left' | 'docked-right'>('docked-right')
  const [realtimeStats, setRealtimeStats] = useState<RealtimeStats | null>(null)
  const [windowSize, setWindowSize] = useState({ width: 96, height: 96 })

  useEffect(() => {
    const savedAutoRemove = localStorage.getItem('floatball-autoRemoveAfterDrag')
    if (savedAutoRemove !== null) {
      setAutoRemoveAfterDrag(savedAutoRemove === 'true')
    }
  }, [])

  const floatBallRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragDepthRef = useRef(0)
  const pendingDragPositionRef = useRef<{ screenX: number; screenY: number } | null>(null)
  const dragFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const electron = window.electron as any
    if (electron?.floatBall) {
      electron.floatBall.resize(windowSize.width, windowSize.height)
    }
  }, [windowSize])

  const fetchRealtimeStats = useCallback(async () => {
    const electron = window.electron as typeof window.electron | undefined
    if (!electron?.systemConfig?.getRealtimeStats || document.visibilityState === 'hidden') {
      return
    }

    const result = await electron.systemConfig.getRealtimeStats()
    if (result.success && result.data) {
      setRealtimeStats(result.data as RealtimeStats)
    }
  }, [])

  useEffect(() => {
    fetchRealtimeStats()
    const timer = window.setInterval(fetchRealtimeStats, 5000)
    return () => window.clearInterval(timer)
  }, [fetchRealtimeStats])

  useEffect(() => {
    let timerWindow: NodeJS.Timeout
    let timerRender: NodeJS.Timeout

    if (isExpanded) {
      setWindowSize({ width: 320, height: 400 })
      timerRender = setTimeout(() => {
        setIsPanelRendering(true)
      }, 50)
    } else {
      setIsPanelRendering(false)
      timerWindow = setTimeout(() => {
        setWindowSize({ width: 96, height: 96 })
      }, 300)
    }

    return () => {
      if (timerWindow) clearTimeout(timerWindow)
      if (timerRender) clearTimeout(timerRender)
    }
  }, [isExpanded])

  const openExpandedPanel = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsExpanded(true)
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.drag-handle') || e.button !== 0) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    isDraggingRef.current = true
    setDockState('dragging')
    e.currentTarget.setPointerCapture(e.pointerId)

    const electron = window.electron as any
    if (electron?.floatBall?.beginDrag) {
      const rect = e.currentTarget.getBoundingClientRect()
      electron.floatBall.beginDrag({ pointerOffsetX: e.clientX - rect.left, pointerOffsetY: e.clientY - rect.top })
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return

    pendingDragPositionRef.current = { screenX: e.screenX, screenY: e.screenY }
    if (dragFrameRef.current !== null) {
      return
    }

    const electron = window.electron as any
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null
      const nextPosition = pendingDragPositionRef.current
      pendingDragPositionRef.current = null
      if (nextPosition && electron?.floatBall?.dragTo) {
        electron.floatBall.dragTo(nextPosition)
      }
    })
  }

  const handlePointerUp = async (e: React.PointerEvent) => {
    isDraggingRef.current = false
    let nextDockState: 'free' | 'docked' = 'free'
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    pendingDragPositionRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch (_err) {}

    try {
      const electron = window.electron as any
      if (electron?.floatBall?.endDrag) {
        const result = await electron.floatBall.endDrag()
        nextDockState = result?.data?.dockState === 'docked' ? 'docked' : 'free'
        if (result?.data?.dockSide === 'left') {
          setDockSide('docked-left')
        } else if (result?.data?.dockSide === 'right') {
          setDockSide('docked-right')
        }
      }
    } catch (err) {
      void err
    } finally {
      setDockState(nextDockState)
    }
  }

  const handleMouseEnter = () => {
    if (isDraggingRef.current || isExpanded || dockState !== 'docked') {
      return
    }

    setDockState('peek')
    const electron = window.electron as any
    if (electron?.floatBall?.peek) {
      void electron.floatBall.peek()
    }
  }

  const handleMouseLeave = () => {
    if (isDraggingRef.current) {
      return
    }

    if (!isDraggingRef.current && !isExpanded && dockState === 'peek') {
      const electron = window.electron as any
      if (electron?.floatBall?.restoreDock) {
        void electron.floatBall.restoreDock()
      }
    }

    if (isExpanded) {
      setIsExpanded(false)
      setDockState('docked')
      return
    }

    setDockState('docked')
  }

  useEffect(() => {
    return () => {
      isDraggingRef.current = false
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current)
        dragFrameRef.current = null
      }
      pendingDragPositionRef.current = null
    }
  }, [])

  const commitDroppedFiles = useCallback((files: File[]) => {
    const electron = window.electron as any
    const newFiles = buildStoredFiles(
      files,
      (file) => {
        if (electron?.webUtils?.getPathForFile) {
          return electron.webUtils.getPathForFile(file as File)
        }
        return (file as any).path
      }
    ) as StoredFile[]

    if (newFiles.length === 0) {
      return
    }

    setStoredFiles((prev) => {
      const existingPaths = new Set(prev.map((file) => file.path))
      const uniqueNewFiles = newFiles.filter((file) => !existingPaths.has(file.path))
      return uniqueNewFiles.length > 0 ? [...prev, ...uniqueNewFiles] : prev
    })
  }, [])

  const hasFilePayload = (types: Iterable<string> | undefined) => {
    return Array.from(types ?? []).includes('Files')
  }

  useEffect(() => {
    const handleWindowDragEnter = (event: DragEvent) => {
      if (!hasFilePayload(event.dataTransfer?.types)) {
        return
      }

      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      dragDepthRef.current += 1
      setIsDraggingOver(true)
    }

    const handleWindowDragOver = (event: DragEvent) => {
      if (!hasFilePayload(event.dataTransfer?.types)) {
        return
      }

      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      setIsDraggingOver(true)
    }

    const handleWindowDragLeave = (event: DragEvent) => {
      if (!hasFilePayload(event.dataTransfer?.types)) {
        return
      }

      event.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDraggingOver(false)
      }
    }

    const handleWindowDrop = (event: DragEvent) => {
      if (!hasFilePayload(event.dataTransfer?.types)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current = 0
      setIsDraggingOver(false)
      commitDroppedFiles(Array.from(event.dataTransfer?.files ?? []))
    }

    window.addEventListener('dragenter', handleWindowDragEnter, true)
    window.addEventListener('dragover', handleWindowDragOver, true)
    window.addEventListener('dragleave', handleWindowDragLeave, true)
    window.addEventListener('drop', handleWindowDrop, true)

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter, true)
      window.removeEventListener('dragover', handleWindowDragOver, true)
      window.removeEventListener('dragleave', handleWindowDragLeave, true)
      window.removeEventListener('drop', handleWindowDrop, true)
    }
  }, [commitDroppedFiles])

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer.types)) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setIsDraggingOver(true)
  }

  const handleDragLeave = () => {
    dragDepthRef.current = 0
    setIsDraggingOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer.types)) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setIsDraggingOver(false)
    commitDroppedFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileDragStart = (e: React.DragEvent, file: StoredFile) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', file.path)

    const electron = window.electron as any
    if (electron?.floatBall) {
      electron.floatBall.startDrag(file.path)
    }

    if (autoRemoveAfterDrag) {
      setTimeout(() => {
        setStoredFiles((prev) => prev.filter((f) => f.id !== file.id))
      }, 100)
    }
  }

  const removeFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    setStoredFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setStoredFiles([])
  }

  const handleCloseFloatBall = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const electron = window.electron as any
    if (electron?.floatBall?.setVisible) {
      electron.floatBall.setVisible(false)
    }
  }

  const cpuLoad = Math.max(0, Math.min(100, Math.round(realtimeStats?.cpuLoad ?? 0)))
  const memoryUsage = Math.max(0, Math.min(100, Math.round(realtimeStats?.memoryUsage ?? 0)))
  const isDragging = dockState === 'dragging'
  const dockEdgeOffsetClass = isDragging
    ? ''
    : dockSide === 'docked-left'
      ? '-translate-x-[8px]'
      : 'translate-x-[8px]'
  const dragMotionClass = isDragging
    ? 'transition-none duration-0'
    : 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
  const dragTransformClass = isDragging
    ? ''
    : 'group-hover/trigger:scale-[1.04] group-hover/trigger:-translate-y-[1px] group-hover/trigger:shadow-[inset_0_1px_1px_rgba(255,255,255,0.98),0_4px_10px_rgba(148,163,184,0.14)]'
  const statusHue = cpuLoad >= 85 ? '244, 63, 94' : cpuLoad >= 65 ? '245, 158, 11' : '52, 211, 153'
  const memoryHue = memoryUsage >= 85 ? '249, 115, 22' : memoryUsage >= 65 ? '59, 130, 246' : '56, 189, 248'
  const ringRadius = 28
  const ringCircumference = 2 * Math.PI * ringRadius
  const trackArcLength = ringCircumference * 0.22
  const activeArcLength = trackArcLength * Math.max(0.18, cpuLoad / 100)
  const memoryTrackArcLength = ringCircumference * 0.16
  const memoryActiveArcLength = memoryTrackArcLength * Math.max(0.18, memoryUsage / 100)

  return (
    <div
      ref={floatBallRef}
      className={`relative h-full w-full select-none ${dockState === 'peek' ? 'peek' : dockSide} ${dockState === 'dragging' ? 'dragging' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`absolute left-0 top-0 flex h-[96px] w-[96px] items-center origin-[48px_48px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${dockSide === 'docked-left' ? 'justify-start' : 'justify-end'} ${!isPanelRendering ? 'pointer-events-auto delay-100 opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-[0.01]'
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={`relative flex h-[72px] w-[72px] items-center justify-center ${dockEdgeOffsetClass}`}>
          <button
            type="button"
            className={`peer/trigger group/trigger drag-handle relative flex h-[72px] w-[72px] items-center justify-center rounded-full ${dragMotionClass} ${isDraggingOver ? 'scale-[1.03]' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={openExpandedPanel}
            onContextMenu={openExpandedPanel}
          >
            <svg
              viewBox="0 0 72 72"
              className={`absolute inset-0 overflow-visible rotate-[-78deg] ${dragMotionClass} ${isDragging ? '' : 'group-hover/trigger:rotate-[-70deg]'}`}
              aria-hidden="true"
            >
              <circle
                cx="36"
                cy="36"
                r={ringRadius}
                fill="none"
                stroke={`rgba(${statusHue}, 0.18)`}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${trackArcLength} ${ringCircumference}`}
              />
              <circle
                cx="36"
                cy="36"
                r={ringRadius}
                fill="none"
                stroke={`rgba(${statusHue}, 0.8)`}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${activeArcLength} ${ringCircumference}`}
              />
              <circle
                cx="36"
                cy="36"
                r="23"
                fill="none"
                stroke={`rgba(${memoryHue}, 0.14)`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${memoryTrackArcLength} ${ringCircumference}`}
                strokeDashoffset={-18}
              />
              <circle
                cx="36"
                cy="36"
                r="23"
                fill="none"
                stroke={`rgba(${memoryHue}, 0.78)`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${memoryActiveArcLength} ${ringCircumference}`}
                strokeDashoffset={-18}
              />
            </svg>
            <div className={`absolute inset-[9px] rounded-full border border-white/70 bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.98)_0%,rgba(241,246,255,0.92)_34%,rgba(223,234,252,0.86)_62%,rgba(205,220,245,0.78)_100%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.92),0_6px_14px_rgba(148,163,184,0.12)] ${dragMotionClass} ${isDragging ? '' : 'group-hover/trigger:scale-[1.02] group-hover/trigger:shadow-[inset_0_1px_1px_rgba(255,255,255,0.96),0_8px_18px_rgba(148,163,184,0.16)]'}`} />
            <div className="absolute inset-[15px] rounded-full bg-[radial-gradient(circle_at_34%_28%,rgba(255,255,255,0.9)_0%,rgba(233,241,252,0.76)_46%,rgba(216,227,243,0.6)_100%)]" />
            <div className={`absolute inset-[13px] rounded-full bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,0.46)_0%,rgba(255,255,255,0)_40%)] opacity-80 ${dragMotionClass} ${isDragging ? '' : 'group-hover/trigger:-translate-y-[1px]'}`} />
            <div className={`relative z-10 flex h-[40px] w-[40px] flex-col justify-center rounded-full border border-white/80 bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.98)_0%,rgba(243,247,255,0.94)_36%,rgba(226,235,249,0.9)_100%)] px-[6px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.96),0_1px_2px_rgba(148,163,184,0.12)] ${dragMotionClass} ${isDraggingOver ? 'scale-[1.02]' : dragTransformClass}`}>
              <div className="grid grid-cols-[15px_1fr] items-end gap-x-[3px] leading-none">
                <span className="text-[6px] font-bold tracking-[0.16em] text-slate-500">CPU</span>
                <span className="justify-self-end text-[11px] font-black tabular-nums text-slate-700">{cpuLoad}</span>
              </div>
              <div className="mt-[2px] h-[3px] overflow-hidden rounded-full bg-slate-300/40">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${cpuLoad}%`, background: `linear-gradient(90deg, rgba(${statusHue}, 0.66), rgba(${statusHue}, 0.9))` }}
                />
              </div>
              <div className="mt-[4px] grid grid-cols-[15px_1fr] items-end gap-x-[3px] leading-none">
                <span className="text-[6px] font-bold tracking-[0.16em] text-slate-500">MEM</span>
                <span className="justify-self-end text-[11px] font-black tabular-nums text-slate-700">{memoryUsage}</span>
              </div>
              <div className="mt-[2px] h-[3px] overflow-hidden rounded-full bg-slate-300/40">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${memoryUsage}%`, background: `linear-gradient(90deg, rgba(${memoryHue}, 0.62), rgba(${memoryHue}, 0.88))` }}
                />
              </div>
            </div>
          </button>
        </div>

        {storedFiles.length > 0 && (
          <div className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-md">
            {storedFiles.length}
          </div>
        )}

        <button
          onClick={handleCloseFloatBall}
          className="no-drag absolute right-1 top-1 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-slate-900/45 text-white/90 opacity-0 transition-opacity duration-200 peer-hover/trigger:opacity-100 hover:bg-slate-900/65"
        >
          <X className="h-3 w-3 text-white/90" />
        </button>
      </div>

      <div
        className={`absolute left-0 top-0 flex h-[400px] w-[320px] origin-[48px_48px] flex-col overflow-hidden rounded-2xl border border-white/30 bg-white/70 shadow-xl backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-white/10 dark:bg-[#2a2d35]/90 ${isPanelRendering ? 'pointer-events-auto delay-100 opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-50'
          }`}
      >
        <div className="no-drag flex items-center justify-between border-b border-white/20 p-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-white/20 bg-gradient-to-br from-emerald-500/20 to-teal-400/10 p-2 backdrop-blur-sm dark:border-white/10">
              <img
                src={floatBallIcon}
                alt="文件暂存悬浮球"
                className="h-5 w-5 object-contain drop-shadow-[0_4px_10px_rgba(191,219,254,0.32)]"
                draggable={false}
              />
            </div>
            <span className="text-sm font-semibold">文件暂存</span>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsExpanded(false)
            }}
            className="no-drag rounded-lg p-1.5 transition-colors hover:bg-white/30 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto p-3"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {storedFiles.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-8 text-center">
              <div className={`rounded-xl bg-gradient-to-br p-4 transition-all duration-300 ease-apple ${isDraggingOver
                ? 'scale-110 from-emerald-500/20 to-teal-400/10'
                : 'from-muted/50 to-muted/30'
                }`}>
                <img
                  src={floatBallIcon}
                  alt="文件暂存悬浮球"
                  className="h-9 w-9 object-contain opacity-90 drop-shadow-[0_6px_14px_rgba(191,219,254,0.24)]"
                  draggable={false}
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">拖入文件到此处暂存</p>
            </div>
          ) : (
            <div className="space-y-2">
              {storedFiles.map((file) => (
                <div
                  key={file.id}
                  className="group no-drag flex items-center gap-3 rounded-xl bg-white/40 p-2.5 transition-all duration-200 hover:bg-white/60 dark:bg-white/5 dark:hover:bg-white/10"
                  draggable
                  onDragStart={(e) => handleFileDragStart(e, file)}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-400/10">
                    {file.isDirectory ? (
                      <Folder className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <File className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{file.path}</p>
                  </div>
                  <button
                    onClick={(e) => removeFile(e, file.id)}
                    className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {storedFiles.length > 0 && (
          <div className="no-drag border-t border-white/20 p-3 dark:border-white/10">
            <button
              onClick={(e) => clearAll(e)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-2 text-sm font-medium text-red-600 transition-all duration-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Trash2 className="h-4 w-4" />
              一键清空
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
