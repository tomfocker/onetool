import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  KeyRound,
  Play,
  RefreshCw,
  Save,
  Settings2,
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
  buildMemoryDiaryDailyInsight,
  countMemoryDiaryItemsByType,
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
import { getMemoryDiaryScreenpipePrimaryAction } from './memoryDiaryViewModel'

const CONTENT_TYPE_LABELS: Record<MemoryDiaryContentType, string> = {
  accessibility: 'Accessibility',
  ocr: 'OCR',
  audio: 'Audio',
  input: 'Input'
}

const BUCKET_OPTIONS: Array<MemoryDiaryConfig['timelineBucketMinutes']> = [5, 15, 30, 60]
const STYLE_OPTIONS: Array<{ value: MemoryDiaryConfig['diaryStyle']; label: string; disabled?: boolean }> = [
  { value: 'brief', label: '简报' },
  { value: 'worklog', label: '工作流', disabled: true },
  { value: 'blog', label: '博客草稿', disabled: true }
]
const TONE_OPTIONS: Array<{ value: MemoryDiaryConfig['diaryTone']; label: string }> = [
  { value: 'daily', label: '日常日记' },
  { value: 'professional', label: '专业分析' }
]

const DEFAULT_AUTO_SUMMARY_TIME = '21:30'

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

function runtimeStatusLabel(status: MemoryDiaryRuntimeStatus | null) {
  if (!status) return '未托管'
  if (status.apiReachable) {
    return status.state === 'external-running' ? '外部运行中' : '运行中'
  }

  const labels: Record<MemoryDiaryRuntimeStatus['state'], string> = {
    unknown: '未知',
    'not-installed': '未安装',
    stopped: '未运行',
    running: '运行中',
    'external-running': '外部运行中',
    starting: '启动中',
    stopping: '停止中',
    error: '异常'
  }
  return labels[status.state] || status.state
}

function formatRuntimeCaptureTime(value: string | null | undefined) {
  return value ? formatDateTime(value) : '等待采集'
}

function isValidMemoryDiaryTime(value: string | undefined) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
}

function normalizeMemoryDiaryToolConfig(config: MemoryDiaryConfig): MemoryDiaryConfig {
  return {
    ...config,
    diaryStyle: 'brief',
    diaryTone: config.diaryTone === 'professional' ? 'professional' : 'daily',
    autoDailySummaryEnabled: config.autoDailySummaryEnabled === true,
    autoDailySummaryTime: isValidMemoryDiaryTime(config.autoDailySummaryTime)
      ? config.autoDailySummaryTime
      : DEFAULT_AUTO_SUMMARY_TIME
  }
}

function formatCurrentClockTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
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
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [timelineSourceExpanded, setTimelineSourceExpanded] = useState(false)
  const timelineLoadingRef = useRef(false)
  const lastAutoSummaryKeyRef = useRef<string | null>(null)

  const timezone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  }, [])

  const contentTypes = useMemo(() => getContentTypes(config), [config])
  const totalItems = useMemo(() => timeline.reduce((sum, bucket) => sum + bucket.items.length, 0), [timeline])
  const sourceCounts = useMemo(() => (
    countMemoryDiaryItemsByType(timeline.flatMap((bucket) => bucket.items))
  ), [timeline])
  const dailyInsight = useMemo(() => buildMemoryDiaryDailyInsight(timeline), [timeline])
  const latestLog = logs[0]
  const screenpipePrimaryAction = useMemo(
    () => getMemoryDiaryScreenpipePrimaryAction(runtimeStatus),
    [runtimeStatus]
  )
  const screenpipeReady = Boolean(cliStatus?.installed && runtimeStatus?.apiReachable)
  const screenpipeReachable = Boolean(runtimeStatus?.apiReachable)
  const selectedDateIsToday = selectedDate === todayString()
  const timelineConfigSignature = useMemo(() => JSON.stringify({
    bucketMinutes: config.timelineBucketMinutes,
    aiEventOptimizationEnabled: config.aiEventOptimizationEnabled,
    contentTypes,
    sensitiveAppPatterns: config.sensitiveAppPatterns,
    sensitiveWindowPatterns: config.sensitiveWindowPatterns
  }), [config, contentTypes])

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

  const refreshRuntimeStatus = async () => {
    if (!api) {
      return
    }

    const runtimeResult = await api.getRuntimeStatus()
    if (runtimeResult.success && runtimeResult.data) {
      setRuntimeStatus(runtimeResult.data)
    }
  }

  const refreshAll = async () => {
    if (!api) {
      return
    }

    const runtimeStatusTask = refreshRuntimeStatus()
    const [stateResult, statusResult, logsResult, historyResult] = await Promise.all([
      api.getState(),
      api.getCliStatus(),
      api.getLogs(),
      api.listDiaries()
    ])

    if (stateResult.success && stateResult.data) {
      setConfig(normalizeMemoryDiaryToolConfig(stateResult.data.config))
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

    await runtimeStatusTask
  }

  const loadTimeline = useCallback(async (options: { silent?: boolean } = {}): Promise<MemoryDiaryTimelineBucket[] | null> => {
    if (!api || timelineLoadingRef.current) {
      return null
    }

    timelineLoadingRef.current = true
    if (!options.silent) {
      setActiveTask('timeline')
      setMessage(null)
    }

    try {
      const result = await api.queryTimeline({ date: selectedDate, timezone })
      if (result.success && result.data) {
        setTimeline(result.data)
        if (!options.silent) {
          setMessage(`已读取 ${result.data.length} 个时间段`)
        }
        return result.data
      } else if (!options.silent) {
        setMessage(result.error || '时间线读取失败')
      }
    } catch (error) {
      if (!options.silent) {
        setMessage(error instanceof Error ? error.message : String(error))
      }
    } finally {
      timelineLoadingRef.current = false
      if (!options.silent) {
        setActiveTask(null)
      }
    }
    return null
  }, [api, selectedDate, timezone])

  useEffect(() => {
    void refreshAll()
  }, [])

  useEffect(() => {
    void loadTimeline({ silent: true })
  }, [loadTimeline, timelineConfigSignature])

  useEffect(() => {
    if (!api) return

    const intervalId = window.setInterval(() => {
      void (async () => {
        const [runtimeResult, logsResult] = await Promise.all([
          api.getRuntimeStatus(),
          api.getLogs()
        ])
        if (runtimeResult.success && runtimeResult.data) {
          setRuntimeStatus(runtimeResult.data)
        }
        if (logsResult.success && logsResult.data) {
          setLogs(logsResult.data)
        }
      })()
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [api])

  useEffect(() => {
    if (!api || !screenpipeReachable || !selectedDateIsToday) return

    const intervalId = window.setInterval(() => {
      void loadTimeline({ silent: true })
    }, 60000)

    return () => window.clearInterval(intervalId)
  }, [api, loadTimeline, screenpipeReachable, selectedDateIsToday])

  useEffect(() => {
    if (!api || !screenpipeReachable || !config.autoDailySummaryEnabled) return

    const runAutoSummary = async () => {
      const summaryDate = todayString()
      const summaryTime = config.autoDailySummaryTime || DEFAULT_AUTO_SUMMARY_TIME
      const summaryKey = `${summaryDate}-${summaryTime}`
      if (formatCurrentClockTime() !== summaryTime || lastAutoSummaryKeyRef.current === summaryKey) {
        return
      }

      lastAutoSummaryKeyRef.current = summaryKey
      setMessage('正在自动生成今日简报')

      const timelineResult = await api.queryTimeline({ date: summaryDate, timezone })
      if (!timelineResult.success || !timelineResult.data) {
        setMessage(timelineResult.error || '自动总结读取时间线失败')
        return
      }

      if (selectedDate === summaryDate) {
        setTimeline(timelineResult.data)
      }

      const diaryResult = await api.generateDiary({
        date: summaryDate,
        timezone,
        buckets: timelineResult.data,
        config: normalizeMemoryDiaryToolConfig(config),
        userNotes
      })
      if (!diaryResult.success || !diaryResult.data) {
        setMessage(diaryResult.error || '自动总结生成失败')
        return
      }

      setDraft(diaryResult.data)
      const saveResult = await api.saveDiary(diaryResult.data)
      if (!saveResult.success) {
        setMessage(saveResult.error || '自动总结保存失败')
        return
      }

      const historyResult = await api.listDiaries()
      if (historyResult.success && historyResult.data) {
        setHistory(historyResult.data)
      }
      setMessage('今日简报已自动生成并保存')
    }

    void runAutoSummary()
    const intervalId = window.setInterval(() => {
      void runAutoSummary()
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [api, config, screenpipeReachable, selectedDate, timezone, userNotes])

  const saveConfig = () => runTask('save-config', async () => {
    const nextConfig = normalizeMemoryDiaryToolConfig(config)
    const result = await api!.updateConfig(nextConfig)
    if (result.success && result.data) {
      setConfig(normalizeMemoryDiaryToolConfig(result.data.config))
      setMessage('设置已保存')
    } else {
      setMessage(result.error || '设置保存失败')
    }
  })

  const saveSummarySettings = () => runTask('save-summary-settings', async () => {
    const nextConfig = normalizeMemoryDiaryToolConfig(config)
    const result = await api!.updateConfig(nextConfig)
    if (result.success && result.data) {
      setConfig(normalizeMemoryDiaryToolConfig(result.data.config))
      setMessage(nextConfig.autoDailySummaryEnabled
        ? `自动总结已设为每天 ${nextConfig.autoDailySummaryTime}`
        : '自动总结已关闭')
    } else {
      setMessage(result.error || '自动总结设置保存失败')
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
    setMessage(result.success
      ? result.data?.apiReachable ? 'ScreenPipe 已运行' : 'ScreenPipe 正在启动'
      : result.error || '启动失败')
  })

  const stopScreenpipe = () => runTask('stop', async () => {
    const result = await api!.stopScreenpipe()
    if (result.data) setRuntimeStatus(result.data)
    await refreshAll()
    setMessage(result.success ? '托管进程已停止' : result.error || '停止失败')
  })

  const queryTimeline = () => {
    void loadTimeline({ silent: false })
  }

  const selectDiaryStyle = (style: MemoryDiaryConfig['diaryStyle']) => {
    const option = STYLE_OPTIONS.find((item) => item.value === style)
    if (option?.disabled) return
    setConfig((prev) => ({
      ...prev,
      diaryStyle: style,
      diaryTone: prev.diaryTone === 'professional' ? 'professional' : 'daily'
    }))
  }

  const generateDiary = () => runTask('generate', async () => {
    const result = await api!.generateDiary({
      date: selectedDate,
      timezone,
      buckets: timeline,
      config: normalizeMemoryDiaryToolConfig(config),
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

  const openDiary = (id: string) => runTask(`open-${id}`, async () => {
    const result = await api!.openDiary(id)
    if (result.success && result.data) {
      setDraft(result.data)
      setSelectedDate(result.data.date)
      setMessage('已打开保存的日报')
    } else {
      setMessage(result.error || '打开日报失败')
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
    <div className="mx-auto min-w-0 max-w-[1500px] space-y-6 pb-16">
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
          <Badge variant="outline">采集 {runtimeStatusLabel(runtimeStatus)}</Badge>
          <Badge variant="outline">API {config.apiUrl}</Badge>
          <Badge variant="outline">{contentTypes.map((type) => CONTENT_TYPE_LABELS[type]).join(' / ')}</Badge>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="min-w-0 space-y-5 xl:col-span-4">
          <Card className={panelClassName()}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  ScreenPipe 管理
                </CardTitle>
                <Badge variant={screenpipeReady ? 'secondary' : 'outline'}>
                  {screenpipeReady ? '自动桥接' : '待处理'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn(
                'flex items-start gap-3 rounded-lg border p-4',
                screenpipeReady
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                  : 'border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100'
              )}>
                {screenpipeReady ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold">
                    {screenpipeReady ? '采集已就绪' : '采集需要处理'}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm opacity-80">
                    {screenpipeReady
                      ? `最近采集：${formatRuntimeCaptureTime(runtimeStatus?.lastCaptureAt)}`
                      : runtimeStatus?.message || cliStatus?.error || '点击启动或安装，OneTool 会自动完成连接。'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={refreshStatus} disabled={activeTask === 'refresh'}>
                  <RefreshCw className="h-4 w-4" />
                  刷新
                </Button>
                <Button
                  onClick={screenpipePrimaryAction.action === 'refresh' ? refreshStatus : startScreenpipe}
                  disabled={activeTask === screenpipePrimaryAction.action}
                >
                  {screenpipePrimaryAction.action === 'refresh' ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {screenpipePrimaryAction.label}
                </Button>
                {!cliStatus?.installed ? (
                  <Button variant="outline" onClick={installLatest} disabled={activeTask === 'install'}>
                    <Download className="h-4 w-4" />
                    安装/更新
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">CLI 版本</div>
                  <div className="mt-1 truncate font-semibold">{cliStatus?.version || '未检测'}</div>
                </div>
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">进程状态</div>
                  <div className="mt-1 font-semibold">{runtimeStatusLabel(runtimeStatus)}</div>
                </div>
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">今日记录</div>
                  <div className="mt-1 truncate font-semibold">{runtimeStatus?.todayItemCount ?? 0}</div>
                </div>
                <div className="rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs text-muted-foreground">采集范围</div>
                  <div className="mt-1 truncate font-semibold">
                    {contentTypes.map((type) => CONTENT_TYPE_LABELS[type]).join(' / ')}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSettingsExpanded((value) => !value)}
                aria-expanded={settingsExpanded}
                className="flex w-full items-center justify-between rounded-lg border border-white/25 bg-white/30 px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-white/50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  高级设置
                </span>
                <ChevronDown className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  settingsExpanded ? 'rotate-180' : ''
                )} />
              </button>

              {settingsExpanded ? (
                <div className="space-y-4 border-t border-white/20 pt-4 dark:border-white/10">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={installLatest} disabled={activeTask === 'install'}>
                      <Download className="h-4 w-4" />
                      安装/更新
                    </Button>
                    <Button variant="outline" onClick={getToken} disabled={activeTask === 'token'}>
                      <KeyRound className="h-4 w-4" />
                      Token
                    </Button>
                    <Button variant="outline" onClick={stopScreenpipe} disabled={activeTask === 'stop'}>
                      <Square className="h-4 w-4" />
                      停止采集
                    </Button>
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

                  <label className="flex items-center gap-3 rounded-lg border border-white/20 bg-white/20 p-3 text-sm font-semibold dark:border-white/10 dark:bg-white/5">
                    <Checkbox
                      checked={config.aiEventOptimizationEnabled !== false}
                      onCheckedChange={(value) => setConfig((prev) => ({
                        ...prev,
                        aiEventOptimizationEnabled: value === true
                      }))}
                    />
                    <Brain className="h-4 w-4 text-emerald-500" />
                    智能整理时间轴
                  </label>

                  <div className="space-y-3 rounded-lg border border-white/20 bg-white/20 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      隐私与采集范围
                    </div>
                    <div className="grid grid-cols-2 gap-2">
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
                  </div>

                  <Button onClick={saveConfig} disabled={activeTask === 'save-config'} className="w-full">
                    <Save className="h-4 w-4" />
                    保存高级设置
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-5 xl:col-span-5">
          <Card className={panelClassName('min-h-[620px] overflow-hidden')}>
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
              <div className="rounded-lg border border-white/25 bg-white/25 dark:border-white/10 dark:bg-white/5">
                <button
                  type="button"
                  onClick={() => setTimelineSourceExpanded((value) => !value)}
                  aria-expanded={timelineSourceExpanded}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/35 dark:hover:bg-white/10 sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Activity className="h-4 w-4 text-emerald-500" />
                      数据来源
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {timeline.length > 0
                        ? `${timeline.length} 个时间段，已压缩为 ${dailyInsight.uniqueTextCount} 条有效证据`
                        : '读取后可查看采集来源与压缩情况'}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Badge variant="outline">{config.timelineBucketMinutes} 分钟</Badge>
                    {timeline.length > 0 ? (
                      <Badge variant="secondary" className="hidden sm:inline-flex">
                        原始重复度 {Math.round(dailyInsight.duplicateRatio * 100)}%
                      </Badge>
                    ) : null}
                    <ChevronDown className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      timelineSourceExpanded ? 'rotate-180' : ''
                    )} />
                  </div>
                </button>

                {timelineSourceExpanded ? (
                  <div className="space-y-4 border-t border-white/20 p-4 dark:border-white/10">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <div className="text-xs text-muted-foreground">时间段</div>
                        <div className="mt-1 text-xl font-black">{timeline.length}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">原始记录</div>
                        <div className="mt-1 text-xl font-black">{totalItems}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">有效证据</div>
                        <div className="mt-1 text-xl font-black">{dailyInsight.uniqueTextCount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">活跃分钟</div>
                        <div className="mt-1 text-xl font-black">{dailyInsight.activeMinutes}</div>
                      </div>
                    </div>

                    <div className="space-y-3 border-y border-white/20 py-4 dark:border-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">采集诊断</div>
                        <Badge variant="outline">摘要优先 UI</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {(Object.keys(CONTENT_TYPE_LABELS) as MemoryDiaryContentType[]).map((type) => (
                          <div key={type} className="min-w-0">
                            <div className="text-xs text-muted-foreground">{CONTENT_TYPE_LABELS[type]}</div>
                            <div className={cn(
                              'mt-1 text-lg font-black tabular-nums',
                              sourceCounts[type] > 0 ? 'text-zinc-950 dark:text-zinc-50' : 'text-muted-foreground'
                            )}>
                              {sourceCounts[type]}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {timeline.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">理解层</div>
                          <Badge variant="outline">原始重复度 {Math.round(dailyInsight.duplicateRatio * 100)}%</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {dailyInsight.activityMix.slice(0, 4).map((item) => (
                            <Badge key={item.kind} variant="secondary">
                              {item.label} {Math.round(item.share * 100)}%
                            </Badge>
                          ))}
                          {dailyInsight.topApps.slice(0, 4).map((item) => (
                            <Badge key={item.label} variant="outline">
                              {item.label} {item.count}
                            </Badge>
                          ))}
                        </div>
                        {dailyInsight.focusBlocks.length > 0 ? (
                          <div className="grid gap-2">
                            {dailyInsight.focusBlocks.slice(0, 3).map((block) => (
                              <div key={`${block.start}-${block.title}`} className="min-w-0 rounded-lg border border-white/20 bg-white/25 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                                <div className="truncate font-semibold">{block.title}</div>
                                <div className="mt-1 truncate text-xs text-muted-foreground">
                                  {formatTime(block.start)} - {formatTime(block.end)}
                                  {block.projectHints.length > 0 ? ` · ${block.projectHints.join(' / ')}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <div className="text-sm font-semibold">时间轴颗粒度</div>
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
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-0 pt-2">
                {timeline.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-muted-foreground dark:border-zinc-700">
                    暂无时间线数据
                  </div>
                ) : timeline.map((bucket, index) => (
                  <div key={bucket.id} className="grid min-w-0 grid-cols-[68px_24px_minmax(0,1fr)] gap-3 pb-6 last:pb-0">
                    <div className="pt-0.5 text-right">
                      <div className="text-sm font-black tabular-nums text-zinc-950 dark:text-zinc-50">
                        {formatTime(bucket.start)}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {formatTime(bucket.end)}
                      </div>
                    </div>
                    <div className="relative flex justify-center">
                      {index < timeline.length - 1 ? (
                        <div className="absolute bottom-[-24px] top-6 w-px bg-gradient-to-b from-emerald-500/45 via-zinc-300 to-zinc-200 dark:via-zinc-700 dark:to-zinc-800" />
                      ) : null}
                      <div className="relative mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/40 bg-white shadow-[0_4px_16px_-10px_rgba(16,185,129,0.9)] dark:bg-zinc-950">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      </div>
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-lg border border-white/25 bg-white/40 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-white/5">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-muted-foreground">
                          {formatTime(bucket.start)} - {formatTime(bucket.end)}
                        </div>
                        <div className="mt-1 truncate text-base font-black leading-snug">{bucket.title}</div>
                        <div className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">
                          {bucket.summary}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline">{bucket.event?.activityLabel || bucket.insight.activityLabel}</Badge>
                        {(bucket.event?.topics.length ? bucket.event.topics : bucket.insight.projectHints).slice(0, 3).map((topic) => (
                          <Badge key={topic} variant="secondary">{topic}</Badge>
                        ))}
                      </div>
                      {timelineSourceExpanded ? (
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/20 pt-3 dark:border-white/10">
                          <Badge variant="outline">{bucket.items.length} 条来源</Badge>
                          {bucket.contentTypes.map((type) => (
                            <Badge key={type} variant="secondary">{CONTENT_TYPE_LABELS[type]}</Badge>
                          ))}
                        </div>
                      ) : null}
                      {timelineSourceExpanded && bucket.keyTexts.length > 0 ? (
                        <div className="mt-3 space-y-1 border-t border-white/20 pt-3 text-xs text-muted-foreground dark:border-white/10">
                          {bucket.keyTexts.slice(0, 3).map((text) => (
                            <div key={text} className="truncate" title={text}>{text}</div>
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

        <div className="min-w-0 space-y-5 xl:col-span-3">
          <Card className={panelClassName()}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-emerald-500" />
                日报草稿
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => selectDiaryStyle(option.value)}
                    disabled={option.disabled}
                    className={cn(
                      'min-h-11 rounded-lg border px-2 py-2 text-sm font-semibold transition-colors',
                      option.disabled
                        ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-600'
                        : config.diaryStyle === option.value
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                          : 'border-white/25 bg-white/30 text-muted-foreground hover:bg-white/50 dark:border-white/10 dark:bg-white/5'
                    )}
                  >
                    <span>{option.label}</span>
                    {option.disabled ? (
                      <span className="mt-0.5 block text-[10px] font-semibold">暂未开放</span>
                    ) : null}
                  </button>
                ))}
              </div>

              {config.diaryStyle === 'brief' ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">简报口吻</div>
                  <div className="grid grid-cols-2 gap-2">
                    {TONE_OPTIONS.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => setConfig((prev) => ({ ...prev, diaryTone: option.value }))}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                          config.diaryTone === option.value
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-white/25 bg-white/30 text-muted-foreground hover:bg-white/50 dark:border-white/10 dark:bg-white/5'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 rounded-lg border border-white/25 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
                <label className="flex items-center gap-3 text-sm font-semibold">
                  <Checkbox
                    checked={config.autoDailySummaryEnabled}
                    onCheckedChange={(value) => setConfig((prev) => ({
                      ...prev,
                      autoDailySummaryEnabled: value === true
                    }))}
                  />
                  自动总结
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Input
                    type="time"
                    value={config.autoDailySummaryTime || DEFAULT_AUTO_SUMMARY_TIME}
                    onChange={(event) => setConfig((prev) => ({
                      ...prev,
                      autoDailySummaryTime: event.target.value
                    }))}
                  />
                  <Button
                    variant="outline"
                    onClick={saveSummarySettings}
                    disabled={activeTask === 'save-summary-settings'}
                  >
                    <Save className="h-4 w-4" />
                    保存设置
                  </Button>
                </div>
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
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDiary(item.id)}
                        disabled={activeTask === `open-${item.id}`}
                        aria-label="打开日报"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
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
                  </div>
                  <div className="mt-2 line-clamp-2 break-words text-xs text-muted-foreground">{item.summary}</div>
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
                  <div className="mt-1 line-clamp-3 break-words text-sm text-muted-foreground">{log.message}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
