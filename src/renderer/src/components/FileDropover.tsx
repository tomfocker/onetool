import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Trash2, File, Folder } from 'lucide-react'
import { buildStoredFiles } from '../../../shared/fileDropover'
import appIcon from '../../../../resources/icon.png'

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
  const [windowSize, setWindowSize] = useState({ width: 120, height: 120 })

  useEffect(() => {
    const savedAutoRemove = localStorage.getItem('floatball-autoRemoveAfterDrag')
    if (savedAutoRemove !== null) {
      setAutoRemoveAfterDrag(savedAutoRemove === 'true')
    }
  }, [])

  const floatBallRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragDepthRef = useRef(0)
  const startPosRef = useRef({ offsetX: 0, offsetY: 0 })
  const animationFrameRef = useRef<number | null>(null)
  const pendingTargetRef = useRef<{ targetX: number; targetY: number } | null>(null)

  useEffect(() => {
    const electron = window.electron as any
    if (electron?.floatBall) {
      electron.floatBall.resize(windowSize.width, windowSize.height)
    }
  }, [windowSize])

  useEffect(() => {
    let timerWindow: NodeJS.Timeout
    let timerRender: NodeJS.Timeout

    if (isExpanded) {
      // 展开时：主进程窗口立刻变大，前端动画延迟 50ms 播放，防止闪烁
      setWindowSize({ width: 320, height: 400 })
      timerRender = setTimeout(() => {
        setIsPanelRendering(true)
      }, 50)
    } else {
      // 收缩时：前端动画立刻播放，主进程窗口等待动画 300ms 结束后再变小
      setIsPanelRendering(false)
      timerWindow = setTimeout(() => {
        setWindowSize({ width: 120, height: 120 })
      }, 300)
    }

    return () => {
      if (timerWindow) clearTimeout(timerWindow)
      if (timerRender) clearTimeout(timerRender)
    }
  }, [isExpanded])

  const moveWindow = useCallback(() => {
    if (pendingTargetRef.current) {
      const electron = window.electron as any
      if (electron?.floatBall) {
        electron.floatBall.setPosition(pendingTargetRef.current.targetX, pendingTargetRef.current.targetY)
      }
      pendingTargetRef.current = null
    }
    animationFrameRef.current = null
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    isDraggingRef.current = true

    // Capture the pointer
    e.currentTarget.setPointerCapture(e.pointerId)

    // Calculate the mouse offset from the top-left of the window
    startPosRef.current = { offsetX: e.clientX, offsetY: e.clientY }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return

    // Calculate absolute window position
    const targetX = e.screenX - startPosRef.current.offsetX
    const targetY = e.screenY - startPosRef.current.offsetY

    pendingTargetRef.current = { targetX, targetY }

    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(moveWindow)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch (err) { }
  }

  const handleMouseLeave = () => {
    if (!isDraggingRef.current && isExpanded) {
      setIsExpanded(false)
    }
  }

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
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
        setStoredFiles(prev => prev.filter(f => f.id !== file.id))
      }, 100)
    }
  }

  const removeFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    setStoredFiles(prev => prev.filter(f => f.id !== id))
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

  return (
    <div
      ref={floatBallRef}
      className="w-full h-full relative select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* 悬浮球形态 */}
      <div
        className={`absolute top-0 left-0 w-[120px] h-[120px] flex items-center justify-center cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-[60px_60px] ${!isPanelRendering ? 'opacity-100 scale-100 pointer-events-auto delay-100' : 'opacity-0 scale-[0.01] pointer-events-none'
          }`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsExpanded(true)
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={`w-[72px] h-[72px] relative transition-all duration-300 ease-out flex items-center justify-center group ${isDraggingOver ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{
            filter: isDraggingOver
              ? 'drop-shadow(0 0 18px rgba(127, 86, 217, 0.55))'
              : 'drop-shadow(0 8px 18px rgba(78, 49, 138, 0.28))'
          }}>
          <img
            src={appIcon}
            alt="OneTool"
            className="w-full h-full object-contain pointer-events-none transition-transform duration-300 group-hover:scale-105"
            draggable={false}
          />
        </div>

        {storedFiles.length > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-md">
            {storedFiles.length}
          </div>
        )}

        <button
          onClick={handleCloseFloatBall}
          className="absolute -top-2 -right-2 w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-all duration-200 opacity-0 hover:opacity-100 no-drag"
        >
          <X className="w-3 h-3 text-white/90" />
        </button>
      </div>

      {/* 展开面板形态 */}
      <div
        className={`absolute top-0 left-0 w-[320px] h-[400px] bg-white/70 dark:bg-[#2a2d35]/90 backdrop-blur-xl rounded-2xl border border-white/30 dark:border-white/10 shadow-xl flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-[60px_60px] ${isPanelRendering ? 'opacity-100 scale-100 pointer-events-auto delay-100' : 'opacity-0 scale-50 pointer-events-none'
          }`}
      >
        <div className="p-3 border-b border-white/20 dark:border-white/10 flex items-center justify-between no-drag">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-400/10 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-xl">
              <img src={appIcon} alt="OneTool" className="w-4 h-4 object-contain" draggable={false} />
            </div>
            <span className="font-semibold text-sm">文件暂存</span>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsExpanded(false)
            }}
            className="no-drag p-1.5 rounded-lg hover:bg-white/30 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto p-3"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {storedFiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <div className={`p-4 rounded-xl bg-gradient-to-br transition-all duration-300 ease-apple ${isDraggingOver
                ? 'from-emerald-500/20 to-teal-400/10 scale-110'
                : 'from-muted/50 to-muted/30'
                }`}>
                <img src={appIcon} alt="OneTool" className="w-8 h-8 object-contain opacity-60" draggable={false} />
              </div>
              <p className="text-sm text-muted-foreground mt-3">拖入文件到此处暂存</p>
            </div>
          ) : (
            <div className="space-y-2">
              {storedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 transition-all duration-200 group no-drag"
                  draggable
                  onDragStart={(e) => handleFileDragStart(e, file)}
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-400/10 flex items-center justify-center flex-shrink-0">
                    {file.isDirectory ? (
                      <Folder className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <File className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{file.path}</p>
                  </div>
                  <button
                    onClick={(e) => removeFile(e, file.id)}
                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {storedFiles.length > 0 && (
          <div className="p-3 border-t border-white/20 dark:border-white/10 no-drag">
            <button
              onClick={(e) => clearAll(e)}
              className="w-full py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              一键清空
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
