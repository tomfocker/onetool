import React from 'react'
import { 
  Settings, Cpu, HardDrive, ShieldCheck, Activity, Globe,
  Terminal, Layout, List, TerminalSquare, Database, Monitor,
  ExternalLink, Info, AlertTriangle, Key, Network, Star,
  SlidersHorizontal, Users, Sparkles, Shield, Volume2, MousePointer,
  KeyRound, LockKeyhole
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useStore } from '@/hooks/useStore'
import {
  categoryNames,
  categoryOrder,
  getPinnedToolIds,
  getPinnedSystemTools,
  groupSystemToolsByCategory,
  SystemTool
} from './windowsManagerData'

const iconMap = {
  Settings,
  Cpu,
  HardDrive,
  ShieldCheck,
  Activity,
  Globe,
  Terminal,
  Layout,
  List,
  TerminalSquare,
  Database,
  Monitor,
  Info,
  Network,
  SlidersHorizontal,
  Users,
  Sparkles,
  Shield,
  Volume2,
  MousePointer,
  KeyRound,
  LockKeyhole
}

export default function WindowsManagerTool() {
  const [loadingId, setLoadingId] = React.useState<string | null>(null)
  const { store, setStoreValue } = useStore()
  const groupedTools = React.useMemo(() => groupSystemToolsByCategory(), [])
  const pinnedToolIds = React.useMemo(() => getPinnedToolIds(store?.windowsManagerFavorites), [store?.windowsManagerFavorites])
  const pinnedTools = React.useMemo(() => getPinnedSystemTools(store?.windowsManagerFavorites), [store?.windowsManagerFavorites])

  const getToolIcon = (tool: SystemTool) => iconMap[tool.iconKey as keyof typeof iconMap] ?? Settings

  const handleOpenTool = async (tool: SystemTool) => {
    setLoadingId(tool.id)
    try {
      console.log(`[WindowsManager] Requesting tool: ${tool.name} (${tool.command})`)
      if (window.electron?.systemConfig) {
        const res = await window.electron.systemConfig.executeCommand(tool.command)
        if (!res.success) {
          console.error(`[WindowsManager] Failed to launch:`, res.error)
          alert(`启动失败: ${res.error}`)
        }
      } else {
        console.error(`[WindowsManager] systemConfig API not found`)
        alert('系统接口未就绪，请稍后重试')
      }
    } catch (err) {
      console.error(`[WindowsManager] Error:`, err)
    } finally {
      // 延迟清除加载状态，给用户一点视觉反馈
      setTimeout(() => setLoadingId(null), 500)
    }
  }

  const handleTogglePinned = async (toolId: string) => {
    const isPinned = pinnedToolIds.includes(toolId)
    const nextPinnedIds = isPinned
      ? pinnedToolIds.filter((id) => id !== toolId)
      : [...pinnedToolIds, toolId]

    await setStoreValue('windowsManagerFavorites', nextPinnedIds)
  }

  const renderToolCard = (tool: SystemTool, emphasis: 'default' | 'pinned' = 'default') => {
    const Icon = getToolIcon(tool)
    const isLoading = loadingId === tool.id
    const isPinned = pinnedToolIds.includes(tool.id)

    return (
      <Card 
        key={tool.id} 
        className={cn(
          "glass-card group hover:scale-[1.02] transition-all duration-300 border-none cursor-pointer overflow-hidden relative",
          emphasis === 'pinned' && "bg-gradient-to-br from-amber-500/10 via-white/70 to-indigo-500/5 dark:from-amber-500/10 dark:via-zinc-900/70 dark:to-indigo-500/10",
          isLoading && "opacity-70 scale-95"
        )}
        onClick={() => !isLoading && handleOpenTool(tool)}
      >
        <div className={cn(
          "absolute top-0 right-0 w-24 h-24 blur-2xl -mr-12 -mt-12 transition-colors",
          emphasis === 'pinned' ? "bg-amber-400/10 group-hover:bg-amber-400/20" : "bg-indigo-500/5 group-hover:bg-indigo-500/10"
        )} />
        <CardContent className={cn("p-5", emphasis === 'pinned' && "p-6")}>
          <div className="flex items-start gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300",
              emphasis === 'pinned' && "bg-amber-500/10 text-amber-500 group-hover:bg-amber-500",
              isLoading && "animate-pulse bg-indigo-500 text-white"
            )}>
              <Icon size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className={cn("font-black text-sm text-zinc-900 dark:text-zinc-100", emphasis === 'pinned' && "text-base")}>
                      {tool.name}
                    </h4>
                    {isPinned && (
                      <Star size={13} className="text-amber-500 fill-amber-400 shrink-0" />
                    )}
                  </div>
                  {emphasis === 'pinned' && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/30 text-amber-600 bg-amber-500/5">
                      已置顶
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 w-8 p-0 rounded-full text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500",
                      isPinned && "text-amber-500"
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleTogglePinned(tool.id)
                    }}
                    title={isPinned ? '取消置顶' : '置顶到顶部'}
                  >
                    <Star size={15} className={cn(isPinned && "fill-amber-400")} />
                  </Button>
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                  ) : (
                    <ExternalLink size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
              <p className={cn("text-xs text-muted-foreground font-bold line-clamp-2 mb-3", emphasis === 'pinned' && "text-[13px]")}>
                {tool.description}
              </p>
              <div className="flex items-center gap-2">
                <code className="text-[10px] px-1.5 py-0.5 bg-muted/50 rounded font-mono text-indigo-500 dark:text-indigo-400">
                  {tool.command}
                </code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <Settings className="text-indigo-500" size={32} />
          Windows 管理面板
        </h2>
        <p className="text-muted-foreground font-bold flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-500" />
          快速唤起系统原生命令入口，点击星标即可置顶或取消置顶。
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-amber-500 fill-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-widest opacity-70">已置顶</h3>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600/70">
            点击星标可置顶/取消
          </span>
        </div>
        {pinnedTools.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {pinnedTools.map((tool) => renderToolCard(tool, 'pinned'))}
          </div>
        ) : (
          <Card className="glass-card border-dashed border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-6 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-black">还没有置顶的命令</h4>
                <p className="text-xs font-bold text-muted-foreground">
                  在下方分类里点卡片右上角星标，就会出现在这里。
                </p>
              </div>
              <Star size={18} className="text-amber-500" />
            </CardContent>
          </Card>
        )}
      </section>

      <div className="space-y-8 pb-20">
        {categoryOrder.map((category) => (
          <section key={category} className="space-y-4">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
                <h3 className="text-sm font-black uppercase tracking-widest opacity-60">
                  {categoryNames[category]}
                </h3>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-35">
                {groupedTools[category].length} 项
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {groupedTools[category].map((tool) => renderToolCard(tool))}
            </div>
          </section>
        ))}
      </div>

      <Card className="glass-card border-indigo-500/10 shadow-sm">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="space-y-1">
              <h5 className="font-black text-sm flex items-center gap-2">
                操作提示
                <Key size={13} className="text-indigo-500" />
              </h5>
              <p className="text-xs font-bold leading-relaxed opacity-80">
                某些高级工具需要管理员权限，少数组件还受 Windows 版本限制。若未成功打开，通常是 UAC 或系统版本导致。
              </p>
            </div>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest opacity-35">
            Administrative Tools
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
