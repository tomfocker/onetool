import type { DownloadOrganizerStoredState } from './downloadOrganizer'

/**
 * 应用全局设置
 */
export interface AppSettings {
  recorderHotkey: string
  screenshotHotkey: string
  floatBallHotkey: string
  screenshotSavePath: string
  autoSaveScreenshot: boolean
  autoCheckForUpdates: boolean
  clipboardHotkey: string
  minimizeToTray: boolean

  // 截图翻译大模型 API 配置
  translateApiUrl: string
  translateApiKey: string
  translateModel: string
}

/**
 * 通用 IPC 响应结构
 */
export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 硬件配置类型
 */
export interface SystemConfig {
  cpu: string
  deviceModel: string
  motherboard: string
  memory: string
  gpu: string
  monitor: string
  disk: string
  os: string
  installTime: number
}

/**
 * 实时硬件监控数据
 */
export interface RealtimeStats {
  cpuLoad: number
  cpuTemp: number
  gpuLoad: number
  gpuTemp: number
  memoryUsage: number // 百分比
  memoryUsed: number  // GB
  memoryTotal: number // GB
  netUp: string
  netDown: string
}

/**
 * 批量重命名类型
 */
export interface RenameFileItem {
  path: string
  name: string
  size: number
  mtime: Date
  ctime?: Date
  newName?: string
  success?: boolean
  error?: string
}

export interface RenameRule {
  type: 'prefix' | 'suffix' | 'replace' | 'sequence' | 'case'
  params: {
    prefix?: string
    suffix?: string
    find?: string
    replace?: string
    baseName?: string
    startNum?: number
    digits?: number
    caseType?: 'upper' | 'lower' | 'title'
  }
}

export type SortField = 'name' | 'size' | 'mtime' | 'ctime' | 'extension' | 'random' | 'reverse'
export type SortOrder = 'asc' | 'desc'

export interface RenamePreset {
  id: string
  name: string
  rules: RenameRule[]
}

/**
 * 窗口唤醒类型
 */
export type ActivatorTargetType = 'app' | 'tab'

export interface ActivatorConfig {
  id: string
  name: string
  type: ActivatorTargetType
  pattern: string
  shortcut: string
  isActive: boolean
  hwnd?: number
}

export interface WindowInfo {
  id: number
  title: string
  processName: string
  hwnd: number
  type: 'window' | 'tab'
}

/**
 * 剪贴板历史类型
 */
export interface ClipboardItem {
  id: string
  type: 'text' | 'image'
  content: string
  preview?: string
  timestamp: number
  pinned: boolean
}

/**
 * 网络探测类型
 */
export interface NetworkInterfaceInfo {
  name: string
  description: string
  type: 'Wi-Fi' | '以太网'
  speed: string
  ip: string
}

export type ProxyProtocol = 'http' | 'socks5' | 'unknown'

export interface LocalProxyConfig {
  host: string
  port: number
  protocol: Exclude<ProxyProtocol, 'unknown'>
  bypass: string[]
}

export interface LocalProxyStatus {
  enabled: boolean
  server: string
  host: string
  port: number | null
  protocol: ProxyProtocol
  bypass: string[]
  autoConfigUrl: string | null
}

export interface WslDistroInfo {
  name: string
  state: string
  version: number
  isDefault: boolean
  isRunning: boolean
  basePath?: string | null
  vhdPath?: string | null
  vhdSizeBytes?: number | null
  osVersion?: string | null
  flavor?: string | null
}

export interface WslVersionInfo {
  wslVersion: string | null
  kernelVersion: string | null
  wslgVersion: string | null
  msrdcVersion: string | null
  direct3dVersion: string | null
  dxcoreVersion: string | null
  windowsVersion: string | null
}

export type WslBackupFormat = 'tar' | 'vhd'

export interface WslBackupInfo {
  id: string
  distroName: string
  sourceVersion: number
  format: WslBackupFormat
  fileName: string
  filePath: string
  sizeBytes: number
  createdAt: string
}

