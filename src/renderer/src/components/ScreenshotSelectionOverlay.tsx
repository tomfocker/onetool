import React from 'react'
import { useScreenshotSelection } from '../hooks/useScreenshotSelection'

export const ScreenshotSelectionOverlay: React.FC = () => {
  const { rect, isDragging, onStart, onMove, onEnd, restrictBounds, isEnhanced } = useScreenshotSelection()

  return (
    <div
      className="fixed inset-0 z-[9999] cursor-crosshair select-none overflow-hidden"
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: restrictBounds ? 'transparent' : 'rgba(0,0,0,0.2)'
      }}
      onMouseDown={onStart}
      onMouseMove={onMove}
      onMouseUp={onEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      {restrictBounds && (
        <>
          <div
            className="absolute bg-black/40 pointer-events-none"
            style={{ left: 0, top: 0, right: 0, height: restrictBounds.y }}
          />
          <div
            className="absolute bg-black/40 pointer-events-none"
            style={{ left: 0, bottom: 0, right: 0, height: `calc(100vh - ${restrictBounds.y + restrictBounds.height}px)` }}
          />
          <div
            className="absolute bg-black/40 pointer-events-none"
            style={{ left: 0, top: restrictBounds.y, width: restrictBounds.x, height: restrictBounds.height }}
          />
          <div
            className="absolute bg-black/40 pointer-events-none"
            style={{ left: restrictBounds.x + restrictBounds.width, top: restrictBounds.y, right: 0, height: restrictBounds.height }}
          />
          <div
            className="absolute border border-blue-500/50 pointer-events-none"
            style={{
              left: restrictBounds.x,
              top: restrictBounds.y,
              width: restrictBounds.width,
              height: restrictBounds.height
            }}
          />
        </>
      )}

      <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-blue-500/90 text-white px-6 py-3 rounded-2xl text-sm font-medium border border-blue-400/30 shadow-2xl pointer-events-none z-[100] animate-fade-in whitespace-nowrap">
        {restrictBounds
          ? '✨ 第二步：请在底图内标注重点 (聚光灯效果)'
          : (isEnhanced ? '📸 第一步：请选取整体底图区域 (Esc 退出，右键取消)' : '📸 请选取要截取的区域 (Esc 退出，右键取消)')}
      </div>

      {rect && (
        <div
          className="absolute border-2 border-blue-400 bg-transparent transition-none"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div className="absolute -top-8 left-0 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1 font-mono">
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </div>
          <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-blue-400" />
          <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-blue-400" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-blue-400" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-blue-400" />
        </div>
      )}
    </div>
  )
}
