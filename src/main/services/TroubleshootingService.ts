import { spawn } from 'child_process'
import { execPowerShellEncoded } from '../utils/processUtils'
import { logger } from '../utils/logger'
import type { IpcResponse } from '../../shared/types'
import type {
  GroupPolicyInstallResult,
  GroupPolicyStatus,
  PrinterShareCheck,
  PrinterShareCredentialRequest,
  PrinterShareCredentialResult,
  PrinterShareDiagnosis,
  PrinterShareDiagnosisRequest,
  PrinterShareGuidedAction,
  PrinterShareGuidedActionId,
  PrinterShareOpenRequest,
  PrinterShareRepairActionId,
  PrinterShareRepairRequest,
  PrinterShareRepairResult
} from '../../shared/troubleshooting'

const GROUP_POLICY_STATUS_JSON_START = '---GROUP_POLICY_STATUS_JSON_START---'
const GROUP_POLICY_STATUS_JSON_END = '---GROUP_POLICY_STATUS_JSON_END---'
const GROUP_POLICY_INSTALL_JSON_START = '---GROUP_POLICY_INSTALL_JSON_START---'
const GROUP_POLICY_INSTALL_JSON_END = '---GROUP_POLICY_INSTALL_JSON_END---'
const PRINTER_SHARE_DIAGNOSIS_JSON_START = '---PRINTER_SHARE_DIAGNOSIS_JSON_START---'
const PRINTER_SHARE_DIAGNOSIS_JSON_END = '---PRINTER_SHARE_DIAGNOSIS_JSON_END---'
const PRINTER_SHARE_REPAIR_JSON_START = '---PRINTER_SHARE_REPAIR_JSON_START---'
const PRINTER_SHARE_REPAIR_JSON_END = '---PRINTER_SHARE_REPAIR_JSON_END---'
const PRINTER_SHARE_CREDENTIAL_JSON_START = '---PRINTER_SHARE_CREDENTIAL_JSON_START---'
const PRINTER_SHARE_CREDENTIAL_JSON_END = '---PRINTER_SHARE_CREDENTIAL_JSON_END---'

type TroubleshootingRuntime = {
  platform: NodeJS.Platform
}

type RawGroupPolicyStatus = {
  caption?: string
  editionId?: string
  productName?: string
  gpeditExists?: boolean
  clientExtensionPackages?: string[]
  clientToolsPackages?: string[]
}

type RawGroupPolicyInstall = {
  started?: boolean
  exitCode?: number | null
  logPath?: string
  outputTail?: string
  error?: string
}

type NormalizedPrinterShareTarget = {
  targetHost: string
  printerName: string
  uncRoot: string
  printerPath: string | null
}

type RawPrinterShareDiagnosis = Partial<NormalizedPrinterShareTarget> & {
  spoolerStatus?: string
  queueFileCount?: number
  pingReachable?: boolean
  smbPortOpen?: boolean
  rpcPortOpen?: boolean
  uncAccessible?: boolean
  existingConnections?: string[]
  savedCredentialTargets?: string[]
  activeServerConnections?: string[]
  rpcUseNamedPipeProtocol?: number | null
  rpcAuthnLevelPrivacyEnabled?: number | null
  smb1ClientState?: string
}

type RawPrinterShareRepair = {
  actionId?: PrinterShareRepairActionId
  started?: boolean
  exitCode?: number | null
  message?: string
  logPath?: string
  outputTail?: string
  error?: string
}

type RawPrinterShareCredential = {
  targetHost?: string
  username?: string
  saved?: boolean
  uncAccessible?: boolean
  message?: string
  outputTail?: string
  error?: string
}

