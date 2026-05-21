import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Gauge, Power, RefreshCw, ShieldCheck, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useGlobalStore } from '@/store'
import type { ProxyDoctorLayerStatus, ProxyDoctorProbeCheck, ProxyDoctorProbeResult, ProxyDoctorSnapshot } from '../../../shared/proxyDoctor'
import {
  DEFAULT_PROXY_DOCTOR_BYPASS,
  DEFAULT_PROXY_DOCTOR_TARGET,
  createProxyDoctorApplyRequest,
  getFirstProxyTargetCandidate,
  getLayerLampCopy,
  getLayerStateLabel,
  getSummaryCopy
} from './localProxyDoctorViewModel'

const layerToneClassNames = {
  success: 'bg-emerald-500 ring-emerald-500/15',
  muted: 'bg-zinc-300 ring-zinc-400/15 dark:bg-zinc-600',
  warning: 'bg-amber-500 ring-amber-500/15',
  danger: 'bg-red-500 ring-red-500/15'
}

const layerTextToneClassNames = {
  success: 'text-emerald-600',
  muted: 'text-zinc-500',
  warning: 'text-amber-600',
  danger: 'text-red-600'
}

const portToneClassNames = {
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  muted: 'border-zinc-300/60 bg-zinc-500/5 text-zinc-500'
}

const probeCheckToneClassNames = {
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300'
}

function getPortTone(snapshot: ProxyDoctorSnapshot | null): keyof typeof portToneClassNames {
  if (!snapshot) return 'muted'
  return snapshot.portOpen ? 'success' : 'warning'
}

function makeProbeKey(label: string, input: string): string {
  return `${label}:${input.trim()}`
}

function formatProbeLatency(latencyMs: number | null): string {
  return latencyMs == null ? '-' : `${latencyMs}ms`
}

function getProbeCheckTone(check: ProxyDoctorProbeCheck): keyof typeof probeCheckToneClassNames {
  if (check.ok) return 'success'
  if (check.skipped) return 'warning'
  return 'danger'
}

function getProbeCheckStatus(check: ProxyDoctorProbeCheck): string {
  if (check.ok) return '可用'
  if (check.skipped) return '已跳过'
  return '失败'
}

function formatProbeCheckDetail(check: ProxyDoctorProbeCheck): string {
  const parts = [getProbeCheckStatus(check)]
  if (check.latencyMs != null) {
    parts.push(formatProbeLatency(check.latencyMs))
  }
  if (check.statusCode != null) {
    parts.push(`HTTP ${check.statusCode}`)
  }
  if (check.error) {
    parts.push(check.error)
  }
  return parts.join(' · ')
}

