import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Copy, ExternalLink, Power, RefreshCw, ShieldCheck, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useGlobalStore } from '@/store'
import type { ProxyDoctorLayerStatus, ProxyDoctorSnapshot } from '../../../shared/proxyDoctor'
import {
  DEFAULT_PROXY_DOCTOR_BYPASS,
  DEFAULT_PROXY_DOCTOR_TARGET,
  createProxyDoctorApplyRequest,
  getLayerStateLabel,
  getLayerStateTone,
  getSummaryCopy
} from './localProxyDoctorViewModel'

const layerToneClassNames = {
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
  muted: 'border-zinc-300/60 bg-zinc-500/5 text-zinc-500',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-600',
  danger: 'border-red-500/20 bg-red-500/10 text-red-600'
}

function getLayerBadgeClassName(layer: ProxyDoctorLayerStatus): string {
  return layerToneClassNames[getLayerStateTone(layer.state)]
}

export default function LocalProxyManagerTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const [snapshot, setSnapshot] = useState<ProxyDoctorSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState(DEFAULT_PROXY_DOCTOR_TARGET)
  const [bypass, setBypass] = useState(DEFAULT_PROXY_DOCTOR_BYPASS.join(';'))
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const appendLog = useCallback((message: string) => {
    setLog((previous) => [message, ...previous].slice(0, 12))
  }, [])

  const scan = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true)
      }

      const result = await window.electron.localProxy.doctorScan(target)

      if (result.success && result.data) {
        setSnapshot(result.data)
        const summary = getSummaryCopy(result.data.summary).title
        appendLog(`扫描完成: ${summary}`)
      } else {
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
    [appendLog, showNotification, target]
  )

  useEffect(() => {
    void scan()
  }, [])

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
      await scan(true)
      return
    }

    showNotification({
      type: 'error',
      title: '清理失败',
      message: result.error || '未能清除开发代理配置。'
    })
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
      await scan(true)
      return
    }

    showNotification({
      type: 'error',
      title: '单层修复失败',
      message: result.error || `${layer.title} 未能修复。`
    })
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
      await scan(true)
      return
    }

    showNotification({
      type: 'error',
      title: '单层清除失败',
      message: result.error || `${layer.title} 未能清除。`
    })
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
  const reportText = useMemo(() => snapshot?.reportText || log.join('\n') || '暂无诊断日志。', [log, snapshot])

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
          <Button variant="outline" className="rounded-2xl" onClick={() => void scan()} disabled={loading}>
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-black">
            <Activity size={18} className="text-emerald-500" />
            目标代理
          </CardTitle>
          <CardDescription>用于统一写入系统代理、环境变量、Git 和 npm。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">代理地址</label>
              <Input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="h-12 rounded-2xl font-bold"
                placeholder="127.0.0.1:7897"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">旁路规则</label>
              <textarea
                value={bypass}
                onChange={(event) => setBypass(event.target.value)}
                className="min-h-28 w-full rounded-3xl border border-white/20 bg-white/50 px-5 py-4 text-sm font-medium shadow-soft-sm backdrop-blur-sm transition-all duration-300 ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-white/10 dark:bg-white/10"
                placeholder="localhost;127.*;<local>"
              />
            </div>
          </div>

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden border-none">
          <CardHeader>
            <CardDescription>诊断摘要</CardDescription>
            <CardTitle className="text-2xl font-black">{summaryCopy.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-bold text-muted-foreground">{summaryCopy.description}</p>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em]',
                  snapshot?.portOpen
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                    : 'border-amber-500/20 bg-amber-500/10 text-amber-600'
                )}
              >
                {portStatus}
              </Badge>
              <Badge variant="outline" className="px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
                {snapshot?.target.url || target}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <AlertTriangle size={18} className="text-amber-500" />
              操作提示
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm font-medium text-muted-foreground">
            <p>一键修复会覆盖已管理层的代理值；无法直接修改的进程层会给出重启提示。</p>
            <p>如果端口未响应，请先确认本地代理客户端已启动并监听目标端口。</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(snapshot?.layers || []).map((layer) => (
          <Card key={layer.id} className="overflow-hidden border-none">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-black">{layer.title}</CardTitle>
                  <CardDescription>{layer.detail}</CardDescription>
                </div>
                <Badge variant="outline" className={cn('shrink-0 font-black', getLayerBadgeClassName(layer))}>
                  {getLayerStateLabel(layer.state)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-zinc-500/5 p-4 text-xs font-bold text-muted-foreground">
                <div className="mb-1 text-[11px] uppercase tracking-[0.2em]">当前值</div>
                <div className="break-all text-sm text-foreground">{layer.currentValue || '未设置'}</div>
              </div>
              <p className="text-sm font-medium text-muted-foreground">{layer.actionHint}</p>
              <div className="flex flex-wrap gap-2">
                {layer.canFix && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void handleFixLayer(layer)} disabled={loading}>
                    <Wrench size={14} />
                    修复此层
                  </Button>
                )}
                {layer.canClear && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void handleClearLayer(layer)} disabled={loading}>
                    <Power size={14} />
                    清除此层
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
