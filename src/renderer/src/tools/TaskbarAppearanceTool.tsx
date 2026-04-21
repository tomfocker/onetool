import React, { useEffect, useState } from 'react'
import {
  AlertTriangle,
  LoaderCircle,
  PanelTop,
  RotateCcw,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type {
  TaskbarAppearanceAvailability,
  TaskbarAppearancePreset,
  TaskbarAppearanceSettings
} from '../../../shared/taskbarAppearance'
import { createDefaultTaskbarAppearanceSettings } from '../../../shared/taskbarAppearance'
import type { IpcResponse } from '../../../shared/types'

type TaskbarAppearanceStatus = {
  support: TaskbarAppearanceAvailability
  settings: TaskbarAppearanceSettings
}

type TaskbarAppearanceBridge = {
  getStatus: () => Promise<IpcResponse<TaskbarAppearanceStatus>>
  applyPreset: (input: {
    preset: TaskbarAppearancePreset
    intensity: number
    tintHex: string
  }) => Promise<IpcResponse>
  restoreDefault: () => Promise<IpcResponse>
}

const presetOptions: Array<{
  value: TaskbarAppearancePreset
  label: string
  description: string
}> = [
  {
    value: 'default',
    label: '默认',
    description: '恢复系统默认任务栏材质'
  },
  {
    value: 'transparent',
    label: '透明',
    description: '弱化任务栏背景，突出壁纸和窗口层次'
  },
  {
    value: 'blur',
    label: '模糊',
    description: '保留层次感的同时提供更稳定的可读性'
  },
  {
    value: 'acrylic',
    label: '亚克力',
    description: '更强的景深与染色效果，依赖较新的 Windows 11'
  }
]

const defaultDraft = createDefaultTaskbarAppearanceSettings()
type ToolStatusState = 'loading' | 'ready' | 'unavailable'

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function getTaskbarAppearanceBridge() {
  const electronBridge = window.electron as unknown as {
    taskbarAppearance?: TaskbarAppearanceBridge
  }

  return electronBridge.taskbarAppearance
}

export default function TaskbarAppearanceTool() {
  const [statusState, setStatusState] = useState<ToolStatusState>('loading')
  const [isApplying, setIsApplying] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [support, setSupport] = useState<TaskbarAppearanceAvailability | null>(null)
  const [currentSettings, setCurrentSettings] = useState<TaskbarAppearanceSettings | null>(null)
  const [draft, setDraft] = useState<TaskbarAppearanceSettings>(defaultDraft)
  const [feedback, setFeedback] = useState<{ tone: 'default' | 'destructive'; message: string } | null>(null)

  useEffect(() => {
    let mounted = true
    const bridge = getTaskbarAppearanceBridge()

    const loadStatus = async () => {
      if (!bridge) {
        if (!mounted) {
          return
        }

        setStatusState('unavailable')
        setSupport(null)
        setCurrentSettings(null)
        setFeedback({
          tone: 'destructive',
          message: '当前无法连接任务栏服务，状态暂不可用。'
        })
        return
      }

      try {
        const result = await bridge.getStatus()
        if (!mounted) {
          return
        }

        if (!result.success || !result.data) {
          setStatusState('unavailable')
          setSupport(null)
          setCurrentSettings(null)
          setFeedback({
            tone: 'destructive',
            message: result.error ?? '当前无法读取任务栏状态，请稍后重试。'
          })
          return
        }

        setSupport(result.data.support)
        setCurrentSettings(result.data.settings)
        setDraft(result.data.settings)
        setStatusState('ready')
        setFeedback(null)
      } catch (error) {
        if (!mounted) {
          return
        }

        setStatusState('unavailable')
        setSupport(null)
        setCurrentSettings(null)
        setFeedback({
          tone: 'destructive',
          message: getErrorMessage(error, '当前无法读取任务栏状态，请稍后重试。')
        })
      }
    }

    void loadStatus()

    return () => {
      mounted = false
    }
  }, [])

  const bridge = getTaskbarAppearanceBridge()
  const hasKnownStatus = statusState === 'ready' && support !== null && currentSettings !== null
  const readySupport = hasKnownStatus ? support : null
  const readySettings = hasKnownStatus ? currentSettings : null
  const activePresetSupport = readySupport?.presets[draft.preset] ?? null
  const isTintValid = /^#[0-9A-Fa-f]{8}$/.test(draft.tintHex)
  const colorInputValue = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(draft.tintHex)
    ? draft.tintHex.slice(0, 7)
    : '#FFFFFF'
  const isLoading = statusState === 'loading'
  const isUnsupportedHost = hasKnownStatus ? !support.supported : false
  const canApply = Boolean(
    bridge &&
    hasKnownStatus &&
    !isLoading &&
    !isApplying &&
    !isRestoring &&
    isTintValid &&
    activePresetSupport?.available
  )
  const canRestore = Boolean(bridge && !isLoading && !isApplying && !isRestoring)

  const reloadStatus = async (failureMessage?: string) => {
    if (!bridge) {
      setStatusState('unavailable')
      setSupport(null)
      setCurrentSettings(null)
      setFeedback({
        tone: 'destructive',
        message: failureMessage ?? '当前无法连接任务栏服务，状态暂不可用。'
      })
      return false
    }

    try {
      const result = await bridge.getStatus()
      if (!result.success || !result.data) {
        setStatusState('unavailable')
        setSupport(null)
        setCurrentSettings(null)
        setFeedback({
          tone: 'destructive',
          message: failureMessage ?? result.error ?? '刷新任务栏状态失败。'
        })
        return false
      }

      setStatusState('ready')
      setSupport(result.data.support)
      setCurrentSettings(result.data.settings)
      setDraft(result.data.settings)
      return true
    } catch (error) {
      setStatusState('unavailable')
      setSupport(null)
      setCurrentSettings(null)
      setFeedback({
        tone: 'destructive',
        message: failureMessage ?? getErrorMessage(error, '刷新任务栏状态失败。')
      })
      return false
    }
  }

  const handleApplyPreset = async () => {
    if (!bridge || !canApply) {
      return
    }

    setIsApplying(true)
    try {
      const result = await bridge.applyPreset({
        preset: draft.preset,
        intensity: draft.intensity,
        tintHex: draft.tintHex
      })

      if (!result.success) {
        setFeedback({
          tone: 'destructive',
          message: result.error ?? '应用任务栏外观失败。'
        })
        return
      }

      const refreshed = await reloadStatus('任务栏外观已提交，但暂时无法确认最新状态，请稍后重试。')
      if (refreshed) {
        setFeedback({
          tone: 'default',
          message: '任务栏外观已更新。'
        })
      }
    } catch (error) {
      setFeedback({
        tone: 'destructive',
        message: getErrorMessage(error, '应用任务栏外观失败。')
      })
    } finally {
      setIsApplying(false)
    }
  }

  const handleRestoreDefault = async () => {
    if (!bridge || !canRestore) {
      return
    }

    setIsRestoring(true)
    try {
      const result = await bridge.restoreDefault()

      if (!result.success) {
        setFeedback({
          tone: 'destructive',
          message: result.error ?? '恢复默认任务栏失败。'
        })
        return
      }

      const refreshed = await reloadStatus('已发送恢复请求，但暂时无法确认当前状态，请稍后重试。')
      if (refreshed) {
        setFeedback({
          tone: 'default',
          message: '已恢复系统默认任务栏外观。'
        })
      }
    } catch (error) {
      setFeedback({
        tone: 'destructive',
        message: getErrorMessage(error, '恢复默认任务栏失败。')
      })
    } finally {
      setIsRestoring(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-sky-500/15 bg-sky-500/5 px-5 py-4 text-sm font-medium text-muted-foreground">
          <LoaderCircle className="h-5 w-5 animate-spin text-sky-500" />
          正在读取任务栏外观状态...
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500">
              <PanelTop size={24} />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight">任务栏外观</h1>
              <p className="text-sm font-medium text-muted-foreground">
                选择预设、调整强度和染色值，快速切换任务栏观感。
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-sky-500/20 text-sky-600">
            {hasKnownStatus
              ? (readySettings?.enabled ? '已启用自定义外观' : '当前为系统默认')
              : '状态未知'}
          </Badge>
          <Badge variant="outline">
            {readySupport ? `Windows build ${readySupport.host.build}` : '宿主信息未知'}
          </Badge>
          <Badge variant="outline">
            {readySupport
              ? (readySupport.host.acrylicAvailable ? '支持亚克力' : '亚克力受限')
              : '能力信息未知'}
          </Badge>
        </div>
      </div>

      {feedback ? (
        <Card className={cn(
          feedback.tone === 'destructive'
            ? 'border-red-500/20 bg-red-500/5'
            : 'border-emerald-500/20 bg-emerald-500/5'
        )}>
          <CardContent className="flex items-center gap-3 p-4">
            {feedback.tone === 'destructive' ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : (
              <Sparkles className="h-4 w-4 text-emerald-500" />
            )}
            <p className="text-sm font-medium">{feedback.message}</p>
          </CardContent>
        </Card>
      ) : null}

      {statusState === 'unavailable' ? (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              状态暂不可用
            </CardTitle>
            <CardDescription>
              当前无法获取任务栏实时状态。页面会暂停展示已应用结果，避免把默认值误认为真实状态。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {isUnsupportedHost ? (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              当前系统不在正式支持范围内
            </CardTitle>
            <CardDescription>
              当前系统未满足任务栏材质增强要求，可用项会根据系统能力自动禁用。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-sky-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-sky-500" />
              预设选择
            </CardTitle>
            <CardDescription>
              先切换到目标材质，再决定强度和染色值。不可用的预设会直接标记原因。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={draft.preset}
              onValueChange={(value) => {
                setDraft((prev) => ({ ...prev, preset: value as TaskbarAppearancePreset }))
              }}
              className="grid gap-3"
            >
              {presetOptions.map((option) => {
                const availability = support?.presets[option.value]
                const unavailable = availability ? !availability.available : true

                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-4 rounded-2xl border border-white/20 bg-white/30 p-4 transition-all dark:border-white/10 dark:bg-white/[0.03]',
                      draft.preset === option.value && 'border-sky-500/40 bg-sky-500/5',
                      unavailable && 'cursor-not-allowed opacity-55'
                    )}
                  >
                    <RadioGroupItem value={option.value} disabled={unavailable} className="mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">{option.label}</span>
                        <Badge variant="outline" className="text-[11px]">
                          {availability?.available ? '可用' : '受限'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                      {!availability?.available && availability?.reason ? (
                        <p className="text-xs font-medium text-amber-600">{availability.reason}</p>
                      ) : null}
                    </div>
                  </label>
                )
              })}
            </RadioGroup>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <SlidersHorizontal className="h-5 w-5 text-sky-500" />
              强度与染色
            </CardTitle>
            <CardDescription>
              在选定预设后，可继续微调强度与染色值。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="taskbar-intensity">强度</Label>
                  <span className="text-sm font-semibold text-sky-600">{draft.intensity}%</span>
                </div>
                <input
                  id="taskbar-intensity"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={draft.intensity}
                  onChange={(event) => {
                    setDraft((prev) => ({
                      ...prev,
                      intensity: Number(event.target.value)
                    }))
                  }}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-sky-500/15 accent-sky-500"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="taskbar-tint">染色值</Label>
                <div className="flex gap-3">
                  <Input
                    id="taskbar-tint"
                    value={draft.tintHex}
                    onChange={(event) => {
                      setDraft((prev) => ({
                        ...prev,
                        tintHex: event.target.value.toUpperCase()
                      }))
                    }}
                    placeholder="#FFFFFF33"
                    className={!isTintValid ? 'border-red-500/40 focus-visible:ring-red-500/30' : undefined}
                  />
                  <Input
                    type="color"
                    value={colorInputValue}
                    onChange={(event) => {
                      const alpha = draft.tintHex.length === 9 ? draft.tintHex.slice(7) : '33'
                      setDraft((prev) => ({
                        ...prev,
                        tintHex: `${event.target.value.toUpperCase()}${alpha.toUpperCase()}`
                      }))
                    }}
                    className="h-10 w-16 cursor-pointer p-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  使用 8 位十六进制色值，例如 `#FFFFFF33`。
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">当前状态</CardTitle>
              <CardDescription>
                展示最近一次成功读取到的任务栏配置，便于与当前草稿对照。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 text-sm">
                <span className="text-muted-foreground">当前预设</span>
                <span className="font-semibold">{readySettings ? readySettings.preset : '未知'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 text-sm">
                <span className="text-muted-foreground">当前强度</span>
                <span className="font-semibold">{readySettings ? `${readySettings.intensity}%` : '未知'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 text-sm">
                <span className="text-muted-foreground">当前染色</span>
                <code className="rounded bg-background/60 px-2 py-1 text-xs">
                  {readySettings ? readySettings.tintHex : '未知'}
                </code>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-sky-500/10">
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            更改会通过系统桥接接口应用到任务栏，恢复默认可撤销当前自定义效果。
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void handleRestoreDefault()} disabled={!canRestore}>
              <RotateCcw className="h-4 w-4" />
              {isRestoring ? '恢复中...' : '恢复默认'}
            </Button>
            <Button onClick={() => void handleApplyPreset()} disabled={!canApply}>
              {isApplying ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isApplying ? '应用中...' : '应用预设'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
