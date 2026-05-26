import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Brain,
  CalendarDays,
  Download,
  FileText,
  KeyRound,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Square,
  Trash2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  createDefaultMemoryDiaryConfig,
  type MemoryDiaryCliStatus,
  type MemoryDiaryConfig,
  type MemoryDiaryContentType,
  type MemoryDiaryDeploymentLog,
  type MemoryDiaryGenerateResult,
  type MemoryDiaryHistoryEntry,
  type MemoryDiaryRuntimeStatus,
  type MemoryDiaryTimelineBucket
} from '../../../shared/memoryDiary'

const CONTENT_TYPE_LABELS: Record<MemoryDiaryContentType, string> = {
  accessibility: 'Accessibility',
  ocr: 'OCR',
  audio: 'Audio',
  input: 'Input'
}

const BUCKET_OPTIONS: Array<MemoryDiaryConfig['timelineBucketMinutes']> = [5, 15, 30, 60]
const STYLE_OPTIONS: Array<{ value: MemoryDiaryConfig['diaryStyle']; label: string }> = [
  { value: 'brief', label: '简报' },
  { value: 'worklog', label: '工作流' },
  { value: 'blog', label: '博客草稿' }
]

function todayString() {
  const now = new Date()
  const localMs = now.getTime() - now.getTimezoneOffset() * 60 * 1000
  return new Date(localMs).toISOString().slice(0, 10)
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatCsv(value: string[]) {
  return value.join(', ')
}

function getContentTypes(config: MemoryDiaryConfig) {
  const types = new Set<MemoryDiaryContentType>(config.enabledContentTypes)
  if (config.includeAudio) types.add('audio')
  if (config.includeInput) types.add('input')
  return Array.from(types)
}

function statusTone(level: MemoryDiaryDeploymentLog['level']) {
  if (level === 'success') return 'text-emerald-600 dark:text-emerald-300'
  if (level === 'warning') return 'text-amber-600 dark:text-amber-300'
  if (level === 'error') return 'text-rose-600 dark:text-rose-300'
  return 'text-muted-foreground'
}

function panelClassName(className?: string) {
  return cn('rounded-lg before:rounded-lg after:rounded-lg shadow-soft-sm', className)
}

export default function MemoryDiaryTool() {
  const api = window.electron?.memoryDiary
  const [config, setConfig] = useState<MemoryDiaryConfig>(createDefaultMemoryDiaryConfig())
  const [cliStatus, setCliStatus] = useState<MemoryDiaryCliStatus | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<MemoryDiaryRuntimeStatus | null>(null)
  const [logs, setLogs] = useState<MemoryDiaryDeploymentLog[]>([])
  const [timeline, setTimeline] = useState<MemoryDiaryTimelineBucket[]>([])
  const [history, setHistory] = useState<MemoryDiaryHistoryEntry[]>([])
  const [draft, setDraft] = useState<MemoryDiaryGenerateResult | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [userNotes, setUserNotes] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [activeTask, setActiveTask] = useState<string | null>(null)

  const timezone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  }, [])

  const contentTypes = useMemo(() => getContentTypes(config), [config])
  const totalItems = useMemo(() => timeline.reduce((sum, bucket) => sum + bucket.items.length, 0), [timeline])
  const latestLog = logs[0]

  const runTask = async (task: string, work: () => Promise<void>) => {
    if (!api) {
      setMessage('memoryDiary bridge unavailable')
      return
    }

    setActiveTask(task)
    setMessage(null)
    try {
      await work()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setActiveTask(null)
    }
  }

  const refreshAll = async () => {
    if (!api) {
      return
    }

    const [stateResult, statusResult, logsResult, historyResult] = await Promise.all([
      api.getState(),
      api.getCliStatus(),
      api.getLogs(),
      api.listDiaries()
    ])

    if (stateResult.success && stateResult.data) {
      setConfig(stateResult.data.config)
    }
    if (statusResult.success && statusResult.data) {
      setCliStatus(statusResult.data)
    }
    if (logsResult.success && logsResult.data) {
      setLogs(logsResult.data)
    }
    if (historyResult.success && historyResult.data) {
      setHistory(historyResult.data)
    }
  }

  useEffect(() => {
    void refreshAll()
  }, [])

  const saveConfig = () => runTask('save-config', async () => {
    const result = await api!.updateConfig(config)
    if (result.success && result.data) {
      setConfig(result.data.config)
      setMessage('设置已保存')
    } else {
      setMessage(result.error || '设置保存失败')
    }
  })

  const refreshStatus = () => runTask('refresh', async () => {
    await refreshAll()
  })

  const getToken = () => runTask('token', async () => {
    const result = await api!.getToken()
    if (result.success) {
      await refreshAll()
      setMessage('Token 已写入本地配置')
    } else {
      setMessage(result.error || 'Token 获取失败')
    }
  })

  const installLatest = () => runTask('install', async () => {
    const result = await api!.installLatest()
    if (result.success && result.data) {
      setConfig(result.data.config)
      await refreshAll()
      setMessage('ScreenPipe 已安装或更新')
    } else {
      await refreshAll()
      setMessage(result.error || '安装失败')
    }
  })

  const startScreenpipe = () => runTask('start', async () => {
    const result = await api!.startScreenpipe()
    if (result.data) setRuntimeStatus(result.data)
    await refreshAll()
    setMessage(result.success ? 'ScreenPipe 正在启动' : result.error || '启动失败')
  })

  const stopScreenpipe = () => runTask('stop', async () => {
    const result = await api!.stopScreenpipe()
    if (result.data) setRuntimeStatus(result.data)
    await refreshAll()
    setMessage(result.success ? '托管进程已停止' : result.error || '停止失败')
  })

  const queryTimeline = () => runTask('timeline', async () => {
    const result = await api!.queryTimeline({ date: selectedDate, timezone })
    if (result.success && result.data) {
      setTimeline(result.data)
      setMessage(`已读取 ${result.data.length} 个时间段`)
    } else {
      setMessage(result.error || '时间线读取失败')
    }
  })

  const generateDiary = () => runTask('generate', async () => {
    const result = await api!.generateDiary({
      date: selectedDate,
      timezone,
      buckets: timeline,
      config,
      userNotes
    })
    if (result.success && result.data) {
      setDraft(result.data)
      setMessage('日报草稿已生成')
    } else {
      setMessage(result.error || '日报生成失败')
    }
  })

  const saveDraft = () => runTask('save-draft', async () => {
    if (!draft) return
    const result = await api!.saveDiary(draft)
    if (result.success) {
      const historyResult = await api!.listDiaries()
      if (historyResult.success && historyResult.data) {
        setHistory(historyResult.data)
      }
      setMessage('日报已保存')
    } else {
      setMessage(result.error || '日报保存失败')
    }
  })

  const deleteDiary = (id: string) => runTask(`delete-${id}`, async () => {
    const result = await api!.deleteDiary(id)
    if (result.success) {
      setHistory((prev) => prev.filter((item) => item.id !== id))
    } else {
      setMessage(result.error || '删除失败')
    }
  })

  const updateContentType = (type: MemoryDiaryContentType, enabled: boolean) => {
    setConfig((prev) => {
      if (type === 'audio') return { ...prev, includeAudio: enabled }
      if (type === 'input') return { ...prev, includeInput: enabled }

      const nextTypes = enabled
        ? Array.from(new Set([...prev.enabledContentTypes, type]))
        : prev.enabledContentTypes.filter((item) => item !== type)
      return { ...prev, enabledContentTypes: nextTypes }
    })
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
            <Brain className="h-4 w-4" />
            ScreenPipe Memory
          </div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
            记忆日报
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">CLI {cliStatus?.installed ? '已安装' : '未安装'}</Badge>
          <Badge variant="outline">API {config.apiUrl}</Badge>
          <Badge variant="outline">{contentTypes.map((type) => CONTENT_TYPE_LABELS[type]).join(' / ')}</Badge>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-4">
          <Card className={panelClassName()}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-emerald-500" />
                ScreenPipe 管理
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={refreshStatus} disabled={activeTask === 'refresh'}>
                  <RefreshCw className="h-4 w-4" />
                  刷新
                </Button>
                <Button variant="outline" onClick={installLatest} disabled={activeTask === 'install'}>
                  <Download className="h-4 w-4" />
                  安装/更新
                </Button>
                <Button variant="outline" onClick={getToken} disabled={activeTask === 'token'}>
                  <KeyRound className="h-4 w-4" />
                  Token
                </Button>
                <Button onClick={startScreenpipe} disabled={activeTask === 'start'}>
                  <Play className="h-4 w-4" />
                  启动
                </Button>
                <Button variant="outline" onClick={stopScreenpipe} disabled={activeTask === 'stop'}>
                  <Square className="h-4 w-4" />
                  停止
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">CLI 版本</div>
                  <div className="mt-1 truncate font-semibold">{cliStatus?.version || '未检测'}</div>
                </div>
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">进程状态</div>
                  <div className="mt-1 font-semibold">{runtimeStatus?.state || '未托管'}</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">ScreenPipe 路径</label>
                <Input
                  value={config.screenpipeExecutablePath}
                  placeholder="screenpipe 或 C:\\Tools\\screenpipe.exe"
                  onChange={(event) => setConfig((prev) => ({
                    ...prev,
                    screenpipeExecutablePath: event.target.value
                  }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">API 地址</label>
                <Input
                  value={config.apiUrl}
                  onChange={(event) => setConfig((prev) => ({ ...prev, apiUrl: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">API Token</label>
                <Input
                  value={config.apiKey}
                  type="password"
                  onChange={(event) => setConfig((prev) => ({ ...prev, apiKey: event.target.value }))}
                />
              </div>
              <Button onClick={saveConfig} disabled={activeTask === 'save-config'} className="w-full">
                <Save className="h-4 w-4" />
                保存设置
              </Button>
            </CardContent>
          </Card>

          <Card className={panelClassName()}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                隐私范围
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(CONTENT_TYPE_LABELS) as MemoryDiaryContentType[]).map((type) => {
                  const checked = type === 'audio'
                    ? config.includeAudio
                    : type === 'input'
                      ? config.includeInput
                      : config.enabledContentTypes.includes(type)
                  return (
                    <label key={type} className="flex items-center gap-2 rounded-lg border border-white/25 bg-white/30 p-3 text-sm dark:border-white/10 dark:bg-white/5">
                      <Checkbox checked={checked} onCheckedChange={(value) => updateContentType(type, value === true)} />
                      {CONTENT_TYPE_LABELS[type]}
                    </label>
                  )
                })}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">敏感应用</label>
                <Input
                  value={formatCsv(config.sensitiveAppPatterns)}
                  onChange={(event) => setConfig((prev) => ({
                    ...prev,
                    sensitiveAppPatterns: parseCsv(event.target.value)
                  }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">敏感窗口</label>
                <Input
                  value={formatCsv(config.sensitiveWindowPatterns)}
                  onChange={(event) => setConfig((prev) => ({
                    ...prev,
                    sensitiveWindowPatterns: parseCsv(event.target.value)
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-5">
          <Card className={panelClassName('min-h-[620px]')}>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarDays className="h-5 w-5 text-emerald-500" />
                  今日时间线
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="h-9 w-[150px]"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                  <Button size="sm" onClick={queryTimeline} disabled={activeTask === 'timeline'}>
                    <RefreshCw className="h-4 w-4" />
                    读取
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">时间段</div>
                  <div className="mt-1 text-xl font-black">{timeline.length}</div>
                </div>
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">记录</div>
                  <div className="mt-1 text-xl font-black">{totalItems}</div>
                </div>
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">颗粒度</div>
                  <div className="mt-1 text-xl font-black">{config.timelineBucketMinutes}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {BUCKET_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setConfig((prev) => ({ ...prev, timelineBucketMinutes: minutes }))}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                      config.timelineBucketMinutes === minutes
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-white/25 bg-white/30 hover:bg-white/50 dark:border-white/10 dark:bg-white/5'
                    )}
                  >
                    {minutes} 分钟
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {timeline.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-muted-foreground dark:border-zinc-700">
                    暂无时间线数据
                  </div>
                ) : timeline.map((bucket) => (
                  <div key={bucket.id} className="relative grid grid-cols-[72px_1fr] gap-3">
                    <div className="pt-1 text-right text-xs font-semibold text-muted-foreground">
                      {formatTime(bucket.start)}
                    </div>
                    <div className="rounded-lg border border-white/25 bg-white/35 p-4 dark:border-white/10 dark:bg-white/5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{bucket.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{bucket.summary}</div>
                        </div>
                        <Badge variant="outline">{bucket.items.length}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {bucket.contentTypes.map((type) => (
                          <Badge key={type} variant="secondary">{CONTENT_TYPE_LABELS[type]}</Badge>
                        ))}
                      </div>
                      {bucket.keyTexts.length > 0 ? (
                        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                          {bucket.keyTexts.slice(0, 3).map((text) => (
                            <div key={text} className="truncate">{text}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-3">
          <Card className={panelClassName()}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-emerald-500" />
                日报草稿
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex rounded-lg border border-white/25 bg-white/30 p-1 dark:border-white/10 dark:bg-white/5">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setConfig((prev) => ({ ...prev, diaryStyle: option.value }))}
                    className={cn(
                      'flex-1 rounded-md px-2 py-2 text-sm font-semibold transition-colors',
                      config.diaryStyle === option.value ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950' : 'text-muted-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <textarea
                className="min-h-24 w-full rounded-lg border border-white/25 bg-white/45 p-3 text-sm outline-none transition-colors focus:border-emerald-500 dark:border-white/10 dark:bg-white/5"
                value={userNotes}
                onChange={(event) => setUserNotes(event.target.value)}
                placeholder="今天要强调的内容"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={generateDiary} disabled={activeTask === 'generate'}>
                  <Brain className="h-4 w-4" />
                  生成
                </Button>
                <Button variant="outline" onClick={saveDraft} disabled={!draft || activeTask === 'save-draft'}>
                  <Save className="h-4 w-4" />
                  保存
                </Button>
              </div>
              <div className="max-h-[360px] overflow-auto rounded-lg border border-white/25 bg-white/35 p-4 text-sm dark:border-white/10 dark:bg-white/5">
                {draft ? (
                  <pre className="whitespace-pre-wrap font-sans leading-6 text-zinc-800 dark:text-zinc-100">
                    {draft.markdown}
                  </pre>
                ) : (
                  <div className="py-10 text-center text-muted-foreground">暂无草稿</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={panelClassName()}>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">历史</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700">
                  暂无历史
                </div>
              ) : history.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.updatedAt)}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDiary(item.id)}
                      disabled={activeTask === `delete-${item.id}`}
                      aria-label="删除日报"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.summary}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className={panelClassName()}>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">日志</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!latestLog ? (
                <div className="text-sm text-muted-foreground">暂无日志</div>
              ) : logs.slice(0, 8).map((log) => (
                <div key={log.id} className="border-b border-white/15 pb-2 last:border-b-0">
                  <div className={cn('text-xs font-semibold', statusTone(log.level))}>
                    {formatDateTime(log.timestamp)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{log.message}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
