import React, { useState, useEffect } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'

export function TitleBar(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const checkMaximized = async () => {
      const electron = window.electron as any
      if (electron?.window?.isMaximized) {
        const result = await electron.window.isMaximized()
        if (result.success && result.data) {
          setIsMaximized(result.data.maximized)
        }
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
      if (result.success && result.data) {
        setIsMaximized(result.data.maximized)
      }
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
      className="fixed top-0 left-0 right-0 h-9 z-[9999] flex items-center justify-between px-3 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-2xl border-b border-zinc-200/50 dark:border-zinc-800/50"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5 pl-1">
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-900 dark:text-zinc-100 opacity-80">onetool</span>
      </div>

      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="w-10 h-full flex items-center justify-center hover:bg-zinc-200/50 dark:hover:bg-white/5 transition-all duration-200"
          title="最小化"
        >
          <Minus className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-10 h-full flex items-center justify-center hover:bg-zinc-200/50 dark:hover:bg-white/5 transition-all duration-200"
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
            <Maximize2 className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
          ) : (
            <Square className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center hover:bg-rose-500 group transition-all duration-200"
          title="关闭"
        >
          <X className="w-4 h-4 text-zinc-600 dark:text-zinc-400 group-hover:text-white transition-colors" />
        </button>
      </div>
    </div>
  )
}
