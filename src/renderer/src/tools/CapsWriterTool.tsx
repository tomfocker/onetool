import React, { useState } from 'react'
import { Mic, Server, Play, Square, AlertCircle, CheckCircle, Info, ChevronDown, ChevronUp, Terminal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useCapsWriter } from '../hooks/useCapsWriter'

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
  const {
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
    stopClient
  } = useCapsWriter()

  const [showHelp, setShowHelp] = useState(false)

  return (
    <div className='max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700'>
      <div className='flex flex-col gap-2 mb-2'>
        <h1 className='text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent'>
          CapsWriter 离线语音
        </h1>
        <p className='text-muted-foreground'>
          基于开源 CapsWriter-Offline 引擎的高效率离线语音输入方案
        </p>
      </div>

      {message && (
        <Alert className={cn(
          'border-l-4 transition-all duration-500',
          messageType === 'success' ? 'bg-green-500/5 border-green-500 text-green-700 dark:text-green-400' :
          messageType === 'error' ? 'bg-red-500/5 border-red-500 text-red-700 dark:text-red-400' :
          'bg-blue-500/5 border-blue-500 text-blue-700 dark:text-blue-400'
        )}>
          {messageType === 'success' ? <CheckCircle className='h-4 w-4' /> : 
           messageType === 'error' ? <AlertCircle className='h-4 w-4' /> : <Info className='h-4 w-4' />}
          <AlertTitle className='font-bold'>{messageType === 'success' ? '成功' : messageType === 'error' ? '错误' : '提示'}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <div className='lg:col-span-2 space-y-6'>
          <Card className='border-none shadow-xl bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md overflow-hidden'>
            <CardHeader className='pb-4'>
              <div className='flex items-center justify-between'>
                <div className='space-y-1'>
                  <CardTitle className='flex items-center gap-2'>
                    <Mic className='w-5 h-5 text-blue-500' />
                    服务控制
                  </CardTitle>
                  <CardDescription>一键启停语音输入全套组件</CardDescription>
                </div>
                <div className='flex gap-2'>
                  <Button 
                    variant='outline' 
                    size='sm' 
                    className='rounded-full'
                    onClick={() => setShowHelp(!showHelp)}
                  >
                    {showHelp ? <ChevronUp className='w-4 h-4 mr-1' /> : <ChevronDown className='w-4 h-4 mr-1' />}
                    {showHelp ? '收起帮助' : '查看帮助'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div className='p-4 rounded-2xl bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 space-y-4'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <div className='p-2 rounded-lg bg-blue-500/10 text-blue-500'>
                        <Server size={18} />
                      </div>
                      <span className='font-bold'>服务端引擎</span>
                    </div>
                    <StatusBadge running={status.serverRunning} />
                  </div>
                  <div className='flex gap-2'>
                    <Button 
                      className='flex-1 rounded-xl' 
                      size='sm'
                      onClick={startServer}
                      disabled={isLoading || status.serverRunning}
                    >
                      启动
                    </Button>
                    <Button 
                      variant='outline' 
                      className='flex-1 rounded-xl' 
                      size='sm'
                      onClick={stopServer}
                      disabled={isLoading || !status.serverRunning}
                    >
                      停止
                    </Button>
                  </div>
                </div>

                <div className='p-4 rounded-2xl bg-zinc-100/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 space-y-4'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <div className='p-2 rounded-lg bg-indigo-500/10 text-indigo-500'>
                        <Mic size={18} />
                      </div>
                      <span className='font-bold'>语音客户端</span>
                    </div>
                    <StatusBadge running={status.clientRunning} />
                  </div>
                  <div className='flex gap-2'>
                    <Button 
                      className='flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700' 
                      size='sm'
                      onClick={startClient}
                      disabled={isLoading || status.clientRunning}
                    >
                      启动
                    </Button>
                    <Button 
                      variant='outline' 
                      className='flex-1 rounded-xl' 
                      size='sm'
                      onClick={stopClient}
                      disabled={isLoading || !status.clientRunning}
                    >
                      停止
                    </Button>
                  </div>
                </div>
              </div>

              <div className='pt-2'>
                <Button 
                  className={cn(
                    'w-full h-14 rounded-2xl text-lg font-bold transition-all duration-500 shadow-lg',
                    status.serverRunning && status.clientRunning
                      ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 shadow-blue-500/20'
                  )}
                  onClick={status.serverRunning || status.clientRunning ? stopAll : startAll}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className='flex items-center gap-2'>
                      <div className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                      <span>正在处理...</span>
                    </div>
                  ) : (
                    <div className='flex items-center gap-2'>
                      {status.serverRunning || status.clientRunning ? (
                        <>
                          <Square className='w-5 h-5 fill-current' />
                          <span>停止所有服务</span>
                        </>
                      ) : (
                        <>
                          <Play className='w-5 h-5 fill-current' />
                          <span>一键启动完整服务</span>
                        </>
                      )}
                    </div>
                  )}
                </Button>
              </div>

              {showHelp && (
                <div className='mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300'>
                  <h4 className='text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2'>
                    <Info size={16} />
                    使用指南
                  </h4>
                  <ul className='text-xs space-y-2 text-muted-foreground leading-relaxed'>
                    <li className='flex items-start gap-2'>
                      <span className='font-bold text-blue-500'>1.</span>
                      <span>确保已在 C 盘根目录安装了 <b>CapsWriter-Offline</b>。</span>
                    </li>
                    <li className='flex items-start gap-2'>
                      <span className='font-bold text-blue-500'>2.</span>
                      <span>启动后，长按键盘上的 <b>Caps Lock</b> 键即可开始说话。</span>
                    </li>
                    <li className='flex items-start gap-2'>
                      <span className='font-bold text-blue-500'>3.</span>
                      <span>松开按键后，语音将自动转为文字并输入到当前焦点位置。</span>
                    </li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className='space-y-6'>
          <Card className='border-none shadow-xl bg-zinc-900 text-zinc-100 h-[400px] flex flex-col rounded-3xl'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-bold flex items-center gap-2 text-zinc-400'>
                <Terminal size={16} />
                运行日志
              </CardTitle>
            </CardHeader>
            <CardContent className='flex-1 overflow-hidden p-4'>
              <div className='bg-black/40 rounded-2xl p-4 h-full font-mono text-[11px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 space-y-1'>
                {logs.map((log, i) => (
                  <div key={i} className={cn(
                    'break-all',
                    log.includes('✓') ? 'text-green-400' :
                    log.includes('✗') ? 'text-red-400' :
                    log.includes('[系统]') ? 'text-blue-400' : 'text-zinc-400'
                  )}>
                    {log}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CapsWriterTool
