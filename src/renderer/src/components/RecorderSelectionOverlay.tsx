import React from 'react'
import { useRecorderSelection } from '../hooks/useRecorderSelection'

export const RecorderSelectionOverlay: React.FC = () => {
  const { rect, isDragging, onStart, onMove, onEnd } = useRecorderSelection()

  return (
    <div
      className="fixed inset-0 z-[9999] cursor-crosshair select-none overflow-hidden bg-black/20"
      style={{ width: '100vw', height: '100vh' }}
      onMouseDown={onStart}
      onMouseMove={onMove}
      onMouseUp={onEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded-2xl text-sm font-medium border border-red-400/30 shadow-2xl pointer-events-none z-[100] animate-fade-in whitespace-nowrap">
        🎥 请框选录制区域 (Esc 退出，右键取消)
      </div>

      {rect && (
        <div
          className="absolute border-2 border-red-400 bg-transparent transition-none"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div className="absolute -top-8 left-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1 font-mono">
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </div>
          <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-red-400" />
          <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-red-400" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-red-400" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-red-400" />
        </div>
      )}
    </div>
  )
}
