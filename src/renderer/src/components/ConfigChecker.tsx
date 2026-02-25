import React, { useState, useEffect } from 'react'
import { 
  Cpu, 
  HardDrive, 
  Monitor, 
  Wifi, 
  Volume2,
  CircuitBoard,
  MemoryStick,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Play
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ConfigItem {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}

interface SystemConfig {
  cpu: string
  motherboard: string
  memory: string
  gpu: string
  monitor: string
  disk: string
  audio: string
  network: string
  os: string
}

const STORAGE_KEY = 'system-config-cache'
const STORAGE_TIMESTAMP_KEY = 'system-config-timestamp'

const getConfigItems = (config: SystemConfig | null): ConfigItem[] => {
  if (!config) return []
  
  return [
    {
      icon: <Cpu size={18} />,
      label: '处理器',
      value: config.cpu || '未知',
      color: 'text-blue-500'
    },
    {
      icon: <CircuitBoard size={18} />,
      label: '主板',
      value: config.motherboard || '未知',
      color: 'text-violet-500'
    },
    {
      icon: <MemoryStick size={18} />,
      label: '内存',
      value: config.memory || '未知',
      color: 'text-purple-500'
    },
    {
      icon: <Monitor size={18} />,
      label: '显卡',
      value: config.gpu || '未知',
      color: 'text-green-500'
    },
    {
      icon: <Monitor size={18} />,
      label: '显示器',
      value: config.monitor || '未知',
      color: 'text-cyan-500'
    },
    {
      icon: <HardDrive size={18} />,
      label: '磁盘',
      value: config.disk || '未知',
      color: 'text-orange-500'
    },
    {
      icon: <Volume2 size={18} />,
      label: '声卡',
      value: config.audio || '未知',
      color: 'text-pink-500'
    },
    {
      icon: <Wifi size={18} />,
      label: '网卡',
      value: config.network || '未知',
      color: 'text-teal-500'
    }
  ]
}

const generateConfigText = (config: SystemConfig | null): string => {
  if (!config) return ''
  
  const items = [
    { label: '处理器', value: config.cpu },
    { label: '主板', value: config.motherboard },
    { label: '内存', value: config.memory },
    { label: '显卡', value: config.gpu },
    { label: '显示器', value: config.monitor },
    { label: '磁盘', value: config.disk },
    { label: '声卡', value: config.audio },
    { label: '网卡', value: config.network }
  ]
  
  return items.map(item => `${item.label}：${item.value}`).join('\n')
}

const saveConfigToStorage = (config: SystemConfig) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString())
  } catch (e) {
    console.error('保存配置失败:', e)
  }
}

const loadConfigFromStorage = (): SystemConfig | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as SystemConfig
    }
  } catch (e) {
    console.error('读取配置失败:', e)
  }
  return null
}

const getLastDetectTime = (): string | null => {
  try {
    const timestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY)
    if (timestamp) {
      const date = new Date(parseInt(timestamp))
      return date.toLocaleString('zh-CN')
    }
  } catch (e) {
    console.error('读取时间失败:', e)
  }
  return null
}

export const ConfigChecker: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCache, setHasCache] = useState(false)

  useEffect(() => {
    const cachedConfig = loadConfigFromStorage()
    if (cachedConfig) {
      setConfig(cachedConfig)
      setHasCache(true)
    }
  }, [])

  const fetchConfig = async () => {
    setLoading(true)
    setError(null)
    
    try {
      if (window.electron?.systemConfig) {
        const result = await window.electron.systemConfig.getSystemConfig()
        if (result.success && result.config) {
          setConfig(result.config)
          saveConfigToStorage(result.config)
          setHasCache(true)
        } else {
          setError(result.error || '获取配置失败')
        }
      } else {
        setError('系统配置 API 不可用')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    const text = generateConfigText(config)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const configItems = getConfigItems(config)
  const lastDetectTime = getLastDetectTime()

  if (!hasCache && !loading && !error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">配置检测</h2>
            <p className="text-muted-foreground">首次使用，请点击开始检测获取系统配置信息</p>
          </div>
        </div>

        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="p-6 bg-primary/10 rounded-full">
                <Cpu size={48} className="text-primary" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">开始检测系统配置</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  检测将获取处理器、主板、内存、显卡等硬件信息
                </p>
                <Button 
                  onClick={fetchConfig}
                  disabled={loading}
                  size="lg"
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Play size={18} />
                  )}
                  开始检测
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">配置检测</h2>
          <p className="text-muted-foreground">
            {lastDetectTime ? `上次检测时间：${lastDetectTime}` : '系统配置信息'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={fetchConfig}
            disabled={loading}
            variant="outline"
            className="gap-2"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            重新检测
          </Button>
          <Button 
            onClick={handleCopy}
            disabled={loading || !config}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check size={16} />
                已复制
              </>
            ) : (
              <>
                <Copy size={16} />
                一键复制
              </>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-muted-foreground">正在获取系统配置...</p>
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-4 text-destructive">
              <p>获取配置失败</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={fetchConfig} variant="outline" size="sm">
                重试
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Cpu size={20} className="text-primary" />
                系统配置信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {configItems.map((item, index) => (
                  <div 
                    key={index}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-xl transition-all duration-300",
                      "bg-muted/30 hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "p-2.5 rounded-xl shrink-0",
                      item.color.replace('text-', 'bg-') + '/20'
                    )}>
                      <span className={item.color}>{item.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{item.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed break-all">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">预览文本</span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleCopy}
                  className="h-8 gap-1.5"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
              <pre className="text-xs text-muted-foreground bg-background/50 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono">
                {generateConfigText(config)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default ConfigChecker
