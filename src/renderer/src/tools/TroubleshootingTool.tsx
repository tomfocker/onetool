import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  Info,
  KeyRound,
  ListChecks,
  Play,
  Printer,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Wrench
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useGlobalStore } from '@/store'
import {
  getGroupPolicyCardState,
  type GroupPolicyInstallResult,
  type GroupPolicyStatus,
  type PrinterShareCredentialResult,
  type PrinterShareDiagnosis,
  type PrinterShareGuidedActionId,
  type PrinterShareRepairActionId,
  type PrinterShareRepairResult,
  type TroubleshootingCardState
} from '../../../shared/troubleshooting'

type LoadingAction =
  | 'scan'
  | 'install'
  | 'open'
  | 'printer-diagnose'
  | 'open-printer-target'
  | 'save-server-credential'
  | PrinterShareRepairActionId
  | null

const cardStateCopy: Record<
  TroubleshootingCardState,
  {
    label: string
    title: string
    detail: string
    badgeClassName: string
    iconClassName: string
  }
> = {
  idle: {
    label: '待检测',
    title: '正在准备检测',
    detail: '会检查当前 Windows 版本、gpedit.msc 和本机组策略组件包。',
    badgeClassName: 'border-zinc-300/60 bg-zinc-500/5 text-zinc-600 dark:text-zinc-300',
    iconClassName: 'bg-zinc-500/10 text-zinc-500'
  },
  ready: {
    label: '可安装',
    title: '检测到可用组件包',
    detail: '可以用本机系统组件包安装或修复组策略编辑器。',
    badgeClassName: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    iconClassName: 'bg-emerald-500/10 text-emerald-600'
  },
  installed: {
    label: '已可用',
    title: '组策略编辑器已经可用',
    detail: '可以直接打开 gpedit.msc 管理本机策略。',
    badgeClassName: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    iconClassName: 'bg-indigo-500/10 text-indigo-600'
  },
  unsupported: {
    label: '不支持',
    title: '当前环境不支持',
    detail: '此向导仅面向 Windows 本机环境。',
    badgeClassName: 'border-zinc-300/60 bg-zinc-500/5 text-zinc-600 dark:text-zinc-300',
    iconClassName: 'bg-zinc-500/10 text-zinc-500'
  },
  blocked: {
    label: '缺少组件',
    title: '未找到本机组件包',
    detail: '系统目录里没有找到可用于安装的组策略组件包。',
    badgeClassName: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    iconClassName: 'bg-amber-500/10 text-amber-600'
  },
  error: {
    label: '需检查',
    title: '状态需要人工确认',
    detail: '检测结果不完整，建议重新检测或查看安装日志。',
    badgeClassName: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
    iconClassName: 'bg-red-500/10 text-red-600'
  }
}

function formatStatusValue(value: string | null | undefined): string {
  return value?.trim() || '未读取到'
}

function getInstallSummary(result: GroupPolicyInstallResult): string {
  if (result.exitCode === 0) return '安装流程已完成'
  if (!result.started) return result.error || '管理员权限请求未完成'
  return `安装流程结束，退出码 ${result.exitCode ?? '未知'}`
}

const printerActionCopy: Record<PrinterShareGuidedActionId, { label: string; icon: typeof Wrench }> = {
  'restart-client-spooler': { label: '重启本机打印服务', icon: RefreshCw },
  'clear-client-print-queue': { label: '清空本机队列', icon: Trash2 },
  'apply-rpc-compatibility': { label: '应用 RPC 兼容修复', icon: ShieldCheck },
  'save-server-credential': { label: '保存服务端凭据', icon: KeyRound },
  'clear-server-credential': { label: '清除旧凭据', icon: Trash2 },
  'clear-server-connection': { label: '清除旧连接', icon: RefreshCw },
  'open-credential-manager': { label: '打开凭据管理器', icon: KeyRound },
  'open-printer-settings': { label: '打开打印机设置', icon: Printer },
  'open-server-unc': { label: '打开服务端共享', icon: ExternalLink },
  'server-checklist': { label: '查看服务端检查项', icon: Server },
  'retry-diagnosis': { label: '重新检测', icon: RefreshCw },
  none: { label: '无需操作', icon: CheckCircle2 }
}

