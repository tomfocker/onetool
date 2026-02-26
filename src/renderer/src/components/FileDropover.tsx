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
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [autoRemoveAfterDrag, setAutoRemoveAfterDrag] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 60, height: 60 })

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
    if (isExpanded) {
      setWindowSize({ width: 320, height: 400 })
    } else {
      setWindowSize({ width: 60, height: 60 })
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
  }

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
      className="w-full h-full relative select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {!isExpanded ? (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer transition-all duration-300 ease-apple"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsExpanded(true)
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className={`w-full h-full rounded-full overflow-hidden relative transition-all duration-500 ease-apple ${
            isDraggingOver ? 'scale-110' : 'hover:scale-105'
          }`}>
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 to-slate-800/90" />
            
            <div 
              className="absolute -top-4 -left-4 w-24 h-24 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(0,255,255,0.8) 0%, rgba(0,255,255,0) 70%)',
                filter: 'blur(8px)',
                animation: 'orbit1 8s ease-in-out infinite'
              }}
            />
            
            <div 
              className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(255,0,255,0.8) 0%, rgba(255,0,255,0) 70%)',
                filter: 'blur(8px)',
                animation: 'orbit2 10s ease-in-out infinite'
              }}
            />
            
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(100,149,237,0.7) 0%, rgba(100,149,237,0) 70%)',
                filter: 'blur(10px)',
                animation: 'pulse 6s ease-in-out infinite'
              }}
            />
            
            <div 
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%)'
              }}
            >
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                <Inbox className="w-4 h-4 text-white/90" />
              </div>
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
      ) : (
        <div className="absolute inset-0 bg-white/70 dark:bg-[#2a2d35]/90 backdrop-blur-xl rounded-2xl border border-white/30 dark:border-white/10 shadow-xl flex flex-col overflow-hidden">
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
                <div className={`p-4 rounded-xl bg-gradient-to-br transition-all duration-300 ease-apple ${
                  isDraggingOver 
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
      )}
      
      <style>{`
        @keyframes orbit1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(10px, 5px) scale(1.1); }
          66% { transform: translate(-5px, 10px) scale(0.9); }
        }
        
        @keyframes orbit2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-8px, -5px) scale(0.9); }
          66% { transform: translate(5px, -8px) scale(1.1); }
        }
        
        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.7; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
