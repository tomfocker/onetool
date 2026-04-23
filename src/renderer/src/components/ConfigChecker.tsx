import React, { useEffect, useState } from 'react'
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
  HardDrive,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { translateHardwareLabel } from '../../../shared/hardwareIdentity'
import type { SystemConfig } from '../../../shared/types'
import { hasMeaningfulSystemConfig } from '../../../shared/toolState'

type ConfigCardId = 'cpu' | 'deviceModel' | 'motherboard' | 'gpu' | 'memory' | 'monitor' | 'disk'

const formatHardwareLabel = (value: string | null | undefined): string => {
  if (!value || value === 'Unknown') return ''
  const text = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim()
  return translateHardwareLabel(text)
}

const formatRAM = (val: string) => {
  if (!val || val === 'Unknown') return '检测中...'
  const [size, count, speed, manuRaw] = val.split('|')
  const countStr = count ? `× ${count} 条` : ''
  const speedStr = speed && speed !== '0' ? `${speed} MHz` : ''
  const manu = formatHardwareLabel(manuRaw) || manuRaw
  const parts = [size, countStr, speedStr, (manu && manu !== 'Unknown') ? manu : ''].filter(Boolean)
  return parts.join('  ·  ')
}

const formatMonitor = (val: string) => {
  if (!val || val === 'Unknown') return { name: '通用显示设备', res: '' }
  const parts = val.split('|')
  if (parts.length === 3) {
    const [id, name, resolution] = parts
    const brand = formatHardwareLabel(id) || (id !== 'Unknown' ? id : '')
    const model = formatHardwareLabel(name) || name
    const displayName = brand && model.toLowerCase().includes(brand.toLowerCase().split(' ')[0].toLowerCase())
      ? model
      : `${brand} ${model}`.trim()
    // 过滤 0x0 或以 0 开头的无效分辨率
    const validRes = resolution && !/^0[x×]/.test(resolution) ? resolution : ''
    return { name: displayName || '显示设备', res: validRes }
  }
  return { name: formatHardwareLabel(val) || val, res: '' }
}

const CACHE_KEY = 'config-cache-v17'

const itemConfig: Array<{
  id: ConfigCardId
  label: string
  icon: LucideIcon
  gradient: string
  accent: string
}> = [
  { id: 'cpu', label: '处理器', icon: Cpu, gradient: 'from-blue-500 to-indigo-500', accent: 'blue' },
  { id: 'motherboard', label: '主板', icon: CircuitBoard, gradient: 'from-violet-500 to-purple-600', accent: 'violet' },
  { id: 'gpu', label: '显卡', icon: MonitorSmartphone, gradient: 'from-cyan-500 to-blue-600', accent: 'cyan' },
  { id: 'memory', label: '内存', icon: MemoryStick, gradient: 'from-emerald-500 to-teal-600', accent: 'emerald' },
  { id: 'monitor', label: '显示器', icon: Monitor, gradient: 'from-amber-500 to-orange-500', accent: 'amber' },
  { id: 'disk', label: '存储', icon: HardDrive, gradient: 'from-rose-500 to-pink-600', accent: 'rose' },
]

const exportOrder: ConfigCardId[] = [
  'deviceModel',
  'cpu',
  'motherboard',
  'gpu',
  'memory',
  'monitor',
  'disk',
]

const cardRows: ConfigCardId[][] = [
  ['cpu', 'memory'],
  ['monitor', 'disk'],
  ['motherboard', 'gpu']
]

function countEntries(value: string | undefined): number {
  if (!value) {
    return 0
  }

  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .length
}

function parseMemorySizeGb(value: string | undefined): number {
  if (!value) {
    return 0
  }

  const match = value.match(/(\d+)\s*GB/i)
  return match ? Number(match[1]) : 0
}

function getFilteredGpuLines(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/(Virtual Display|OrayIddDriver|Remote Display|Basic Display)/i.test(line))
}

