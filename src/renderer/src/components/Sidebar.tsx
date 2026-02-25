import React from 'react'
import {
  LayoutDashboard, Package, Terminal, MousePointer, Mic,
  Globe, Clock, Settings, Image, Video, Clipboard, Palette, QrCode, Radar, Inbox, Languages
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onNavigate: (page: string) => void
}

const toolNameMap: Record<string, string> = {
  'dashboard': '仪表盘',
  'quick-installer': '极速装机',
  'rename-tool': '批量重命名',
  'autoclicker': '鼠标连点器',
  'capswriter': 'CapsWriter 语音',
  'web-activator': '网页激活器',
  'flip-clock': '翻页时钟',
  'config-checker': '配置检测',
  'settings': '设置',
  'image-processor': '图片处理',
  'network-radar': '网络雷达',
  'clipboard-manager': '剪贴板管理',
  'qr-generator': '二维码生成',
  'color-picker': '取色器',
  'screen-recorder': '屏幕录制',
  'file-dropover': '文件暂存悬浮球',
  'screen-overlay-translator': '沉浸式截屏翻译'
}

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, name: '仪表盘' },
  { id: 'quick-installer', icon: Package, name: '极速装机' },
  { id: 'rename-tool', icon: Terminal, name: '批量重命名' },
  { id: 'autoclicker', icon: MousePointer, name: '鼠标连点器' },
  { id: 'capswriter', icon: Mic, name: 'CapsWriter 语音' },
  { id: 'image-processor', icon: Image, name: '图片处理' },
  { id: 'web-activator', icon: Globe, name: '网页激活器' },
  { id: 'flip-clock', icon: Clock, name: '翻页时钟' },
  { id: 'config-checker', icon: Settings, name: '配置检测' },
  { id: 'screen-recorder', icon: Video, name: '屏幕录制' },
  { id: 'screen-overlay-translator', icon: Languages, name: '沉浸式截屏翻译' },
  { id: 'clipboard-manager', icon: Clipboard, name: '剪贴板管理' },
  { id: 'color-picker', icon: Palette, name: '取色器' },
  { id: 'qr-generator', icon: QrCode, name: '二维码生成' },
  { id: 'network-radar', icon: Radar, name: '网络雷达' },
  { id: 'file-dropover', icon: Inbox, name: '文件暂存悬浮球' },
  { id: 'settings', icon: Settings, name: '设置' }
]

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  return (
    <aside className='w-64 h-[calc(100vh-2rem)] bg-white/60 dark:bg-[#2a2d35]/80 backdrop-blur-xl border-r border-white/20 dark:border-white/10 fixed left-0 top-8 flex flex-col z-30 shadow-soft-sm'>
      <div className='p-6 border-b border-white/20 dark:border-white/10'>
        <div className='flex items-center gap-3'>
          <div className='w-10 h-10 rounded-xl overflow-hidden shadow-soft'>
            <img src='/icon.png' alt='onetool' className='w-full h-full object-contain' />
          </div>
          <div>
            <h1 className='font-bold text-lg'>onetool</h1>
            <p className='text-xs text-muted-foreground'>工具箱</p>
          </div>
        </div>
      </div>

      <nav className='flex-1 overflow-y-auto p-3'>
        <div className='space-y-1'>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl',
                  'text-sm font-medium transition-all duration-200',
                  'hover:bg-white/50 dark:hover:bg-white/10',
                  'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className='h-4 w-4' />
                <span>{item.name}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <div className='p-4 border-t border-white/20 dark:border-white/10'>
        <div className='text-xs text-muted-foreground text-center'>
          onetool v1.0.0
        </div>
      </div>
    </aside>
  )
}
