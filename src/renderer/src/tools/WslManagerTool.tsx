import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useGlobalStore } from '@/store'
import {
  Archive,
  HardDrive,
  Power,
  RefreshCw,
  RotateCcw,
  Square,
  Star,
  TerminalSquare,
  Trash2
} from 'lucide-react'

import type {
  WslBackupFormat,
  WslBackupInfo,
  WslDistroInfo,
  WslOverview,
  WslSpaceReclaimResult
} from '../../../shared/types'

function formatBytes(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '未知'
  }

  if (value < 1024) {
    return `${value} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let current = value / 1024
  let unitIndex = 0

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }

  return `${current.toFixed(current >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

function buildRestoreCopyName(backup: WslBackupInfo, override: string): string | undefined {
  const normalized = override.trim()
  if (normalized) {
    return normalized
  }

  return `${backup.distroName}-restored`
}

export default function WslManagerTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const [overview, setOverview] = useState<WslOverview | null>(null)
  const [backups, setBackups] = useState<WslBackupInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [backupDistro, setBackupDistro] = useState('')
  const [backupFormat, setBackupFormat] = useState<WslBackupFormat>('tar')
  const [restoreCopyName, setRestoreCopyName] = useState('')
  const [spaceDistro, setSpaceDistro] = useState('')
  const [reclaimResult, setReclaimResult] = useState<WslSpaceReclaimResult | null>(null)

  const fetchOverview = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }

    const result = await window.electron.wsl.getOverview()
    if (result.success && result.data) {
      setOverview(result.data)
    } else if (!silent) {
      showNotification({
        type: 'error',
        title: 'WSL 状态读取失败',
        message: result.error || '当前无法读取 WSL 环境。'
      })
    }

    if (!silent) {
      setLoading(false)
    }
  }, [showNotification])

  const fetchBackups = useCallback(async (silent = false) => {
    const result = await window.electron.wsl.getBackups()
    if (result.success && result.data) {
      setBackups(result.data)
    } else if (!silent) {
      showNotification({
        type: 'error',
        title: '备份列表读取失败',
        message: result.error || '当前无法读取 WSL 备份列表。'
      })
    }
  }, [showNotification])

  useEffect(() => {
    void fetchOverview()
    void fetchBackups(true)
  }, [fetchBackups, fetchOverview])

  useEffect(() => {
    if (!overview?.distros.length) {
      setBackupDistro('')
      setSpaceDistro('')
      return
    }

    setBackupDistro((current) => {
      if (current && overview.distros.some((distro) => distro.name === current)) {
        return current
      }

      return overview.defaultDistro || overview.distros[0].name
    })

    setSpaceDistro((current) => {
      if (current && overview.distros.some((distro) => distro.name === current)) {
        return current
      }

      const distroWithDisk = overview.distros.find((distro) => distro.vhdPath)
      return distroWithDisk?.name || overview.distros[0].name
    })
  }, [overview])

  const refreshOverviewSilently = useCallback(() => {
    if (loading || actionKey) {
      return
    }

    void fetchOverview(true)
  }, [actionKey, fetchOverview, loading])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshOverviewSilently()
      }
    }, 5000)

    const handleFocus = () => {
      refreshOverviewSilently()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshOverviewSilently()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshOverviewSilently])

  const runOverviewAction = useCallback(async (
    key: string,
    action: () => Promise<any>,
    successTitle: string,
    successMessage: string,
    shouldRefreshBackups = false
  ) => {
    setActionKey(key)
    const result = await action()
    setActionKey(null)

    if (result.success) {
      if (result.data) {
        setOverview(result.data)
      } else {
        void fetchOverview(true)
      }

      if (shouldRefreshBackups) {
        void fetchBackups(true)
      }

      showNotification({
        type: 'success',
        title: successTitle,
        message: successMessage
      })
      return
    }

    showNotification({
      type: 'error',
      title: `${successTitle}失败`,
      message: result.error || '命令执行失败。'
    })
  }, [fetchBackups, fetchOverview, showNotification])

  const handleCreateBackup = useCallback(async () => {
    if (!backupDistro) {
      return
    }

    setActionKey('backup-create')
    const result = await window.electron.wsl.createBackup(backupDistro, backupFormat)
    setActionKey(null)

    if (result.success && result.data) {
      setBackups(result.data)
      await fetchOverview(true)
      showNotification({
        type: 'success',
        title: '备份已创建',
        message: `${backupDistro} 已导出为 ${backupFormat === 'vhd' ? 'VHDX' : 'TAR'} 备份。`
      })
      return
    }

    showNotification({
      type: 'error',
      title: '创建备份失败',
      message: result.error || '当前无法导出该发行版。'
    })
  }, [backupDistro, backupFormat, fetchOverview, showNotification])

  const handleDeleteBackup = useCallback(async (backup: WslBackupInfo) => {
    setActionKey(`backup-delete-${backup.id}`)
    const result = await window.electron.wsl.deleteBackup(backup.id)
    setActionKey(null)

    if (result.success && result.data) {
      setBackups(result.data)
      showNotification({
        type: 'success',
        title: '备份已删除',
        message: `${backup.fileName} 已从备份列表移除。`
      })
      return
    }

    showNotification({
      type: 'error',
      title: '删除备份失败',
      message: result.error || '无法删除指定备份。'
    })
  }, [showNotification])

  const handleRestoreBackup = useCallback(async (backup: WslBackupInfo, mode: 'copy' | 'replace') => {
    const key = `backup-restore-${mode}-${backup.id}`
    setActionKey(key)
    const result = await window.electron.wsl.restoreBackup(
      backup.id,
      mode,
      mode === 'copy' ? buildRestoreCopyName(backup, restoreCopyName) : undefined
    )
    setActionKey(null)

    if (result.success && result.data) {
      setOverview(result.data)
      setRestoreCopyName('')
      showNotification({
        type: 'success',
        title: mode === 'copy' ? '副本恢复完成' : '覆盖恢复完成',
        message: mode === 'copy'
          ? `${backup.distroName} 已恢复为一个新的 WSL 副本。`
          : `${backup.distroName} 已按备份内容重建。`
      })
      return
    }

    showNotification({
      type: 'error',
      title: mode === 'copy' ? '副本恢复失败' : '覆盖恢复失败',
      message: result.error || '当前无法恢复该备份。'
    })
  }, [restoreCopyName, showNotification])

  const handleReclaimSpace = useCallback(async () => {
    if (!spaceDistro) {
      return
    }

    setActionKey(`reclaim-${spaceDistro}`)
    const result = await window.electron.wsl.reclaimSpace(spaceDistro)
    setActionKey(null)

    if (result.success && result.data) {
      setReclaimResult(result.data)
      await fetchOverview(true)
      showNotification({
        type: 'success',
        title: '空间回收已完成',
        message: `${spaceDistro} 已尝试把空闲虚拟磁盘空间归还给 Windows。`
      })
      return
    }

    showNotification({
      type: 'error',
      title: '空间回收失败',
      message: result.error || '当前无法处理该发行版的虚拟磁盘。'
    })
  }, [fetchOverview, showNotification, spaceDistro])

  const summary = useMemo(() => ({
    distroCount: overview?.distros.length || 0,
    runningCount: overview?.runningCount || 0,
    defaultDistro: overview?.defaultDistro || '未设置'
  }), [overview])

  const statusItems = useMemo(() => {
    if (!overview) {
      return []
    }

    const info = overview.versionInfo
    return [
      { label: 'WSL 版本', value: info.wslVersion },
      { label: '内核版本', value: info.kernelVersion },
      { label: 'WSLg 版本', value: info.wslgVersion },
      { label: 'MSRDC 版本', value: info.msrdcVersion },
      { label: 'Direct3D 版本', value: info.direct3dVersion },
      { label: 'DXCore 版本', value: info.dxcoreVersion },
      { label: 'Windows 版本', value: info.windowsVersion }
    ].filter((item) => item.value)
  }, [overview])

  const selectedSpaceDistro = overview?.distros.find((distro) => distro.name === spaceDistro) || null

  const renderDistroCard = (distro: WslDistroInfo) => {
    const keyBase = `wsl-${distro.name}`
    const busyShell = actionKey === `${keyBase}-shell`
    const busyDefault = actionKey === `${keyBase}-default`
    const busyTerminate = actionKey === `${keyBase}-terminate`

    return (
      <Card key={distro.name} className="border-none overflow-hidden">
        <CardContent className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-black tracking-tight">{distro.name}</h3>
                {distro.isDefault && (
                  <Badge className="bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                    <Star size={12} />
                    默认
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    distro.isRunning
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                      : 'border-zinc-300/60 bg-zinc-500/5 text-zinc-500'
                  )}
                >
                  {distro.state}
                </Badge>
                <Badge variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-cyan-700">
                  WSL {distro.version}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-medium text-muted-foreground">
                <span>{distro.isRunning ? '实例运行中' : '实例已停止'}</span>
                {distro.osVersion && <span>系统版本 {distro.osVersion}</span>}
                {distro.vhdSizeBytes !== null && distro.vhdSizeBytes !== undefined && (
                  <span>虚拟磁盘 {formatBytes(distro.vhdSizeBytes)}</span>
                )}
              </div>
              {distro.vhdPath && (
                <p className="text-xs text-muted-foreground break-all">
                  {distro.vhdPath}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                className="rounded-2xl bg-cyan-500 hover:bg-cyan-600 shadow-lg shadow-cyan-500/20"
                onClick={() =>
                  void runOverviewAction(
                    `${keyBase}-shell`,
                    () => window.electron.wsl.launchShell(distro.name),
                    '终端已打开',
                    `${distro.name} 终端窗口已启动。`
                  )
                }
              >
                <TerminalSquare size={16} className={cn(busyShell && 'animate-pulse')} />
                打开终端
              </Button>
              {!distro.isDefault && (
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() =>
                    void runOverviewAction(
                      `${keyBase}-default`,
                      () => window.electron.wsl.setDefault(distro.name),
                      '默认发行版已切换',
                      `${distro.name} 已设为默认 WSL 发行版。`
                    )
                  }
                >
                  <Star size={16} className={cn(busyDefault && 'animate-pulse')} />
                  设为默认
                </Button>
              )}
              <Button
                variant="outline"
                className="rounded-2xl"
                disabled={!distro.isRunning}
                onClick={() =>
                  void runOverviewAction(
                    `${keyBase}-terminate`,
                    () => window.electron.wsl.terminate(distro.name),
                    '实例已停止',
                    `${distro.name} 已被终止。`
                  )
                }
              >
                <Square size={16} className={cn(busyTerminate && 'animate-pulse')} />
                停止实例
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <TerminalSquare className="text-cyan-500" size={30} />
            WSL 虚拟机管理
          </h2>
          <p className="text-sm font-bold text-muted-foreground">
            查看 WSL 状态、做发行版备份与恢复，并把已释放的虚拟磁盘空间尽量归还给 Windows。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className={cn(
              'px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em]',
              overview?.available
                ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-600'
                : 'border-zinc-300/60 bg-zinc-500/5 text-zinc-500'
            )}
          >
            {overview?.available ? 'WSL Ready' : 'WSL Missing'}
          </Badge>
          <Button variant="outline" className="rounded-2xl" onClick={() => void fetchOverview()}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新状态
          </Button>
          <Button
            className="rounded-2xl bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
            disabled={!overview?.available || summary.runningCount === 0}
            onClick={() =>
              void runOverviewAction(
                'wsl-shutdown-all',
                () => window.electron.wsl.shutdownAll(),
                'WSL 已关闭',
                '所有 WSL 发行版实例已停止。'
              )
            }
          >
            <Power size={16} className={cn(actionKey === 'wsl-shutdown-all' && 'animate-pulse')} />
            全部关闭
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none overflow-hidden">
          <CardHeader className="pb-3">
            <CardDescription>发行版数量</CardDescription>
            <CardTitle className="text-xl font-black">{summary.distroCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs font-bold text-muted-foreground">
            当前系统可见的 WSL 发行版总数。
          </CardContent>
        </Card>
        <Card className="border-none overflow-hidden">
          <CardHeader className="pb-3">
            <CardDescription>运行中的实例</CardDescription>
            <CardTitle className="text-xl font-black">{summary.runningCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs font-bold text-muted-foreground">
            用于判断当前是否有 Linux 环境正在占用资源。
          </CardContent>
        </Card>
        <Card className="border-none overflow-hidden">
          <CardHeader className="pb-3">
            <CardDescription>默认发行版</CardDescription>
            <CardTitle className="text-xl font-black truncate">{summary.defaultDistro}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs font-bold text-muted-foreground">
            直接执行 <code>wsl</code> 时默认进入的发行版。
          </CardContent>
        </Card>
      </div>

      {!overview?.available ? (
        <Card className="border-none overflow-hidden">
          <CardHeader>
            <CardTitle className="text-xl font-black">当前未检测到可用 WSL</CardTitle>
            <CardDescription>{overview?.message || '如果你尚未安装 WSL，可以先在管理员 PowerShell 中执行安装命令。'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-3xl border border-zinc-200/80 bg-white px-5 py-4 font-mono text-sm text-zinc-900 shadow-sm">
              wsl --install
            </div>
          </CardContent>
        </Card>
      ) : summary.distroCount === 0 ? (
        <Card className="border-none overflow-hidden">
          <CardHeader>
            <CardTitle className="text-xl font-black">WSL 已启用，但还没有发行版</CardTitle>
            <CardDescription>{overview.message || '先安装一个 Ubuntu、Debian 或其他发行版，之后这里就会显示可管理实例。'}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
          <div className="space-y-4">
            {overview.distros.map((distro) => renderDistroCard(distro))}
          </div>

          <div className="space-y-6">
            <Card className="border-none overflow-hidden">
              <CardHeader>
                <CardTitle className="text-xl font-black">状态摘要</CardTitle>
                <CardDescription>结构化展示 WSL 版本与宿主机相关版本，避免原始输出乱码。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-3">
                  {statusItems.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-zinc-900 shadow-sm">
                      <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">{item.label}</span>
                      <span className="text-sm font-semibold text-right">{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">原始状态输出</p>
                  <pre className="max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-3xl border border-zinc-200/80 bg-white px-5 py-4 font-mono text-xs leading-6 text-zinc-800 shadow-sm">
                    {overview.rawStatus || '暂无额外状态输出'}
                  </pre>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none overflow-hidden">
              <CardHeader>
                <CardTitle className="text-xl font-black flex items-center gap-2">
                  <Archive size={18} />
                  备份管理
                </CardTitle>
                <CardDescription>支持导出为 TAR 或 VHDX，并可恢复为新副本或覆盖恢复原发行版。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-muted-foreground">备份目标发行版</span>
                    <select
                      value={backupDistro}
                      onChange={(event) => setBackupDistro(event.target.value)}
                      className="flex h-11 w-full rounded-xl border border-zinc-200/80 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      {overview.distros.map((distro) => (
                        <option key={distro.name} value={distro.name}>{distro.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-muted-foreground">备份格式</span>
                    <select
                      value={backupFormat}
                      onChange={(event) => setBackupFormat(event.target.value as WslBackupFormat)}
                      className="flex h-11 w-full rounded-xl border border-zinc-200/80 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <option value="tar">TAR 文件系统备份</option>
                      <option value="vhd">VHDX 磁盘镜像备份</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    className="rounded-2xl bg-cyan-500 hover:bg-cyan-600 shadow-lg shadow-cyan-500/20"
                    disabled={!backupDistro}
                    onClick={() => void handleCreateBackup()}
                  >
                    <Archive size={16} className={cn(actionKey === 'backup-create' && 'animate-pulse')} />
                    创建备份
                  </Button>
                  <p className="text-xs font-medium text-muted-foreground">
                    备份目录：{overview.backupRoot}
                  </p>
                </div>

                <label className="space-y-2 block">
                  <span className="text-sm font-bold text-muted-foreground">恢复为副本时的名称（留空自动生成）</span>
                  <Input
                    value={restoreCopyName}
                    onChange={(event) => setRestoreCopyName(event.target.value)}
                    placeholder="例如 Ubuntu-lab-copy"
                    className="rounded-xl"
                  />
                </label>

                <Alert>
                  <Archive className="h-4 w-4" />
                  <AlertTitle>恢复策略</AlertTitle>
                  <AlertDescription>
                    “恢复为副本”会保留现有发行版；“覆盖恢复”会先注销原发行版，再按备份重建，默认用于你明确要回滚当前环境的场景。
                  </AlertDescription>
                </Alert>

                {backups.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-zinc-300/70 px-5 py-8 text-sm text-center text-muted-foreground">
                    还没有应用管理的 WSL 备份，先创建一个备份再做恢复或删除操作。
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>发行版</TableHead>
                        <TableHead>格式</TableHead>
                        <TableHead>大小</TableHead>
                        <TableHead>时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backups.map((backup) => (
                        <TableRow key={backup.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-semibold">{backup.distroName}</p>
                              <p className="text-xs text-muted-foreground break-all">{backup.fileName}</p>
                            </div>
                          </TableCell>
                          <TableCell>{backup.format === 'vhd' ? 'VHDX' : 'TAR'}</TableCell>
                          <TableCell>{formatBytes(backup.sizeBytes)}</TableCell>
                          <TableCell>{formatDateTime(backup.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-xl"
                                onClick={() => void handleRestoreBackup(backup, 'copy')}
                              >
                                <RotateCcw size={14} className={cn(actionKey === `backup-restore-copy-${backup.id}` && 'animate-pulse')} />
                                恢复副本
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-xl"
                                onClick={() => void handleRestoreBackup(backup, 'replace')}
                              >
                                <RotateCcw size={14} className={cn(actionKey === `backup-restore-replace-${backup.id}` && 'animate-pulse')} />
                                覆盖恢复
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-xl"
                                onClick={() => void handleDeleteBackup(backup)}
                              >
                                <Trash2 size={14} className={cn(actionKey === `backup-delete-${backup.id}` && 'animate-pulse')} />
                                删除
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="border-none overflow-hidden">
              <CardHeader>
                <CardTitle className="text-xl font-black flex items-center gap-2">
                  <HardDrive size={18} />
                  压缩空间
                </CardTitle>
                <CardDescription>尝试把发行版虚拟磁盘中已释放的空闲块归还给 Windows。此过程会执行一次全局 WSL 关闭。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <label className="space-y-2 block">
                  <span className="text-sm font-bold text-muted-foreground">目标发行版</span>
                  <select
                    value={spaceDistro}
                    onChange={(event) => setSpaceDistro(event.target.value)}
                    className="flex h-11 w-full rounded-xl border border-zinc-200/80 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {overview.distros.map((distro) => (
                      <option key={distro.name} value={distro.name}>{distro.name}</option>
                    ))}
                  </select>
                </label>

                <div className="space-y-2 rounded-3xl border border-zinc-200/80 bg-white px-5 py-4 text-zinc-900 shadow-sm">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-zinc-500">虚拟磁盘路径</span>
                    <span className="text-right break-all">{selectedSpaceDistro?.vhdPath || '未找到'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-zinc-500">当前文件大小</span>
                    <span>{formatBytes(selectedSpaceDistro?.vhdSizeBytes)}</span>
                  </div>
                </div>

                <Alert>
                  <HardDrive className="h-4 w-4" />
                  <AlertTitle>回收原理</AlertTitle>
                  <AlertDescription>
                    这一步会先尝试在 Linux 内执行 trim，再启用 VHD 稀疏回收并关闭 WSL。它只能回收已经释放但还占着宿主机磁盘的空闲块，不能压缩仍在使用的数据。
                  </AlertDescription>
                </Alert>

                <Button
                  className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                  disabled={!selectedSpaceDistro?.vhdPath}
                  onClick={() => void handleReclaimSpace()}
                >
                  <HardDrive size={16} className={cn(actionKey === `reclaim-${spaceDistro}` && 'animate-pulse')} />
                  开始压缩空间
                </Button>

                {reclaimResult && (
                  <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 space-y-2">
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      最近一次回收结果：{reclaimResult.distroName}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl bg-white/70 dark:bg-black/20 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">回收前</div>
                        <div className="font-semibold">{formatBytes(reclaimResult.beforeBytes)}</div>
                      </div>
                      <div className="rounded-2xl bg-white/70 dark:bg-black/20 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">回收后</div>
                        <div className="font-semibold">{formatBytes(reclaimResult.afterBytes)}</div>
                      </div>
                      <div className="rounded-2xl bg-white/70 dark:bg-black/20 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">归还空间</div>
                        <div className="font-semibold">{formatBytes(reclaimResult.reclaimedBytes)}</div>
                      </div>
                    </div>
                    {reclaimResult.trimOutput && (
                      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-xs text-zinc-800 shadow-sm">
                        {reclaimResult.trimOutput}
                      </pre>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
