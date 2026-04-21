import React, { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderOpen,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  XCircle
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useBilibiliDownloader } from '@/hooks/useBilibiliDownloader'
import type { BilibiliDownloadStage, BilibiliParsedItem } from '../../../shared/types'

function formatExpiry(value: string | null) {
  if (!value) {
    return '未提供过期时间'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN')
}

function getLinkKindLabel(kind?: string | null) {
  switch (kind) {
    case 'video':
      return '视频'
    case 'episode':
      return '番剧单集'
    case 'season':
      return '番剧整季'
    default:
      return '未解析'
  }
}

function getItemMetaLabel(item: BilibiliParsedItem | null) {
  if (!item) {
    return '还没有选中条目'
  }

  if (item.kind === 'page') {
    return `分 P ${item.page}`
  }

  if (item.kind === 'episode') {
    return item.epId
  }

  return item.seasonId
}

function getStageBadgeClass(stage: BilibiliDownloadStage) {
  if (stage === 'completed') {
    return 'border-emerald-500/20 text-emerald-600'
  }

  if (stage === 'failed') {
    return 'border-red-500/20 text-red-600'
  }

  if (stage === 'cancelled') {
    return 'border-amber-500/20 text-amber-600'
  }

  if (stage === 'idle') {
    return 'border-slate-500/20 text-slate-600'
  }

  return 'border-sky-500/20 text-sky-600'
}

export default function BilibiliDownloaderTool() {
  const {
    state,
    linkInput,
    outputDirectory,
    exportMode,
    pendingAction,
    loginPollStatus,
    loginQrPayload,
    selectedItem,
    loadedStreamOptions,
    lastDownloadResult,
    stageLabel,
    loginStatusLabel,
    exportModeOptions,
    isBusy,
    isDownloading,
    hasParsedLink,
    hasMultipleItems,
    canPollLogin,
    canStartDownload,
    setLinkInput,
    setOutputDirectory,
    setExportMode,
    startLogin,
    pollLogin,
    logout,
    parseLink,
    selectItem,
    chooseOutputDirectory,
    startDownload,
    cancelDownload
  } = useBilibiliDownloader()

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!loginQrPayload?.qrUrl) {
      setQrCodeDataUrl(null)
      return
    }

    let cancelled = false
    void QRCode.toDataURL(loginQrPayload.qrUrl, {
      width: 220,
      margin: 1
    }).then((dataUrl) => {
      if (!cancelled) {
        setQrCodeDataUrl(dataUrl)
      }
    }).catch(() => {
      if (!cancelled) {
        setQrCodeDataUrl(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [loginQrPayload?.qrUrl])

  const selectedStreamHint = useMemo(() => {
    if (loadedStreamOptions.qnOptions.length === 0) {
      return '解析后会在这里显示当前条目的可用清晰度。'
    }

    const selected = loadedStreamOptions.qnOptions.find((item) => item.selected) ?? loadedStreamOptions.qnOptions[0]
    return `服务当前会按默认清晰度下载，当前默认档位：${selected?.label ?? '未知'}。`
  }, [loadedStreamOptions.qnOptions])

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 bg-clip-text text-transparent">
            B 站下载
          </h1>
          <p className="text-sm font-medium text-muted-foreground">
            用已有主进程能力完成登录、链接解析和音视频导出。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Badge variant="outline" className="rounded-full px-4 py-1.5 border-pink-500/20 text-pink-600">
            {loginStatusLabel}
          </Badge>
          <Badge variant="outline" className={`rounded-full px-4 py-1.5 ${getStageBadgeClass(state.taskStage)}`}>
            {stageLabel}
          </Badge>
        </div>
      </div>

      {state.error && (
        <div className="rounded-3xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="glass-card border-none xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-black">
              <QrCode className="w-5 h-5 text-pink-500" />
              登录
            </CardTitle>
            <CardDescription>先拿到 Bilibili 会话。轮询登录由你手动触发。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {state.loginSession.isLoggedIn ? (
              <div className="rounded-3xl border border-emerald-500/15 bg-emerald-500/5 p-4 space-y-4">
                <div className="flex items-center gap-3">
                  {state.loginSession.avatarUrl ? (
                    <img
                      src={state.loginSession.avatarUrl}
                      alt={state.loginSession.nickname ?? 'Bilibili avatar'}
                      className="w-12 h-12 rounded-full object-cover border border-white/40"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-white font-black flex items-center justify-center">
                      {(state.loginSession.nickname ?? 'B').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-black truncate">{state.loginSession.nickname ?? '已登录用户'}</div>
                    <div className="text-xs text-muted-foreground">会话到期：{formatExpiry(state.loginSession.expiresAt)}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  当前渲染层只感知登录状态，不展示更细的账号权限信息。
                </div>
              </div>
            ) : qrCodeDataUrl ? (
              <div className="rounded-3xl border border-border/60 bg-background/70 p-4 space-y-4">
                <img src={qrCodeDataUrl} alt="Bilibili login QR" className="w-full max-w-[220px] mx-auto rounded-2xl" />
                <div className="text-center space-y-1">
                  <div className="font-semibold">扫码后点一次“轮询状态”</div>
                  <div className="text-xs text-muted-foreground">
                    {loginPollStatus === 'scanned' ? '已扫码，等待手机端确认' : '等待手机客户端扫码'}
                  </div>
                  <div className="text-[11px] text-muted-foreground break-all">authCode: {loginQrPayload?.authCode}</div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                还没有登录二维码。点击“开始登录”后在这里显示。
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              <Button onClick={() => void startLogin()} disabled={state.loginSession.isLoggedIn || pendingAction === 'start-login'}>
                <LogIn className="w-4 h-4 mr-2" />
                {pendingAction === 'start-login' ? '生成中...' : '开始登录'}
              </Button>
              <Button variant="outline" onClick={() => void pollLogin()} disabled={!canPollLogin || pendingAction === 'poll-login'}>
                <RefreshCw className={`w-4 h-4 mr-2 ${pendingAction === 'poll-login' ? 'animate-spin' : ''}`} />
                轮询状态
              </Button>
              <Button variant="secondary" onClick={() => void logout()} disabled={!state.loginSession.isLoggedIn || pendingAction === 'logout'}>
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-none xl:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-black">
              <Link2 className="w-5 h-5 text-sky-500" />
              解析 / 选择
            </CardTitle>
            <CardDescription>粘贴视频、番剧单集或整季链接，解析后切换要下载的条目。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-2">
              <Input
                value={linkInput}
                onChange={(event) => setLinkInput(event.target.value)}
                placeholder="https://www.bilibili.com/video/BV..."
              />
              <Button onClick={() => void parseLink()} disabled={pendingAction === 'parse-link'}>
                {pendingAction === 'parse-link' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {hasParsedLink && state.parsedLink ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-border/60 bg-background/70 p-4">
                  <div className="flex gap-4">
                    {state.parsedLink.coverUrl ? (
                      <img
                        src={state.parsedLink.coverUrl}
                        alt={state.parsedLink.title ?? 'Bilibili cover'}
                        className="w-28 h-20 rounded-2xl object-cover border border-border/50"
                      />
                    ) : (
                      <div className="w-28 h-20 rounded-2xl bg-muted/60 border border-border/50 flex items-center justify-center text-muted-foreground">
                        <Link2 className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="font-black text-base line-clamp-2">{state.parsedLink.title ?? '未命名内容'}</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="rounded-full px-3 py-1">{getLinkKindLabel(state.parsedLink.kind)}</Badge>
                        <Badge variant="outline" className="rounded-full px-3 py-1">条目 {state.parsedLink.items.length}</Badge>
                        <Badge variant="outline" className="rounded-full px-3 py-1">{getItemMetaLabel(selectedItem)}</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {hasMultipleItems ? '选择条目' : '当前条目'}
                  </label>
                  <select
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                    value={state.parsedLink.selectedItemId}
                    onChange={(event) => void selectItem(event.target.value)}
                    disabled={isBusy}
                  >
                    {state.parsedLink.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-3xl border border-border/60 bg-background/70 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">流信息</div>
                    {pendingAction === 'load-stream-options' && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        重新加载中
                      </div>
                    )}
                  </div>

                  {loadedStreamOptions.qnOptions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {loadedStreamOptions.qnOptions.map((item) => (
                        <Badge
                          key={`${item.qn}-${item.label}`}
                          variant="outline"
                          className={
                            item.selected
                              ? 'rounded-full px-3 py-1 border-sky-500/20 text-sky-600'
                              : 'rounded-full px-3 py-1'
                          }
                        >
                          {item.label}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">还没有流信息。</div>
                  )}

                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {selectedStreamHint}
                    {' '}Task 5 暂未暴露切换清晰度的接口，所以这里仅展示可用档位。
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                解析成功后会在这里显示封面、条目列表和可用流信息。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card border-none xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-black">
              <Download className="w-5 h-5 text-orange-500" />
              下载
            </CardTitle>
            <CardDescription>选择导出方式和输出目录，然后启动或取消当前任务。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">输出目录</label>
              <div className="flex gap-2">
                <Input
                  value={outputDirectory}
                  onChange={(event) => setOutputDirectory(event.target.value)}
                  placeholder="留空则使用系统下载目录"
                />
                <Button variant="outline" onClick={() => void chooseOutputDirectory()} disabled={pendingAction === 'select-output-directory'}>
                  <FolderOpen className="w-4 h-4 mr-2" />
                  选择
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                当前后端支持传入目录路径；留空时会回落到系统下载目录。
              </div>
            </div>

            <div className="grid gap-3">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">导出方式</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {exportModeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!option.available}
                    onClick={() => setExportMode(option.value)}
                    className={[
                      'rounded-2xl border px-3 py-3 text-left transition-colors',
                      exportMode === option.value
                        ? 'border-orange-500/30 bg-orange-500/10'
                        : 'border-border/60 bg-background/60',
                      !option.available ? 'opacity-50 cursor-not-allowed' : 'hover:border-orange-500/20'
                    ].join(' ')}
                  >
                    <div className="font-semibold">{option.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {option.available ? '可用' : option.disabledReason ?? '当前不可用'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">当前状态</div>
                <Badge variant="outline" className={`rounded-full px-3 py-1 ${getStageBadgeClass(state.taskStage)}`}>
                  {stageLabel}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedItem ? `当前条目：${selectedItem.title}` : '还没有可下载的条目。'}
              </div>
              {lastDownloadResult?.outputPaths?.length ? (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">最近输出</div>
                  <div className="space-y-2">
                    {lastDownloadResult.outputPaths.map((item) => (
                      <div key={item} className="rounded-2xl border border-border/50 bg-background/80 px-3 py-2 text-xs break-all">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void startDownload()} disabled={!canStartDownload || pendingAction === 'start-download'}>
                {pendingAction === 'start-download' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                开始下载
              </Button>
              <Button variant="destructive" onClick={() => void cancelDownload()} disabled={!isDownloading && pendingAction !== 'cancel-download'}>
                {pendingAction === 'cancel-download' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )}
                取消下载
              </Button>
            </div>

            <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-3 text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-2">
                {state.taskStage === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : state.taskStage === 'failed' ? (
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                ) : (
                  <RefreshCw className={`w-4 h-4 ${isDownloading ? 'animate-spin text-sky-500' : 'text-muted-foreground'}`} />
                )}
                <span>{stageLabel}</span>
              </div>
              <div>
                只暴露了当前已接好的主进程能力：登录、解析、条目切换、导出方式、目录选择、开始/取消下载。
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
