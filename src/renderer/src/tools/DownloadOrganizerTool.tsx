import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, FolderOpen, Play, RefreshCw, Save, Shield, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type {
  DownloadOrganizerCategory,
  DownloadOrganizerConfig,
  DownloadOrganizerRule,
  DownloadOrganizerState
} from '../../../shared/downloadOrganizer'
import { createDefaultDownloadOrganizerStoredState } from '../../../shared/downloadOrganizer'

const ALL_CATEGORIES: DownloadOrganizerCategory[] = [
  'installer',
  'archive',
  'image',
  'video',
  'audio',
  'document',
  'code',
  'other'
]

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatCsv(values?: string[]) {
  return values?.join(', ') ?? ''
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function bytesToMbInput(bytes?: number | null) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return ''
  }

  return String(Math.round((bytes / 1024 / 1024) * 10) / 10)
}

function mbInputToBytes(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.round(parsed * 1024 * 1024)
}

function createNewRule(index: number): DownloadOrganizerRule {
  return {
    id: `custom-rule-${Date.now()}-${index}`,
    name: `新规则 ${index + 1}`,
    enabled: true,
    conditions: {},
    action: {
      targetPathTemplate: '未分类/{yyyy-mm}'
    }
  }
}

const initialState: DownloadOrganizerState = {
  ...createDefaultDownloadOrganizerStoredState(),
  watcherActive: false,
  lastError: null
}

