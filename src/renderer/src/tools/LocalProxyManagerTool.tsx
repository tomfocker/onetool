import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, ExternalLink, Network, Power, RefreshCw, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useGlobalStore } from '@/store'
import type { LocalProxyConfig, LocalProxyStatus } from '../../../shared/types'

const DEFAULT_BYPASS = [
  'localhost',
  '127.*',
  '192.168.*',
  '10.*',
  '172.16.*',
  '172.17.*',
  '172.18.*',
  '172.19.*',
  '172.20.*',
  '172.21.*',
  '172.22.*',
  '172.23.*',
  '172.24.*',
  '172.25.*',
  '172.26.*',
  '172.27.*',
  '172.28.*',
  '172.29.*',
  '172.30.*',
  '172.31.*',
  '<local>'
]

const QUICK_PRESETS: Array<{ label: string; host: string; port: number; protocol: LocalProxyConfig['protocol'] }> = [
  { label: 'Clash HTTP 7890', host: '127.0.0.1', port: 7890, protocol: 'http' },
  { label: 'Mixed 7897', host: '127.0.0.1', port: 7897, protocol: 'http' },
  { label: 'v2rayN SOCKS 10808', host: '127.0.0.1', port: 10808, protocol: 'socks5' }
]

function splitBypass(value: string): string[] {
  return value
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function LocalProxyManagerTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const [status, setStatus] = useState<LocalProxyStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    host: '127.0.0.1',
    port: '7890',
    protocol: 'http' as LocalProxyConfig['protocol'],
    bypass: DEFAULT_BYPASS.join(';')
  })

  const syncFormWithStatus = useCallback((nextStatus: LocalProxyStatus) => {
    setForm({
      host: nextStatus.host || '127.0.0.1',
      port: nextStatus.port ? String(nextStatus.port) : '7890',
      protocol: nextStatus.protocol === 'socks5' ? 'socks5' : 'http',
      bypass: nextStatus.bypass.length > 0 ? nextStatus.bypass.join(';') : DEFAULT_BYPASS.join(';')
    })
  }, [])

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }

    const result = await window.electron.localProxy.getStatus()
    if (result.success && result.data) {
      setStatus(result.data)
      syncFormWithStatus(result.data)
    } else if (!silent) {
      showNotification({
        type: 'error',
        title: '代理状态读取失败',
        message: result.error || '无法读取当前系统代理配置。'
      })
    }

    if (!silent) {
      setLoading(false)
    }
  }, [showNotification, syncFormWithStatus])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const handleApply = async () => {
    const port = Number(form.port)
    if (!form.host.trim()) {
      showNotification({ type: 'warning', message: '请输入代理地址。' })
      return
    }
    if (!Number.isFinite(port) || port <= 0) {
      showNotification({ type: 'warning', message: '请输入有效端口。' })
      return
    }

    setLoading(true)
    const result = await window.electron.localProxy.setConfig({
      host: form.host.trim(),
      port,
      protocol: form.protocol,
      bypass: splitBypass(form.bypass)
    })
    setLoading(false)

    if (result.success && result.data) {
      setStatus(result.data)
      syncFormWithStatus(result.data)
      showNotification({
        type: 'success',
        title: '代理已更新',
        message: `当前系统代理已切换到 ${result.data.server || `${form.host}:${form.port}`}`
      })
      return
    }

    showNotification({
      type: 'error',
      title: '代理设置失败',
      message: result.error || '系统代理未能成功写入。'
    })
  }

  const handleDisable = async () => {
    setLoading(true)
    const result = await window.electron.localProxy.disable()
    setLoading(false)

    if (result.success && result.data) {
      setStatus(result.data)
      showNotification({
        type: 'success',
        title: '代理已关闭',
        message: '当前用户级 Windows 代理已禁用。'
      })
      return
    }

    showNotification({
      type: 'error',
      title: '关闭失败',
      message: result.error || '未能关闭系统代理。'
    })
  }

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

  const handleCopy = async () => {
    if (!status?.server) {
      return
    }
    await navigator.clipboard.writeText(status.server)
    showNotification({
      type: 'info',
      message: '已复制当前 ProxyServer 字符串。'
    })
  }

  const summary = useMemo(() => {
    const serverLabel = status?.server || '未启用'
    const modeLabel =
      status?.protocol === 'socks5'
        ? 'SOCKS5'
        : status?.protocol === 'http'
          ? 'HTTP / HTTPS'
          : '未识别'

    return {
      serverLabel,
      modeLabel,
      bypassCount: status?.bypass.length || 0
    }
  }, [status])

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <ShieldCheck className="text-emerald-500" size={30} />
            本地代理管理
          </h2>
          <p className="text-sm font-bold text-muted-foreground">
            管理当前用户级 Windows 系统代理，适合切换本地代理端口、常见客户端预设和手动旁路规则。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className={cn(
              'px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em]',
              status?.enabled
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                : 'border-zinc-300/60 bg-zinc-500/5 text-zinc-500'
            )}
          >
            {status?.enabled ? 'Proxy On' : 'Proxy Off'}
          </Badge>
          <Button variant="outline" className="rounded-2xl" onClick={() => void fetchStatus()}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新状态
          </Button>
          <Button variant="outline" className="rounded-2xl" onClick={() => void handleOpenSettings()}>
            <ExternalLink size={16} />
            系统设置
          </Button>
          <Button
            className="rounded-2xl bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
            onClick={() => void handleDisable()}
          >
            <Power size={16} />
            关闭代理
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none overflow-hidden">
          <CardHeader className="pb-3">
            <CardDescription>当前状态</CardDescription>
            <CardTitle className="text-xl font-black">{status?.enabled ? '已启用' : '未启用'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <div className={cn('w-2.5 h-2.5 rounded-full', status?.enabled ? 'bg-emerald-500' : 'bg-zinc-400')} />
              当前仅管理 WinINET 用户级代理，不改动 WinHTTP。
            </div>
          </CardContent>
        </Card>

        <Card className="border-none overflow-hidden">
          <CardHeader className="pb-3">
            <CardDescription>当前地址</CardDescription>
            <CardTitle className="text-xl font-black truncate">{summary.serverLabel}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">模式：{summary.modeLabel}</span>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => void handleCopy()} disabled={!status?.server}>
              <Copy size={14} />
              复制
            </Button>
          </CardContent>
        </Card>

        <Card className="border-none overflow-hidden">
          <CardHeader className="pb-3">
            <CardDescription>旁路规则</CardDescription>
            <CardTitle className="text-xl font-black">{summary.bypassCount} 条</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs font-bold text-muted-foreground">
            AutoConfigURL: {status?.autoConfigUrl || '未配置'}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <Card className="border-none overflow-hidden">
          <CardHeader>
            <CardTitle className="text-xl font-black flex items-center gap-2">
              <Network size={18} className="text-emerald-500" />
              手动代理配置
            </CardTitle>
            <CardDescription>HTTP 模式会同时写入 HTTP / HTTPS；SOCKS5 模式会写入 socks 项。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {(['http', 'socks5'] as Array<LocalProxyConfig['protocol']>).map((protocol) => (
                <button
                  key={protocol}
                  onClick={() => setForm((prev) => ({ ...prev, protocol }))}
                  className={cn(
                    'px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em] border transition-all',
                    form.protocol === protocol
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                      : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted'
                  )}
                >
                  {protocol === 'http' ? 'HTTP / HTTPS' : 'SOCKS5'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">代理地址</label>
                <Input
                  value={form.host}
                  onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))}
                  className="h-12 rounded-2xl font-bold"
                  placeholder="127.0.0.1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">代理端口</label>
                <Input
                  value={form.port}
                  onChange={(event) => setForm((prev) => ({ ...prev, port: event.target.value }))}
                  className="h-12 rounded-2xl font-bold"
                  placeholder="7890"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">旁路规则</label>
              <textarea
                value={form.bypass}
                onChange={(event) => setForm((prev) => ({ ...prev, bypass: event.target.value }))}
                className="w-full min-h-32 rounded-3xl border border-white/20 dark:border-white/10 bg-white/50 dark:bg-white/10 backdrop-blur-sm px-5 py-4 text-sm font-medium shadow-soft-sm transition-all duration-300 ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                placeholder="localhost;127.*;<local>"
              />
              <p className="text-[11px] font-medium text-muted-foreground">
                支持使用分号或换行分隔。默认已覆盖常见内网网段和 <code>{'<local>'}</code>。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                onClick={() => void handleApply()}
              >
                应用到系统代理
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setForm((prev) => ({ ...prev, bypass: DEFAULT_BYPASS.join(';') }))}
              >
                恢复默认旁路
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-none overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl font-black">常用本地代理预设</CardTitle>
              <CardDescription>按常见客户端端口快速填充，但不会自动应用。</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      host: preset.host,
                      port: String(preset.port),
                      protocol: preset.protocol
                    }))
                  }
                  className="flex items-center justify-between px-4 py-4 rounded-2xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 transition-all text-left"
                >
                  <div>
                    <div className="text-sm font-black">{preset.label}</div>
                    <div className="text-xs font-medium text-muted-foreground">
                      {preset.protocol === 'http' ? 'HTTP / HTTPS' : 'SOCKS5'} · {preset.host}:{preset.port}
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/20 text-emerald-600 bg-emerald-500/5">
                    填充
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-none overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl font-black">实时提示</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm font-medium text-muted-foreground">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-500/5 border border-zinc-500/10">
                <AlertTriangle size={18} className="shrink-0 text-amber-500 mt-0.5" />
                <p>关闭代理只会关闭当前用户的 WinINET 代理开关，不会自动清除其他代理工具自身配置。</p>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                <ShieldCheck size={18} className="shrink-0 text-emerald-500 mt-0.5" />
                <p>如果你依赖命令行代理或 WinHTTP，请在对应工具里单独配置，避免出现浏览器和终端行为不一致。</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
