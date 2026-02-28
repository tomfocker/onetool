import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Camera, Languages, Settings2 } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'

export const ScreenOverlayTranslatorTool: React.FC = () => {
  const { settings, updateSettings, isLoading } = useSettings()

  const handleStartTranslation = async () => {
    try {
      await window.electron?.screenOverlay?.start?.()
    } catch (error) {
      console.error('Failed to start screen overlay:', error)
    }
  }

  if (isLoading || !settings) {
    return <div className="p-4 text-center text-muted-foreground">加载配置中...</div>
  }

  return (
    <div className='space-y-6 pb-10'>
      <div className='flex items-center gap-4'>
        <div className='w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-soft'>
          <Languages className='h-6 w-6 text-white' />
        </div>
        <div>
          <h2 className='text-xl font-bold'>沉浸式截屏翻译</h2>
          <p className='text-muted-foreground text-sm'>Screen Overlay Translator</p>
        </div>
      </div>

      <div className='bg-white/60 dark:bg-[#2a2d35]/80 backdrop-blur-xl rounded-2xl p-6 shadow-soft-sm border border-white/20 dark:border-white/10'>
        <div className='space-y-4'>
          <div className='flex items-start gap-4'>
            <div className='w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0'>
              <Camera className='h-5 w-5 text-blue-600 dark:text-blue-400' />
            </div>
            <div>
              <h3 className='font-medium'>快捷键启动</h3>
              <p className='text-muted-foreground text-sm mt-1'>
                按下 <kbd className='px-2 py-1 bg-white/50 dark:bg-white/10 rounded-lg text-xs font-mono'>Alt</kbd> + <kbd className='px-2 py-1 bg-white/50 dark:bg-white/10 rounded-lg text-xs font-mono'>Shift</kbd> + <kbd className='px-2 py-1 bg-white/50 dark:bg-white/10 rounded-lg text-xs font-mono'>T</kbd> 快速启动
              </p>
            </div>
          </div>

          <div className='h-px bg-white/20 dark:bg-white/10' />

          <div className='space-y-3'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <div className='bg-white/40 dark:bg-white/5 rounded-xl p-4'>
                <h4 className='font-medium text-sm mb-2'>功能特点</h4>
                <ul className='text-muted-foreground text-sm space-y-1'>
                  <li>• 全屏透明遮罩</li>
                  <li>• 拖拽框选区域</li>
                  <li>• 原地翻译结果</li>
                  <li>• 玻璃质感设计</li>
                </ul>
              </div>
              <div className='bg-white/40 dark:bg-white/5 rounded-xl p-4'>
                <h4 className='font-medium text-sm mb-2'>使用说明</h4>
                <ul className='text-muted-foreground text-sm space-y-1'>
                  <li>• 框选要翻译的文本区域</li>
                  <li>• 自动识别和翻译文字</li>
                  <li>• 点击卡片外部或ESC关闭</li>
                  <li>• 支持OCR识别与翻译</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card className="border-none shadow-soft bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Settings2 className="w-4 h-4 text-blue-500" />
            翻译 API 配置 (大模型)
          </CardTitle>
          <CardDescription className="text-xs">配置视觉大模型接口 (推荐使用 gpt-4o 或兼容 OpenAI 标准的视觉模型)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground tracking-wider ml-1 uppercase">API URL</label>
              <Input
                value={settings.translateApiUrl}
                onChange={(e) => updateSettings({ translateApiUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="rounded-xl border-white/20 bg-white/40 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground tracking-wider ml-1 uppercase">模型名称</label>
              <Input
                value={settings.translateModel}
                onChange={(e) => updateSettings({ translateModel: e.target.value })}
                placeholder="gpt-4o"
                className="rounded-xl border-white/20 bg-white/40 font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground tracking-wider ml-1 uppercase">API Key</label>
            <Input
              type="password"
              value={settings.translateApiKey}
              onChange={(e) => updateSettings({ translateApiKey: e.target.value })}
              placeholder="sk-..."
              className="rounded-xl border-white/20 bg-white/40 font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <div className='flex gap-4'>
        <Button
          onClick={handleStartTranslation}
          className='flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl py-6'
        >
          <Camera className='mr-2 h-5 w-5' />
          启动截屏翻译
        </Button>
      </div>
    </div>
  )
}

export default ScreenOverlayTranslatorTool