export default function DownloadOrganizerTool() {
  const [state, setState] = useState<DownloadOrganizerState>(initialState)
  const [draftConfig, setDraftConfig] = useState<DownloadOrganizerConfig>(initialState.config)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  const downloadOrganizer = (window.electron as any)?.downloadOrganizer

  useEffect(() => {
    if (!downloadOrganizer) {
      setIsLoading(false)
      return
    }

    let mounted = true
    const loadState = async () => {
      const result = await downloadOrganizer.getState()
      if (!mounted || !result?.success || !result.data) {
        setIsLoading(false)
        return
      }

      setState(result.data)
      setDraftConfig(result.data.config)
      setIsLoading(false)
    }

    void loadState()

    const unsubscribe = downloadOrganizer.onStateChanged?.((nextState: DownloadOrganizerState) => {
      if (!mounted) {
        return
      }

      setState(nextState)
      setDraftConfig(nextState.config)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [downloadOrganizer])

  const summary = useMemo(() => {
    const readyItems = state.lastPreviewItems.filter((item) => item.status === 'ready').length
    const movedItems = state.lastPreviewItems.filter((item) => item.status === 'moved').length
    const skippedItems = state.lastPreviewItems.filter((item) => item.status === 'skipped').length
    return { readyItems, movedItems, skippedItems }
  }, [state.lastPreviewItems])

  const persistConfig = async (nextConfig: DownloadOrganizerConfig) => {
    if (!downloadOrganizer) {
      return
    }

    setIsSaving(true)
    setDraftConfig(nextConfig)
    const result = await downloadOrganizer.updateConfig(nextConfig)
    if (result?.success && result.data) {
      setState(result.data)
      setDraftConfig(result.data.config)
    }
    setIsSaving(false)
  }

  const updateRule = (ruleId: string, updater: (rule: DownloadOrganizerRule) => DownloadOrganizerRule) => {
    setDraftConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => (rule.id === ruleId ? updater(rule) : rule))
    }))
  }

  const moveRule = (ruleId: string, direction: -1 | 1) => {
    setDraftConfig((prev) => {
      const index = prev.rules.findIndex((rule) => rule.id === ruleId)
      if (index < 0) {
        return prev
      }

      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= prev.rules.length) {
        return prev
      }

      const nextRules = [...prev.rules]
      const [currentRule] = nextRules.splice(index, 1)
      nextRules.splice(nextIndex, 0, currentRule)
      return { ...prev, rules: nextRules }
    })
  }

  const handleChooseWatchPath = async () => {
    const result = await downloadOrganizer?.chooseWatchPath?.()
    if (result?.success && result.data?.path) {
      setDraftConfig((prev) => ({ ...prev, watchPath: result.data.path }))
    }
  }

  const handleChooseDestinationRoot = async () => {
    const result = await downloadOrganizer?.chooseDestinationRoot?.()
    if (result?.success && result.data?.path) {
      setDraftConfig((prev) => ({ ...prev, destinationRoot: result.data.path }))
    }
  }

  const handlePreview = async () => {
    if (!downloadOrganizer) {
      return
    }

    setIsPreviewing(true)
    const result = await downloadOrganizer.preview()
    if (result?.success && result.data) {
      setState(result.data)
      setDraftConfig(result.data.config)
    }
    setIsPreviewing(false)
  }

  const handleApply = async () => {
    if (!downloadOrganizer) {
      return
    }

    setIsApplying(true)
    const result = await downloadOrganizer.applyPreview()
    if (result?.success && result.data) {
      setState(result.data)
      setDraftConfig(result.data.config)
    }
    setIsApplying(false)
  }

  const handleToggleWatch = async () => {
    if (!downloadOrganizer) {
      return
    }

    const result = await downloadOrganizer.toggleWatch(!state.config.enabled)
    if (result?.success && result.data) {
      setState(result.data)
      setDraftConfig(result.data.config)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">
            下载整理
          </h1>
          <p className="text-sm font-medium text-muted-foreground">
            用组合规则自动归档下载目录，也能手动补扫历史文件。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Badge variant="outline" className="rounded-full px-4 py-1.5 border-sky-500/20 text-sky-600">
            {state.watcherActive ? '监控已启动' : '监控未启动'}
          </Badge>
          <Badge variant="outline" className="rounded-full px-4 py-1.5">
            规则 {draftConfig.rules.length}
          </Badge>
          <Badge variant="outline" className="rounded-full px-4 py-1.5">
            活动 {state.activity.length}
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
                <Shield className="w-5 h-5 text-sky-500" />
                监控与路径
              </CardTitle>
              <CardDescription>先决定监控目录、归档目录和冲突策略。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">下载目录</label>
                <div className="flex gap-2">
                  <Input value={draftConfig.watchPath} onChange={(e) => setDraftConfig((prev) => ({ ...prev, watchPath: e.target.value }))} />
                  <Button variant="outline" onClick={handleChooseWatchPath}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    选择
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">归档目录</label>
                <div className="flex gap-2">
                  <Input value={draftConfig.destinationRoot} onChange={(e) => setDraftConfig((prev) => ({ ...prev, destinationRoot: e.target.value }))} />
                  <Button variant="outline" onClick={handleChooseDestinationRoot}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    选择
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">冲突策略</label>
                  <select
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                    value={draftConfig.conflictPolicy}
                    onChange={(e) => setDraftConfig((prev) => ({ ...prev, conflictPolicy: e.target.value as DownloadOrganizerConfig['conflictPolicy'] }))}
                  >
                    <option value="rename">重命名避让</option>
                    <option value="skip">跳过重复</option>
                    <option value="overwrite">覆盖目标</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">稳定等待 (ms)</label>
                  <Input
                    type="number"
                    value={draftConfig.stableWindowMs}
                    onChange={(e) => setDraftConfig((prev) => ({ ...prev, stableWindowMs: Math.max(200, Number(e.target.value) || 1200) }))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">忽略扩展名</label>
                <Input
                  value={formatCsv(draftConfig.ignoredExtensions)}
                  onChange={(e) => setDraftConfig((prev) => ({ ...prev, ignoredExtensions: parseCsv(e.target.value) }))}
                  placeholder=".crdownload, .tmp, .part"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void persistConfig(draftConfig)} disabled={isSaving}>
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? '保存中...' : '保存配置'}
                </Button>
                <Button variant={state.config.enabled ? 'destructive' : 'secondary'} onClick={handleToggleWatch}>
                  {state.config.enabled ? '暂停自动监控' : '启动自动监控'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="text-lg font-black">规则编辑器</CardTitle>
              <CardDescription>规则按当前列表顺序匹配，先命中先生效。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  模板占位符：{`{category}`} {`{ext}`} {`{yyyy-mm}`}
                </Badge>
                <Button
                  variant="outline"
                  onClick={() => setDraftConfig((prev) => ({ ...prev, rules: [...prev.rules, createNewRule(prev.rules.length)] }))}
                >
                  新增规则
                </Button>
              </div>

              <div className="space-y-4">
                {draftConfig.rules.map((rule, index) => (
                  <div key={rule.id} className="rounded-3xl border border-border/60 bg-background/70 p-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-sky-500 text-white hover:bg-sky-600">{index + 1}</Badge>
                        <Input
                          value={rule.name}
                          onChange={(e) => updateRule(rule.id, (current) => ({ ...current, name: e.target.value }))}
                          className="h-9 w-48"
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => updateRule(rule.id, (current) => ({ ...current, enabled: e.target.checked }))}
                          />
                          启用
                        </label>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => moveRule(rule.id, -1)}>
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => moveRule(rule.id, 1)}>
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDraftConfig((prev) => ({ ...prev, rules: prev.rules.filter((item) => item.id !== rule.id) }))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">分类</label>
                        <Input
                          value={formatCsv(rule.conditions.categories)}
                          placeholder={ALL_CATEGORIES.join(', ')}
                          onChange={(e) => updateRule(rule.id, (current) => ({
                            ...current,
                            conditions: {
                              ...current.conditions,
                              categories: parseCsv(e.target.value) as DownloadOrganizerCategory[]
                            }
                          }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">扩展名</label>
                        <Input
                          value={formatCsv(rule.conditions.extensions)}
                          placeholder=".zip, .exe"
                          onChange={(e) => updateRule(rule.id, (current) => ({
                            ...current,
                            conditions: {
                              ...current.conditions,
                              extensions: parseCsv(e.target.value)
                            }
                          }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">名称关键词</label>
                        <Input
                          value={formatCsv(rule.conditions.nameIncludes)}
                          placeholder="installer, setup"
                          onChange={(e) => updateRule(rule.id, (current) => ({
                            ...current,
                            conditions: {
                              ...current.conditions,
                              nameIncludes: parseCsv(e.target.value)
                            }
                          }))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">目标模板</label>
                        <Input
                          value={rule.action.targetPathTemplate}
                          placeholder="安装包/{yyyy-mm}"
                          onChange={(e) => updateRule(rule.id, (current) => ({
                            ...current,
                            action: {
                              ...current.action,
                              targetPathTemplate: e.target.value
                            }
                          }))}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">最小大小 MB</label>
                          <Input
                            value={bytesToMbInput(rule.conditions.minSizeBytes)}
                            onChange={(e) => updateRule(rule.id, (current) => ({
                              ...current,
                              conditions: {
                                ...current.conditions,
                                minSizeBytes: mbInputToBytes(e.target.value)
                              }
                            }))}
                          />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">最大大小 MB</label>
                          <Input
                            value={bytesToMbInput(rule.conditions.maxSizeBytes)}
                            onChange={(e) => updateRule(rule.id, (current) => ({
                              ...current,
                              conditions: {
                                ...current.conditions,
                                maxSizeBytes: mbInputToBytes(e.target.value)
                              }
                            }))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">最小文件年龄 天</label>
                          <Input
                            type="number"
                            value={rule.conditions.minAgeDays ?? ''}
                            onChange={(e) => updateRule(rule.id, (current) => ({
                              ...current,
                              conditions: {
                                ...current.conditions,
                                minAgeDays: e.target.value ? Number(e.target.value) : null
                              }
                            }))}
                          />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">最大文件年龄 天</label>
                          <Input
                            type="number"
                            value={rule.conditions.maxAgeDays ?? ''}
                            onChange={(e) => updateRule(rule.id, (current) => ({
                              ...current,
                              conditions: {
                                ...current.conditions,
                                maxAgeDays: e.target.value ? Number(e.target.value) : null
                              }
                            }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-7 space-y-6">
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-4 text-lg font-black">
                <span>手动补扫</span>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handlePreview} disabled={isPreviewing}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isPreviewing ? 'animate-spin' : ''}`} />
                    预览当前下载目录
                  </Button>
                  <Button onClick={handleApply} disabled={isApplying || summary.readyItems === 0}>
                    <Play className="w-4 h-4 mr-2" />
                    {isApplying ? '执行中...' : `执行整理 (${summary.readyItems})`}
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                最近预览：{state.lastPreviewAt ? new Date(state.lastPreviewAt).toLocaleString('zh-CN') : '尚未执行'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">待整理 {summary.readyItems}</Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">已移动 {summary.movedItems}</Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">已跳过 {summary.skippedItems}</Badge>
              </div>

              <div className="rounded-3xl border border-border/60 overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30">
                  <span>项目</span>
                  <span>分类 / 规则</span>
                  <span>目标</span>
                  <span>状态</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto divide-y divide-border/50">
                  {state.lastPreviewItems.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-muted-foreground text-center">还没有预览结果。</div>
                  ) : (
                    state.lastPreviewItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-4 py-3 text-sm items-start">
                        <div className="space-y-1 min-w-0">
                          <div className="font-bold truncate">{item.fileName}</div>
                          <div className="text-xs text-muted-foreground truncate">{item.sourcePath}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.entryType === 'directory' ? '文件夹' : formatBytes(item.sizeBytes)}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="font-medium">{item.category}</div>
                          <div className="text-xs text-muted-foreground">{item.matchedRuleName ?? '未命中'}</div>
                        </div>
                        <div className="text-xs text-muted-foreground break-all">{item.targetPath ?? item.reason ?? '-'}</div>
                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className={
                              item.status === 'moved'
                                ? 'border-emerald-500/20 text-emerald-600'
                                : item.status === 'failed'
                                  ? 'border-red-500/20 text-red-600'
                                  : item.status === 'skipped'
                                    ? 'border-amber-500/20 text-amber-600'
                                    : 'border-sky-500/20 text-sky-600'
                            }
                          >
                            {item.status}
                          </Badge>
                          {item.reason && <div className="text-xs text-muted-foreground">{item.reason}</div>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="text-lg font-black">最近活动</CardTitle>
              <CardDescription>自动监控和手动整理都会在这里留下记录。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {state.activity.length === 0 ? (
                  <div className="text-sm text-muted-foreground">还没有活动记录。</div>
                ) : (
                  state.activity.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="font-semibold">{item.message}</div>
                        <Badge variant="outline">{item.level}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground space-y-1">
                        <div>{new Date(item.timestamp).toLocaleString('zh-CN')}</div>
                        {item.sourcePath && <div className="break-all">来源：{item.sourcePath}</div>}
                        {item.targetPath && <div className="break-all">目标：{item.targetPath}</div>}
                      </div>
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
