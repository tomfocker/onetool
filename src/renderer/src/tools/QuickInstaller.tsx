import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Package,
  Download,
  Check,
  Terminal,
  Play,
  RotateCcw,
  CheckSquare,
  Square,
  Monitor,
  Music,
  Settings,
  Zap,
  Code,
  Globe,
  Keyboard,
  Shield,
  FileArchive
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { softwareList, softwareCategories, Software } from './softwareData'

interface LogEntry {
  id: number
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'success'
  message: string
  timestamp: Date
}

// 获取分类图标
const getCategoryIcon = (category: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    '社交与通讯': <Monitor className="w-4 h-4" />,
    '影音与娱乐': <Music className="w-4 h-4" />,
    '系统增强与文件管理': <Settings className="w-4 h-4" />,
    '生产力与效率': <Zap className="w-4 h-4" />,
    '开发与运维': <Code className="w-4 h-4" />,
    '网络、传输与浏览器': <Globe className="w-4 h-4" />,
    '输入法': <Keyboard className="w-4 h-4" />,
    '下载工具': <Download className="w-4 h-4" />,
    '安全防护': <Shield className="w-4 h-4" />
  }
  return iconMap[category] || <Package className="w-4 h-4" />
}

// 获取分类颜色
const getCategoryColor = (category: string) => {
  const colorMap: Record<string, string> = {
    '社交与通讯': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    '影音与娱乐': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    '系统增强与文件管理': 'bg-green-500/10 text-green-500 border-green-500/20',
    '生产力与效率': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    '开发与运维': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    '网络、传输与浏览器': 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    '输入法': 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    '下载工具': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    '安全防护': 'bg-red-500/10 text-red-500 border-red-500/20'
  }
  return colorMap[category] || 'bg-gray-500/10 text-gray-500 border-gray-500/20'
}