export type WslRestoreMode = 'copy' | 'replace'

export interface WslSpaceReclaimResult {
  distroName: string
  vhdPath: string
  beforeBytes: number
  afterBytes: number
  reclaimedBytes: number
  sparseEnabled: boolean
  trimAttempted: boolean
  trimOutput: string
}

export interface WslOverview {
  available: boolean
  message: string | null
  defaultDistro: string | null
  runningCount: number
  distros: WslDistroInfo[]
  rawStatus: string
  versionInfo: WslVersionInfo
  backupRoot: string
  restoreRoot: string
}

/**
 * 工具定义 (插件系统元数据)
 */
export interface ToolDefinition {
  id: string
  name: string
  description: string
  category: '系统维护' | '日常办公' | '媒体处理' | '实用工具'
  icon: string // 对应 Lucide 图标名称
  componentPath: string // 组件相对于 tools 目录的路径
}

export interface LanDevice {
  ip: string
  mac: string
  name: string
  type: string
}

/**
 * 工具使用统计
 */
export interface ToolUsageRecord {
  id: string
  name: string
  icon: string
  lastUsed: number
  useCount: number
}

/**
 * 全局存储 Schema
 */
export interface GlobalStore {
  settings: AppSettings
  renamePresets: RenamePreset[]
  webActivatorConfigs: ActivatorConfig[]
  toolUsages: ToolUsageRecord[]
  pinnedToolIds: string[]
  windowsManagerFavorites: string[]
  clipboardHistory: ClipboardItem[]
  downloadOrganizer: DownloadOrganizerStoredState
  version: string
}

/**
 * 全局通知类型
 */
export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface AppNotification {
  id: string
  type: NotificationType
  title?: string
  message: string
  duration?: number
}

export type BilibiliLinkKind = 'video' | 'episode' | 'season'

export type BilibiliParsedItemKind = 'page' | 'episode' | 'season'

export const BILIBILI_EXPORT_MODE_VALUES = [
  'video-only',
  'audio-only',
  'split-streams',
  'merge-mp4'
] as const

export type BilibiliExportMode = (typeof BILIBILI_EXPORT_MODE_VALUES)[number]

export const BILIBILI_DOWNLOAD_STAGE_VALUES = [
  'idle',
  'parsing',
  'loading-stream-options',
  'downloading-video',
  'downloading-audio',
  'merging',
  'completed',
  'failed'
] as const

export type BilibiliDownloadStage = (typeof BILIBILI_DOWNLOAD_STAGE_VALUES)[number]

export interface BilibiliParsedLink {
  kind: BilibiliLinkKind
  bvid?: string
  epId?: string
  seasonId?: string
  page?: number
  title: string | null
  coverUrl: string | null
  items: BilibiliParsedItem[]
  selectedItemId: string | null
}

export interface BilibiliParsedItem {
  id: string
  kind: BilibiliParsedItemKind
  title: string
  page?: number
  epId?: string
  seasonId?: string
}

export interface BilibiliLoginSession {
  isLoggedIn: boolean
  nickname: string | null
  avatarUrl: string | null
  expiresAt: string | null
}

export interface BilibiliStreamModeAvailability {
  available: boolean
  disabledReason: string | null
}

export interface BilibiliStreamOptionSummary {
  hasAudio: boolean
  hasVideo: boolean
  mergeMp4: BilibiliStreamModeAvailability
  exportModes: Record<BilibiliExportMode, BilibiliStreamModeAvailability>
  availableExportModes: BilibiliExportMode[]
}

export interface BilibiliDownloaderSelection {
  exportMode: BilibiliExportMode | null
}

export interface BilibiliDownloaderState {
  loginSession: BilibiliLoginSession
  parsedLink: BilibiliParsedLink | null
  selection: BilibiliDownloaderSelection
  streamOptionSummary: BilibiliStreamOptionSummary | null
  taskStage: BilibiliDownloadStage
  error: string | null
}