function inferDeviceForm(model: string, monitorCount: number): {
  typeLabel: string
  titleLabel: string
} {
  if (/(thinkpad|yoga|xiaoxin|legion|laptop|notebook|book|vivobook|zenbook|rog zephyrus|surface laptop|matebook|magicbook|macbook)/i.test(model)) {
    return {
      typeLabel: '移动设备形态：品牌笔记本',
      titleLabel: '笔记本'
    }
  }

  if (/(desk|desktop|tower|prodesk|elitedesk|optiplex|precision|workstation|x700t|mt|g\d\b)/i.test(model)) {
    return {
      typeLabel: '设备形态：桌面主机',
      titleLabel: monitorCount >= 2 ? '桌面工作站' : '台式机'
    }
  }

  return {
    typeLabel: monitorCount >= 2 ? '设备形态：多屏固定平台' : '设备形态：通用 Windows 设备',
    titleLabel: monitorCount >= 2 ? '工作平台' : '主机'
  }
}

function inferPerformanceTier(cpu: string, memorySizeGb: number, hasDiscreteGpu: boolean): {
  levelLabel: string
  titlePrefix: string
} {
  let score = 0

  if (/(i9|ultra 9|ryzen 9|threadripper|xeon)/i.test(cpu)) {
    score += 4
  } else if (/(i7|ultra 7|ryzen 7)/i.test(cpu)) {
    score += 3
  } else if (/(i5|ultra 5|ryzen 5)/i.test(cpu)) {
    score += 2
  } else {
    score += 1
  }

  if (/\b(K|KF|KS|HX|HK|X3D)\b/i.test(cpu)) {
    score += 2
  } else if (/\b(H|HS)\b/i.test(cpu)) {
    score += 1
  }

  if (memorySizeGb >= 64) {
    score += 3
  } else if (memorySizeGb >= 32) {
    score += 2
  } else if (memorySizeGb >= 16) {
    score += 1
  }

  if (hasDiscreteGpu) {
    score += 2
  }

  if (score >= 8) {
    return { levelLabel: '性能档位：工作站级', titlePrefix: '高性能' }
  }

  if (score >= 5) {
    return { levelLabel: '性能档位：高性能级', titlePrefix: '高性能' }
  }

  if (score >= 3) {
    return { levelLabel: '性能档位：主流级', titlePrefix: '主流' }
  }

  return { levelLabel: '性能档位：基础级', titlePrefix: '基础' }
}

function buildQuickConclusion(config: SystemConfig | null): { title: string; lines: string[] } {
  if (!config) {
    return {
      title: '硬件画像生成中',
      lines: ['等待本次审计完成后，自动汇总整机定位与硬件特征。']
    }
  }

  const gpuLines = getFilteredGpuLines(config.gpu)
  const monitorCount = countEntries(config.monitor)
  const diskCount = countEntries(config.disk)
  const memorySize = config.memory.split('|')[0] || '内存信息待定'
  const memorySizeGb = parseMemorySizeGb(config.memory)
  const normalizedDeviceModel = formatHardwareLabel(config.deviceModel) || config.deviceModel
  const normalizedCpu = formatHardwareLabel(config.cpu) || config.cpu
  const hasDiscreteGpu = gpuLines.some((line) => /(RTX|GTX|GeForce|Quadro|RX\s?\d+|Radeon\s+(?!Graphics)|Arc\b)/i.test(line))
  const hasIntegratedGpu = gpuLines.some((line) => /(Intel\(R\)\sUHD|Intel\(R\)\sIris|Radeon Graphics|Vega|Intel Arc Graphics)/i.test(line))
  const isMultiDisplay = monitorCount >= 2
  const { typeLabel, titleLabel } = inferDeviceForm(normalizedDeviceModel, monitorCount)
  const { levelLabel, titlePrefix } = inferPerformanceTier(normalizedCpu, memorySizeGb, hasDiscreteGpu)

  let title = `${titlePrefix}${titleLabel}`
  if (hasDiscreteGpu && isMultiDisplay) {
    title = `多屏${titlePrefix}${titleLabel}`
  } else if (hasDiscreteGpu && /笔记本/.test(titleLabel)) {
    title = `${titlePrefix}图形${titleLabel}`
  } else if (hasDiscreteGpu && /台式机|桌面工作站|工作平台|主机/.test(titleLabel)) {
    title = `${titlePrefix}独显${titleLabel}`
  }

  const graphicsProfile = hasDiscreteGpu && hasIntegratedGpu
    ? '图形能力：独显 + 核显混合图形'
    : hasDiscreteGpu
      ? '图形能力：独立显卡主力输出'
      : hasIntegratedGpu
        ? '图形能力：核显为主'
        : '图形能力：基础显示输出'

  const expansionProfile = [
    memorySize || '内存信息待定',
    diskCount > 0 ? `${diskCount} 个存储设备` : '',
    monitorCount > 0 ? `${monitorCount} 台显示器` : ''
  ].filter(Boolean).join(' · ')

  return {
    title,
    lines: [
      typeLabel,
      levelLabel,
      expansionProfile || '硬件拓扑信息整理中',
      graphicsProfile,
      `整机识别：${normalizedDeviceModel || '未识别具体型号'}`,
      `处理器：${normalizedCpu || '待识别'}`
    ]
  }
}

