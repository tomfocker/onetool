import React, { useState, useEffect, useMemo } from 'react'
import {
  Package, Terminal, Mic, MousePointer, Sparkles, Clock,
  Search, Filter, Download, Check, RefreshCw, Cloud, HardDrive,
  Globe, Image, Video, Clipboard, Palette, QrCode, Settings
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToolUsage, ToolUsage } from '@/lib/useToolUsage'
import { toolComponents, toolCategories, ToolComponent } from '@/data/toolComponents'

interface DashboardProps {
  onNavigate?: (page: string) => void
}

const iconMap: Record<string, React.ReactNode> = {
  'Package': <Package className="h-5 w-5" />,
  'Terminal': <Terminal className="h-5 w-5" />,
  'MousePointer': <MousePointer className="h-5 w-5" />,
  'Mic': <Mic className="h-5 w-5" />,
  'Image': <Image className="h-5 w-5" />,
  'Globe': <Globe className="h-5 w-5" />,
  'Clock': <Clock className="h-5 w-5" />,
  'Scan': <Settings className="h-5 w-5" />,
  'Video': <Video className="h-5 w-5" />,
  'Clipboard': <Clipboard className="h-5 w-5" />,
  'Palette': <Palette className="h-5 w-5" />,
  'QrCode': <QrCode className="h-5 w-5" />,
}

const toolGradientMap: Record<string, string> = {
  'quick-installer': 'from-blue-500 to-cyan-400',
  'rename-tool': 'from-violet-500 to-purple-400',
  'autoclicker': 'from-amber-500 to-orange-400',
  'capswriter': 'from-rose-500 to-pink-400',
  'image-processor': 'from-emerald-500 to-teal-400',
  'web-activator': 'from-indigo-500 to-blue-400',
  'flip-clock': 'from-slate-500 to-gray-400',
  'config-checker': 'from-cyan-500 to-blue-400',
  'screen-recorder': 'from-red-500 to-orange-400',
  'clipboard-manager': 'from-yellow-500 to-amber-400',
  'color-picker': 'from-pink-500 to-rose-400',
  'qr-generator': 'from-green-500 to-emerald-400',
}

const getUsageTime = (): { days: number; hours: number } => {
  const storedDate = localStorage.getItem('toolbox-first-use')
  const now = new Date()
  
  if (!storedDate) {
    localStorage.setItem('toolbox-first-use', now.toISOString())
    return { days: 0, hours: 0 }
  }
  
  const firstUse = new Date(storedDate)
  const diffMs = now.getTime() - firstUse.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  
  return { days, hours }
}

const getGreeting = (): string => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 9) return '早上好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 22) return '晚上好'
  return '夜深了'
}

interface RecentToolCardProps {
  tool: ToolUsage
  onClick?: () => void
}

const RecentToolCard: React.FC<RecentToolCardProps> = ({ tool, onClick }) => {
  const gradient = toolGradientMap[tool.id] || 'from-gray-500 to-gray-400'
  const icon = iconMap[tool.icon] || <Package className="h-5 w-5" />
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-xl',
        'bg-white/40 dark:bg-white/5 backdrop-blur-sm',
        'border border-white/20 dark:border-white/10',
        'hover:bg-white/60 dark:hover:bg-white/10',
        'transition-all duration-300 ease-apple',
        'hover:-translate-y-1 hover:shadow-soft',
        'group'
      )}
    >
      <div className={cn(
        'p-3 rounded-xl backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-soft-sm',
        'transition-all duration-500 ease-apple',
        'group-hover:scale-110 group-hover:shadow-soft',
        'bg-gradient-to-br',
        gradient
      )}>
        <div className="text-white">{icon}</div>
      </div>
      <span className="text-xs font-medium text-center truncate w-full">{tool.name}</span>
    </button>
  )
}

interface ToolComponentCardProps {
  component: ToolComponent
  isDownloading: boolean
  downloadProgress: number
  onDownload: () => void
  onOpen: () => void
  onCheckUpdate: () => void
}

