import React from 'react'
import { AlertTriangle, Code, Download, RefreshCw, Wrench } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGlobalStore } from '@/store'
import { DEV_ENVIRONMENT_DISPLAY_LIST, getDevEnvironmentActionLabel } from './devEnvironmentData'
import { useDevEnvironmentManager, resolveDevEnvironmentActionAvailability } from '../hooks/useDevEnvironmentManager'

export default function DevEnvironmentManagerTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const {
    logs,
    pendingAction,
    viewModel,
    refreshAll,
    refreshOne,
    install,
    update,
    updateAll,
    clearLogs
  } = useDevEnvironmentManager()

  const recordsById = new Map(viewModel.records.map((record) => [record.id, record]))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Code className="w-6 h-6 text-primary" />
          开发环境
        </h2>
        <p className="text-muted-foreground">检测常见开发环境版本、路径与可更新状态。</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>环境总览</CardTitle>
            <CardDescription>
              {viewModel.checkedAt ? `最近检测 ${new Date(viewModel.checkedAt).toLocaleString('zh-CN')}` : '等待首次检测'}
            </CardDescription>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => void refreshAll()} disabled={pendingAction === 'refresh-all'}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重新检测全部
            </Button>
            <Button onClick={() => void updateAll()} disabled={!viewModel.wingetAvailable || pendingAction === 'update-all'}>
              <Download className="w-4 h-4 mr-2" />
              更新全部可更新项
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {viewModel.summaryCards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{card.label}</div>
                <div className="text-3xl font-black mt-2">{card.value}</div>
              </div>
            ))}
          </div>
          {!viewModel.wingetAvailable && (
            <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              未检测到 winget，当前仍可查看环境状态，但安装和更新按钮会禁用。
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {DEV_ENVIRONMENT_DISPLAY_LIST.map((item) => {
          const record = recordsById.get(item.id)
          const actions = resolveDevEnvironmentActionAvailability(record ?? {
            id: item.id,
            status: item.id === 'wsl' ? 'external' : 'missing',
            canInstall: false,
            canUpdate: false
          })

          return (
            <Card key={item.id} className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{item.name}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                  <Badge variant="outline">{record?.status ?? 'missing'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div>版本：{record?.detectedVersion ?? '未检测到'}</div>
                  <div className="truncate">路径：{record?.resolvedPath ?? '未检测到'}</div>
                </div>
                {record?.notes?.length ? (
                  <div className="text-xs text-muted-foreground">{record.notes.join(' / ')}</div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void refreshOne(item.id)}>
                    {getDevEnvironmentActionLabel('refresh')}
                  </Button>
                  {actions.canInstall ? (
                    <Button size="sm" disabled={!viewModel.wingetAvailable} onClick={() => void install(item.id).then((result) => {
                      if (!result.success) {
                        showNotification({ type: 'error', message: result.error || '安装失败' })
                      }
                    })}>
                      {getDevEnvironmentActionLabel('install')}
                    </Button>
                  ) : null}
                  {actions.canUpdate ? (
                    <Button size="sm" disabled={!viewModel.wingetAvailable} onClick={() => void update(item.id).then((result) => {
                      if (!result.success) {
                        showNotification({ type: 'error', message: result.error || '更新失败' })
                      }
                    })}>
                      {getDevEnvironmentActionLabel('update')}
                    </Button>
                  ) : null}
                  {actions.canOpenRelatedTool ? (
                    <Button size="sm" onClick={() => void window.electron.devEnvironment.openRelatedTool(item.id)}>
                      <Wrench className="w-4 h-4 mr-2" />
                      {getDevEnvironmentActionLabel('open-related-tool')}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>运行日志</CardTitle>
            <CardDescription>显示检测、安装和更新过程中的即时输出。</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={clearLogs}>清空日志</Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl bg-zinc-950 text-zinc-100 p-4 font-mono text-xs h-72 overflow-auto space-y-2">
            {logs.length === 0 ? (
              <div className="text-zinc-500">暂无日志输出</div>
            ) : logs.map((entry, index) => (
              <div key={`${entry.type}-${index}`} className="break-all">
                <span className="text-zinc-500 mr-2">[{entry.type}]</span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