export const ConfigChecker: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState<{
    summary: string
    bullets: string[]
    warnings: string[]
    actions: string[]
  } | null>(null)

  const fetchConfig = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
    }
    setError(null)
    const timeoutId = setTimeout(() => {
      if (!silent) {
        setLoading(false)
      }
      setError('检测超时，请重试')
    }, 70000)
    try {
      const result = await window.electron.systemConfig.getSystemConfig()
      if (result.success && result.data) {
        if (hasMeaningfulSystemConfig(result.data)) {
          setConfig(result.data)
          localStorage.setItem(CACHE_KEY, JSON.stringify(result.data))
        } else {
          localStorage.removeItem(CACHE_KEY)
          setError('硬件审计结果不完整，请重新审计')
        }
      } else {
        setError(result.error || '获取配置失败')
      }
    } catch (e: any) {
      setError(e?.message || '调用失败')
    } finally {
      clearTimeout(timeoutId)
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (hasMeaningfulSystemConfig(parsed)) {
          setConfig(parsed)
          void fetchConfig({ silent: true })
          return
        }
        localStorage.removeItem(CACHE_KEY)
      } catch {
        localStorage.removeItem(CACHE_KEY)
      }
      void fetchConfig()
    } else {
      void fetchConfig()
    }
  }, [])

  const renderLines = (id: ConfigCardId, value: string | undefined): React.ReactNode => {
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
      return <span className="text-sm font-semibold tracking-tight">{formatHardwareLabel(lines[0]) || lines[0]}</span>
    }

    return (
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
            <span className="text-sm font-semibold leading-snug">{formatHardwareLabel(line) || line}</span>
          </div>
        ))}
      </div>
    )
  }

  const formatExportValue = (id: ConfigCardId, value: string | undefined): string => {
    if (!value || value === 'Unknown') return ''

    if (id === 'memory') {
      return formatRAM(value.split('\n').filter(l => l.trim())[0] || value)
    }

    if (id === 'monitor') {
      return value
        .split('\n')
        .filter(l => l.trim())
        .map((line) => {
          const { name, res } = formatMonitor(line)
          return res ? `${name} (${res})` : name
        })
        .join('； ')
    }

    const lines = value.split('\n').filter(l => l.trim())
    if (lines.length === 1) {
      return formatHardwareLabel(lines[0]) || lines[0]
    }

    return lines
      .map(line => formatHardwareLabel(line) || line)
      .join('； ')
  }

  const handleCopy = () => {
    const report = '[系统硬件快照]\n' + exportOrder.map((id) => {
      const item = itemConfig.find(entry => entry.id === id)!
      const val = config?.[item.id] || ''
      return `${item.label}: ${formatExportValue(item.id, val)}`
    }).join('\n')
    navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAiDiagnosis = async () => {
    if (!config) {
      setError('请先完成一次硬件审计')
      return
    }

    setAiLoading(true)
    try {
      const doctorResult = await window.electron.doctor.runAudit()
      const result = await window.electron.llm.analyzeSystem({
        config,
        doctorReport: doctorResult.success ? doctorResult.data ?? null : null
      })

      if (!result.success || !result.data) {
        setError(result.error || 'AI 诊断失败')
        return
      }

      setAiInsight(result.data)
      setError(null)
    } finally {
      setAiLoading(false)
    }
  }

  const quickConclusion = buildQuickConclusion(config)
  const normalizedDeviceModel = formatHardwareLabel(config?.deviceModel) || config?.deviceModel || '未识别具体型号'

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* 页面头 */}
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
              onClick={() => { void fetchConfig() }}
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
            <Button
              onClick={() => { void handleAiDiagnosis() }}
              disabled={loading || !config || aiLoading}
              variant="outline"
              className="h-10 rounded-full px-5 text-xs font-black"
            >
              {aiLoading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}
              {aiLoading ? 'AI 分析中...' : 'AI 诊断建议'}
            </Button>
          </div>
          {error && <p className="text-[11px] text-red-400 font-medium">{error}</p>}
        </div>
      </div>

      <Card className="glass-card border-none group overflow-hidden relative">
        <div className="absolute inset-y-0 right-0 w-1/3 blur-3xl opacity-15 transition-opacity duration-500 group-hover:opacity-25 pointer-events-none bg-gradient-to-br from-cyan-400 to-blue-500" />
        <CardContent className="p-6 md:p-7 transition-transform duration-300 group-hover:scale-[1.01]">
          <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 to-cyan-500 flex items-center justify-center text-white shadow-md shrink-0 transition-transform duration-300 group-hover:scale-105">
                <Sparkles size={24} />
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground opacity-60">
                    整机画像
                  </p>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
                    {quickConclusion.title}
                  </h2>
                  <p className="text-base md:text-lg font-bold text-foreground/90">
                    {normalizedDeviceModel}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  {quickConclusion.lines.map((line, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                      <span className="text-sm font-semibold leading-snug text-foreground/90">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
          </div>
        </CardContent>
      </Card>

      {aiInsight ? (
        <Card className="glass-card border-none overflow-hidden">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground opacity-60">AI 系统诊断</p>
                <h3 className="text-xl font-black tracking-tight">{aiInsight.summary}</h3>
              </div>
            </div>
            {aiInsight.bullets.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {aiInsight.bullets.map((line) => (
                  <div key={line} className="rounded-2xl border border-white/10 bg-white/40 px-4 py-3 text-sm font-medium dark:bg-white/5">
                    {line}
                  </div>
                ))}
              </div>
            ) : null}
            {aiInsight.actions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-bold">建议动作</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {aiInsight.actions.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {aiInsight.warnings.length > 0 ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {aiInsight.warnings.map((line) => (
                  <div key={line}>• {line}</div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* 硬件卡片严格对齐布局 */}
      <div className="space-y-4">
        {cardRows.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            {row.map((cardId) => {
              const item = itemConfig.find((entry) => entry.id === cardId)!
              const value = config?.[item.id]
              const hasData = !loading && value && value !== ''

              return (
                <Card
                  key={item.id}
                  className="glass-card border-none group overflow-hidden relative h-full"
                >
                  <div className={cn(
                    'absolute top-0 right-0 w-24 h-24 blur-2xl -mr-8 -mt-8 opacity-10 transition-opacity duration-500 group-hover:opacity-25 pointer-events-none',
                    `bg-gradient-to-br ${item.gradient}`
                  )} />

                  <CardContent className={cn(
                    'p-5 transition-transform duration-300 min-h-[136px] h-full',
                    hasData && 'group-hover:scale-[1.02]'
                  )}>
                    <div className="flex items-start gap-4 h-full">
                      <div className={cn(
                        'w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-md shrink-0 transition-transform duration-300 group-hover:scale-110',
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
        ))}
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
