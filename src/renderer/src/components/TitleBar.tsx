import React, { useState, useEffect } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'

export function TitleBar(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const checkMaximized = async () => {
      const electron = window.electron as any
      if (electron?.window?.isMaximized) {
        const result = await electron.window.isMaximized()
        setIsMaximized(result.maximized)
      }
    }
    checkMaximized()
  }, [])

  const handleMinimize = async () => {
    const electron = window.electron as any
    if (electron?.window?.minimize) {
      await electron.window.minimize()
    }
  }

  const handleMaximize = async () => {
    const electron = window.electron as any
    if (electron?.window?.maximize) {
      const result = await electron.window.maximize()
      setIsMaximized(result.maximized)
    }
  }

  const handleClose = async () => {
    const electron = window.electron as any
    if (electron?.window?.close) {
      await electron.window.close()
    }
  }

  return (
    <div 
      className="fixed top-0 left-0 right-0 h-8 z-[9999] flex items-center justify-between px-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-white/20 dark:border-gray-700/30"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-400 to-purple-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">onetool</span>
      </div>
      
      <div 
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
          title="最小化"
        >
          <Minus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
            <Maximize2 className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
          ) : (
            <Square className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-500 group transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4 text-gray-600 dark:text-gray-300 group-hover:text-white" />
        </button>
      </div>
    </div>
  )
}
