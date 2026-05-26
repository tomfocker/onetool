export interface GroupPolicyStatus {
  available: boolean
  reason: string | null
  caption: string
  editionId: string
  productName: string
  isHomeEdition: boolean
  gpeditInstalled: boolean
  packageCount: number
  clientExtensionPackageCount: number
  clientToolsPackageCount: number
  packageNames: string[]
  canInstall: boolean
}

export interface GroupPolicyInstallResult {
  started: boolean
  exitCode: number | null
  logPath: string
  outputTail: string
  error?: string
}

export type PrinterShareDiagnosisOwner =
  | 'client'
  | 'server'
  | 'network'
  | 'protocol'
  | 'credential'
  | 'unknown'
export type PrinterShareCheckStatus = 'ok' | 'warning' | 'error' | 'info' | 'skipped'
export type PrinterShareCheckTarget = 'client' | 'server' | 'network' | 'protocol' | 'credential'
export type PrinterShareRepairActionId =
  | 'restart-client-spooler'
  | 'clear-client-print-queue'
  | 'apply-rpc-compatibility'
  | 'clear-server-credential'
  | 'clear-server-connection'
  | 'open-credential-manager'
  | 'open-printer-settings'
  | 'open-server-unc'
export type PrinterShareGuidedActionId =
  | PrinterShareRepairActionId
  | 'save-server-credential'
  | 'server-checklist'
  | 'retry-diagnosis'
  | 'none'
export type PrinterShareWizardStep =
  | 'unsupported'
  | 'checking'
  | 'fix-client-service'
  | 'clear-client-queue'
  | 'network-blocked'
  | 'server-blocked'
  | 'need-credentials'
  | 'credential-conflict'
  | 'rpc-compatibility'
  | 'ready'
  | 'unknown'
export type PrinterShareCredentialState = 'unknown' | 'missing' | 'saved' | 'conflict'

export interface PrinterShareGuidedAction {
  id: PrinterShareGuidedActionId
  kind: 'repair' | 'credential' | 'open' | 'server' | 'done'
  label: string
  buttonLabel: string
  detail: string
  requiresConfirmation?: boolean
}

export interface PrinterShareDiagnosisRequest {
  target: string
  printerName?: string
}

export interface PrinterShareCheck {
  id: string
  title: string
  status: PrinterShareCheckStatus
  target: PrinterShareCheckTarget
  detail: string
  recommendation?: string
}

export interface PrinterShareDiagnosisSummary {
  owner: PrinterShareDiagnosisOwner
  title: string
  detail: string
}

export interface PrinterShareDiagnosis {
  available: boolean
  reason: string | null
  targetHost: string
  printerName: string
  uncRoot: string
  printerPath: string | null
  checks: PrinterShareCheck[]
  summary: PrinterShareDiagnosisSummary
  recommendedActions: PrinterShareGuidedActionId[]
  wizardStep: PrinterShareWizardStep
  nextAction: PrinterShareGuidedAction
  advancedChecksVisibleByDefault: boolean
  credentialState: PrinterShareCredentialState
  hasCredentialConflict: boolean
  queueFileCount: number
  existingConnections: string[]
  savedCredentialTargets: string[]
  activeServerConnections: string[]
}

export interface PrinterShareRepairRequest {
  actionId: PrinterShareRepairActionId
  targetHost?: string
}

export interface PrinterShareRepairResult {
  actionId: PrinterShareRepairActionId
  started: boolean
  exitCode: number | null
  message: string
  logPath?: string
  outputTail?: string
  error?: string
}

export interface PrinterShareCredentialRequest {
  targetHost: string
  username: string
  password: string
  clearExisting?: boolean
}

export interface PrinterShareCredentialResult {
  targetHost: string
  username: string
  saved: boolean
  uncAccessible: boolean
  message: string
  outputTail?: string
  error?: string
}

export interface PrinterShareOpenRequest {
  target: 'credential-manager' | 'printer-settings' | 'server-unc' | 'network-sharing'
  host?: string
}

export type TroubleshootingCardState = 'idle' | 'ready' | 'installed' | 'unsupported' | 'blocked' | 'error'

export function getGroupPolicyCardState(status: GroupPolicyStatus | null): TroubleshootingCardState {
  if (!status) return 'idle'
  if (!status.available) return 'unsupported'
  if (status.gpeditInstalled) return 'installed'
  if (status.canInstall) return 'ready'
  if (status.packageCount === 0) return 'blocked'
  return 'error'
}
