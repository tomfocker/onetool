import React from 'react'
import { Button } from '@/components/ui/button'
import { Camera, Languages } from 'lucide-react'

export const ScreenOverlayTranslatorTool: React.FC = () => {
  const handleStartTranslation = async () => {
    try {
      await window.electron?.screenOverlay?.start?.()
    } catch (error) {
      console.error('Failed to start screen overlay:', error)
    }
  }

  return (
    <div className='space-y-6'>
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

      <div className='flex gap-4'>
        <Button
          onClick={handleStartTranslation}
          className='flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300'
        >
          <Camera className='mr-2 h-4 w-4' />
          启动截屏翻译
        </Button>
      </div>
    </div>
  )
}

export default ScreenOverlayTranslatorTool
