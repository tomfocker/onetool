import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Camera, Languages, Sparkles } from 'lucide-react'
import type { ScreenOverlayMode } from '../../../shared/llm'

export const ScreenOverlayTranslatorTool: React.FC = () => {
  const [mode, setMode] = React.useState<ScreenOverlayMode>('translate')

  const handleStartTranslation = async () => {
    try {
      await window.electron?.screenOverlay?.start?.(mode)
    } catch (error) {
      console.error('Failed to start screen overlay:', error)
    }
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
            <div className='bg-white/40 dark:bg-white/5 rounded-xl p-4 space-y-3'>
              <div>
                <h4 className='font-medium text-sm'>识别模式</h4>
                <p className='text-muted-foreground text-sm mt-1'>
                  不启用翻译时只提取图片内文字；开启开关后才调用全局 LLM 输出译文。
                </p>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <button
                  type='button'
                  onClick={() => setMode('ocr')}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    mode === 'ocr'
                      ? 'border-blue-500 bg-blue-500/10 shadow-sm'
                      : 'border-white/20 bg-white/40 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
                  }`}
                >
                  <div className='text-sm font-semibold'>仅提取文字</div>
                  <div className='text-xs text-muted-foreground mt-1'>只跑本地 OCR，不需要 AI 配置。</div>
                </button>
                <button
                  type='button'
                  onClick={() => setMode('translate')}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    mode === 'translate'
                      ? 'border-purple-500 bg-purple-500/10 shadow-sm'
                      : 'border-white/20 bg-white/40 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
                  }`}
                >
                  <div className='text-sm font-semibold'>OCR + 翻译</div>
                  <div className='text-xs text-muted-foreground mt-1'>先提取文字，再调用全局 LLM 做翻译。</div>
                </button>
              </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <div className='bg-white/40 dark:bg-white/5 rounded-xl p-4'>
                <h4 className='font-medium text-sm mb-2'>功能特点</h4>
                <ul className='text-muted-foreground text-sm space-y-1'>
                  <li>• 全屏透明遮罩</li>
                  <li>• 拖拽框选区域</li>
                  <li>• 结果贴回原位置</li>
                  <li>• OCR / 翻译双模式</li>
                </ul>
              </div>
              <div className='bg-white/40 dark:bg-white/5 rounded-xl p-4'>
                <h4 className='font-medium text-sm mb-2'>使用说明</h4>
                <ul className='text-muted-foreground text-sm space-y-1'>
                  <li>• 先选择模式再启动遮罩</li>
                  <li>• 框选要提取或翻译的文本区域</li>
                  <li>• 结果将贴回原文附近位置</li>
                  <li>• 点击关闭按钮或按 ESC 退出</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card className="border-none shadow-soft bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="w-4 h-4 text-blue-500" />
            {mode === 'translate' ? '全局 AI 配置已接入' : 'OCR-only 模式可直接使用'}
          </CardTitle>
          <CardDescription className="text-xs">
            {mode === 'translate'
              ? '翻译模式会复用偏好设置里的全局 LLM 配置。由于已集成本地 OCR，推荐使用任意文本模型即可完成翻译。'
              : '仅提取文字模式不会调用 LLM，直接用本地 OCR 提取图片中的文本内容。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/30 px-4 py-3 text-sm text-muted-foreground dark:bg-white/5">
            {mode === 'translate'
              ? <>请前往 <span className="font-semibold text-foreground">全局设置 → AI 与 LLM</span> 填写 Base URL、模型和 API Key。</>
              : <>当前模式不依赖 AI 配置；如果你只想提取图片里的字，现在就可以直接启动。</>}
          </div>
        </CardContent>
      </Card>

      <div className='flex gap-4'>
        <Button
          onClick={handleStartTranslation}
          className='flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl py-6'
        >
          <Camera className='mr-2 h-5 w-5' />
          {mode === 'translate' ? '启动截屏翻译' : '启动文字提取'}
        </Button>
      </div>
    </div>
  )
}

export default ScreenOverlayTranslatorTool
