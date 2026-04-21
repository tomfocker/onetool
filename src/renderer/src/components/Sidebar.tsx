import React from 'react'
import {
  LayoutDashboard, Package, Terminal, MousePointer, Mic,
  Globe, Clock, Settings, Image, Video, Clipboard, Palette, QrCode, Radar, Inbox, Languages, Camera, ShieldCheck, TerminalSquare, Star, Code, CloudDownload, PanelTop
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { tools } from '@/data/tools'
import { useGlobalStore } from '@/store'
import { normalizePinnedToolIds } from '../../../shared/devEnvironment'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

const iconMap: Record<string, any> = {
  LayoutDashboard, Package, Terminal, MousePointer, Mic,
  Globe, Clock, Settings, Image, Video, Clipboard, Palette, QrCode, Radar, Inbox, Languages, Camera, ShieldCheck, TerminalSquare, Star, Code, CloudDownload, PanelTop
}

const categories = ['系统维护', '日常办公', '媒体处理', '实用工具']

export function buildSidebarSections(
  toolList: Array<{ id: string; name: string; category: string; icon: string }>,
  pinnedToolIds: string[]
) {
  const validToolIds = toolList.map((tool) => tool.id)
  const normalizedPinnedToolIds = normalizePinnedToolIds(pinnedToolIds, validToolIds)
  const pinnedIdSet = new Set(normalizedPinnedToolIds)
  const pinnedItems = normalizedPinnedToolIds
    .map((id) => toolList.find((tool) => tool.id === id))
    .filter(Boolean)

  const sections: Array<{
    id: string
    label: string
    items: Array<{ id: string; name: string; category: string; icon: string }>
  }> = []
  if (pinnedItems.length > 0) {
    sections.push({ id: 'pinned', label: '常用工具', items: pinnedItems as Array<{ id: string; name: string; category: string; icon: string }> })
  }

  categories.forEach((category) => {
    sections.push({
      id: `category-${category}`,
      label: category,
      items: toolList.filter((tool) => tool.category === category && !pinnedIdSet.has(tool.id))
    })
  })

  return sections
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate }) => {
  const pinnedToolIds = useGlobalStore((state) => state.pinnedToolIds)
  const togglePinnedToolId = useGlobalStore((state) => state.togglePinnedToolId)
  const sections = buildSidebarSections(tools, pinnedToolIds)
  const validToolIds = tools.map((tool) => tool.id)

  return (
    <aside className="w-64 h-full bg-white/80 dark:bg-zinc-900/60 backdrop-blur-2xl border-r border-zinc-200 dark:border-zinc-800/50 flex flex-col z-20">
      <div className="pt-14 px-8 pb-4">
        <div className="flex items-center gap-3 px-2">
          <div
            className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/10 cursor-pointer overflow-hidden border border-zinc-200 dark:border-zinc-700 transition-transform hover:scale-105 active:scale-95"
            onClick={() => onNavigate('dashboard')}
          >
            <img src="icon.png" alt="OneTool" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-lg tracking-tight">OneTool</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest -mt-1">Platform v1.0</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pr-1 pb-8 sidebar-scroll">
        <div className="space-y-1">
          <button
            onClick={() => onNavigate('dashboard')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative mb-4 mt-10",
              currentPage === 'dashboard'
                ? "bg-indigo-500 text-white shadow-xl shadow-indigo-500/20"
                : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-foreground"
            )}
          >
            <LayoutDashboard size={18} />
            <span className="text-sm font-bold tracking-tight">仪表盘总览</span>
          </button>

          {sections.map(section => (
            <div key={section.id} className="space-y-1">
              <div className="px-4 pt-6 pb-2">
                <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.2em]">
                  {section.label}
                </span>
              </div>
              {section.items.map(tool => {
                const Icon = iconMap[tool.icon] || Package
                const active = currentPage === tool.id
                const pinned = pinnedToolIds.includes(tool.id)
                return (
                  <button
                    key={tool.id}
                    onClick={() => onNavigate(tool.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative",
                      active
                        ? "bg-indigo-500 text-white shadow-xl shadow-indigo-500/20"
                        : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    <Icon size={18} />
                    <span className="text-sm font-bold tracking-tight">{tool.name}</span>
                    <span
                      className={cn(
                        "ml-auto mr-4 rounded-full p-1 transition-colors",
                        pinned ? "text-yellow-300" : "text-muted-foreground/50 hover:text-foreground"
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        void togglePinnedToolId(tool.id, validToolIds)
                      }}
                    >
                      <Star size={14} fill={pinned ? 'currentColor' : 'none'} />
                    </span>
                    {active && <div className="absolute right-3 w-1.5 h-1.5 bg-white rounded-full" />}
                  </button>
                )
              })}
            </div>
          ))}

          <div className="px-4 pt-6 pb-2">
            <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.2em]">配置</span>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative",
              currentPage === 'settings'
                ? "bg-indigo-500 text-white shadow-xl shadow-indigo-500/20"
                : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-foreground"
            )}
          >
            <Settings size={18} />
            <span className="text-sm font-bold tracking-tight">偏好设置</span>
          </button>
        </div>
      </nav>

      <div className="p-6 border-t border-zinc-200 dark:border-zinc-800/50">
        <div className="text-[10px] text-center text-muted-foreground font-bold uppercase tracking-widest opacity-50">
          Engineered for Efficiency
        </div>
      </div>
    </aside>
  )
}
