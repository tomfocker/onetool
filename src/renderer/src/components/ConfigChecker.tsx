import React, { useState, useEffect } from 'react'
import {
  Cpu,
  Monitor,
  CircuitBoard,
  MemoryStick,
  Check,
  Loader2,
  RefreshCw,
  Fingerprint,
  MonitorSmartphone,
  Copy,
  HardDrive
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// 品牌字典
const dictionary: Record<string, string> = {
  'Samsung': '三星 (Samsung)',
  'Intel': '英特尔 (Intel)',
  'NVIDIA': '英伟达 (NVIDIA)',
  'AMD': 'AMD',
  'Gigabyte': '技嘉 (GIGABYTE)',
  'ASUSTeK': '华硕 (ASUS)',
  'ASUS': '华硕 (ASUS)',
  'Micro-Star': '微星 (MSI)',
  'Kingston': '金士顿 (Kingston)',
  'Micron': '美光 (Micron)',
  'Hynix': '海力士 (SK hynix)',
  'Corsair': '美商海盗船 (Corsair)',
  'Western Digital': '西部数据 (WD)',
  'Seagate': '希捷 (Seagate)',
  'Crucial': '英睿达 (Crucial)',
  'AOC': '冠捷 (AOC)',
  'TPV': '冠捷 (AOC)',
  'Dell': '戴尔 (DELL)',
  'HP': '惠普 (HP)',
  'Lenovo': '联想 (Lenovo)',
  'Acer': '宏碁 (Acer)',
  'LG': 'LG',
  'BenQ': '明基 (BenQ)',
  'Philips': '飞利浦 (Philips)',
  'ViewSonic': '优派 (ViewSonic)',
  'Microsoft': '微软',
  'SSD': '固态硬盘',
  'HDD': '机械硬盘',
  'NVMe': '高速存储',
  'SATA': '串口存储'
}

const t = (str: string): string => {
  if (!str || str === 'Unknown') return ''
  let res = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim()
  Object.keys(dictionary).forEach(key => {
    const regex = new RegExp(`(^|\\s|\\()${key}`, 'gi')
    if (res.match(regex)) {
      res = res.replace(regex, (match) => {
        if (match.startsWith('(')) return '(' + dictionary[key]
        if (match.startsWith(' ')) return ' ' + dictionary[key]
        return dictionary[key]
      })
    }
  })
  return res
}

const formatRAM = (val: string) => {
  if (!val || val === 'Unknown') return '检测中...'
  const [size, count, speed, manuRaw] = val.split('|')
  const countStr = count ? `× ${count} 条` : ''
  const speedStr = speed && speed !== '0' ? `${speed} MHz` : ''
  const manu = t(manuRaw) || manuRaw
  const parts = [size, countStr, speedStr, (manu && manu !== 'Unknown') ? manu : ''].filter(Boolean)
  return parts.join('  ·  ')
}

const formatMonitor = (val: string) => {
  if (!val || val === 'Unknown') return { name: '通用显示设备', res: '' }
  const parts = val.split('|')
  if (parts.length === 3) {
    const [id, name, resolution] = parts
    let brand = dictionary[id.toUpperCase()] || (id !== 'Unknown' ? id : '')
    let model = t(name) || name
    let displayName = brand && model.toLowerCase().includes(brand.toLowerCase().split(' ')[0].toLowerCase())
      ? model
      : `${brand} ${model}`.trim()
    // 过滤 0x0 或以 0 开头的无效分辨率
    const validRes = resolution && !/^0[x×]/.test(resolution) ? resolution : ''
    return { name: displayName || '显示设备', res: validRes }
  }
  return { name: t(val) || val, res: '' }
}

interface SystemConfig {
  cpu: string; motherboard: string; memory: string; gpu: string; monitor: string; disk: string; os: string;
}

const itemConfig = [
  { id: 'cpu', label: '处理器', icon: Cpu, gradient: 'from-blue-500 to-indigo-500', accent: 'blue' },
  { id: 'motherboard', label: '主板', icon: CircuitBoard, gradient: 'from-violet-500 to-purple-600', accent: 'violet' },
  { id: 'gpu', label: '显卡', icon: MonitorSmartphone, gradient: 'from-cyan-500 to-blue-600', accent: 'cyan' },
  { id: 'memory', label: '内存', icon: MemoryStick, gradient: 'from-emerald-500 to-teal-600', accent: 'emerald' },
  { id: 'monitor', label: '显示器', icon: Monitor, gradient: 'from-amber-500 to-orange-500', accent: 'amber' },
  { id: 'disk', label: '存储', icon: HardDrive, gradient: 'from-rose-500 to-pink-600', accent: 'rose' },
]

export const ConfigChecker: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchConfig = async () => {
    setLoading(true)
    setError(null)
    const timeoutId = setTimeout(() => {
      setLoading(false)
      setError('检测超时，请重试')
    }, 70000)
    try {
      const result = await window.electron.systemConfig.getSystemConfig()
      if (result.success && result.data) {
        setConfig(result.data)
        localStorage.setItem('config-cache-v16', JSON.stringify(result.data))
      } else {
        setError(result.error || '获取配置失败')
      }
    } catch (e: any) {
      setError(e?.message || '调用失败')
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  useEffect(() => {
    const cached = localStorage.getItem('config-cache-v16')
    if (cached) {
      try { setConfig(JSON.parse(cached)) } catch { fetchConfig() }
    } else {
      fetchConfig()
    }
  }, [])

  const renderLines = (id: string, value: string | undefined): React.ReactNode => {
    if (!value || loading) {
      return <span className="text-sm text-muted-foreground italic opacity-40">审计进行中...</span>
    }
    const lines = value.split('\n').filter(l => l.trim())

    if (id === 'memory') {
      return <span className="text-sm font-semibold tracking-tight">{formatRAM(lines[0] || value)}</span>
    }

    if (id === 'monitor') {
      if (lines.length === 0) return <span className="text-sm font-semibold">通用显示设备</span>
      return (
        <div className="space-y-2">
          {lines.map((line, i) => {
            const { name, res } = formatMonitor(line)
            return (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold leading-snug">{name}</div>
                  {res && <div className="text-xs text-muted-foreground font-mono mt-0.5">{res} 物理像素</div>}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    if (lines.length === 1) {
      return <span className="text-sm font-semibold tracking-tight">{t(lines[0]) || lines[0]}</span>
    }

    return (
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
            <span className="text-sm font-semibold leading-snug">{t(line) || line}</span>
          </div>
        ))}
      </div>
    )
  }

  const handleCopy = () => {
    const report = '[系统硬件快照]\n' + itemConfig.map(item => {
      const val = (config as any)?.[item.id] || ''
      return `${item.label}: ${t(val) || val}`
    }).join('\n')
    navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* 页头 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 transition-transform duration-500 hover:scale-105">
              <Fingerprint size={26} className="text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter">
                配置<span className="bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">快照</span>
              </h1>
              <p className="text-[10px] font-black text-muted-foreground mt-1 uppercase tracking-[0.4em] opacity-60">
                {config?.os || 'Initializing Hardware Layer...'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <Button
              onClick={fetchConfig}
              disabled={loading}
              variant="ghost"
              className="h-10 px-5 rounded-full text-xs font-black text-muted-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
            >
              {loading
                ? <Loader2 size={14} className="animate-spin mr-2" />
                : <RefreshCw size={14} className="mr-2" />
              }
              {loading ? '审计中...' : '重新审计'}
            </Button>
            <Button
              onClick={handleCopy}
              disabled={loading || !config}
              className="h-10 px-6 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-black shadow-lg shadow-cyan-500/20 active:scale-95 transition-all border-0"
            >
              {copied ? <Check size={14} className="mr-2" /> : <Copy size={14} className="mr-2" />}
              {copied ? '已复制' : '导出报告'}
            </Button>
          </div>
          {error && <p className="text-[11px] text-red-400 font-medium">{error}</p>}
        </div>
      </div>

      {/* 硬件卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {itemConfig.map((item) => {
          const value = (config as any)?.[item.id]
          const hasData = !loading && value && value !== ''
          return (
            <Card
              key={item.id}
              className={cn(
                'glass-card border-none transition-all duration-500 group overflow-hidden relative',
                hasData ? 'hover:scale-[1.02]' : 'opacity-70'
              )}
            >
              {/* 装饰光晕 */}
              <div className={cn(
                'absolute top-0 right-0 w-24 h-24 blur-2xl -mr-8 -mt-8 opacity-10 transition-opacity duration-500 group-hover:opacity-20',
                `bg-gradient-to-br ${item.gradient}`
              )} />

              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-md shrink-0 transition-transform duration-500 group-hover:rotate-6',
                    item.gradient
                  )}>
                    <item.icon size={20} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground opacity-60 mb-2">
                      {item.label}
                    </p>
                    <div className="leading-relaxed">
                      {renderLines(item.id, value)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 底部 footer */}
      <div className="pt-8 border-t border-border/30 flex flex-col items-center gap-1 opacity-30 hover:opacity-80 transition-opacity text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-muted-foreground">Hardware Trust Layer</p>
        <p className="text-[10px] text-muted-foreground font-medium">基于 CIM 总线实时审计 · 自动适配多品牌硬件及显示协议</p>
      </div>
    </div>
  )
}

export default ConfigChecker