const ToolComponentCard: React.FC<ToolComponentCardProps> = ({
  component,
  isDownloading,
  downloadProgress,
  onDownload,
  onOpen,
  onCheckUpdate
}) => {
  const icon = iconMap[component.icon] || <Package className="h-5 w-5" />
  const sizeText = component.size >= 100 ? `${component.size}MB (云端)` : `${component.size}MB`
  
  return (
    <Card className={cn(
      'group overflow-hidden transition-all duration-300',
      'hover:-translate-y-1 hover:shadow-soft-lg',
      component.installed && 'ring-2 ring-primary/30'
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {icon}
            </div>
            <div>
              <h4 className="font-medium text-sm">{component.name}</h4>
              <p className="text-xs text-muted-foreground">{component.category}</p>
            </div>
          </div>
          {component.installed && (
            <Badge variant="secondary" className="text-xs">
              <Check className="h-3 w-3 mr-1" />
              已安装
            </Badge>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          {component.description}
        </p>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            {component.size >= 100 ? (
              <Cloud className="h-3 w-3" />
            ) : (
              <HardDrive className="h-3 w-3" />
            )}
            <span>{sizeText}</span>
          </div>
          <span>v{component.version}</span>
        </div>
        
        {isDownloading && (
          <div className="mb-3">
            <Progress value={downloadProgress} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1 text-center">
              下载中... {downloadProgress}%
            </p>
          </div>
        )}
        
        <div className="flex gap-2">
          {component.installed ? (
            <>
              <Button
                size="sm"
                className="flex-1 text-xs"
                onClick={onOpen}
              >
                打开
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={onCheckUpdate}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="flex-1 text-xs"
              onClick={onDownload}
              disabled={isDownloading}
            >
              <Download className="h-3 w-3 mr-1" />
              {isDownloading ? '下载中' : '下载'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [usageTime, setUsageTime] = useState({ days: 0, hours: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')
  const [installedComponents, setInstalledComponents] = useState<Set<string>>(new Set())
  const [downloadingComponents, setDownloadingComponents] = useState<Map<string, number>>(new Map())
  
  const { getRecentTools } = useToolUsage()
  const recentTools = getRecentTools(8)

  useEffect(() => {
    setUsageTime(getUsageTime())
    const installed = toolComponents.filter(c => c.installed).map(c => c.id)
    setInstalledComponents(new Set(installed))
  }, [])

  const filteredComponents = useMemo(() => {
    return toolComponents.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = selectedCategory === '全部' || c.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [searchQuery, selectedCategory])

  const handleDownload = async (component: ToolComponent) => {
    setDownloadingComponents(prev => new Map(prev).set(component.id, 0))
    
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200))
      setDownloadingComponents(prev => new Map(prev).set(component.id, i))
    }
    
    setDownloadingComponents(prev => {
      const newMap = new Map(prev)
      newMap.delete(component.id)
      return newMap
    })
    
    setInstalledComponents(prev => new Set(prev).add(component.id))
  }

  const handleOpen = (componentId: string) => {
    onNavigate?.(componentId)
  }

  const handleCheckUpdate = (component: ToolComponent) => {
    console.log('检查更新:', component.name)
  }

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/10 backdrop-blur-sm border border-white/20 dark:border-white/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className='text-2xl font-bold'>仪表盘</h2>
            <p className='text-muted-foreground text-sm'>
              {getGreeting()}，onetool 已陪伴您 {usageTime.days} 天 {usageTime.hours} 小时
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">最近使用</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">
              按使用频率排序
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {recentTools.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
              {recentTools.map(tool => (
                <RecentToolCard
                  key={tool.id}
                  tool={tool}
                  onClick={() => onNavigate?.(tool.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无使用记录</p>
              <p className="text-xs">开始使用工具后，这里会显示您常用的工具</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">工具组件</CardTitle>
            </div>
          </div>
          <CardDescription>浏览并安装 onetool 扩展组件</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="搜索工具..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex gap-1.5">
                <Button
                  variant={selectedCategory === '全部' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setSelectedCategory('全部')}
                >
                  全部
                </Button>
                {toolCategories.map(cat => (
                  <Button
                    key={cat}
                    variant={selectedCategory === cat ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7 whitespace-nowrap"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredComponents.map(component => (
              <ToolComponentCard
                key={component.id}
                component={{
                  ...component,
                  installed: installedComponents.has(component.id)
                }}
                isDownloading={downloadingComponents.has(component.id)}
                downloadProgress={downloadingComponents.get(component.id) || 0}
                onDownload={() => handleDownload(component)}
                onOpen={() => handleOpen(component.id)}
                onCheckUpdate={() => handleCheckUpdate(component)}
              />
            ))}
          </div>

          {filteredComponents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">未找到匹配的工具</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
