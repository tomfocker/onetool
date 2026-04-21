import React, { useEffect, useMemo, useState } from 'react'
import {
  CloudDownload,
  ExternalLink,
  FolderOpen,
  KeyRound,
  Rocket,
  Square,
  Trash2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { ModelDownloadRequest, ModelDownloadState } from '../../../shared/modelDownload'

const resourceLinks = [
  { label: 'HuggingFace 官网', href: 'https://huggingface.co' },
  { label: 'ModelScope 魔搭', href: 'https://modelscope.cn' },
  { label: 'Civitai', href: 'https://civitai.com' }
]

const initialState: ModelDownloadState = {
  status: 'idle',
  defaultSavePath: '',
  currentRequest: null,
  logs: [],
  runtime: {
    ready: false,
    resourceRoot: null,
    pythonPath: null,
    scriptPath: null
  },
  lastOutputPath: null,
  lastError: null
}

export default function ModelDownloadTool() {
  const [state, setState] = useState<ModelDownloadState>(initialState)
  const [form, setForm] = useState<ModelDownloadRequest>({
    platform: 'huggingface',
    repoId: '',
    filePath: '',
    savePath: '',
    hfToken: '',
    useHfMirror: true
  })
  const [isLoading, setIsLoading] = useState(true)

  const modelDownload = window.electron?.modelDownload

  useEffect(() => {
    if (!modelDownload) {
      setIsLoading(false)
      return
    }

    let mounted = true

    const load = async () => {
      const result = await modelDownload.getState()
      if (!mounted || !result.success || !result.data) {
        setIsLoading(false)
        return
      }

      const nextState = result.data

      setState(nextState)
      setForm((prev) => ({
        ...prev,
        savePath: prev.savePath || nextState.defaultSavePath
      }))
      setIsLoading(false)
    }

    void load()

    const unsubscribe = modelDownload.onStateChanged((nextState) => {
      if (!mounted) {
        return
      }

      setState(nextState)
      setForm((prev) => ({
        ...prev,
        savePath: prev.savePath || nextState.defaultSavePath
      }))
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [modelDownload])

  const isRunning = state.status === 'running'
  const statusText = useMemo(() => {
    switch (state.status) {
      case 'running':
        return '下载中'
      case 'success':
        return '已完成'
      case 'error':
        return '失败'
      case 'cancelled':
        return '已取消'
      default:
        return '待命'
    }
  }, [state.status])

  const handleStart = async () => {
    if (!modelDownload) {
      return
    }
    await modelDownload.startDownload(form)
  }

  const handleCancel = async () => {
    if (!modelDownload) {
      return
    }
    await modelDownload.cancelDownload()
  }

  const handleChooseSavePath = async () => {
    if (!modelDownload) {
      return
    }
    const result = await modelDownload.chooseSavePath()
    const selectedPath = result.success ? result.data?.path : null
    if (selectedPath) {
      setForm((prev) => ({ ...prev, savePath: selectedPath }))
    }
  }

  const handleOpenPath = async () => {
    if (!modelDownload) {
      return
    }
    await modelDownload.openPath(state.lastOutputPath || form.savePath)
  }

  const handleClearLogs = () => {
    setState((prev) => ({ ...prev, logs: [] }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-sky-500 to-blue-700 bg-clip-text text-transparent">
            模型下载
          </h1>
          <p className="text-sm font-medium text-muted-foreground">
            原生接入 HuggingFace 与 ModelScope，支持整仓和单文件下载。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge variant="outline" className="rounded-full px-4 py-1.5 border-sky-500/20 text-sky-600">
            {statusText}
          </Badge>
          <Badge variant="outline" className="rounded-full px-4 py-1.5">
            运行时 {state.runtime.ready ? '就绪' : '缺失'}
          </Badge>
        </div>
      </div>

      {state.lastError && (
        <div className="rounded-3xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-600 dark:text-red-400">
          {state.lastError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 space-y-6">
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-black">
                <CloudDownload className="w-5 h-5 text-sky-500" />
                下载参数
              </CardTitle>
              <CardDescription>支持 HuggingFace 镜像、Token、整仓下载和单文件下载。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">平台</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'huggingface', label: 'HuggingFace' },
                    { id: 'modelscope', label: 'ModelScope' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, platform: item.id as ModelDownloadRequest['platform'] }))}
                      className={`h-11 rounded-2xl border text-sm font-black transition-all ${
                        form.platform === item.id
                          ? 'border-sky-500 bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                          : 'border-border bg-background/60 hover:border-sky-500/40'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">仓库 ID</label>
                <Input
                  value={form.repoId}
                  onChange={(event) => setForm((prev) => ({ ...prev, repoId: event.target.value }))}
                  placeholder="Qwen/Qwen2.5-0.5B-Instruct"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">单文件路径</label>
                <Input
                  value={form.filePath}
                  onChange={(event) => setForm((prev) => ({ ...prev, filePath: event.target.value }))}
                  placeholder="可留空；如 config.json"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">保存目录</label>
                <div className="flex gap-2">
                  <Input
                    value={form.savePath}
                    onChange={(event) => setForm((prev) => ({ ...prev, savePath: event.target.value }))}
                    placeholder={state.defaultSavePath || '选择保存目录'}
                  />
                  <Button variant="outline" onClick={handleChooseSavePath}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    选择
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">HF Token</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    className="pl-9"
                    value={form.hfToken}
                    onChange={(event) => setForm((prev) => ({ ...prev, hfToken: event.target.value }))}
                    placeholder="可选；下载受限模型时填写"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.useHfMirror}
                  onChange={(event) => setForm((prev) => ({ ...prev, useHfMirror: event.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                使用 HF 镜像加速
              </label>

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void handleStart()} disabled={isRunning || !state.runtime.ready}>
                  <Rocket className="w-4 h-4 mr-2" />
                  开始下载
                </Button>
                <Button variant="destructive" onClick={() => void handleCancel()} disabled={!isRunning}>
                  <Square className="w-4 h-4 mr-2" />
                  取消下载
                </Button>
                <Button variant="outline" onClick={() => void handleOpenPath()}>
                  <FolderOpen className="w-4 h-4 mr-2" />
                  打开目录
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="text-lg font-black">常用资源入口</CardTitle>
              <CardDescription>原工具里的常用站点入口保留在这里。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {resourceLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm font-bold transition-colors hover:border-sky-500/40 hover:text-sky-600"
                >
                  <span>{item.label}</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-7">
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-4 text-lg font-black">
                <span>运行日志</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {state.logs.length} 条
                  </Badge>
                  <Button variant="outline" onClick={handleClearLogs}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    清空
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                {state.lastOutputPath ? `最近输出目录：${state.lastOutputPath}` : '等待任务启动'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-3xl border border-zinc-900/10 bg-zinc-950 text-zinc-100 p-4 min-h-[560px] max-h-[640px] overflow-y-auto font-mono text-xs leading-6">
                {state.logs.length === 0 ? (
                  <div className="text-zinc-500">暂无日志输出。</div>
                ) : (
                  state.logs.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <span className="text-zinc-500 shrink-0">{new Date(item.timestamp).toLocaleTimeString('zh-CN')}</span>
                      <span
                        className={
                          item.level === 'error'
                            ? 'text-red-400'
                            : item.level === 'success'
                              ? 'text-emerald-400'
                              : item.level === 'progress'
                                ? 'text-sky-400'
                                : 'text-zinc-200'
                        }
                      >
                        {item.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
