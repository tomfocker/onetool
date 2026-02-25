import React, { useState, useEffect, useCallback } from 'react'
import { Mic, Server, Play, Square, AlertCircle, CheckCircle, Info, ChevronDown, ChevronUp, Terminal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface ServiceStatus {
  serverRunning: boolean
  clientRunning: boolean
}

const StatusBadge: React.FC<{ running: boolean }> = ({ running }) => (
  <div className={cn(
    'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300',
    running
      ? 'bg-green-500/15 text-green-600 dark:bg-green-500/20 dark:text-green-400'
      : 'bg-gray-500/15 text-gray-500 dark:bg-gray-500/20 dark:text-gray-400'
  )}>
    {running && (
      <span className='relative flex h-2 w-2'>
        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75'></span>
        <span className='relative inline-flex rounded-full h-2 w-2 bg-green-500'></span>
      </span>
    )}
    <span>{running ? '运行中' : '已停止'}</span>
  </div>
)

export const CapsWriterTool: React.FC = () => {
  const [status, setStatus] = useState<ServiceStatus>({
    serverRunning: false,
    clientRunning: false
  })
  const [message, setMessage] = useState<string>('')
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info')
  const [isLoading, setIsLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [logs, setLogs] = useState<string[]>([
    '[系统] CapsWriter 控制台已就绪',
    '[提示] 点击启动按钮开始服务...'
  ])

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.electron.capswriter.getStatus()
      if (result.success) {
        setStatus({
          serverRunning: result.serverRunning,
          clientRunning: result.clientRunning
        })
      }
    } catch (error) {
      console.error('获取状态失败:', error)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const addLog = (log: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev.slice(-50), `[${timestamp}] ${log}`])
  }

  const showMessage = (text: string, type: 'success' | 'error' | 'info') => {
    setMessage(text)
    setMessageType(type)
    setTimeout(() => setMessage(''), 5000)
  }

  const handleStartAll = async () => {
    setIsLoading(true)
    addLog('正在启动所有服务...')
    try {
      const result = await window.electron.capswriter.startAll()
      if (result.success) {
        showMessage('服务端和客户端已启动', 'success')
        addLog('✓ 服务端和客户端启动成功')
      } else {
        let errorMsg = '启动失败'
        if (result.serverError) errorMsg += ` - 服务端: ${result.serverError}`
        if (result.clientError) errorMsg += ` - 客户端: ${result.clientError}`
        if (result.error) errorMsg = result.error
        showMessage(errorMsg, 'error')
        addLog(`✗ ${errorMsg}`)
      }
      fetchStatus()
    } catch (error) {
      showMessage(`启动失败: ${error}`, 'error')
      addLog(`✗ 启动失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopAll = async () => {
    setIsLoading(true)
    addLog('正在停止所有服务...')
    try {
      const result = await window.electron.capswriter.stopAll()
      if (result.success) {
        showMessage('服务端和客户端已停止', 'success')
        addLog('✓ 服务端和客户端已停止')
      } else {
        showMessage(`停止失败: ${result.error}`, 'error')
        addLog(`✗ 停止失败: ${result.error}`)
      }
      fetchStatus()
    } catch (error) {
      showMessage(`停止失败: ${error}`, 'error')
      addLog(`✗ 停止失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartServer = async () => {
    setIsLoading(true)
    addLog('正在启动服务端...')
    try {
      const result = await window.electron.capswriter.startServer()
      if (result.success) {
        showMessage('服务端已启动', 'success')
        addLog('✓ 服务端启动成功')
      } else {
        showMessage(`启动失败: ${result.error}`, 'error')
        addLog(`✗ 服务端启动失败: ${result.error}`)
      }
      fetchStatus()
    } catch (error) {
      showMessage(`启动失败: ${error}`, 'error')
      addLog(`✗ 服务端启动失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopServer = async () => {
    setIsLoading(true)
    addLog('正在停止服务端...')
    try {
      const result = await window.electron.capswriter.stopServer()
      if (result.success) {
        showMessage('服务端已停止', 'success')
        addLog('✓ 服务端已停止')
      } else {
        showMessage(`停止失败: ${result.error}`, 'error')
        addLog(`✗ 服务端停止失败: ${result.error}`)
      }
      fetchStatus()
    } catch (error) {
      showMessage(`停止失败: ${error}`, 'error')
      addLog(`✗ 服务端停止失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartClient = async () => {
    setIsLoading(true)
    addLog('正在启动客户端...')
    try {
      const result = await window.electron.capswriter.startClient()
      if (result.success) {
        showMessage('客户端已启动', 'success')
        addLog('✓ 客户端启动成功')
      } else {
        showMessage(`启动失败: ${result.error}`, 'error')
        addLog(`✗ 客户端启动失败: ${result.error}`)
      }
      fetchStatus()
    } catch (error) {
      showMessage(`启动失败: ${error}`, 'error')
      addLog(`✗ 客户端启动失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopClient = async () => {
    setIsLoading(true)
    addLog('正在停止客户端...')
    try {
      const result = await window.electron.capswriter.stopClient()
      if (result.success) {
        showMessage('客户端已停止', 'success')
        addLog('✓ 客户端已停止')
      } else {
        showMessage(`停止失败: ${result.error}`, 'error')
        addLog(`✗ 客户端停止失败: ${result.error}`)
      }
      fetchStatus()
    } catch (error) {
      showMessage(`停止失败: ${error}`, 'error')
      addLog(`✗ 客户端停止失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='space-y-6'>
      {/* 标题栏 + 快捷控制按钮 */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold'>CapsWriter 语音输入</h2>
          <p className='text-sm text-muted-foreground'>按住 CapsLock 说话，松开就上屏</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='icon'
            variant='outline'
            onClick={handleStartAll}
            disabled={isLoading || (status.serverRunning && status.clientRunning)}
            title='启动全部'
            className='h-9 w-9'
          >
            <Play className='h-4 w-4' />
          </Button>
          <Button
            size='icon'
            variant='outline'
            onClick={handleStopAll}
            disabled={isLoading || (!status.serverRunning && !status.clientRunning)}
            title='停止全部'
            className='h-9 w-9'
          >
            <Square className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <Alert className={cn(
          messageType === 'success' ? 'bg-green-500/10 border-green-500 text-green-500' :
          messageType === 'error' ? 'bg-red-500/10 border-red-500 text-red-500' :
          'bg-blue-500/10 border-blue-500 text-blue-500'
        )}>
          {messageType === 'success' && <CheckCircle className='h-4 w-4' />}
          {messageType === 'error' && <AlertCircle className='h-4 w-4' />}
          {messageType === 'info' && <Info className='h-4 w-4' />}
          <AlertTitle>{message}</AlertTitle>
        </Alert>
      )}

      {/* 服务卡片 */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <Card className='overflow-hidden'>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Server className='h-4 w-4' />
                服务端
              </CardTitle>
              <StatusBadge running={status.serverRunning} />
            </div>
            <CardDescription className='text-xs'>语音识别模型服务</CardDescription>
          </CardHeader>
          <CardContent className='pt-0'>
            <div className='flex gap-2'>
              <Button
                size='sm'
                className='flex-1 h-8'
                onClick={handleStartServer}
                disabled={isLoading || status.serverRunning}
              >
                <Play className='mr-1.5 h-3.5 w-3.5' />
                启动
              </Button>
              <Button
                size='sm'
                variant='destructive'
                className='flex-1 h-8'
                onClick={handleStopServer}
                disabled={isLoading || !status.serverRunning}
              >
                <Square className='mr-1.5 h-3.5 w-3.5' />
                停止
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className='overflow-hidden'>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Mic className='h-4 w-4' />
                客户端
              </CardTitle>
              <StatusBadge running={status.clientRunning} />
            </div>
            <CardDescription className='text-xs'>键盘监听和输入客户端</CardDescription>
          </CardHeader>
          <CardContent className='pt-0'>
            <div className='flex gap-2'>
              <Button
                size='sm'
                className='flex-1 h-8'
                onClick={handleStartClient}
                disabled={isLoading || status.clientRunning}
              >
                <Play className='mr-1.5 h-3.5 w-3.5' />
                启动
              </Button>
              <Button
                size='sm'
                variant='destructive'
                className='flex-1 h-8'
                onClick={handleStopClient}
                disabled={isLoading || !status.clientRunning}
              >
                <Square className='mr-1.5 h-3.5 w-3.5' />
                停止
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 实时日志控制台 */}
      <Card className='overflow-hidden'>
        <CardHeader className='py-3 px-4 bg-muted/50'>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <Terminal className='h-4 w-4' />
            实时日志控制台
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='bg-black font-mono text-green-400 text-xs p-4 h-48 overflow-y-auto leading-relaxed'>
            {logs.map((log, index) => (
              <div key={index} className='whitespace-pre-wrap'>
                {log}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 使用说明 - 可折叠 */}
      <div className='border rounded-lg overflow-hidden'>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className='w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm'
        >
          <span className='text-muted-foreground'>使用说明</span>
          {showHelp ? (
            <ChevronUp className='h-4 w-4 text-muted-foreground' />
          ) : (
            <ChevronDown className='h-4 w-4 text-muted-foreground' />
          )}
        </button>
        {showHelp && (
          <div className='px-4 py-3 text-xs text-muted-foreground space-y-2 bg-muted/10'>
            <p>• <strong>启动服务：</strong>先启动服务端，等待模型加载完成后再启动客户端</p>
            <p>• <strong>开始听写：</strong>按住 CapsLock 键说话，松开后识别结果会自动上屏</p>
            <p>• <strong>模型配置：</strong>在 CapsWriter-Offline 目录下的 config_server.py 和 config_client.py 中进行配置</p>
          </div>
        )}
      </div>
    </div>
  )
}