function normalizeComparableProxyValue(value: string): string {
  const trimmed = value.trim().replace(/^(?:https?|socks5):\/\//i, '')
  if (/^\d+$/.test(trimmed)) {
    return `127.0.0.1:${trimmed}`
  }
  return trimmed.toLowerCase()
}

function needsLayerAction(layer: ProxyDoctorLayerStatus): boolean {
  return layer.state === 'conflict' || layer.state === 'error' || layer.state === 'off'
}

function getLayerActionHint(layer: ProxyDoctorLayerStatus): string {
  if (needsLayerAction(layer)) {
    return layer.actionHint
  }
  if (layer.state === 'unavailable') {
    return '当前环境不可用，已跳过。'
  }
  return '配置已和目标一致。'
}

export default function LocalProxyManagerTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const [snapshot, setSnapshot] = useState<ProxyDoctorSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState(DEFAULT_PROXY_DOCTOR_TARGET)
  const [bypass, setBypass] = useState(DEFAULT_PROXY_DOCTOR_BYPASS.join(';'))
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [probeResult, setProbeResult] = useState<{ label: string; input: string; data: ProxyDoctorProbeResult } | null>(null)
  const [probeLoadingKey, setProbeLoadingKey] = useState<string | null>(null)

  const appendLog = useCallback((message: string) => {
    setLog((previous) => [message, ...previous].slice(0, 12))
  }, [])

  const scanTarget = useCallback(
    async (targetValue: string, silent = false) => {
      if (!silent) {
        setLoading(true)
      }

      const result = await window.electron.localProxy.doctorScan(targetValue)

      if (result.success && result.data) {
        setSnapshot(result.data)
        const summary = getSummaryCopy(result.data.summary).title
        appendLog(`扫描完成: ${summary}`)
      } else {
        setSnapshot(null)
        appendLog(`扫描失败: ${result.error || '无法读取代理诊断信息。'}`)
        showNotification({
          type: 'error',
          title: '诊断失败',
          message: result.error || '无法读取代理诊断信息。'
        })
      }

      if (!silent) {
        setLoading(false)
      }
    },
    [appendLog, showNotification]
  )

  useEffect(() => {
    void scanTarget(DEFAULT_PROXY_DOCTOR_TARGET)
  }, [scanTarget])

  const handleProbeTarget = useCallback(
    async (targetValue: string, label: string) => {
      const input = targetValue.trim()
      if (!input) {
        showNotification({
          type: 'warning',
          title: '代理地址为空',
          message: '请先填写要测试的代理地址。'
        })
        return
      }

      const loadingKey = makeProbeKey(label, input)
      setProbeLoadingKey(loadingKey)

      try {
        const proxyApi = window.electron?.localProxy as
          | (typeof window.electron.localProxy & {
              doctorProbe?: (target: string) => Promise<{ success: boolean; data?: ProxyDoctorProbeResult; error?: string }>
            })
          | undefined

        if (typeof proxyApi?.doctorProbe !== 'function') {
          showNotification({
            type: 'warning',
            title: '需要重启预览',
            message: '当前预览窗口还没有加载新的代理测试接口，请重启 OneTool 预览后再试。'
          })
          return
        }

        const result = await proxyApi.doctorProbe(input)
        if (result.success && result.data) {
          setProbeResult({ label, input, data: result.data })
          appendLog(`测试完成: ${label} ${result.data.target.url}`)
          return
        }

        showNotification({
          type: 'error',
          title: '代理测试失败',
          message: result.error || '未能完成代理可用性测试。'
        })
      } catch (error) {
        showNotification({
          type: 'error',
          title: '代理测试失败',
          message: error instanceof Error ? error.message : '未能完成代理可用性测试。'
        })
      } finally {
        setProbeLoadingKey((current) => (current === loadingKey ? null : current))
      }
    },
    [appendLog, showNotification]
  )

  const handleOpenSettings = async () => {
    const result = await window.electron.localProxy.openSystemSettings()
    if (!result.success) {
      showNotification({
        type: 'error',
        title: '打开系统设置失败',
        message: result.error || '无法打开 Windows 代理设置页。'
      })
    }
  }

  const handleApplyAll = async () => {
    if (!window.confirm('将系统、命令行、Git 和 npm 代理同步到目标地址？')) {
      return
    }

    let request
    try {
      request = createProxyDoctorApplyRequest(target, bypass)
    } catch (error) {
      showNotification({
        type: 'warning',
        title: '目标代理无效',
        message: error instanceof Error ? error.message : '请检查代理地址。'
      })
      return
    }

    setLoading(true)
    const result = await window.electron.localProxy.doctorApplyAll(request)
    setLoading(false)

    if (result.success && result.data) {
      setSnapshot(result.data)
      appendLog('一键修复完成')
      showNotification({
        type: 'success',
        title: '修复完成',
        message: '开发代理已同步到目标地址。'
      })
      return
    }

    showNotification({
      type: 'error',
      title: '修复失败',
      message: result.error || '未能完成开发代理修复。'
    })
    await scanTarget(target, true)
  }

  const handleClearAll = async () => {
    if (!window.confirm('清除系统、命令行、Git 和 npm 的开发代理配置？')) {
      return
    }

    setLoading(true)
    const result = await window.electron.localProxy.doctorClearAll()
    setLoading(false)

    if (result.success) {
      appendLog('一键清理完成')
      showNotification({
        type: 'success',
        title: '清理完成',
        message: '开发代理配置已清除。'
      })
      await scanTarget(target, true)
      return
    }

    showNotification({
      type: 'error',
      title: '清理失败',
      message: result.error || '未能清除开发代理配置。'
    })
    await scanTarget(target, true)
  }

  const handleFixLayer = async (layer: ProxyDoctorLayerStatus) => {
    let request
    try {
      request = createProxyDoctorApplyRequest(target, bypass)
    } catch (error) {
      showNotification({
        type: 'warning',
        title: '目标代理无效',
        message: error instanceof Error ? error.message : '请检查代理地址。'
      })
      return
    }

    setLoading(true)
    const result = await window.electron.localProxy.doctorFixLayer(layer.id, request.target, request.bypass)
    setLoading(false)

    if (result.success) {
      appendLog(`修复完成: ${layer.title}`)
      showNotification({
        type: 'success',
        title: '单层修复完成',
        message: `${layer.title} 已同步。`
      })
      await scanTarget(target, true)
      return
    }

    showNotification({
      type: 'error',
      title: '单层修复失败',
      message: result.error || `${layer.title} 未能修复。`
    })
    await scanTarget(target, true)
  }

  const handleClearLayer = async (layer: ProxyDoctorLayerStatus) => {
    setLoading(true)
    const result = await window.electron.localProxy.doctorClearLayer(layer.id)
    setLoading(false)

    if (result.success) {
      appendLog(`清除完成: ${layer.title}`)
      showNotification({
        type: 'success',
        title: '单层清除完成',
        message: `${layer.title} 已清除。`
      })
      await scanTarget(target, true)
      return
    }

    showNotification({
      type: 'error',
      title: '单层清除失败',
      message: result.error || `${layer.title} 未能清除。`
    })
    await scanTarget(target, true)
  }

  const handleCopyReport = async () => {
    const report = snapshot?.reportText || log.join('\n')
    if (!report) {
      return
    }

    await navigator.clipboard.writeText(report)
    showNotification({
      type: 'info',
      message: '诊断报告已复制。'
    })
  }

  const summaryCopy = snapshot ? getSummaryCopy(snapshot.summary) : getSummaryCopy('off')
  const portStatus = snapshot ? (snapshot.portOpen ? '端口已开放' : '端口未响应') : '等待诊断'
  const portTone = getPortTone(snapshot)
  const problemLayerCount = useMemo(() => snapshot?.layers.filter(needsLayerAction).length || 0, [snapshot])
  const reportText = useMemo(() => snapshot?.reportText || log.join('\n') || '暂无诊断日志。', [log, snapshot])
  const targetProbeKey = makeProbeKey('目标代理', target)
  const targetProbeLoading = probeLoadingKey === targetProbeKey
  const targetComparable = normalizeComparableProxyValue(target)

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <h2 className="flex items-center gap-3 text-3xl font-black tracking-tight">
            <ShieldCheck className="text-emerald-500" size={30} />
            代理医生
          </h2>
          <p className="max-w-3xl text-sm font-bold text-muted-foreground">
            诊断 Windows、命令行、Git 和 npm 的开发代理状态，并按目标地址统一修复。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="rounded-2xl" onClick={() => void scanTarget(target)} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新诊断
          </Button>
          <Button variant="outline" className="rounded-2xl" onClick={() => void handleOpenSettings()}>
            <ExternalLink size={16} />
            系统设置
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-none">
        <CardContent className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.82fr_1.18fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <CardDescription>诊断摘要</CardDescription>
                <CardTitle className="text-2xl font-black">{summaryCopy.title}</CardTitle>
                <p className="max-w-2xl text-sm font-bold text-muted-foreground">{summaryCopy.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={cn('px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em]', portToneClassNames[portTone])}
                >
                  {portStatus}
                </Badge>
                <Badge variant="outline" className="px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
                  {snapshot?.target.url || target}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.72fr_1.28fr]">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">代理地址</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    className="h-12 rounded-2xl font-bold"
                    placeholder="127.0.0.1:7897"
                  />
                  <Button
                    variant="outline"
                    className="h-12 rounded-2xl px-4"
                    onClick={() => void handleProbeTarget(target, '目标代理')}
                    disabled={loading || Boolean(probeLoadingKey)}
                  >
                    <Gauge size={16} className={cn(targetProbeLoading && 'animate-pulse')} />
                    {targetProbeLoading ? '测试中' : '测试目标代理'}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">旁路规则</label>
                <textarea
                  value={bypass}
                  onChange={(event) => setBypass(event.target.value)}
                  className="min-h-20 w-full rounded-3xl border border-white/20 bg-white/50 px-5 py-3 text-sm font-medium shadow-soft-sm backdrop-blur-sm transition-all duration-300 ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-white/10 dark:bg-white/10"
                  placeholder="localhost;127.*;<local>"
                />
              </div>
            </div>
          </div>

          {probeResult && (
            <div className="grid gap-3 rounded-2xl border border-zinc-200/70 bg-zinc-50/70 p-3 dark:border-white/10 dark:bg-white/5 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1.4fr)]">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  最近测试 · {probeResult.label}
                </div>
                <div className="truncate font-mono text-xs font-bold text-foreground" title={probeResult.data.target.url}>
                  {probeResult.data.target.url}
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                <div
                  className={cn(
                    'min-w-0 rounded-xl border px-3 py-2 text-xs font-black',
                    probeCheckToneClassNames[getProbeCheckTone(probeResult.data.port)]
                  )}
                  title={formatProbeCheckDetail(probeResult.data.port)}
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] opacity-70">端口连通</div>
                  <div className="truncate">{formatProbeCheckDetail(probeResult.data.port)}</div>
                </div>
                <div
                  className={cn(
                    'min-w-0 rounded-xl border px-3 py-2 text-xs font-black',
                    probeCheckToneClassNames[getProbeCheckTone(probeResult.data.proxy)]
                  )}
                  title={formatProbeCheckDetail(probeResult.data.proxy)}
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] opacity-70">代理请求</div>
                  <div className="truncate">{formatProbeCheckDetail(probeResult.data.proxy)}</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              className="rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/20 hover:bg-emerald-600"
              onClick={() => void handleApplyAll()}
              disabled={loading}
            >
              <Wrench size={16} />
              一键修复开发代理
            </Button>
            <Button variant="destructive" className="rounded-2xl" onClick={() => void handleClearAll()} disabled={loading}>
              <Power size={16} />
              清除开发代理
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-none">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardDescription>状态灯总览</CardDescription>
            <CardTitle className="text-xl font-black">环境代理与连通性</CardTitle>
          </div>
          <Badge variant="outline" className="w-fit px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
            {problemLayerCount > 0 ? `${problemLayerCount} 项需要关注` : '全部正常'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {snapshot ? (
            <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/50 dark:border-white/10 dark:bg-white/5">
              <div className="grid grid-cols-[minmax(8rem,0.9fr)_6.5rem_minmax(13rem,1.1fr)_minmax(8rem,0.9fr)] gap-3 border-b border-zinc-200/70 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground dark:border-white/10">
                <span>环境</span>
                <span>代理状态</span>
                <span>建议与操作</span>
                <span>当前配置</span>
              </div>
              <div className="divide-y divide-zinc-200/70 dark:divide-white/10">
                {snapshot.layers.map((layer) => {
                  const lamp = getLayerLampCopy(layer, snapshot?.portOpen)
                  const hasAction = needsLayerAction(layer)
                  const currentTargetCandidate = getFirstProxyTargetCandidate(layer.currentValue)
                  const currentProbeLabel = `${layer.title} 当前值`
                  const currentProbeKey = currentTargetCandidate ? makeProbeKey(currentProbeLabel, currentTargetCandidate) : ''
                  const currentProbeLoading = probeLoadingKey === currentProbeKey
                  const shouldProbeCurrentValue = Boolean(
                    currentTargetCandidate &&
                    normalizeComparableProxyValue(currentTargetCandidate) !== targetComparable
                  )
                  return (
                    <div
                      key={layer.id}
                      className="environment-status-row grid grid-cols-[minmax(8rem,0.9fr)_6.5rem_minmax(13rem,1.1fr)_minmax(8rem,0.9fr)] items-center gap-3 px-4 py-4 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 rounded-full ring-4',
                            layerToneClassNames[lamp.tone]
                          )}
                          aria-label={`${layer.title}${lamp.stateLabel}`}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-black text-foreground">{layer.title}</div>
                          <div className="text-xs font-bold text-muted-foreground">{getLayerStateLabel(layer.state)}</div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={cn('truncate font-black', layerTextToneClassNames[lamp.tone])}>{lamp.stateLabel}</div>
                        <div className="truncate text-xs font-bold text-muted-foreground">{lamp.reachabilityLabel}</div>
                      </div>
                      <div className="environment-action-cell flex min-w-0 flex-wrap items-center gap-2">
                        <div className={cn('min-w-[9rem] flex-1 text-xs font-bold leading-relaxed', hasAction ? 'text-foreground' : 'text-muted-foreground')}>
                          {getLayerActionHint(layer)}
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-2">
                          {shouldProbeCurrentValue && currentTargetCandidate && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-xl px-3"
                              onClick={() => void handleProbeTarget(currentTargetCandidate, currentProbeLabel)}
                              disabled={loading || Boolean(probeLoadingKey)}
                            >
                              <Gauge size={14} className={cn(currentProbeLoading && 'animate-pulse')} />
                              {currentProbeLoading ? '测试中' : '测试当前值'}
                            </Button>
                          )}
                          {hasAction ? (
                            <>
                              {layer.canFix && (
                                <Button variant="outline" size="sm" className="h-8 rounded-xl px-3" onClick={() => void handleFixLayer(layer)} disabled={loading}>
                                  修复
                                </Button>
                              )}
                              {layer.canClear && layer.currentValue.trim().length > 0 && (
                                <Button variant="outline" size="sm" className="h-8 rounded-xl px-3" onClick={() => void handleClearLayer(layer)} disabled={loading}>
                                  清除
                                </Button>
                              )}
                            </>
                          ) : (
                            <span className="text-xs font-black text-muted-foreground">无需处理</span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 truncate font-mono text-xs font-bold text-muted-foreground" title={layer.currentValue || '未设置'}>
                        {layer.currentValue || '未设置'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-zinc-300/80 px-5 py-8 text-sm font-bold text-muted-foreground">
              正在等待诊断结果。
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-none">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl font-black">高级日志与报告</CardTitle>
            <CardDescription>查看可复制的诊断文本和近期操作记录。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setAdvancedOpen((open) => !open)}>
              {advancedOpen ? '收起' : '展开'}
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void handleCopyReport()} disabled={!snapshot && log.length === 0}>
              <Copy size={14} />
              复制诊断报告
            </Button>
          </div>
        </CardHeader>
        {advancedOpen && (
          <CardContent>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-3xl bg-zinc-950/90 p-5 text-xs font-medium leading-relaxed text-zinc-100">
              {reportText}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
