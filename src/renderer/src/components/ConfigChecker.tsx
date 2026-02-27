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
  Fingerprint,
  MonitorSmartphone
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// 全球主流硬件品牌映射表 (具有普适性)
const dictionary: Record<string, string> = {
  // 核心厂商
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
  
  // 硬件术语
  'SSD': '固态硬盘',
  'HDD': '机械硬盘',
  'NVMe': '高速存储',
  'SATA': '串口存储'
}

// 普适性翻译器：如果字典里没有，就保留原样，确保不丢失信息
const t = (str: string): string => {
  if (!str || str === 'Unknown') return ''
  let res = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim()
  
  // 尝试匹配并替换已知品牌
  Object.keys(dictionary).forEach(key => {
    const regex = new RegExp(`(^|\\s|\\()${key}`, 'gi')
    if (res.match(regex)) {
      res = res.replace(regex, (match) => {
        // 保留匹配前后的符号，只替换文字
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
  const countStr = count ? `(${count} 条内存)` : ''
  const speedStr = speed && speed !== '0' ? `${speed}MHz` : ''
  const manu = t(manuRaw) || manuRaw // 如果字典没翻译，保留原始厂商名
  return `${size} ${countStr} ${speedStr ? `| ${speedStr}` : ''} ${manu && manu !== 'Unknown' ? `| ${manu}` : ''}`.trim()
}

const formatMonitor = (val: string) => {
  if (!val || val === 'Unknown') return '通用显示设备'
  const parts = val.split('|')
  if (parts.length === 3) {
    const [id, name, resolution] = parts
    // 优先从字典查品牌 ID，查不到则保留 ID 原样
    let brand = dictionary[id.toUpperCase()] || (id !== 'Unknown' ? id : '')
    let model = t(name) || name
    let resStr = resolution ? ` [${resolution} 物理像素]` : ''
    
    // 品牌和型号去重显示
    if (brand && model.toLowerCase().includes(brand.toLowerCase().split(' ')[0].toLowerCase())) {
      return `${model}${resStr}`.trim()
    }
    return `${brand} ${model}${resStr}`.trim()
  }
  return t(val) || val
}

interface SystemConfig {
  cpu: string; motherboard: string; memory: string; gpu: string; monitor: string; disk: string; os: string;
}

export const ConfigChecker: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const result = await window.electron.systemConfig.getSystemConfig()
      if (result.success && result.data) setConfig(result.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const cached = localStorage.getItem('config-cache-v15')
    if (cached) setConfig(JSON.parse(cached))
    else fetchConfig()
  }, [])

  useEffect(() => {
    if (config) localStorage.setItem('config-cache-v15', JSON.stringify(config))
  }, [config])

  const renderValue = (key: string, value: string | undefined) => {
    if (!value || loading) return <span className="opacity-20 blur-sm">审计进行中...</span>
    
    const lines = value.split('\n').filter(l => l.trim() !== '')
    const formatLine = (line: string) => {
      if (key === 'memory') return formatRAM(line)
      if (key === 'monitor') return formatMonitor(line)
      return t(line) || line
    }

    if (lines.length <= 1) return <span className="block leading-relaxed">{formatLine(value)}</span>
    
    return (
      <ul className="space-y-3 mt-1">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2.5 group/line text-[14px]">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 mt-2 shrink-0 group-hover/line:bg-blue-500 transition-colors" />
            <span className="leading-snug opacity-90">{formatLine(line)}</span>
          </li>
        ))}
      </ul>
    )
  }

  const items = [
    { id: 'cpu', label: '核心处理器', icon: Cpu },
    { id: 'motherboard', label: '主板芯片组', icon: CircuitBoard },
    { id: 'gpu', label: '图形适配器', icon: MonitorSmartphone },
    { id: 'memory', label: '运行内存堆栈', icon: MemoryStick },
    { id: 'disk', label: '存储矩阵', icon: HardDrive },
    { id: 'monitor', label: '显示终端', icon: Monitor }
  ]

  return (
    <div className="max-w-5xl mx-auto py-10 px-8 animate-in fade-in duration-1000">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-[22px] bg-zinc-900 dark:bg-zinc-50 flex items-center justify-center shadow-2xl transition-all duration-500 hover:scale-105">
            <Fingerprint size={32} className="text-zinc-50 dark:text-zinc-900" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">配置快照</h1>
            <p className="text-[10px] font-black text-zinc-400 mt-1.5 uppercase tracking-[0.4em] opacity-70">
              {config?.os || 'Initializing Hardware Layer...'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button onClick={fetchConfig} disabled={loading} variant="ghost" className="h-10 px-5 rounded-full text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-all">
            {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
            重新审计
          </Button>
          <Button onClick={() => {
            const report = `[系统硬件快照]\n` + items.map(i => `${i.label}: ${t((config as any)?.[i.id]) || (config as any)?.[i.id]}`).join('\n')
            navigator.clipboard.writeText(report)
            setCopied(true); setTimeout(() => setCopied(false), 2000)
          }} disabled={loading} className="h-10 px-6 rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-xs font-black shadow-lg active:scale-95 transition-all">
            {copied ? <Check size={14} className="mr-2" /> : <Copy size={14} className="mr-2" />}
            {copied ? '已复制' : '分享审计报告'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-16">
        {items.map((item) => (
          <div key={item.id} className="group relative border-l-2 border-zinc-100 dark:border-zinc-800 pl-8 transition-all hover:border-blue-500/40 min-h-[90px]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-400 group-hover:text-blue-500 transition-colors shadow-sm">
                <item.icon size={16} />
              </div>
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em] opacity-60">{item.label}</span>
            </div>
            <div className="text-[15px] font-bold font-mono text-zinc-800 dark:text-zinc-200">
              {renderValue(item.id, (config as any)?.[item.id])}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-32 pt-12 border-t border-zinc-50 dark:border-zinc-900 flex flex-col items-center opacity-40 hover:opacity-100 transition-opacity text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-400 mb-2">Hardware Trust Layer</p>
        <p className="text-[10px] text-zinc-400 font-medium max-w-sm">基于底层 WMI 总线实时审计 · 自动适配多品牌硬件及显示协议</p>
      </div>
    </div>
  )
}

export default ConfigChecker
