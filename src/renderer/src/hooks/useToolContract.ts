import { useEffect, useRef, useCallback } from 'react'

/**
 * 工具资源生命周期契约 Hook
 * 用于自动管理和回收 Renderer 进程中的 UI 资源
 */
export function useToolContract(toolId: string) {
  const timers = useRef<NodeJS.Timeout[]>([])
  const ipcListeners = useRef<Array<() => void>>([])
  const domListeners = useRef<Array<{ target: EventTarget, type: string, handler: any }>>([])

  // 1. 登记计时器
  const registerTimer = useCallback((timer: NodeJS.Timeout) => {
    timers.current.push(timer)
    return timer
  }, [])

  // 2. 登记 IPC 监听（封装原生监听并返回取消函数）
  const registerIpc = useCallback((unsubscribe: () => void) => {
    ipcListeners.current.push(unsubscribe)
  }, [])

  // 3. 登记 DOM 监听
  const registerDomEvent = useCallback((target: EventTarget, type: string, handler: any, options?: AddEventListenerOptions) => {
    target.addEventListener(type, handler, options)
    domListeners.current.push({ target, type, handler })
  }, [])

  // 4. 自动回收契约
  useEffect(() => {
    console.log(`[ToolContract] [${toolId}] View Mounted.`)
    
    return () => {
      console.log(`[ToolContract] [${toolId}] View Unmounting. Cleaning up UI resources...`)
      
      // 清理计时器
      timers.current.forEach(t => clearInterval(t))
      
      // 清理 IPC 订阅
      ipcListeners.current.forEach(unsub => unsub())
      
      // 清理 DOM 事件
      domListeners.current.forEach(({ target, type, handler }) => {
        target.removeEventListener(type, handler)
      })

      timers.current = []
      ipcListeners.current = []
      domListeners.current = []
    }
  }, [toolId])

  return {
    registerTimer,
    registerIpc,
    registerDomEvent
  }
}
