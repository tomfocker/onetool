/**
 * 应用全局设置
 */
export interface AppSettings {
  recorderHotkey: string
  screenshotHotkey: string
  floatBallHotkey: string
  screenshotSavePath: string
  autoSaveScreenshot: boolean
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
  motherboard: string
  memory: string
  gpu: string
  monitor: string
  disk: string
  os: string
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

export type SortField = 'name' | 'size' | 'mtime' | 'ctime' | 'extension'
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
  clipboardHistory: ClipboardItem[]
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
