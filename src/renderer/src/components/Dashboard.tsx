import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Package, Terminal, Mic, MousePointer, Sparkles, Clock, RefreshCw,
  Globe, Image, Video, Clipboard, Palette, QrCode, Settings,
  Zap, ArrowRight, LayoutGrid, History, Info, Languages, Camera,
  Inbox, Radar, Search, Sun, Moon
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useToolUsage, ToolUsage } from '@/lib/useToolUsage'
import { tools } from '@/data/tools'
import { ToolDefinition } from '../../../shared/types'
import { useGlobalStore } from '@/store'

interface DashboardProps {
  onNavigate?: (page: string) => void
  searchTerm?: string
  onSearchChange?: (value: string) => void
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

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, searchTerm = '', onSearchChange }) => {
  const { getRecentTools, recordUsage } = useToolUsage()
  const { theme, toggleTheme } = useGlobalStore()
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

  const [realtimeStats, setRealtimeStats] = useState<any>(null)

  const fetchRealtimeStats = useCallback(async () => {
    if (window.electron?.systemConfig) {
      const res = await (window.electron.systemConfig as any).getRealtimeStats()
      if (res.success && res.data) setRealtimeStats(res.data)
    }
  }, [])

  useEffect(() => {
    fetchRealtimeStats()
    const timer = setInterval(fetchRealtimeStats, 3000)
    return () => clearInterval(timer)
  }, [fetchRealtimeStats])

  const companionDays = useMemo(() => {
    if (!systemInfo?.installTime) return 0
    const diff = Date.now() - systemInfo.installTime
    return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)))
  }, [systemInfo])

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between flex-1 gap-6">
          <div className="space-y-2.5">
            <h1 className="text-4xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100">
              {greeting}
            </h1>
            <p className="text-muted-foreground font-bold flex items-center gap-2 text-sm opacity-80">
              <Sparkles size={16} className="text-amber-500 fill-amber-500" />
              今天想处理点什么？OneTool 已为您准备就绪。
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-indigo-500" />
              <Input
                placeholder="搜索工具..."
                value={searchTerm || ''}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pl-10 h-11 bg-white/40 dark:bg-white/5 border-zinc-200/50 dark:border-white/10 rounded-2xl focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500/50 backdrop-blur-md transition-all font-bold placeholder:font-bold"
              />
            </div>

            <div className="flex items-center gap-2 p-1.5 bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-zinc-200/50 dark:border-white/10 shadow-sm">
              <Sun className={cn("w-4 h-4 transition-colors", theme === 'light' ? "text-amber-500" : "text-muted-foreground/30")} />
              <button
                onClick={toggleTheme}
                className="relative w-11 h-6 bg-zinc-200 dark:bg-zinc-800 rounded-full transition-colors cursor-pointer group border border-zinc-300 dark:border-zinc-700"
              >
                <div className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-zinc-400 rounded-full shadow-md transition-transform duration-300",
                  theme === 'dark' ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
              <Moon className={cn("w-4 h-4 transition-colors", theme === 'dark' ? "text-indigo-400" : "text-muted-foreground/30")} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-2xl border border-indigo-500/20 shadow-sm">
            <Clock size={15} className="text-indigo-500" />
            <span className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">已陪伴您 {companionDays} 天</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-2xl border border-zinc-200/50 dark:border-white/10 shadow-sm">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <span className="text-[11px] font-black uppercase tracking-widest opacity-60">System Online</span>
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

          <Card className="glass-card border-none relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-400/10 blur-2xl -mr-12 -mt-12" />
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-black flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-amber-500 fill-amber-500" />
                  系统状态
                </div>
                <Button variant="ghost" size="sm" onClick={fetchRealtimeStats} className="h-8 w-8 p-0 rounded-full hover:bg-indigo-500/10 text-indigo-500">
                  <RefreshCw size={14} className={cn(realtimeStats ? "animate-none" : "animate-spin")} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {realtimeStats ? (
                <div className="space-y-4">
                  {/* CPU Section */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase opacity-60">CPU Load</span>
                        {realtimeStats.cpuTemp > 0 && (
                          <Badge variant="outline" className="h-4 text-[9px] px-1 border-amber-500/20 text-amber-600 bg-amber-500/5">
                            {Math.round(realtimeStats.cpuTemp)}°C
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs font-black">{realtimeStats.cpuLoad}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${realtimeStats.cpuLoad}%` }} />
                    </div>
                  </div>

                  {/* GPU Section */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase opacity-60">GPU Load</span>
                        {realtimeStats.gpuTemp > 0 && (
                          <Badge variant="outline" className="h-4 text-[9px] px-1 border-emerald-500/20 text-emerald-600 bg-emerald-500/5">
                            {realtimeStats.gpuTemp}°C
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs font-black">{realtimeStats.gpuLoad}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${realtimeStats.gpuLoad}%` }} />
                    </div>
                  </div>

                  {/* Memory Section */}
                  <div className="space-y-2 pb-1">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black uppercase opacity-60">Memory (RAM)</span>
                      <span className="text-xs font-black">{realtimeStats.memoryUsage}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 transition-all duration-1000" style={{ width: `${realtimeStats.memoryUsage}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px] font-bold opacity-40">
                      <span>{Math.round(realtimeStats.memoryUsed)} GB used</span>
                      <span>{Math.round(realtimeStats.memoryTotal)} GB total</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between opacity-50">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 truncate max-w-[150px]">
                      {realtimeStats.cpuName || systemInfo?.cpu?.split('@')[0] || 'Generic CPU'}
                    </span>
                    <span className="text-[9px] font-bold">V1.0.5</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-4">
                  <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Analyzing Core...</span>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 space-y-4 shadow-sm backdrop-blur-sm">
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
    </div >
  )
}
