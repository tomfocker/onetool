import { useState, useCallback, useEffect } from 'react'

export interface ServiceStatus {
  serverRunning: boolean
  clientRunning: boolean
}

export function useCapsWriter() {
  const [status, setStatus] = useState<ServiceStatus>({
    serverRunning: false,
    clientRunning: false
  })
  const [message, setMessage] = useState<string>('')
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info')
  const [isLoading, setIsLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([
    '[系统] CapsWriter 控制台已就绪',
    '[提示] 点击启动按钮开始服务...'
  ])

  const addLog = useCallback((log: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev.slice(-50), `[${timestamp}] ${log}`])
  }, [])

  const showMessage = useCallback((text: string, type: 'success' | 'error' | 'info') => {
    setMessage(text)
    setMessageType(type)
    setTimeout(() => setMessage(''), 5000)
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.electron.capswriter.getStatus()
      if (result.success && result.data) {
        setStatus({
          serverRunning: result.data.serverRunning,
          clientRunning: result.data.clientRunning
        })
      }
    } catch (error) { console.error('获取状态失败:', error) }
  }, [])

  const startAll = async () => {
    setIsLoading(true); addLog('正在启动所有服务...')
    try {
      const result = await window.electron.capswriter.startAll()
      if (result.success) {
        showMessage('服务端和客户端已启动', 'success')
        addLog('✓ 服务端和客户端启动成功')
      } else {
        let errorMsg = result.error || '启动失败'
        if (result.data) {
          if (result.data.serverError) errorMsg += ` - 服务端: ${result.data.serverError}`
          if (result.data.clientError) errorMsg += ` - 客户端: ${result.data.clientError}`
        }
        showMessage(errorMsg, 'error'); addLog(`✗ ${errorMsg}`)
      }
      await fetchStatus()
    } catch (error) { showMessage(`启动失败: ${error}`, 'error'); addLog(`✗ 启动失败: ${error}`) }
    finally { setIsLoading(false) }
  }

  const stopAll = async () => {
    setIsLoading(true); addLog('正在停止所有服务...')
    try {
      const result = await window.electron.capswriter.stopAll()
      if (result.success) { showMessage('所有服务已停止', 'success'); addLog('✓ 所有服务已停止') }
      else { showMessage(`停止失败: ${result.error}`, 'error'); addLog(`✗ 停止失败: ${result.error}`) }
      await fetchStatus()
    } catch (error) { showMessage(`停止失败: ${error}`, 'error'); addLog(`✗ 停止失败: ${error}`) }
    finally { setIsLoading(false) }
  }

  const startServer = async () => {
    setIsLoading(true); addLog('正在启动服务端...')
    try {
      const result = await window.electron.capswriter.startServer()
      if (result.success) { showMessage('服务端已启动', 'success'); addLog('✓ 服务端启动成功') }
      else { showMessage(`启动失败: ${result.error}`, 'error'); addLog(`✗ 服务端启动失败: ${result.error}`) }
      await fetchStatus()
    } catch (error) { showMessage(`启动失败: ${error}`, 'error'); addLog(`✗ 服务端启动失败: ${error}`) }
    finally { setIsLoading(false) }
  }

  const stopServer = async () => {
    setIsLoading(true); addLog('正在停止服务端...')
    try {
      const result = await window.electron.capswriter.stopServer()
      if (result.success) { showMessage('服务端已停止', 'success'); addLog('✓ 服务端已停止') }
      else { showMessage(`停止失败: ${result.error}`, 'error'); addLog(`✗ 服务端停止失败: ${result.error}`) }
      await fetchStatus()
    } catch (error) { showMessage(`停止失败: ${error}`, 'error'); addLog(`✗ 服务端停止失败: ${error}`) }
    finally { setIsLoading(false) }
  }

  const startClient = async () => {
    setIsLoading(true); addLog('正在启动客户端...')
    try {
      const result = await window.electron.capswriter.startClient()
      if (result.success) { showMessage('客户端已启动', 'success'); addLog('✓ 客户端启动成功') }
      else { showMessage(`启动失败: ${result.error}`, 'error'); addLog(`✗ 客户端启动失败: ${result.error}`) }
      await fetchStatus()
    } catch (error) { showMessage(`启动失败: ${error}`, 'error'); addLog(`✗ 客户端启动失败: ${error}`) }
    finally { setIsLoading(false) }
  }

  const stopClient = async () => {
    setIsLoading(true); addLog('正在停止客户端...')
    try {
      const result = await window.electron.capswriter.stopClient()
      if (result.success) { showMessage('客户端已停止', 'success'); addLog('✓ 客户端已停止') }
      else { showMessage(`停止失败: ${result.error}`, 'error'); addLog(`✗ 客户端停止失败: ${result.error}`) }
      await fetchStatus()
    } catch (error) { showMessage(`停止失败: ${error}`, 'error'); addLog(`✗ 客户端停止失败: ${error}`) }
    finally { setIsLoading(false) }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  return {
    status,
    message,
    messageType,
    isLoading,
    logs,
    startAll,
    stopAll,
    startServer,
    stopServer,
    startClient,
    stopClient,
    addLog,
    showMessage
  }
}