export const QuickInstaller: React.FC = () => {
  const [selectedSoftware, setSelectedSoftware] = useState<Set<string>>(new Set())
  const [isInstalling, setIsInstalling] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '' })
  const terminalRef = useRef<HTMLDivElement>(null)
  const logIdRef = useRef(0)

  // 自动滚动到终端底部
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  // 监听安装日志
  useEffect(() => {
    const unsubscribeLog = window.electron?.quickInstaller?.onInstallLog((data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          type: data.type,
          message: data.message,
          timestamp: new Date()
        }
      ])
    })

    const unsubscribeProgress = window.electron?.quickInstaller?.onInstallProgress((data) => {
      setProgress(data)
    })

    const unsubscribeComplete = window.electron?.quickInstaller?.onInstallComplete((data) => {
      setIsInstalling(false)
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          type: data.success ? 'success' : 'error',
          message: data.message,
          timestamp: new Date()
        }
      ])
    })

    return () => {
      unsubscribeLog?.()
      unsubscribeProgress?.()
      unsubscribeComplete?.()
    }
  }, [])

  const handleToggleSoftware = (id: string) => {
    setSelectedSoftware((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedSoftware.size === softwareList.length) {
      setSelectedSoftware(new Set())
    } else {
      setSelectedSoftware(new Set(softwareList.map((s) => s.id)))
    }
  }

  const handleInstall = async () => {
    if (selectedSoftware.size === 0) return

    const selectedList = softwareList.filter((s) => selectedSoftware.has(s.id))

    setIsInstalling(true)
    setLogs([])
    setProgress({ current: 0, total: selectedList.length, currentName: '' })

    try {
      await window.electron?.quickInstaller?.installSoftware(
        selectedList.map((s) => ({ id: s.id, name: s.name, source: s.source }))
      )
    } catch (error) {
      setIsInstalling(false)
      setLogs((prev) => [
        ...prev,
        {
          id: logIdRef.current++,
          type: 'error',
          message: `安装过程出错: ${error}`,
          timestamp: new Date()
        }
      ])
    }
  }

  const handleClearLogs = () => {
    setLogs([])
  }

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'stdout':
        return 'text-gray-300'
      case 'stderr':
        return 'text-red-400'
      case 'info':
        return 'text-blue-400'
      case 'error':
        return 'text-red-400'
      case 'success':
        return 'text-green-400'
      default:
        return 'text-gray-300'
    }
  }

  // 按分类分组软件
  const groupedSoftware = softwareCategories.map((category) => ({
    category,
    software: softwareList.filter((s) => s.category === category)
  }))

  return (
    <div className="space-y-6">
      {/* 标题区域 */}
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          极速装机
        </h2>
        <p className="text-muted-foreground">一键安装常用软件，快速配置新系统</p>
      </div>

      {/* 控制区 */}
      <Card className="border-0 shadow-md bg-gradient-to-r from-primary/5 to-purple-500/5">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-primary" />
                <span className="font-medium">
                  已选择 {selectedSoftware.size} / {softwareList.length} 个软件
                </span>
              </div>
              {isInstalling && progress.total > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    进度: {progress.current}/{progress.total}
                  </span>
                  {progress.currentName && (
                    <span className="text-primary">- 正在安装: {progress.currentName}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleSelectAll}
                disabled={isInstalling}
                className="gap-2"
              >
                {selectedSoftware.size === softwareList.length ? (
                  <Square className="w-4 h-4" />
                ) : (
                  <CheckSquare className="w-4 h-4" />
                )}
                {selectedSoftware.size === softwareList.length ? '取消全选' : '全选'}
              </Button>
              <Button
                onClick={handleInstall}
                disabled={isInstalling || selectedSoftware.size === 0}
                className="gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
              >
                {isInstalling ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isInstalling ? '安装中...' : '一键安装选中软件'}
              </Button>
            </div>
          </div>
          {isInstalling && progress.total > 0 && (
            <div className="mt-4">
              <Progress value={(progress.current / progress.total) * 100} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 软件超市 */}
      <div className="space-y-6">
        {groupedSoftware.map(
          ({ category, software }) =>
            software.length > 0 && (
              <div key={category}>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="outline" className={cn('gap-1.5 px-3 py-1', getCategoryColor(category))}>
                    {getCategoryIcon(category)}
                    {category}
                  </Badge>
                  <span className="text-sm text-muted-foreground">({software.length} 个软件)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {software.map((item) => (
                    <SoftwareCard
                      key={item.id}
                      software={item}
                      isSelected={selectedSoftware.has(item.id)}
                      onToggle={() => handleToggleSoftware(item.id)}
                      disabled={isInstalling}
                    />
                  ))}
                </div>
              </div>
            )
        )}
      </div>

      <Separator />

      {/* 实时终端 */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gray-900 text-white rounded-t-lg pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-green-400" />
              <CardTitle className="text-white text-base">安装日志</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearLogs}
                disabled={logs.length === 0}
                className="text-gray-400 hover:text-white hover:bg-white/10"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <CardDescription className="text-gray-400">实时显示安装进度和输出</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div
            ref={terminalRef}
            className="bg-gray-950 text-gray-300 font-mono text-sm p-4 h-80 overflow-y-auto rounded-b-lg"
          >
            {logs.length === 0 ? (
              <div className="text-gray-500 italic">等待开始安装...</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className={cn('break-all', getLogColor(log.type))}>
                    <span className="text-gray-600 mr-2">
                      [{log.timestamp.toLocaleTimeString()}]
                    </span>
                    {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default QuickInstaller

// 软件卡片组件
interface SoftwareCardProps {
  software: Software
  isSelected: boolean
  onToggle: () => void
  disabled?: boolean
}

const SoftwareCard: React.FC<SoftwareCardProps> = ({ software, isSelected, onToggle, disabled }) => {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200 hover:shadow-md group',
        isSelected && 'ring-2 ring-primary ring-offset-2',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onClick={() => !disabled && onToggle()}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
              isSelected
                ? 'bg-primary border-primary'
                : 'border-gray-300 group-hover:border-primary/50'
            )}
          >
            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-base truncate">{software.name}</h3>
              {software.source === 'msstore' && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  Store
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{software.description}</p>
            <p className="text-xs text-muted-foreground/60 mt-2 truncate" title={software.id}>
              ID: {software.id}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
