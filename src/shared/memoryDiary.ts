export type MemoryDiaryContentType = 'accessibility' | 'ocr' | 'audio' | 'input'
export type MemoryDiaryManagedProcessState =
  | 'unknown'
  | 'not-installed'
  | 'stopped'
  | 'running'
  | 'external-running'
  | 'starting'
  | 'stopping'
  | 'error'
export type MemoryDiaryTaskState = 'idle' | 'running' | 'success' | 'error'

export interface MemoryDiaryConfig {
  apiUrl: string
  apiKey: string
  enabledContentTypes: MemoryDiaryContentType[]
  includeAudio: boolean
  includeInput: boolean
  sensitiveAppPatterns: string[]
  sensitiveWindowPatterns: string[]
  timelineBucketMinutes: 5 | 15 | 30 | 60
  diaryStyle: 'brief' | 'worklog' | 'blog'
}

export interface MemoryDiaryCliStatus {
  installed: boolean
  version: string | null
  executablePath: string | null
  error: string | null
}

export interface MemoryDiaryRuntimeStatus {
  state: MemoryDiaryManagedProcessState
  apiReachable: boolean
  apiUrl: string
  apiKeyConfigured: boolean
  lastCaptureAt: string | null
  todayItemCount: number
  contentTypeCounts: Record<MemoryDiaryContentType, number>
  message: string | null
}

export interface MemoryDiaryDeploymentLog {
  id: string
  timestamp: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export interface MemoryDiaryItem {
  id: string
  timestamp: string
  contentType: MemoryDiaryContentType
  appName: string
  windowName: string
  url: string
  text: string
}

export interface MemoryDiaryTimelineBucket {
  id: string
  start: string
  end: string
  title: string
  summary: string
  appNames: string[]
  windowNames: string[]
  urls: string[]
  contentTypes: MemoryDiaryContentType[]
  keyTexts: string[]
  items: MemoryDiaryItem[]
}

export interface MemoryDiaryGenerateRequest {
  date: string
  timezone: string
  buckets: MemoryDiaryTimelineBucket[]
  config: MemoryDiaryConfig
  userNotes: string
}

export interface MemoryDiaryGenerateResult {
  id: string
  date: string
  title: string
  markdown: string
  summary: string
  createdAt: string
}

export interface MemoryDiaryHistoryEntry {
  id: string
  date: string
  title: string
  summary: string
  markdownPath: string
  createdAt: string
  updatedAt: string
}

export interface MemoryDiaryStoredState {
  config: MemoryDiaryConfig
  diaryHistory: MemoryDiaryHistoryEntry[]
  deploymentLogs: MemoryDiaryDeploymentLog[]
}

export function createDefaultMemoryDiaryConfig(): MemoryDiaryConfig {
  return {
    apiUrl: 'http://localhost:3030',
    apiKey: '',
    enabledContentTypes: ['accessibility', 'ocr'],
    includeAudio: false,
    includeInput: false,
    sensitiveAppPatterns: ['1Password', 'Bitwarden', 'KeePass'],
    sensitiveWindowPatterns: ['password', 'login', '支付', '密码'],
    timelineBucketMinutes: 15,
    diaryStyle: 'worklog'
  }
}

export function createDefaultMemoryDiaryStoredState(): MemoryDiaryStoredState {
  return {
    config: createDefaultMemoryDiaryConfig(),
    diaryHistory: [],
    deploymentLogs: []
  }
}

function matchesAnyPattern(value: string, patterns: string[]): boolean {
  const normalizedValue = value.toLowerCase()
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.trim().toLowerCase()
    return normalizedPattern.length > 0 && normalizedValue.includes(normalizedPattern)
  })
}

export function getAllowedMemoryDiaryContentTypes(
  config: MemoryDiaryConfig
): MemoryDiaryContentType[] {
  const allowed = new Set<MemoryDiaryContentType>(config.enabledContentTypes)
  if (config.includeAudio) {
    allowed.add('audio')
  } else {
    allowed.delete('audio')
  }
  if (config.includeInput) {
    allowed.add('input')
  } else {
    allowed.delete('input')
  }
  return Array.from(allowed)
}

export function filterMemoryDiaryItems(
  items: MemoryDiaryItem[],
  config: MemoryDiaryConfig
): MemoryDiaryItem[] {
  const allowedTypes = new Set(getAllowedMemoryDiaryContentTypes(config))
  return items.filter((item) => {
    if (!allowedTypes.has(item.contentType)) return false
    if (matchesAnyPattern(item.appName, config.sensitiveAppPatterns)) return false
    if (matchesAnyPattern(item.windowName, config.sensitiveWindowPatterns)) return false
    return item.text.trim().length > 0
  })
}

export function createMemoryDiaryBucketStart(timestamp: string, bucketMinutes: number): string {
  const date = new Date(timestamp)
  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000
  const bucketStartMs = Math.floor(date.getTime() / bucketMs) * bucketMs
  return new Date(bucketStartMs).toISOString()
}