export default function TroubleshootingTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const [status, setStatus] = useState<GroupPolicyStatus | null>(null)
  const [installResult, setInstallResult] = useState<GroupPolicyInstallResult | null>(null)
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [printerTarget, setPrinterTarget] = useState('')
  const [printerName, setPrinterName] = useState('')
  const [printerDiagnosis, setPrinterDiagnosis] = useState<PrinterShareDiagnosis | null>(null)
  const [printerRepairResult, setPrinterRepairResult] = useState<PrinterShareRepairResult | null>(null)
  const [printerCredentialResult, setPrinterCredentialResult] = useState<PrinterShareCredentialResult | null>(null)
  const [showAdvancedPrinterDiagnostics, setShowAdvancedPrinterDiagnostics] = useState(false)
  const [credentialUsername, setCredentialUsername] = useState('')
  const [credentialPassword, setCredentialPassword] = useState('')

  const cardState = getGroupPolicyCardState(status)
  const stateCopy = cardStateCopy[cardState]
  const hasTroubleshootingApi = Boolean(window.electron?.troubleshooting)

  const statusRows = useMemo(
    () => [
      { label: '系统版本', value: formatStatusValue(status?.productName || status?.caption) },
      { label: '版本标识', value: formatStatusValue(status?.editionId) },
      { label: 'gpedit.msc', value: status?.gpeditInstalled ? '已存在' : '未安装' },
      { label: '组件包总数', value: String(status?.packageCount ?? 0) },
      { label: '扩展包', value: String(status?.clientExtensionPackageCount ?? 0) },
      { label: '工具包', value: String(status?.clientToolsPackageCount ?? 0) }
    ],
    [status]
  )

  const scanGroupPolicy = useCallback(
    async (silent = false) => {
      if (!window.electron?.troubleshooting) {
        setLastError('疑难修复接口还没有就绪，请重启 OneTool 后再试。')
        return
      }

      if (!silent) setLoadingAction('scan')
      setLastError(null)

      try {
        const result = await window.electron.troubleshooting.scanGroupPolicy()
        if (result.success && result.data) {
          setStatus(result.data)
          if (!silent) {
            showNotification({
              type: 'success',
              title: '检测完成',
              message: result.data.reason || '已完成组策略状态检测。'
            })
          }
          return
        }

        const message = result.error || '无法读取组策略状态。'
        setLastError(message)
        showNotification({ type: 'error', title: '检测失败', message })
      } catch (error) {
        const message = error instanceof Error ? error.message : '检测过程异常。'
        setLastError(message)
        showNotification({ type: 'error', title: '检测失败', message })
      } finally {
        if (!silent) setLoadingAction(null)
      }
    },
    [showNotification]
  )

  useEffect(() => {
    void scanGroupPolicy(true)
  }, [scanGroupPolicy])

  const installGroupPolicy = useCallback(async () => {
    if (!window.electron?.troubleshooting) {
      showNotification({
        type: 'warning',
        title: '接口未就绪',
        message: '疑难修复接口还没有加载，请重启 OneTool 后再试。'
      })
      return
    }

    const confirmed = window.confirm(
      '安装组策略会请求管理员权限，并调用 DISM 安装 Windows 本机组件包。继续吗？'
    )
    if (!confirmed) return

    setLoadingAction('install')
    setLastError(null)
    setInstallResult(null)

    try {
      const result = await window.electron.troubleshooting.installGroupPolicy()
      if (result.data) {
        setInstallResult(result.data)
      }

      if (result.success) {
        showNotification({
          type: 'success',
          title: '安装完成',
          message: '组策略组件安装流程已结束，正在重新检测状态。'
        })
        await scanGroupPolicy(true)
        return
      }

      const message = result.error || '组策略安装没有完成。'
      setLastError(message)
      showNotification({ type: 'error', title: '安装失败', message })
      await scanGroupPolicy(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : '安装过程异常。'
      setLastError(message)
      showNotification({ type: 'error', title: '安装失败', message })
    } finally {
      setLoadingAction(null)
    }
  }, [scanGroupPolicy, showNotification])

  const openGroupPolicyEditor = useCallback(async () => {
    if (!window.electron?.troubleshooting) {
      showNotification({
        type: 'warning',
        title: '接口未就绪',
        message: '疑难修复接口还没有加载，请重启 OneTool 后再试。'
      })
      return
    }

    setLoadingAction('open')
    try {
      const result = await window.electron.troubleshooting.openGroupPolicyEditor()
      if (result.success) {
        showNotification({
          type: 'success',
          title: '已打开',
          message: '正在启动 gpedit.msc。'
        })
        return
      }

      showNotification({
        type: 'error',
        title: '打开失败',
        message: result.error || '无法打开 gpedit.msc。'
      })
    } finally {
      setLoadingAction(null)
    }
  }, [showNotification])

  const diagnosePrinterShare = useCallback(async (notify = true): Promise<PrinterShareDiagnosis | null> => {
    if (!window.electron?.troubleshooting) {
      showNotification({
        type: 'warning',
        title: '接口未就绪',
        message: '疑难修复接口还没有加载，请重启 OneTool 后再试。'
      })
      return null
    }

    const target = printerTarget.trim()
    if (!target) {
      showNotification({
        type: 'warning',
        title: '缺少服务端地址',
        message: '请输入服务端 IP、主机名或共享路径。'
      })
      return null
    }

    setLoadingAction('printer-diagnose')
    setPrinterRepairResult(null)
    setPrinterCredentialResult(null)
    try {
      const result = await window.electron.troubleshooting.diagnosePrinterShare({
        target,
        printerName: printerName.trim() || undefined
      })

      if (result.success && result.data) {
        setPrinterDiagnosis(result.data)
        setShowAdvancedPrinterDiagnostics(result.data.advancedChecksVisibleByDefault)
        if (notify) {
          showNotification({
            type: 'success',
            title: '诊断完成',
            message: result.data.summary.title
          })
        }
        return result.data
      }

      showNotification({
        type: 'error',
        title: '诊断失败',
        message: result.error || '无法完成打印共享诊断。'
      })
      return null
    } finally {
      setLoadingAction(null)
    }
  }, [printerName, printerTarget, showNotification])

  const openPrinterShareTarget = useCallback(
    async (actionId: PrinterShareGuidedActionId, diagnosisOverride?: PrinterShareDiagnosis | null) => {
      if (!window.electron?.troubleshooting) return

      const host = diagnosisOverride?.targetHost || printerDiagnosis?.targetHost || printerTarget.trim()
      const target =
        actionId === 'open-credential-manager'
          ? 'credential-manager'
          : actionId === 'open-printer-settings'
            ? 'printer-settings'
            : 'server-unc'

      setLoadingAction('open-printer-target')
      try {
        const result = await window.electron.troubleshooting.openPrinterShareTarget({ target, host })
        if (!result.success) {
          showNotification({
            type: 'error',
            title: '打开失败',
            message: result.error || '无法打开相关系统入口。'
          })
        }
      } finally {
        setLoadingAction(null)
      }
    },
    [printerDiagnosis?.targetHost, printerTarget, showNotification]
  )

  const repairPrinterShare = useCallback(
    async (actionId: PrinterShareRepairActionId, diagnosisOverride?: PrinterShareDiagnosis | null) => {
      if (
        actionId === 'open-credential-manager' ||
        actionId === 'open-printer-settings' ||
        actionId === 'open-server-unc'
      ) {
        await openPrinterShareTarget(actionId)
        return
      }

      if (!window.electron?.troubleshooting) {
        showNotification({
          type: 'warning',
          title: '接口未就绪',
          message: '疑难修复接口还没有加载，请重启 OneTool 后再试。'
        })
        return
      }

      if (
        (actionId === 'clear-server-connection' || actionId === 'clear-server-credential') &&
        !window.confirm('只会清理当前服务端的旧连接/旧凭据，适合处理同一服务端账号冲突。继续吗？')
      ) {
        return
      }

      if (
        actionId === 'clear-client-print-queue' &&
        !window.confirm('清空本机打印队列会取消当前待打印任务，并请求管理员权限。继续吗？')
      ) {
        return
      }

      if (
        actionId === 'apply-rpc-compatibility' &&
        !window.confirm('RPC 兼容修复会写入 Windows 打印相关注册表项并重启打印服务，仅建议连接旧服务端失败时使用。继续吗？')
      ) {
        return
      }

      setLoadingAction(actionId)
      setPrinterRepairResult(null)
      try {
        const result = await window.electron.troubleshooting.repairPrinterShare({
          actionId,
          targetHost: diagnosisOverride?.targetHost || printerDiagnosis?.targetHost
        })
        if (result.data) {
          setPrinterRepairResult(result.data)
        }

        if (result.success) {
          showNotification({
            type: 'success',
            title: '修复完成',
            message: result.data?.message || '打印共享修复动作已完成。'
          })
          await diagnosePrinterShare(false)
          return
        }

        showNotification({
          type: 'error',
          title: '修复失败',
          message: result.error || '打印共享修复动作没有完成。'
        })
      } finally {
        setLoadingAction(null)
      }
    },
    [diagnosePrinterShare, openPrinterShareTarget, printerDiagnosis?.targetHost, showNotification]
  )

  const savePrinterShareCredential = useCallback(async () => {
    if (!window.electron?.troubleshooting) {
      showNotification({
        type: 'warning',
        title: '接口未就绪',
        message: '疑难修复接口还没有加载，请重启 OneTool 后再试。'
      })
      return
    }

    const targetHost = printerDiagnosis?.targetHost
    if (!targetHost) {
      showNotification({
        type: 'warning',
        title: '请先开始修复',
        message: '先让 OneTool 识别服务端，再保存凭据。'
      })
      return
    }

    if (!credentialUsername.trim() || !credentialPassword) {
      showNotification({
        type: 'warning',
        title: '缺少账号密码',
        message: '请输入服务端账号和密码。'
      })
      return
    }

    setLoadingAction('save-server-credential')
    setPrinterCredentialResult(null)
    try {
      const result = await window.electron.troubleshooting.savePrinterShareCredential({
        targetHost,
        username: credentialUsername.trim(),
        password: credentialPassword,
        clearExisting: printerDiagnosis.hasCredentialConflict
      })

      setCredentialPassword('')
      if (result.data) setPrinterCredentialResult(result.data)

      if (result.success) {
        showNotification({
          type: result.data?.uncAccessible ? 'success' : 'warning',
          title: result.data?.uncAccessible ? '凭据已生效' : '凭据已保存',
          message: result.data?.message || '已写入 Windows 凭据。'
        })
        await diagnosePrinterShare(false)
        return
      }

      showNotification({
        type: 'error',
        title: '凭据保存失败',
        message: result.error || '没有完成凭据写入。'
      })
    } finally {
      setLoadingAction(null)
    }
  }, [credentialPassword, credentialUsername, diagnosePrinterShare, printerDiagnosis, showNotification])

  const runPrinterNextAction = useCallback(
    async (diagnosis: PrinterShareDiagnosis | null = printerDiagnosis) => {
      if (!diagnosis) {
        await diagnosePrinterShare()
        return
      }

      const actionId = diagnosis.nextAction.id
      if (actionId === 'save-server-credential') return
      if (actionId === 'server-checklist') {
        setShowAdvancedPrinterDiagnostics(true)
        return
      }
      if (actionId === 'none') return
      if (actionId === 'retry-diagnosis') {
        await diagnosePrinterShare()
        return
      }
      await repairPrinterShare(actionId as PrinterShareRepairActionId, diagnosis)
    },
    [diagnosePrinterShare, printerDiagnosis, repairPrinterShare]
  )

  const startPrinterGuidedRepair = useCallback(async () => {
    const diagnosis = await diagnosePrinterShare(false)
    if (!diagnosis) return

    if (diagnosis.nextAction.id === 'restart-client-spooler') {
      await repairPrinterShare('restart-client-spooler', diagnosis)
      return
    }

    showNotification({
      type: diagnosis.nextAction.kind === 'server' ? 'warning' : 'info',
      title: diagnosis.nextAction.label,
      message: diagnosis.nextAction.detail
    })
  }, [diagnosePrinterShare, repairPrinterShare, showNotification])

  const runPrinterActionById = useCallback(
    async (actionId: PrinterShareGuidedActionId) => {
      if (actionId === 'save-server-credential') {
        await savePrinterShareCredential()
        return
      }
      if (actionId === 'server-checklist') {
        setShowAdvancedPrinterDiagnostics(true)
        return
      }
      if (actionId === 'none') return
      if (actionId === 'retry-diagnosis') {
        await diagnosePrinterShare()
        return
      }
      await repairPrinterShare(actionId as PrinterShareRepairActionId)
    },
    [diagnosePrinterShare, repairPrinterShare, savePrinterShareCredential]
  )

  const canInstall = Boolean(status?.canInstall) && loadingAction !== 'install'
  const canOpen = Boolean(status?.gpeditInstalled) && loadingAction !== 'open'

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <Wrench className="text-red-500" size={32} />
          疑难修复
        </h2>
        <p className="text-muted-foreground font-bold flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-500" />
          把需要管理员权限或多步命令的 Windows 修复流程做成可检查、可确认的向导。
        </p>
      </div>

      <Card className="glass-card border-none overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'h-12 w-12 rounded-xl flex items-center justify-center shrink-0',
                  stateCopy.iconClassName
                )}
              >
                {cardState === 'installed' ? <CheckCircle2 size={24} /> : <TerminalSquare size={24} />}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl font-black">家庭版组策略助手</CardTitle>
                  <Badge variant="outline" className={cn('border', stateCopy.badgeClassName)}>
                    {stateCopy.label}
                  </Badge>
                </div>
                <CardDescription className="font-bold">
                  Windows 家庭版常见的 gpedit.msc 安装与修复流程。
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void scanGroupPolicy()}
                disabled={loadingAction !== null || !hasTroubleshootingApi}
                title="重新检测组策略状态"
              >
                <RefreshCw className={cn(loadingAction === 'scan' && 'animate-spin')} />
                重新检测
              </Button>
              <Button
                size="sm"
                onClick={() => void installGroupPolicy()}
                disabled={!canInstall || !hasTroubleshootingApi}
                title="请求管理员权限安装或修复组策略组件"
              >
                <Play className={cn(loadingAction === 'install' && 'animate-pulse')} />
                安装/修复
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openGroupPolicyEditor()}
                disabled={!canOpen || !hasTroubleshootingApi}
                title="打开 gpedit.msc"
              >
                <ExternalLink />
                打开 gpedit.msc
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-xl border border-white/20 dark:border-white/10 bg-white/45 dark:bg-zinc-950/30 p-4">
            <div className="flex items-start gap-3">
              <Info size={18} className="mt-0.5 text-indigo-500 shrink-0" />
              <div className="min-w-0 space-y-1">
                <h3 className="font-black text-sm">{stateCopy.title}</h3>
                <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  {status?.reason || stateCopy.detail}
                </p>
              </div>
            </div>
          </div>

          {lastError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-700 dark:text-red-300">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p className="text-xs font-bold leading-relaxed">{lastError}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {statusRows.map((row) => (
              <div
                key={row.label}
                className="rounded-xl border border-white/20 dark:border-white/10 bg-white/35 dark:bg-zinc-950/20 px-4 py-3 min-w-0"
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {row.label}
                </div>
                <div className="mt-1 text-sm font-black [overflow-wrap:anywhere]">{row.value}</div>
              </div>
            ))}
          </div>

          {status?.packageNames && status.packageNames.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TerminalSquare size={15} className="text-muted-foreground" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  已发现组件包
                </h3>
              </div>
              <div className="max-h-32 overflow-y-auto rounded-xl border border-white/20 dark:border-white/10 bg-zinc-950/5 dark:bg-zinc-950/40 p-3 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere]">
                {status.packageNames.map((packageName) => (
                  <div key={packageName}>{packageName}</div>
                ))}
              </div>
            </div>
          )}

          {installResult && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'border',
                    installResult.exitCode === 0
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  )}
                >
                  {getInstallSummary(installResult)}
                </Badge>
                {installResult.logPath && (
                  <span className="text-xs font-bold text-muted-foreground [overflow-wrap:anywhere]">
                    日志: {installResult.logPath}
                  </span>
                )}
              </div>
              {installResult.outputTail && (
                <pre className="max-h-48 overflow-auto rounded-xl border border-white/20 dark:border-white/10 bg-zinc-950 text-zinc-100 p-4 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {installResult.outputTail}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card border-none overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
                <Printer size={24} />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl font-black">打印共享修复</CardTitle>
                  <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                    自动向导
                  </Badge>
                </div>
                <CardDescription className="font-bold">
                  只填服务端地址，OneTool 按顺序处理本机服务、队列、凭据、共享链路和 Win11 兼容项。
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedPrinterDiagnostics((value) => !value)}
              disabled={!printerDiagnosis}
              title="显示当前链路和检查细节"
            >
              <ListChecks />
              高级诊断
              <ChevronDown className={cn('transition-transform', showAdvancedPrinterDiagnostics && 'rotate-180')} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.42fr)] gap-3">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                服务端 IP、主机名或共享路径
              </label>
              <Input
                value={printerTarget}
                onChange={(event) => setPrinterTarget(event.target.value)}
                placeholder={'例如 192.168.6.7 或 \\\\192.168.6.7\\HP'}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                共享打印机名
              </label>
              <Input
                value={printerName}
                onChange={(event) => setPrinterName(event.target.value)}
                placeholder="可选"
              />
            </div>
          </div>

          <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-black">
                  {printerDiagnosis ? printerDiagnosis.nextAction.label : '从客户机开始自动排查'}
                </h3>
                <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  {printerDiagnosis
                    ? printerDiagnosis.nextAction.detail
                    : '点击开始后，会先检测本机打印服务和队列，再判断服务端端口、共享入口、凭据和 RPC 兼容项。'}
                </p>
                {printerDiagnosis && (
                  <p className="text-xs font-mono text-muted-foreground [overflow-wrap:anywhere]">
                    {printerDiagnosis.printerPath || printerDiagnosis.uncRoot}
                  </p>
                )}
              </div>
              <Button
                size="lg"
                onClick={() => void (printerDiagnosis ? runPrinterNextAction() : startPrinterGuidedRepair())}
                disabled={loadingAction !== null || !hasTroubleshootingApi}
                title={printerDiagnosis?.nextAction.buttonLabel || '开始修复'}
              >
                <RefreshCw className={cn(loadingAction === 'printer-diagnose' && 'animate-spin')} />
                {printerDiagnosis ? printerDiagnosis.nextAction.buttonLabel : '开始修复'}
              </Button>
            </div>
          </div>

          {printerDiagnosis && (
            <div className="rounded-xl border border-white/20 dark:border-white/10 bg-white/45 dark:bg-zinc-950/30 p-4">
              <div className="flex items-start gap-3">
                <Info size={18} className="mt-0.5 text-sky-600 shrink-0" />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-sm">{printerDiagnosis.summary.title}</h3>
                    <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                      {printerDiagnosis.wizardStep}
                    </Badge>
                  </div>
                  <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                    {printerDiagnosis.summary.detail}
                  </p>
                </div>
              </div>
            </div>
          )}

          {printerDiagnosis?.wizardStep === 'need-credentials' && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-4">
              <div className="flex items-start gap-3">
                <KeyRound size={18} className="mt-0.5 text-amber-600 shrink-0" />
                <div className="space-y-1">
                  <h3 className="text-sm font-black">输入服务端账号密码</h3>
                  <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                    用户名通常写成“服务端电脑名\用户名”。密码只用于写入 Windows 凭据管理器，不会保存在 OneTool。
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    服务端用户名
                  </label>
                  <Input
                    value={credentialUsername}
                    onChange={(event) => setCredentialUsername(event.target.value)}
                    placeholder="例如 SERVER\\printuser"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    服务端密码
                  </label>
                  <Input
                    type="password"
                    value={credentialPassword}
                    onChange={(event) => setCredentialPassword(event.target.value)}
                    placeholder="不会在 OneTool 保存"
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <Button
                onClick={() => void savePrinterShareCredential()}
                disabled={loadingAction !== null || !hasTroubleshootingApi}
              >
                <KeyRound />
                保存凭据并继续
              </Button>
            </div>
          )}

          {printerDiagnosis?.wizardStep === 'credential-conflict' && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-black">先处理旧连接冲突</h3>
                  <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                    Windows 不喜欢同一台服务端同时挂多套账号。先清掉这台服务端的旧连接和旧凭据，再输入正确账号密码。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void repairPrinterShare('clear-server-connection')}
                    disabled={loadingAction !== null || !hasTroubleshootingApi}
                  >
                    <RefreshCw />
                    清除旧连接
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void repairPrinterShare('clear-server-credential')}
                    disabled={loadingAction !== null || !hasTroubleshootingApi}
                  >
                    <Trash2 />
                    清除旧凭据
                  </Button>
                </div>
              </div>
            </div>
          )}

          {printerDiagnosis?.nextAction.kind === 'server' && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <Server size={18} className="mt-0.5 text-amber-600 shrink-0" />
                <div className="space-y-1">
                  <h3 className="text-sm font-black">需要到服务端处理</h3>
                  <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                    客户机已经判断出链路被服务端或网络拦住。去服务端检查文件和打印机共享、防火墙入站规则、网络配置文件和 Print Spooler。
                  </p>
                </div>
              </div>
            </div>
          )}

          {printerDiagnosis?.recommendedActions.length ? (
            <div className="flex flex-wrap gap-2">
              {printerDiagnosis.recommendedActions.map((actionId) => {
                const action = printerActionCopy[actionId]
                const Icon = action.icon
                return (
                  <Button
                    key={actionId}
                    variant={actionId === printerDiagnosis.nextAction.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => void runPrinterActionById(actionId)}
                    disabled={loadingAction !== null || !hasTroubleshootingApi}
                    title={action.label}
                  >
                    <Icon />
                    {action.label}
                  </Button>
                )
              })}
            </div>
          ) : null}

          {showAdvancedPrinterDiagnostics && printerDiagnosis && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ListChecks size={15} className="text-muted-foreground" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  高级诊断
                </h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {printerDiagnosis.checks.map((check) => (
                  <div
                    key={check.id}
                    className="rounded-xl border border-white/20 dark:border-white/10 bg-white/35 dark:bg-zinc-950/20 p-4 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <h4 className="text-sm font-black">{check.title}</h4>
                        <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                          {check.detail}
                        </p>
                        {check.recommendation && (
                          <p className="text-xs font-bold text-sky-700 dark:text-sky-300 leading-relaxed">
                            {check.recommendation}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'border shrink-0',
                          check.status === 'ok' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                          check.status === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                          check.status === 'error' && 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
                          (check.status === 'info' || check.status === 'skipped') && 'border-zinc-300/60 bg-zinc-500/5 text-zinc-600 dark:text-zinc-300'
                        )}
                      >
                        {check.target}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              {(printerDiagnosis.activeServerConnections.length > 0 || printerDiagnosis.savedCredentialTargets.length > 0) && (
                <pre className="max-h-40 overflow-auto rounded-xl bg-zinc-950 text-zinc-100 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {[...printerDiagnosis.activeServerConnections, ...printerDiagnosis.savedCredentialTargets].join('\n')}
                </pre>
              )}
            </div>
          )}

          {(printerRepairResult || printerCredentialResult) && (
            <div className="rounded-xl border border-white/20 dark:border-white/10 bg-zinc-950/5 dark:bg-zinc-950/40 p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {printerRepairResult && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'border',
                      printerRepairResult.exitCode === 0
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    )}
                  >
                    {printerRepairResult.message}
                  </Badge>
                )}
                {printerCredentialResult && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'border',
                      printerCredentialResult.uncAccessible
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    )}
                  >
                    {printerCredentialResult.message}
                  </Badge>
                )}
              </div>
              {printerRepairResult?.outputTail && (
                <pre className="max-h-40 overflow-auto rounded-xl bg-zinc-950 text-zinc-100 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {printerRepairResult.outputTail}
                </pre>
              )}
              {printerCredentialResult?.outputTail && (
                <pre className="max-h-40 overflow-auto rounded-xl bg-zinc-950 text-zinc-100 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {printerCredentialResult.outputTail}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
