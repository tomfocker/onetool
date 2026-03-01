import React from 'react'
import { 
  Settings, Cpu, HardDrive, ShieldCheck, Activity, Globe, 
  Terminal, Layout, List, TerminalSquare, Database, Monitor, 
  Search, ExternalLink, Info, AlertTriangle, Key, Network
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SystemTool {
  id: string
  name: string
  description: string
  command: string
  icon: any
  category: 'Common' | 'System' | 'Network' | 'Hardware' | 'Advanced'
}

const systemTools: SystemTool[] = [
  // Common
  { id: 'control', name: '控制面板', description: 'Windows 经典控制中心', command: 'control', icon: Settings, category: 'Common' },
  { id: 'taskmgr', name: '任务管理器', description: '查看进程与性能状态', command: 'taskmgr', icon: Activity, category: 'Common' },
  { id: 'regedit', name: '注册表编辑器', description: '修改系统核心配置', command: 'regedit', icon: Database, category: 'Common' },
  { id: 'cmd', name: '命令提示符', description: '经典命令行终端', command: 'cmd', icon: Terminal, category: 'Common' },
  { id: 'powershell', name: 'PowerShell', description: '现代化脚本终端', command: 'powershell', icon: TerminalSquare, category: 'Common' },
  
  // System
  { id: 'services', name: '系统服务', description: '管理后台运行的服务', command: 'services.msc', icon: List, category: 'System' },
  { id: 'msconfig', name: '系统配置', description: '管理启动项与引导配置', command: 'msconfig', icon: Layout, category: 'System' },
  { id: 'eventvwr', name: '事件查看器', description: '查看系统日志与错误', command: 'eventvwr.msc', icon: Info, category: 'System' },
  { id: 'gpedit', name: '组策略编辑器', description: '配置系统策略 (专业版)', command: 'gpedit.msc', icon: ShieldCheck, category: 'System' },
  { id: 'compmgmt', name: '计算机管理', description: '综合管理控制台', command: 'compmgmt.msc', icon: Monitor, category: 'System' },
  
  // Hardware
  { id: 'devmgmt', name: '设备管理器', description: '管理驱动与硬件设备', command: 'devmgmt.msc', icon: Cpu, category: 'Hardware' },
  { id: 'diskmgmt', name: '磁盘管理', description: '分区、格式化与卷管理', command: 'diskmgmt.msc', icon: HardDrive, category: 'Hardware' },
  { id: 'resmon', name: '资源监视器', description: '深度分析硬件资源占用', command: 'resmon', icon: Activity, category: 'Hardware' },
  
  // Network
  { id: 'ncpa', name: '网络连接', description: '管理适配器与网络设置', command: 'ncpa.cpl', icon: Network, category: 'Network' },
  
  // Advanced
  { id: 'appwiz', name: '程序和功能', description: '卸载程序或启用功能', command: 'appwiz.cpl', icon: List, category: 'Advanced' },
  { id: 'sysdm', name: '系统属性', description: '环境变量、远程、高级设置', command: 'sysdm.cpl', icon: Settings, category: 'Advanced' },
]

const categoryNames = {
  Common: '常用入口',
  System: '系统管理',
  Network: '网络配置',
  Hardware: '硬件管理',
  Advanced: '高级工具'
}

export default function WindowsManagerTool() {
  const [loadingId, setLoadingId] = React.useState<string | null>(null)

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

  const renderToolCard = (tool: SystemTool) => {
    const Icon = tool.icon
    const isLoading = loadingId === tool.id
    
    return (
      <Card 
        key={tool.id} 
        className={cn(
          "glass-card group hover:scale-[1.02] transition-all duration-300 border-none cursor-pointer overflow-hidden relative",
          isLoading && "opacity-70 scale-95"
        )}
        onClick={() => !isLoading && handleOpenTool(tool)}
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-2xl -mr-12 -mt-12 group-hover:bg-indigo-500/10 transition-colors" />
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300",
              isLoading && "animate-pulse bg-indigo-500 text-white"
            )}>
              <Icon size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-black text-sm text-zinc-900 dark:text-zinc-100">{tool.name}</h4>
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                ) : (
                  <ExternalLink size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
              <p className="text-xs text-muted-foreground font-bold line-clamp-1 mb-2">{tool.description}</p>
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
          快速唤起系统原生管理工具，并标注标准运行命令。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
        {(Object.keys(categoryNames) as Array<keyof typeof categoryNames>).map((category) => (
          <div key={category} className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
              <h3 className="text-sm font-black uppercase tracking-widest opacity-60">
                {categoryNames[category]}
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {systemTools
                .filter((tool) => tool.category === category)
                .map((tool) => renderToolCard(tool))}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-10 right-10 flex flex-col gap-4 max-w-xs p-6 glass-card rounded-2xl border-indigo-500/20 shadow-2xl animate-in slide-in-from-right-4 duration-500">
        <div className="flex items-center gap-3 text-amber-500">
          <AlertTriangle size={20} />
          <h5 className="font-black text-sm">操作提示</h5>
        </div>
        <p className="text-xs font-bold leading-relaxed opacity-80">
          某些高级工具（如注册表、组策略）需要管理员权限。如果 OneTool 未以管理员身份运行，启动时可能触发 UAC 提示。
        </p>
        <div className="pt-2 flex items-center gap-2">
          <Key size={14} className="text-indigo-500" />
          <span className="text-[10px] font-black uppercase tracking-tighter opacity-40">Administrative Tools</span>
        </div>
      </div>
    </div>
  )
}
