import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Package, Terminal, Mic, MousePointer, Sparkles, Clock, RefreshCw,
  Globe, Image, Video, Clipboard, Palette, QrCode, Settings,
  Zap, ArrowRight, LayoutGrid, History, Info, Languages, Camera, Inbox, Radar
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToolUsage, ToolUsage } from '@/lib/useToolUsage'
import { tools } from '@/data/tools'
import { ToolDefinition } from '../../../shared/types'

interface DashboardProps {
  onNavigate?: (page: string) => void
  searchTerm?: string
}

const iconMap: Record<string, any> = {
  Package, Terminal, Mic, MousePointer, Image, Globe, Clock, Settings, Video, Clipboard, Palette, QrCode, Languages, Camera, Inbox, Radar
}

const toolGradientMap: Record<string, string> = {
  'quick-installer': 'from-blue-500 to-indigo-500',
  'rename-tool': 'from-violet-500 to-purple-600',
  'autoclicker': 'from-amber-500 to-orange-600',
  'capswriter': 'from-rose-500 to-pink-600',
  'image-processor': 'from-emerald-500 to-teal-600',
  'web-activator': 'from-indigo-500 to-blue-600',
  'flip-clock': 'from-slate-500 to-gray-600',
  'config-checker': 'from-cyan-500 to-blue-600',
  'screen-recorder': 'from-red-500 to-rose-600',
  'clipboard-manager': 'from-yellow-500 to-amber-600',
  'color-picker': 'from-pink-500 to-fuchsia-600',
  'qr-generator': 'from-green-500 to-emerald-600',
  'screenshot-tool': 'from-blue-400 to-cyan-500',
  'file-dropover': 'from-indigo-400 to-purple-500',
  'translator': 'from-purple-500 to-pink-500',
  'network-radar': 'from-blue-600 to-cyan-600'
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, searchTerm = '' }) => {
  const { getRecentTools, recordUsage } = useToolUsage()
  const recentTools = getRecentTools(6)
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')
  const [systemInfo, setSystemInfo] = useState<any>(null)

  const toolCategories = useMemo(() => Array.from(new Set(tools.map(t => t.category))), [])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了'
    if (hour < 9) return '早上好'
    if (hour < 12) return '上午好'
    if (hour < 14) return '中午好'
    if (hour < 18) return '下午好'
    if (hour < 22) return '晚上好'
    return '夜深了'
  }, [])

  const fetchSystemInfo = useCallback(async () => {
    if (window.electron?.systemConfig) {
      const res = await window.electron.systemConfig.getSystemConfig()
      if (res.success && res.data) setSystemInfo(res.data)
    }
  }, [])

  useEffect(() => {
    fetchSystemInfo()
  }, [fetchSystemInfo])

  const filteredTools = useMemo(() => {
    return tools.filter(tool => {
      const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = selectedCategory === '全部' || tool.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [searchTerm, selectedCategory])

  const handleToolClick = (tool: ToolDefinition) => {
    recordUsage({ id: tool.id, name: tool.name, icon: tool.icon })
    onNavigate?.(tool.id)
  }

  const handleRecentClick = (tool: ToolUsage) => {
    recordUsage({ id: tool.id, name: tool.name, icon: tool.icon })
    onNavigate?.(tool.id)
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-5xl font-black tracking-tighter">
            {greeting}, <span className="bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent italic">Explorer</span>
          </h1>
          <p className="text-muted-foreground font-bold flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500 fill-amber-500" />
            今天想处理点什么？OneTool 已为你准备就绪。
          </p>
        </div>
        <div className="flex bg-white/50 dark:bg-white/5 backdrop-blur-md p-1 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">System Online</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black flex items-center gap-2">
                <LayoutGrid size={20} className="text-indigo-500" />
                工具库
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {['全部', ...toolCategories].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-black transition-all whitespace-nowrap border-2",
                      selectedCategory === cat
                        ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredTools.map(tool => {
                const Icon = iconMap[tool.icon] || Package
                const gradient = toolGradientMap[tool.id] || 'from-zinc-500 to-zinc-600'
                return (
                  <Card
                    key={tool.id}
                    onClick={() => handleToolClick(tool)}
                    className="glass-card group cursor-pointer border-none transition-all duration-500 hover:scale-[1.02] hover:shadow-indigo-500/10"
                  >
                    <CardContent className="p-6 flex items-center gap-5">
                      <div className={cn("w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg transition-transform duration-500 group-hover:rotate-12", gradient)}>
                        <Icon size={24} className="fill-white/20" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-base tracking-tight mb-0.5">{tool.name}</h3>
                        <p className="text-xs text-muted-foreground font-medium line-clamp-1">{tool.description}</p>
                      </div>
                      <ArrowRight size={18} className="text-muted-foreground opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <Card className="glass-card border-none overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -mr-16 -mt-16" />
            <CardHeader>
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <History size={18} className="text-purple-500" />
                最近使用
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentTools.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {recentTools.slice(0, 6).map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => handleRecentClick(tool)}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-muted/30 hover:bg-indigo-500/10 hover:text-indigo-500 transition-all group"
                    >
                      <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-110", toolGradientMap[tool.id] || 'from-zinc-500 to-zinc-600')}>
                        {(() => {
                          const Icon = iconMap[tool.icon] || Package
                          return <Icon size={18} />
                        })()}
                      </div>
                      <span className="text-[10px] font-black truncate w-full text-center">{tool.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-xs font-bold text-muted-foreground opacity-50 italic">尚未开启任何工具</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-none bg-gradient-to-br from-zinc-900 to-black text-white rounded-[2rem]">
            <CardHeader>
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <Zap size={18} className="text-amber-400 fill-amber-400" />
                系统状态
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {systemInfo ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase opacity-50">
                      <span>Processor</span>
                    </div>
                    <div className="text-sm font-bold truncate tracking-tight">{systemInfo.cpu}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase opacity-50">
                      <span>Graphics</span>
                    </div>
                    <div className="text-sm font-bold truncate tracking-tight">{systemInfo.gpu.split('\n')[0]}</div>
                  </div>
                  <div className="pt-4 flex items-center justify-between border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Engine V1.0.4</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchSystemInfo} className="h-8 w-8 p-0 hover:bg-white/10 rounded-full">
                      <RefreshCw size={14} />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-10 animate-pulse">
                  <div className="text-xs font-black uppercase tracking-widest opacity-30">Auditing Hardware...</div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 space-y-4">
            <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
              <Info size={14} />
              快捷提示
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              所有工具均支持全局快捷键。您可以在设置中自定义这些热键，以获得最快的工作流体验。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
