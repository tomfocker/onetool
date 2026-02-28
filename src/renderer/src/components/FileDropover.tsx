import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Inbox, X, Trash2, File, Folder } from 'lucide-react'

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
  const [isVisible, setIsVisible] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
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
  const startPosRef = useRef({ x: 0, y: 0 })
  const animationFrameRef = useRef<number | null>(null)
  const pendingDeltaRef = useRef<{ dx: number; dy: number } | null>(null)

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
    if (pendingDeltaRef.current) {
      const electron = window.electron as any
      if (electron?.floatBall) {
        electron.floatBall.move(pendingDeltaRef.current.dx, pendingDeltaRef.current.dy)
      }
      pendingDeltaRef.current = null
    }
    animationFrameRef.current = null
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    isDraggingRef.current = true
    startPosRef.current = { x: e.screenX, y: e.screenY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return

    const dx = e.screenX - startPosRef.current.x
    const dy = e.screenY - startPosRef.current.y

    startPosRef.current = { x: e.screenX, y: e.screenY }

    if (pendingDeltaRef.current) {
      pendingDeltaRef.current.dx += dx
      pendingDeltaRef.current.dy += dy
    } else {
      pendingDeltaRef.current = { dx, dy }
    }

    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(moveWindow)
    }
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  const handleMouseLeave = () => {
    isDraggingRef.current = false
    if (isExpanded) {
      setIsExpanded(false)
    }
  }

  useEffect(() => {
    const electron = window.electron as any
    if (electron?.ipcRenderer) {
      const unsub = electron.ipcRenderer.on('floatball-toggle', () => {
        setIsVisible(prev => {
          const next = !prev
          if (!next) {
            // Wait for exit animation to finish before truly hiding the window
            setTimeout(() => {
              if (electron?.floatBall?.hideWindow) {
                electron.floatBall.hideWindow()
              }
            }, 300)
          }
          return next
        })
      })
      return () => {
        unsub()
      }
    }
    return undefined
  }, [])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }

  const handleDragLeave = () => {
    setIsDraggingOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    const files = Array.from(e.dataTransfer.files)
    const newFiles: StoredFile[] = files.map((file, index) => ({
      id: Date.now().toString() + index,
      path: (file as any).path || file.name,
      name: file.name,
      isDirectory: false
    }))

    setStoredFiles(prev => [...prev, ...newFiles])
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
    if (electron?.floatBall) {
      electron.floatBall.close()
    }
  }

  return (
    <div
      ref={floatBallRef}
      className={`w-full h-full relative select-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.01] pointer-events-none'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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
        <div className={`w-[60px] h-[60px] rounded-full overflow-hidden relative transition-all duration-500 ease-apple flex items-center justify-center group ${isDraggingOver ? 'scale-110' : 'hover:scale-105 shadow-xl'
          }`}
          style={{
            boxShadow: isDraggingOver ? '0 0 30px rgba(168,85,247,0.5)' : '0 10px 30px -10px rgba(0,0,0,0.5)'
          }}>
          {/* 深色半透明底色层 */}
          <div className="absolute inset-0 bg-slate-950/80 rounded-full z-0" />

          {/* Siri 风格流光动态模糊球体容器 */}
          <div
            className="absolute z-0 mix-blend-screen pointer-events-none rounded-full overflow-hidden"
            style={{ inset: '-20%', opacity: 0.8 }}
          >
            <div
              className="absolute w-[80%] h-[80%] rounded-full animate-siri-blob"
              style={{
                background: 'radial-gradient(circle at center, rgba(59,130,246,1) 0%, rgba(59,130,246,0) 70%)',
                top: '50%', left: '50%',
                marginTop: '-40%', marginLeft: '-40%',
                filter: 'blur(10px)',
                willChange: 'transform',
                animationDelay: '0s'
              }}
            />
            <div
              className="absolute w-[80%] h-[80%] rounded-full animate-siri-blob"
              style={{
                background: 'radial-gradient(circle at center, rgba(168,85,247,1) 0%, rgba(168,85,247,0) 70%)',
                top: '50%', left: '50%',
                marginTop: '-40%', marginLeft: '-40%',
                filter: 'blur(10px)',
                willChange: 'transform',
                animationDelay: '-2s'
              }}
            />
            <div
              className="absolute w-[80%] h-[80%] rounded-full animate-siri-blob"
              style={{
                background: 'radial-gradient(circle at center, rgba(236,72,153,1) 0%, rgba(236,72,153,0) 70%)',
                top: '50%', left: '50%',
                marginTop: '-40%', marginLeft: '-40%',
                filter: 'blur(10px)',
                willChange: 'transform',
                animationDelay: '-4s'
              }}
            />
          </div>

          {/* 顶层玻璃质感遮罩与内边框 */}
          <div
            className="absolute rounded-full z-10 flex items-center justify-center pointer-events-none shadow-inner"
            style={{ inset: '0px', border: '1px solid rgba(255,255,255,0.1)' }}
          />

          {/* 核心图标层 */}
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <Inbox className="w-5 h-5 text-white transition-transform duration-300 group-hover:scale-110" style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' }} />
          </div>
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
              <Inbox className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
                <Inbox className="w-8 h-8 opacity-50" />
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

      <style>{`
        @keyframes siri-blob {
          0%, 100% { transform: translate(-20%, -20%) scale(1); }
          33% { transform: translate(25%, 15%) scale(1.1); }
          66% { transform: translate(-10%, 25%) scale(0.95); }
        }
        .animate-siri-blob {
          animation: siri-blob 6s infinite alternate cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; filter: brightness(1.2); }
        }
        .pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
