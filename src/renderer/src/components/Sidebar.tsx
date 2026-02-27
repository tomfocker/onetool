import React from 'react'
import {
  LayoutDashboard, Package, Terminal, MousePointer, Mic,
  Globe, Clock, Settings, Image, Video, Clipboard, Palette, QrCode, Radar, Inbox, Languages, Camera
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, name: '仪表盘' },
  { type: 'separator', name: '系统维护' },
  { id: 'quick-installer', icon: Package, name: '极速装机' },
  { id: 'config-checker', icon: Settings, name: '配置检测' },
  { id: 'settings', icon: Settings, name: '偏好设置' },
  { type: 'separator', name: '日常办公' },
  { id: 'rename-tool', icon: Terminal, name: '批量重命名' },
  { id: 'clipboard-manager', icon: Clipboard, name: '剪贴板管理' },
  { id: 'file-dropover', icon: Inbox, name: '文件传送门' },
  { type: 'separator', name: '媒体处理' },
  { id: 'screenshot-tool', icon: Camera, name: '叠加截图' },
  { id: 'screen-recorder', icon: Video, name: '屏幕录制' },
  { id: 'image-processor', icon: Image, name: '图片处理' },
  { id: 'color-picker', icon: Palette, name: '取色器' },
  { type: 'separator', name: '实用工具' },
  { id: 'autoclicker', icon: MousePointer, name: '鼠标连点器' },
  { id: 'capswriter', icon: Mic, name: 'CapsWriter 语音' },
  { id: 'web-activator', icon: Globe, name: '网页激活器' },
  { id: 'translator', icon: Languages, name: '截屏翻译' },
  { id: 'qrcode-tool', icon: QrCode, name: '二维码生成' },
  { id: 'flip-clock', icon: Clock, name: '翻页时钟' }
]

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate }) => {
  return (
    <aside className="w-64 h-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border-r border-zinc-200 dark:border-zinc-800 flex flex-col z-20">
      <div className="p-8">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Package className="text-white" size={22} />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-lg tracking-tight">OneTool</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest -mt-1">Toolbox v1.0</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-8 scrollbar-none">
        <div className="space-y-1">
          {navItems.map((item, index) => {
            if ('type' in item && item.type === 'separator') {
              return (
                <div key={`sep-${index}`} className="px-4 pt-6 pb-2">
                  <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.2em]">
                    {item.name}
                  </span>
                </div>
              )
            }

            const navItem = item as { id: string, icon: any, name: string }
            const Icon = navItem.icon
            const active = currentPage === navItem.id
            
            return (
              <button
                key={navItem.id}
                onClick={() => onNavigate(navItem.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative",
                  active 
                    ? "bg-indigo-500 text-white shadow-xl shadow-indigo-500/20" 
                    : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-foreground"
                )}
              >
                <div className={cn("transition-transform duration-300", active ? "scale-110" : "group-hover:scale-110")}>
                  <Icon size={18} />
                </div>
                <span className="text-sm font-bold tracking-tight">{navItem.name}</span>
                {active && (
                  <div className="absolute right-3 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                )}
              </button>
            )
          })}
        </div>
      </nav>

      <div className="p-6 border-t border-zinc-200 dark:border-zinc-800">
        <div className="text-[10px] text-center text-muted-foreground font-bold uppercase tracking-widest opacity-50">
          Built with Love & Precision
        </div>
      </div>
    </aside>
  )
}
