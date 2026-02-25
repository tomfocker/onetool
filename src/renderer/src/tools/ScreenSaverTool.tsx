import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, Play, AlertCircle } from 'lucide-react'

function ScreenSaverTool(): React.JSX.Element {
  const [status, setStatus] = React.useState<'idle' | 'starting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string>('')

  const handleStartScreenSaver = async () => {
    try {
      setStatus('starting')
      setErrorMessage('')
      const result = await window.electron?.screenSaver?.start()
      
      if (result?.success) {
        setStatus('success')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('error')
        setErrorMessage(result?.error || '启动屏保失败')
      }
    } catch (error) {
      setStatus('error')
      setErrorMessage('启动屏保发生错误')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">翻页时钟屏保</h2>
        <p className="text-muted-foreground">启动 FlipIt 屏保，享受精美的翻页时钟效果</p>
      </div>

      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="text-primary" size={20} />
            FlipIt 屏保
          </CardTitle>
          <CardDescription>
            启动外部屏保程序，展示翻页时钟效果
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center justify-center p-8 bg-background rounded-lg border border-border">
            <Clock size={64} className="text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">翻页时钟屏保</h3>
            <p className="text-muted-foreground text-center">
              点击下方按钮启动 FlipIt 屏保，体验经典的翻页时钟效果
            </p>
          </div>

          <Button
            onClick={handleStartScreenSaver}
            disabled={status === 'starting'}
            className="w-full flex items-center justify-center gap-2"
          >
            {status === 'starting' && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <Play size={18} />
            {status === 'starting' ? '启动中...' : '启动屏保'}
          </Button>

          {status === 'success' && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              屏保已成功启动
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertCircle size={18} />
              {errorMessage}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• 点击「启动屏保」按钮即可启动 FlipIt 屏保</p>
          <p>• 屏保启动后，按任意键或移动鼠标即可退出</p>
          <p>• 屏保文件位置：工具根目录下的「【时钟屏保】FlipIt.scr」</p>
          <p>• 如果启动失败，请检查屏保文件是否存在</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default ScreenSaverTool