function parseMarkedJson<T>(raw: string, startMarker: string, endMarker: string): T | null {
  const match = raw.match(new RegExp(`${startMarker}(.*?)${endMarker}`, 's'))
  if (!match?.[1]) return null

  try {
    return JSON.parse(match[1].trim()) as T
  } catch (error) {
    logger.warn('[TroubleshootingService] Failed to parse marked JSON', error)
    return null
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
}

function isHomeEdition(caption: string, editionId: string, productName: string): boolean {
  const label = `${caption} ${editionId} ${productName}`.toLowerCase()
  return /\bhome\b|家庭|core/.test(label)
}

export function normalizeGroupPolicyStatus(
  raw: RawGroupPolicyStatus,
  runtime: TroubleshootingRuntime
): GroupPolicyStatus {
  if (runtime.platform !== 'win32') {
    return {
      available: false,
      reason: '仅支持 Windows',
      caption: '',
      editionId: '',
      productName: '',
      isHomeEdition: false,
      gpeditInstalled: false,
      packageCount: 0,
      clientExtensionPackageCount: 0,
      clientToolsPackageCount: 0,
      packageNames: [],
      canInstall: false
    }
  }

  const caption = raw.caption?.trim() ?? ''
  const editionId = raw.editionId?.trim() ?? ''
  const productName = raw.productName?.trim() ?? ''
  const clientExtensionPackages = uniqueStrings(raw.clientExtensionPackages ?? [])
  const clientToolsPackages = uniqueStrings(raw.clientToolsPackages ?? [])
  const packageNames = [...clientExtensionPackages, ...clientToolsPackages]
  const gpeditInstalled = Boolean(raw.gpeditExists)
  const homeEdition = isHomeEdition(caption, editionId, productName)
  const hasPackages = packageNames.length > 0
  const canInstall = !gpeditInstalled && hasPackages
  const reason = gpeditInstalled
    ? '组策略编辑器已经可用'
    : hasPackages
      ? homeEdition
        ? '检测到家庭版系统和本机组策略组件包，可以尝试安装'
        : '检测到本机组策略组件包，可以尝试修复'
      : '未在本机 servicing Packages 目录找到组策略组件包'

  return {
    available: true,
    reason,
    caption,
    editionId,
    productName,
    isHomeEdition: homeEdition,
    gpeditInstalled,
    packageCount: packageNames.length,
    clientExtensionPackageCount: clientExtensionPackages.length,
    clientToolsPackageCount: clientToolsPackages.length,
    packageNames,
    canInstall
  }
}

function normalizePrinterShareTarget(input: PrinterShareDiagnosisRequest): NormalizedPrinterShareTarget {
  const rawTarget = (input.target ?? '').trim()
  const explicitPrinterName = input.printerName?.trim() ?? ''
  if (!rawTarget) {
    throw new Error('请输入打印共享地址或服务端 IP')
  }

  const withoutScheme = rawTarget.replace(/^file:\/\//i, '').replace(/\//g, '\\')
  const parts = withoutScheme.replace(/^\\+/, '').split('\\').filter(Boolean)
  const targetHost = (parts[0] ?? '').trim()
  const printerName = (explicitPrinterName || parts.slice(1).join('\\')).trim()

  if (!targetHost || /[\s`"';&|<>^]/.test(targetHost)) {
    throw new Error('打印共享地址不正确，请输入服务端 IP、主机名或 \\\\主机\\打印机')
  }

  if (printerName && /[`"<>^|]/.test(printerName)) {
    throw new Error('打印机共享名包含不支持的字符')
  }

  const uncRoot = `\\\\${targetHost}`
  const printerPath = printerName ? `${uncRoot}\\${printerName}` : null
  return { targetHost, printerName, uncRoot, printerPath }
}

function addUniqueAction(actions: PrinterShareGuidedActionId[], action: PrinterShareGuidedActionId) {
  if (!actions.includes(action)) actions.push(action)
}

function createPrinterCheck(
  id: string,
  title: string,
  status: PrinterShareCheck['status'],
  target: PrinterShareCheck['target'],
  detail: string,
  recommendation?: string
): PrinterShareCheck {
  return { id, title, status, target, detail, recommendation }
}

function createGuidedAction(
  id: PrinterShareGuidedActionId,
  kind: PrinterShareGuidedAction['kind'],
  label: string,
  buttonLabel: string,
  detail: string,
  requiresConfirmation = false
): PrinterShareGuidedAction {
  return { id, kind, label, buttonLabel, detail, requiresConfirmation }
}

export function normalizePrinterShareDiagnosis(
  raw: RawPrinterShareDiagnosis,
  runtime: TroubleshootingRuntime
): PrinterShareDiagnosis {
  if (runtime.platform !== 'win32') {
    return {
      available: false,
      reason: '仅支持 Windows',
      targetHost: raw.targetHost ?? '',
      printerName: raw.printerName ?? '',
      uncRoot: raw.uncRoot ?? '',
      printerPath: raw.printerPath ?? null,
      checks: [],
      summary: {
        owner: 'unknown',
        title: '当前环境不支持',
        detail: '打印共享修复只支持 Windows 客户机。'
      },
      recommendedActions: [],
      wizardStep: 'unsupported',
      nextAction: createGuidedAction(
        'none',
        'done',
        '当前环境不支持',
        '无需操作',
        '打印共享修复只支持 Windows 客户机。'
      ),
      advancedChecksVisibleByDefault: false,
      credentialState: 'unknown',
      hasCredentialConflict: false,
      queueFileCount: 0,
      existingConnections: [],
      savedCredentialTargets: [],
      activeServerConnections: []
    }
  }

  const targetHost = raw.targetHost?.trim() ?? ''
  const printerName = raw.printerName?.trim() ?? ''
  const uncRoot = raw.uncRoot?.trim() || (targetHost ? `\\\\${targetHost}` : '')
  const printerPath = raw.printerPath?.trim() || (printerName && uncRoot ? `${uncRoot}\\${printerName}` : null)
  const spoolerStatus = raw.spoolerStatus?.trim() || 'Unknown'
  const queueFileCount = Number(raw.queueFileCount ?? 0)
  const existingConnections = uniqueStrings(raw.existingConnections ?? [])
  const savedCredentialTargets = uniqueStrings(raw.savedCredentialTargets ?? [])
  const activeServerConnections = uniqueStrings(raw.activeServerConnections ?? [])
  const recommendedActions: PrinterShareGuidedActionId[] = []
  const checks: PrinterShareCheck[] = []

  const spoolerRunning = /^running$/i.test(spoolerStatus)
  checks.push(
    createPrinterCheck(
      'client-spooler',
      '本机打印服务',
      spoolerRunning ? 'ok' : 'error',
      'client',
      spoolerRunning ? 'Print Spooler 正在运行。' : `Print Spooler 当前状态为 ${spoolerStatus}。`,
      spoolerRunning ? undefined : '先重启本机打印服务。'
    )
  )
  if (!spoolerRunning) addUniqueAction(recommendedActions, 'restart-client-spooler')

  checks.push(
    createPrinterCheck(
      'client-queue',
      '本机打印队列',
      queueFileCount > 0 ? 'warning' : 'ok',
      'client',
      queueFileCount > 0 ? `本机队列目录还有 ${queueFileCount} 个任务文件。` : '本机队列目录没有明显堆积。',
      queueFileCount > 0 ? '如果任务卡死，可以清空本机队列并重启服务。' : undefined
    )
  )
  if (queueFileCount > 0) addUniqueAction(recommendedActions, 'clear-client-print-queue')

  const pingReachable = Boolean(raw.pingReachable)
  checks.push(
    createPrinterCheck(
      'target-ping',
      '主机基础连通',
      pingReachable ? 'ok' : 'warning',
      'network',
      pingReachable ? `客户机能收到 ${targetHost} 的基础连通响应。` : `客户机没有收到 ${targetHost} 的 ping 响应。`,
      pingReachable ? undefined : '如果服务端禁 ping，这一项可能误报；继续看 SMB/RPC 端口结果。'
    )
  )

  const smbPortOpen = Boolean(raw.smbPortOpen)
  checks.push(
    createPrinterCheck(
      'server-smb-port',
      '服务端 SMB 445',
      smbPortOpen ? 'ok' : 'error',
      'server',
      smbPortOpen ? '445 端口可达，文件共享基础通道存在。' : '445 端口不可达，服务端文件共享、防火墙或网络隔离可能有问题。',
      smbPortOpen ? undefined : '到服务端检查文件和打印机共享、防火墙入站规则和网络配置文件。'
    )
  )

  const rpcPortOpen = Boolean(raw.rpcPortOpen)
  checks.push(
    createPrinterCheck(
      'server-rpc-port',
      '服务端 RPC 135',
      rpcPortOpen ? 'ok' : 'error',
      'server',
      rpcPortOpen ? '135 端口可达，RPC 基础通道存在。' : '135 端口不可达，服务端 RPC、防火墙或网络隔离可能有问题。',
      rpcPortOpen ? undefined : '到服务端检查 RPC 相关服务和防火墙入站规则。'
    )
  )

  const uncAccessible = Boolean(raw.uncAccessible)
  checks.push(
    createPrinterCheck(
      'server-unc',
      '服务端共享入口',
      uncAccessible ? 'ok' : 'warning',
      'credential',
      uncAccessible ? `${uncRoot} 可以从客户机访问。` : `${uncRoot} 暂时无法直接打开。`,
      uncAccessible ? undefined : '如果端口可达但共享打不开，优先检查 Windows 凭据、共享权限和服务端共享设置。'
    )
  )
  if (!uncAccessible) {
    addUniqueAction(recommendedActions, 'open-server-unc')
  }

  checks.push(
    createPrinterCheck(
      'existing-connections',
      '已有网络打印机连接',
      existingConnections.length > 0 ? 'info' : 'skipped',
      'client',
      existingConnections.length > 0
        ? `本机已有 ${existingConnections.length} 个指向该服务端的打印机连接。`
        : '没有发现指向该服务端的旧打印机连接。'
    )
  )

  const hasCredentialConflict =
    !uncAccessible && smbPortOpen && (savedCredentialTargets.length > 0 || activeServerConnections.length > 0)
  const credentialState = hasCredentialConflict
    ? 'conflict'
    : savedCredentialTargets.length > 0
      ? 'saved'
      : uncAccessible
        ? 'unknown'
        : 'missing'

  checks.push(
    createPrinterCheck(
      'credential-cache',
      'Windows 凭据和旧连接',
      hasCredentialConflict ? 'warning' : savedCredentialTargets.length > 0 ? 'info' : 'skipped',
      'credential',
      hasCredentialConflict
        ? `发现 ${savedCredentialTargets.length} 条已保存凭据、${activeServerConnections.length} 条当前连接，可能和新账号冲突。`
        : savedCredentialTargets.length > 0
          ? `发现 ${savedCredentialTargets.length} 条指向该服务端的 Windows 凭据。`
          : '没有发现指向该服务端的已保存 Windows 凭据。',
      hasCredentialConflict
        ? '先清除该服务端旧连接和旧凭据，再输入正确账号密码。'
        : !uncAccessible && smbPortOpen
          ? '下一步输入服务端账号密码，让 OneTool 写入 Windows 凭据。'
          : undefined
    )
  )

  if (hasCredentialConflict) {
    addUniqueAction(recommendedActions, 'clear-server-connection')
    addUniqueAction(recommendedActions, 'clear-server-credential')
  } else if (!uncAccessible && smbPortOpen && rpcPortOpen) {
    addUniqueAction(recommendedActions, 'save-server-credential')
  }

  const rpcNamedPipeReady = raw.rpcUseNamedPipeProtocol === 1
  const rpcPrivacyCompat = raw.rpcAuthnLevelPrivacyEnabled === 0
  const rpcCompatReady = rpcNamedPipeReady && rpcPrivacyCompat
  checks.push(
    createPrinterCheck(
      'rpc-compatibility',
      'Win11 打印 RPC 兼容项',
      rpcCompatReady ? 'ok' : 'warning',
      'protocol',
      rpcCompatReady
        ? '已配置 RPC over Named Pipes 和旧服务端身份验证兼容项。'
        : '未完整配置 Win11 连接旧共享打印服务端常用的 RPC 兼容项。',
      rpcCompatReady ? undefined : '如果能看到共享但添加失败，可尝试应用 RPC 兼容修复。'
    )
  )
  if (spoolerRunning && smbPortOpen && rpcPortOpen && uncAccessible && !rpcCompatReady) {
    addUniqueAction(recommendedActions, 'apply-rpc-compatibility')
    addUniqueAction(recommendedActions, 'open-credential-manager')
  }

  const smb1ClientState = raw.smb1ClientState?.trim() || 'Unknown'
  checks.push(
    createPrinterCheck(
      'smb1-client',
      'SMB 1.0 客户端',
      /^enabled$/i.test(smb1ClientState) ? 'warning' : smb1ClientState === 'Unknown' ? 'skipped' : 'info',
      'protocol',
      smb1ClientState === 'Unknown'
        ? '未能读取 SMB 1.0 客户端状态。'
        : `SMB 1.0 客户端状态为 ${smb1ClientState}。`,
      /^enabled$/i.test(smb1ClientState)
        ? 'SMB 1.0 安全风险较高，只建议用于旧设备兜底。'
        : '旧主机/旧打印设备才考虑 SMB 1.0，默认不建议开启。'
    )
  )

  let summary: PrinterShareDiagnosis['summary']
  let wizardStep: PrinterShareDiagnosis['wizardStep']
  let nextAction: PrinterShareGuidedAction
  let advancedChecksVisibleByDefault = false
  if (!spoolerRunning || queueFileCount > 0) {
    summary = {
      owner: 'client',
      title: '更像是客户端本机打印问题',
      detail: '本机打印服务或队列已经异常，先在客户机完成低风险修复。'
    }
    if (!spoolerRunning) {
      wizardStep = 'fix-client-service'
      nextAction = createGuidedAction(
        'restart-client-spooler',
        'repair',
        '先修复本机打印服务',
        '自动重启打印服务',
        'OneTool 会请求管理员权限并重启 Print Spooler。'
      )
    } else {
      wizardStep = 'clear-client-queue'
      nextAction = createGuidedAction(
        'clear-client-print-queue',
        'repair',
        '先清空卡死队列',
        '清空队列并继续',
        '这会取消本机当前待打印任务，并重启打印服务。',
        true
      )
    }
  } else if (!pingReachable && !smbPortOpen && !rpcPortOpen) {
    summary = {
      owner: 'network',
      title: '更像是网络连通或地址问题',
      detail: '客户机无法确认服务端在线，先检查 IP、网段、网络发现和防火墙。'
    }
    addUniqueAction(recommendedActions, 'open-server-unc')
    wizardStep = 'network-blocked'
    nextAction = createGuidedAction(
      'server-checklist',
      'server',
      '客户机到服务端不通',
      '查看服务端检查项',
      '先确认服务端 IP、两台电脑所在网络、网络发现和防火墙。'
    )
    advancedChecksVisibleByDefault = true
  } else if (!smbPortOpen || !rpcPortOpen) {
    summary = {
      owner: 'server',
      title: '更像是服务端共享或防火墙问题',
      detail: '客户机能定位到服务端，但 445 或 135 端口不可达，服务端文件共享、防火墙或 RPC 配置需要检查。'
    }
    addUniqueAction(recommendedActions, 'open-server-unc')
    wizardStep = 'server-blocked'
    nextAction = createGuidedAction(
      'server-checklist',
      'server',
      '服务端共享通道被拦住',
      '查看服务端检查项',
      '客户机不能直接修服务端，需要到服务端检查共享、防火墙和 Print Spooler。'
    )
    advancedChecksVisibleByDefault = true
  } else if (!uncAccessible) {
    summary = {
      owner: 'credential',
      title: hasCredentialConflict ? '发现旧连接或旧凭据冲突' : '需要输入服务端账号密码',
      detail: hasCredentialConflict
        ? '服务端端口可达，但客户机已有旧连接或旧凭据，Windows 可能拒绝用新账号连接。'
        : '服务端端口可达，但共享入口打不开，下一步先写入正确的 Windows 凭据。'
    }
    wizardStep = hasCredentialConflict ? 'credential-conflict' : 'need-credentials'
    nextAction = hasCredentialConflict
      ? createGuidedAction(
          'clear-server-connection',
          'repair',
          '先清除旧连接',
          '清除旧连接',
          '只清除当前服务端的旧网络连接，随后再输入正确账号密码。',
          true
        )
      : createGuidedAction(
          'save-server-credential',
          'credential',
          '输入服务端账号密码',
          '保存凭据并测试',
          '凭据写入 Windows 凭据管理器，OneTool 不保存密码。'
        )
  } else if (!rpcCompatReady) {
    summary = {
      owner: 'protocol',
      title: '更像是 Win11 打印兼容或凭据问题',
      detail: '网络和共享入口可达，添加打印机失败时通常进入凭据、Point and Print 或 RPC 兼容层。'
    }
    wizardStep = 'rpc-compatibility'
    nextAction = createGuidedAction(
      'apply-rpc-compatibility',
      'repair',
      '共享已通，继续修复打印兼容',
      '应用 RPC 兼容修复',
      '会写入 Windows 打印 RPC 兼容项并重启打印服务。',
      true
    )
  } else {
    summary = {
      owner: 'unknown',
      title: '基础连接看起来正常',
      detail: '客户机基础检测没有发现明显阻断点，如果仍无法添加打印机，建议核对共享名、驱动和服务端权限。'
    }
    addUniqueAction(recommendedActions, 'open-printer-settings')
    wizardStep = 'ready'
    nextAction = createGuidedAction(
      'open-printer-settings',
      'open',
      '基础链路已打通',
      '打开打印机设置',
      '现在可以回到 Windows 打印机设置里重新添加共享打印机。'
    )
  }

  return {
    available: true,
    reason: null,
    targetHost,
    printerName,
    uncRoot,
    printerPath,
    checks,
    summary,
    recommendedActions,
    wizardStep,
    nextAction,
    advancedChecksVisibleByDefault,
    credentialState,
    hasCredentialConflict,
    queueFileCount,
    existingConnections,
    savedCredentialTargets,
    activeServerConnections
  }
}

function createGroupPolicyStatusScript(): string {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$currentVersion = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
$os = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1
$packageRoot = 'C:\\Windows\\servicing\\Packages'
$clientExtensionPackages = @()
$clientToolsPackages = @()
if (Test-Path -LiteralPath $packageRoot) {
  $clientExtensionPackages = @(Get-ChildItem -LiteralPath $packageRoot -Filter 'Microsoft-Windows-GroupPolicy-ClientExtensions-Package~3*.mum' -File | Select-Object -ExpandProperty Name)
  $clientToolsPackages = @(Get-ChildItem -LiteralPath $packageRoot -Filter 'Microsoft-Windows-GroupPolicy-ClientTools-Package~3*.mum' -File | Select-Object -ExpandProperty Name)
}
$gpeditExists = (Test-Path -LiteralPath "$env:WINDIR\\System32\\gpedit.msc") -or (Test-Path -LiteralPath "$env:WINDIR\\SysWOW64\\gpedit.msc")
$payload = @{
  caption = $os.Caption
  editionId = $currentVersion.EditionID
  productName = $currentVersion.ProductName
  gpeditExists = $gpeditExists
  clientExtensionPackages = $clientExtensionPackages
  clientToolsPackages = $clientToolsPackages
}
Write-Output '${GROUP_POLICY_STATUS_JSON_START}'
$payload | ConvertTo-Json -Compress
Write-Output '${GROUP_POLICY_STATUS_JSON_END}'
`
}

function createGroupPolicyInstallScript(): string {
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$workDir = Join-Path $env:TEMP 'onetool-troubleshooting'
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
$scriptPath = Join-Path $workDir 'install-group-policy.ps1'
$logPath = Join-Path $workDir ('group-policy-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$installer = @'
param([string]$LogPath)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
function Write-OneToolLog([string]$Message) {
  $Message | Out-File -FilePath $LogPath -Append -Encoding utf8
}
Write-OneToolLog '[OneTool] Starting Group Policy local package installation.'
$packageRoot = 'C:\\Windows\\servicing\\Packages'
$clientExtensionPackages = @(Get-ChildItem -LiteralPath $packageRoot -Filter 'Microsoft-Windows-GroupPolicy-ClientExtensions-Package~3*.mum' -File -ErrorAction SilentlyContinue)
$clientToolsPackages = @(Get-ChildItem -LiteralPath $packageRoot -Filter 'Microsoft-Windows-GroupPolicy-ClientTools-Package~3*.mum' -File -ErrorAction SilentlyContinue)
$packages = @($clientExtensionPackages + $clientToolsPackages)
Write-OneToolLog ("[OneTool] Package count: " + $packages.Count)
if ($packages.Count -eq 0) {
  Write-OneToolLog '[OneTool] No local Group Policy packages found.'
  exit 2
}
$exitCode = 0
foreach ($package in $packages) {
  Write-OneToolLog ("[OneTool] Adding package: " + $package.Name)
  & dism.exe /online /norestart /add-package:$($package.FullName) *>&1 | ForEach-Object { Write-OneToolLog ([string]$_) }
  if ($LASTEXITCODE -ne 0) {
    $exitCode = $LASTEXITCODE
    Write-OneToolLog ("[OneTool] DISM returned exit code: " + $LASTEXITCODE)
  }
}
Write-OneToolLog ("[OneTool] Completed with exit code: " + $exitCode)
exit $exitCode
'@
Set-Content -LiteralPath $scriptPath -Value $installer -Encoding UTF8
$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath, '-LogPath', $logPath)
try {
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  $outputTail = ''
  if (Test-Path -LiteralPath $logPath) {
    $outputTail = (Get-Content -LiteralPath $logPath -Tail 80 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
  }
  $payload = @{
    started = $true
    exitCode = $process.ExitCode
    logPath = $logPath
    outputTail = $outputTail
  }
} catch {
  $payload = @{
    started = $false
    exitCode = $null
    logPath = $logPath
    outputTail = ''
    error = $_.Exception.Message
  }
}
Write-Output '${GROUP_POLICY_INSTALL_JSON_START}'
$payload | ConvertTo-Json -Compress
Write-Output '${GROUP_POLICY_INSTALL_JSON_END}'
`
}

function createPrinterShareDiagnosisScript(target: NormalizedPrinterShareTarget): string {
  const requestBase64 = Buffer.from(JSON.stringify(target), 'utf8').toString('base64')
  return `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$requestJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${requestBase64}'))
$request = $requestJson | ConvertFrom-Json
$targetHost = [string]$request.targetHost
$printerName = [string]$request.printerName
$uncRoot = '\\\\' + $targetHost
$printerPath = if ($printerName) { $uncRoot + '\\' + $printerName } else { $null }

function Test-OneToolPort([string]$HostName, [int]$Port) {
  try {
    return [bool](Test-NetConnection -ComputerName $HostName -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)
  } catch {
    return $false
  }
}

$spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
$spoolPath = Join-Path $env:WINDIR 'System32\\spool\\PRINTERS'
$queueFileCount = 0
if (Test-Path -LiteralPath $spoolPath) {
  $queueFileCount = @(Get-ChildItem -LiteralPath $spoolPath -Force -ErrorAction SilentlyContinue).Count
}
$targetPrefix = '\\\\' + $targetHost + '\\'
$existingConnections = @()
try {
  $existingConnections = @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ($targetPrefix + '*') } | Select-Object -ExpandProperty Name)
} catch {
  $existingConnections = @()
}
$savedCredentialTargets = @()
try {
  $savedCredentialTargets = @(cmdkey.exe /list 2>$null | Where-Object { ([string]$_) -match [regex]::Escape($targetHost) } | ForEach-Object { ([string]$_).Trim() })
} catch {
  $savedCredentialTargets = @()
}
$activeServerConnections = @()
try {
  $serverPattern = '\\\\' + [regex]::Escape($targetHost) + '(\\|\\s|$)'
  $activeServerConnections = @(net.exe use 2>$null | Where-Object { ([string]$_) -match $serverPattern } | ForEach-Object { ([string]$_).Trim() })
} catch {
  $activeServerConnections = @()
}
$rpcPolicyPath = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC'
$printControlPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print'
$rpcUseNamedPipeProtocol = $null
$rpcAuthnLevelPrivacyEnabled = $null
try { $rpcUseNamedPipeProtocol = (Get-ItemProperty -Path $rpcPolicyPath -Name RpcUseNamedPipeProtocol -ErrorAction SilentlyContinue).RpcUseNamedPipeProtocol } catch {}
try { $rpcAuthnLevelPrivacyEnabled = (Get-ItemProperty -Path $printControlPath -Name RpcAuthnLevelPrivacyEnabled -ErrorAction SilentlyContinue).RpcAuthnLevelPrivacyEnabled } catch {}
$smb1ClientState = 'Unknown'
try {
  $smb1 = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol-Client -ErrorAction SilentlyContinue
  if ($smb1) { $smb1ClientState = [string]$smb1.State }
} catch {}
$payload = @{
  targetHost = $targetHost
  printerName = $printerName
  uncRoot = $uncRoot
  printerPath = $printerPath
  spoolerStatus = if ($spooler) { [string]$spooler.Status } else { 'Missing' }
  queueFileCount = $queueFileCount
  pingReachable = [bool](Test-Connection -ComputerName $targetHost -Count 1 -Quiet -ErrorAction SilentlyContinue)
  smbPortOpen = Test-OneToolPort $targetHost 445
  rpcPortOpen = Test-OneToolPort $targetHost 135
  uncAccessible = [bool](Test-Path -LiteralPath $uncRoot -ErrorAction SilentlyContinue)
  existingConnections = $existingConnections
  savedCredentialTargets = $savedCredentialTargets
  activeServerConnections = $activeServerConnections
  rpcUseNamedPipeProtocol = $rpcUseNamedPipeProtocol
  rpcAuthnLevelPrivacyEnabled = $rpcAuthnLevelPrivacyEnabled
  smb1ClientState = $smb1ClientState
}
Write-Output '${PRINTER_SHARE_DIAGNOSIS_JSON_START}'
$payload | ConvertTo-Json -Compress
Write-Output '${PRINTER_SHARE_DIAGNOSIS_JSON_END}'
`
}

function createPrinterShareRepairScript(
  actionId: PrinterShareRepairActionId,
  target?: NormalizedPrinterShareTarget
): string {
  const targetBase64 = Buffer.from(JSON.stringify(target ?? {}), 'utf8').toString('base64')
  const targetHostHint = (target?.targetHost ?? '').replace(/'/g, "''")
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$workDir = Join-Path $env:TEMP 'onetool-troubleshooting'
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
$scriptPath = Join-Path $workDir 'repair-printer-share.ps1'
$logPath = Join-Path $workDir ('printer-share-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$actionId = '${actionId}'
$targetHostHint = '${targetHostHint}'
$targetJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${targetBase64}'))
$targetRequest = if ($targetJson.Trim()) { $targetJson | ConvertFrom-Json } else { $null }
$targetHost = if ($targetRequest -and $targetRequest.targetHost) { [string]$targetRequest.targetHost } else { $targetHostHint }
if ($ActionId -eq 'clear-server-connection' -or $ActionId -eq 'clear-server-credential') {
  $messages = @()
  $exitCode = 0
  try {
    if (-not $targetHost) { throw '缺少服务端地址' }
    if ($ActionId -eq 'clear-server-connection') {
      $uncWildcard = '\\\\' + $targetHost + '\\*'
      $messages += (& net.exe use $uncWildcard /delete /y 2>&1 | ForEach-Object { [string]$_ })
      $messages += '已请求清除该服务端旧网络连接。'
    }
    if ($ActionId -eq 'clear-server-credential') {
      $targets = @(
        $targetHost,
        ('Domain:target=' + $targetHost),
        ('LegacyGeneric:target=' + $targetHost),
        ('\\\\' + $targetHost)
      )
      foreach ($variant in $targets) {
        $messages += (& cmdkey.exe /delete:$variant 2>&1 | ForEach-Object { [string]$_ })
      }
      $messages += '已请求清除该服务端旧 Windows 凭据。'
    }
  } catch {
    $exitCode = 1
    $messages += $_.Exception.Message
  }
  $payload = @{
    actionId = $actionId
    started = $true
    exitCode = $exitCode
    message = if ($exitCode -eq 0) { '修复动作已完成' } else { '修复动作未完成' }
    logPath = ''
    outputTail = (($messages | Where-Object { $_ }) -join [Environment]::NewLine)
  }
  Write-Output '${PRINTER_SHARE_REPAIR_JSON_START}'
  $payload | ConvertTo-Json -Compress
  Write-Output '${PRINTER_SHARE_REPAIR_JSON_END}'
  return
}
$repairScript = @'
param([string]$ActionId, [string]$LogPath)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Write-OneToolLog([string]$Message) {
  $Message | Out-File -FilePath $LogPath -Append -Encoding utf8
}
Write-OneToolLog ("[OneTool] Printer share repair action: " + $ActionId)
if ($ActionId -eq 'restart-client-spooler') {
  Restart-Service -Name Spooler -Force
  Write-OneToolLog '[OneTool] Print Spooler restarted.'
  exit 0
}
if ($ActionId -eq 'clear-client-print-queue') {
  Stop-Service -Name Spooler -Force
  $spoolPath = Join-Path $env:WINDIR 'System32\\spool\\PRINTERS'
  $backupPath = Join-Path (Split-Path -Parent $LogPath) ('print-queue-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
  if (Test-Path -LiteralPath $spoolPath) {
    Get-ChildItem -LiteralPath $spoolPath -Force -ErrorAction SilentlyContinue | Move-Item -Destination $backupPath -Force -ErrorAction SilentlyContinue
    Write-OneToolLog ("[OneTool] Queue files moved to: " + $backupPath)
  }
  Start-Service -Name Spooler
  Write-OneToolLog '[OneTool] Print queue cleared and Spooler restarted.'
  exit 0
}
if ($ActionId -eq 'apply-rpc-compatibility') {
  $rpcPolicyPath = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Printers\\RPC'
  $printControlPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print'
  New-Item -Path $rpcPolicyPath -Force | Out-Null
  New-ItemProperty -Path $rpcPolicyPath -Name RpcUseNamedPipeProtocol -PropertyType DWord -Value 1 -Force | Out-Null
  New-ItemProperty -Path $printControlPath -Name RpcAuthnLevelPrivacyEnabled -PropertyType DWord -Value 0 -Force | Out-Null
  Restart-Service -Name Spooler -Force
  Write-OneToolLog '[OneTool] RPC compatibility registry values applied and Spooler restarted.'
  exit 0
}
Write-OneToolLog ("[OneTool] Unsupported action: " + $ActionId)
exit 3
'@
Set-Content -LiteralPath $scriptPath -Value $repairScript -Encoding UTF8
$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath, '-ActionId', $actionId, '-LogPath', $logPath)
try {
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  $outputTail = ''
  if (Test-Path -LiteralPath $logPath) {
    $outputTail = (Get-Content -LiteralPath $logPath -Tail 80 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
  }
  $payload = @{
    actionId = $actionId
    started = $true
    exitCode = $process.ExitCode
    message = if ($process.ExitCode -eq 0) { '修复动作已完成' } else { '修复动作未完成' }
    logPath = $logPath
    outputTail = $outputTail
  }
} catch {
  $payload = @{
    actionId = $actionId
    started = $false
    exitCode = $null
    message = '管理员权限请求未完成'
    logPath = $logPath
    outputTail = ''
    error = $_.Exception.Message
  }
}
Write-Output '${PRINTER_SHARE_REPAIR_JSON_START}'
$payload | ConvertTo-Json -Compress
Write-Output '${PRINTER_SHARE_REPAIR_JSON_END}'
`
}

function createPrinterShareCredentialScript(request: PrinterShareCredentialRequest): string {
  const requestBase64 = Buffer.from(JSON.stringify(request), 'utf8').toString('base64')
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$requestJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${requestBase64}'))
$request = $requestJson | ConvertFrom-Json
$TargetHost = [string]$request.targetHost
$Username = [string]$request.username
$Password = [string]$request.password
$ClearExisting = [bool]$request.clearExisting
$uncRoot = '\\\\' + $TargetHost
$messages = @()
$saved = $false
$uncAccessible = $false
try {
  if (-not $TargetHost -or -not $Username -or -not $Password) {
    throw '服务端地址、用户名或密码不能为空'
  }
  if ($ClearExisting) {
    & net.exe use ('\\\\' + $TargetHost + '\\*') /delete /y 2>&1 | ForEach-Object { $messages += [string]$_ }
    $targets = @(
      $TargetHost,
      ('Domain:target=' + $TargetHost),
      ('LegacyGeneric:target=' + $TargetHost),
      $uncRoot
    )
    foreach ($variant in $targets) {
      & cmdkey.exe /delete:$variant 2>&1 | ForEach-Object { $messages += [string]$_ }
    }
  }
  & cmdkey.exe /add:$TargetHost /user:$Username /pass:$Password 2>&1 | ForEach-Object { $messages += [string]$_ }
  $saved = $true
  $uncAccessible = [bool](Test-Path -LiteralPath $uncRoot -ErrorAction SilentlyContinue)
  $payload = @{
    targetHost = $TargetHost
    username = $Username
    saved = $saved
    uncAccessible = $uncAccessible
    message = if ($uncAccessible) { '凭据已保存，共享入口已可访问' } else { '凭据已保存，但共享入口仍不可访问' }
    outputTail = (($messages | Where-Object { $_ }) -join [Environment]::NewLine)
  }
} catch {
  $payload = @{
    targetHost = $TargetHost
    username = $Username
    saved = $saved
    uncAccessible = $uncAccessible
    message = '凭据保存失败'
    outputTail = (($messages | Where-Object { $_ }) -join [Environment]::NewLine)
    error = $_.Exception.Message
  }
}
Write-Output '${PRINTER_SHARE_CREDENTIAL_JSON_START}'
$payload | ConvertTo-Json -Compress
Write-Output '${PRINTER_SHARE_CREDENTIAL_JSON_END}'
`
}

export class TroubleshootingService {
  private readonly runtime: TroubleshootingRuntime

  constructor(runtime: TroubleshootingRuntime = { platform: process.platform }) {
    this.runtime = runtime
  }

  async scanGroupPolicy(): Promise<IpcResponse<GroupPolicyStatus>> {
    if (this.runtime.platform !== 'win32') {
      return {
        success: true,
        data: normalizeGroupPolicyStatus({}, this.runtime)
      }
    }

    const raw = await execPowerShellEncoded(createGroupPolicyStatusScript(), 30000)
    const parsed = parseMarkedJson<RawGroupPolicyStatus>(
      raw,
      GROUP_POLICY_STATUS_JSON_START,
      GROUP_POLICY_STATUS_JSON_END
    )

    if (!parsed) {
      return { success: false, error: '无法读取组策略组件状态' }
    }

    return {
      success: true,
      data: normalizeGroupPolicyStatus(parsed, this.runtime)
    }
  }

  async installGroupPolicy(): Promise<IpcResponse<GroupPolicyInstallResult>> {
    if (this.runtime.platform !== 'win32') {
      return { success: false, error: '仅支持 Windows' }
    }

    const raw = await execPowerShellEncoded(createGroupPolicyInstallScript(), 15 * 60 * 1000)
    const parsed = parseMarkedJson<RawGroupPolicyInstall>(
      raw,
      GROUP_POLICY_INSTALL_JSON_START,
      GROUP_POLICY_INSTALL_JSON_END
    )

    if (!parsed) {
      return { success: false, error: '没有收到管理员安装结果，可能已取消管理员权限请求' }
    }

    const data: GroupPolicyInstallResult = {
      started: Boolean(parsed.started),
      exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null,
      logPath: parsed.logPath ?? '',
      outputTail: parsed.outputTail ?? '',
      error: parsed.error
    }

    if (!data.started) {
      return {
        success: false,
        data,
        error: data.error || '管理员权限请求已取消'
      }
    }

    if (data.exitCode !== 0) {
      return {
        success: false,
        data,
        error: `DISM 安装失败，退出码 ${data.exitCode ?? '未知'}`
      }
    }

    return { success: true, data }
  }

  async openGroupPolicyEditor(): Promise<IpcResponse> {
    if (this.runtime.platform !== 'win32') {
      return { success: false, error: '仅支持 Windows' }
    }

    try {
      const child = spawn('cmd.exe', ['/c', 'start', '', 'gpedit.msc'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      child.unref()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async diagnosePrinterShare(input: PrinterShareDiagnosisRequest): Promise<IpcResponse<PrinterShareDiagnosis>> {
    let target: NormalizedPrinterShareTarget
    try {
      target = normalizePrinterShareTarget(input)
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }

    if (this.runtime.platform !== 'win32') {
      return {
        success: true,
        data: normalizePrinterShareDiagnosis(target, this.runtime)
      }
    }

    const raw = await execPowerShellEncoded(createPrinterShareDiagnosisScript(target), 45000)
    const parsed = parseMarkedJson<RawPrinterShareDiagnosis>(
      raw,
      PRINTER_SHARE_DIAGNOSIS_JSON_START,
      PRINTER_SHARE_DIAGNOSIS_JSON_END
    )

    if (!parsed) {
      return { success: false, error: '无法读取打印共享诊断结果' }
    }

    return {
      success: true,
      data: normalizePrinterShareDiagnosis(
        {
          ...target,
          ...parsed
        },
        this.runtime
      )
    }
  }

  async repairPrinterShare(input: PrinterShareRepairRequest): Promise<IpcResponse<PrinterShareRepairResult>> {
    if (this.runtime.platform !== 'win32') {
      return { success: false, error: '仅支持 Windows' }
    }

    let target: NormalizedPrinterShareTarget | undefined
    if (input.actionId === 'clear-server-connection' || input.actionId === 'clear-server-credential') {
      try {
        target = normalizePrinterShareTarget({ target: input.targetHost ?? '' })
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }

    const elevatedActions: PrinterShareRepairActionId[] = [
      'restart-client-spooler',
      'clear-client-print-queue',
      'apply-rpc-compatibility',
      'clear-server-connection',
      'clear-server-credential'
    ]
    if (!elevatedActions.includes(input.actionId)) {
      return { success: false, error: '该打印修复动作不需要管理员脚本执行' }
    }

    const raw = await execPowerShellEncoded(createPrinterShareRepairScript(input.actionId, target), 10 * 60 * 1000)
    const parsed = parseMarkedJson<RawPrinterShareRepair>(
      raw,
      PRINTER_SHARE_REPAIR_JSON_START,
      PRINTER_SHARE_REPAIR_JSON_END
    )

    if (!parsed) {
      return { success: false, error: '没有收到管理员修复结果，可能已取消管理员权限请求' }
    }

    const data: PrinterShareRepairResult = {
      actionId: parsed.actionId ?? input.actionId,
      started: Boolean(parsed.started),
      exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null,
      message: parsed.message ?? '',
      logPath: parsed.logPath,
      outputTail: parsed.outputTail,
      error: parsed.error
    }

    if (!data.started) {
      return { success: false, data, error: data.error || data.message || '管理员权限请求已取消' }
    }

    if (data.exitCode !== 0) {
      return { success: false, data, error: data.message || `修复动作失败，退出码 ${data.exitCode ?? '未知'}` }
    }

    return { success: true, data }
  }

  async savePrinterShareCredential(
    input: PrinterShareCredentialRequest
  ): Promise<IpcResponse<PrinterShareCredentialResult>> {
    if (this.runtime.platform !== 'win32') {
      return { success: false, error: '仅支持 Windows' }
    }

    let target: NormalizedPrinterShareTarget
    try {
      target = normalizePrinterShareTarget({ target: input.targetHost })
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }

    const username = input.username.trim()
    const password = input.password
    if (!username || !password) {
      return { success: false, error: '请输入服务端用户名和密码' }
    }

    const raw = await execPowerShellEncoded(
      createPrinterShareCredentialScript({
        targetHost: target.targetHost,
        username,
        password,
        clearExisting: input.clearExisting
      }),
      45000
    )
    const parsed = parseMarkedJson<RawPrinterShareCredential>(
      raw,
      PRINTER_SHARE_CREDENTIAL_JSON_START,
      PRINTER_SHARE_CREDENTIAL_JSON_END
    )

    if (!parsed) {
      return { success: false, error: '没有收到凭据保存结果' }
    }

    const data: PrinterShareCredentialResult = {
      targetHost: parsed.targetHost ?? target.targetHost,
      username: parsed.username ?? username,
      saved: Boolean(parsed.saved),
      uncAccessible: Boolean(parsed.uncAccessible),
      message: parsed.message ?? '',
      outputTail: parsed.outputTail,
      error: parsed.error
    }

    if (!data.saved) {
      return { success: false, data, error: data.error || data.message || '凭据保存失败' }
    }

    return { success: true, data }
  }

  async openPrinterShareTarget(input: PrinterShareOpenRequest): Promise<IpcResponse> {
    if (this.runtime.platform !== 'win32') {
      return { success: false, error: '仅支持 Windows' }
    }

    const launch = (file: string, args: string[]) => {
      const child = spawn(file, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      child.unref()
    }

    try {
      if (input.target === 'credential-manager') {
        launch('cmd.exe', ['/c', 'start', '', 'control.exe', '/name', 'Microsoft.CredentialManager'])
      } else if (input.target === 'printer-settings') {
        launch('cmd.exe', ['/c', 'start', '', 'ms-settings:printers'])
      } else if (input.target === 'network-sharing') {
        launch('cmd.exe', ['/c', 'start', '', 'control.exe', '/name', 'Microsoft.NetworkAndSharingCenter'])
      } else if (input.target === 'server-unc') {
        if (!input.host) return { success: false, error: '缺少服务端地址' }
        const target = normalizePrinterShareTarget({ target: input.host })
        launch('explorer.exe', [target.uncRoot])
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const troubleshootingService = new TroubleshootingService()
