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
export type MemoryDiaryActivityKind =
  | 'development'
  | 'research'
  | 'communication'
  | 'writing'
  | 'media'
  | 'operations'
  | 'browsing'
  | 'other'

export interface MemoryDiaryConfig {
  apiUrl: string
  screenpipeExecutablePath: string
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

export interface MemoryDiaryTimelineInsight {
  activityKind: MemoryDiaryActivityKind
  activityLabel: string
  confidence: number
  dominantAppName: string
  dominantWindowName: string
  projectHints: string[]
  keywords: string[]
  sourceCounts: Record<MemoryDiaryContentType, number>
  uniqueTextCount: number
  duplicateTextCount: number
  duplicateRatio: number
  evidenceTexts: string[]
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
  insight: MemoryDiaryTimelineInsight
}

export interface MemoryDiaryTopEntry {
  label: string
  count: number
  share: number
}

export interface MemoryDiaryActivityMixEntry {
  kind: MemoryDiaryActivityKind
  label: string
  count: number
  share: number
}

export interface MemoryDiaryFocusBlock {
  title: string
  start: string
  end: string
  activityKind: MemoryDiaryActivityKind
  activityLabel: string
  appName: string
  projectHints: string[]
  bucketCount: number
  recordCount: number
}

export interface MemoryDiaryDailyInsight {
  activeMinutes: number
  bucketCount: number
  recordCount: number
  uniqueTextCount: number
  duplicateRatio: number
  topApps: MemoryDiaryTopEntry[]
  activityMix: MemoryDiaryActivityMixEntry[]
  focusBlocks: MemoryDiaryFocusBlock[]
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

export function createEmptyMemoryDiaryContentCounts(): Record<MemoryDiaryContentType, number> {
  return {
    accessibility: 0,
    ocr: 0,
    audio: 0,
    input: 0
  }
}

export function createDefaultMemoryDiaryConfig(): MemoryDiaryConfig {
  return {
    apiUrl: 'http://localhost:3030',
    screenpipeExecutablePath: '',
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

export function countMemoryDiaryItemsByType(
  items: MemoryDiaryItem[]
): Record<MemoryDiaryContentType, number> {
  return items.reduce((counts, item) => {
    counts[item.contentType] += 1
    return counts
  }, createEmptyMemoryDiaryContentCounts())
}

export function createMemoryDiaryBucketStart(timestamp: string, bucketMinutes: number): string {
  const date = new Date(timestamp)
  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000
  const bucketStartMs = Math.floor(date.getTime() / bucketMs) * bucketMs
  return new Date(bucketStartMs).toISOString()
}

const MEMORY_DIARY_ACTIVITY_LABELS: Record<MemoryDiaryActivityKind, string> = {
  development: '开发',
  research: '资料',
  communication: '沟通',
  writing: '写作',
  media: '创作',
  operations: '维护',
  browsing: '浏览',
  other: '其他'
}

const MEMORY_DIARY_TEXT_SOURCE_PRIORITY: Record<MemoryDiaryContentType, number> = {
  accessibility: 0,
  audio: 1,
  input: 2,
  ocr: 3
}

const MEMORY_DIARY_ACTIVITY_KEYWORDS: Array<{
  kind: MemoryDiaryActivityKind
  keywords: string[]
}> = [
  {
    kind: 'development',
    keywords: [
      'code', 'codex', 'electron', 'vscode', 'visual studio code', 'terminal',
      'powershell', 'typescript', 'javascript', 'github', 'git', 'pull request',
      'commit', 'tsx', '.ts', '.js', '.tsx', 'api', 'service', 'test', 'npm',
      '开发', '代码', '接口', '测试', '编译'
    ]
  },
  {
    kind: 'research',
    keywords: [
      'docs', 'documentation', 'search', 'google', 'bing', 'chrome', 'edge',
      'screenpipe', 'blog', 'article', 'github issue', 'readme',
      '文档', '搜索', '资料', '文章', '教程'
    ]
  },
  {
    kind: 'communication',
    keywords: [
      'wechat', 'weixin', 'slack', 'discord', 'teams', 'zoom', 'mail', 'outlook',
      'meeting', 'calendar', 'message', 'chat',
      '微信', '会议', '消息', '沟通', '邮件'
    ]
  },
  {
    kind: 'media',
    keywords: [
      'premiere', 'after effects', 'photoshop', 'illustrator', 'audition',
      'obs', 'capcut', '剪辑', '字幕', '视频', '素材', '渲染'
    ]
  },
  {
    kind: 'writing',
    keywords: [
      'notion', 'obsidian', 'word', 'typora', 'markdown', 'notepad',
      'draft', 'note', '文档', '笔记', '草稿', '日报', '写作'
    ]
  },
  {
    kind: 'operations',
    keywords: [
      'explorer', 'settings', 'control panel', 'installer', 'install', 'winget',
      'download', 'setup', 'config', '任务管理器', '安装', '配置', '下载', '系统'
    ]
  },
  {
    kind: 'browsing',
    keywords: ['browser', 'chrome', 'edge', 'firefox', '网页', '浏览']
  }
]

const MEMORY_DIARY_GENERIC_PROJECT_WORDS = new Set([
  'code',
  'chrome',
  'edge',
  'codex',
  'electron',
  'implement',
  'file',
  'edit',
  'view',
  'window',
  'help',
  'terminal'
])

const MEMORY_DIARY_STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'will', 'your', 'screen', 'window',
  'file', 'edit', 'view', 'help', 'true', 'false', 'null', 'undefined',
  '正在', '最大化', '最小化', '关闭', '文件', '编辑', '查看', '窗口', '帮助'
])

export function buildMemoryDiaryTimelineInsight(items: MemoryDiaryItem[]): MemoryDiaryTimelineInsight {
  const sourceCounts = countMemoryDiaryItemsByType(items)
  const textItems = items.filter((item) => item.text.trim().length > 0)
  const readableItems = [...textItems].sort((left, right) => (
    MEMORY_DIARY_TEXT_SOURCE_PRIORITY[left.contentType] - MEMORY_DIARY_TEXT_SOURCE_PRIORITY[right.contentType]
  ))
  const evidenceTexts = dedupeMemoryDiaryTexts(readableItems.map((item) => item.text)).slice(0, 6)
  const duplicateTextCount = Math.max(0, textItems.length - evidenceTexts.length)
  const duplicateRatio = textItems.length === 0 ? 0 : roundMemoryDiaryRatio(duplicateTextCount / textItems.length)
  const dominantAppName = getDominantMemoryDiaryValue(items.map((item) => item.appName)) || '未知应用'
  const dominantWindowName = getDominantMemoryDiaryValue(items.map((item) => item.windowName)) || '未知窗口'
  const activity = classifyMemoryDiaryActivity(items, evidenceTexts)

  return {
    activityKind: activity.kind,
    activityLabel: MEMORY_DIARY_ACTIVITY_LABELS[activity.kind],
    confidence: activity.confidence,
    dominantAppName,
    dominantWindowName,
    projectHints: extractMemoryDiaryProjectHints(items, evidenceTexts),
    keywords: extractMemoryDiaryKeywords(evidenceTexts),
    sourceCounts,
    uniqueTextCount: evidenceTexts.length,
    duplicateTextCount,
    duplicateRatio,
    evidenceTexts
  }
}

export function buildMemoryDiaryDailyInsight(
  buckets: MemoryDiaryTimelineBucket[]
): MemoryDiaryDailyInsight {
  const bucketCount = buckets.length
  const recordCount = buckets.reduce((sum, bucket) => sum + bucket.items.length, 0)
  const activeMinutes = buckets.reduce((sum, bucket) => {
    const start = new Date(bucket.start).getTime()
    const end = new Date(bucket.end).getTime()
    const minutes = Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, Math.round((end - start) / 60000))
      : 0
    return sum + minutes
  }, 0)
  const uniqueTextCount = buckets.reduce((sum, bucket) => sum + bucket.insight.uniqueTextCount, 0)
  const duplicateCount = buckets.reduce((sum, bucket) => sum + bucket.insight.duplicateTextCount, 0)
  const observedTextCount = uniqueTextCount + duplicateCount
  const duplicateRatio = observedTextCount === 0 ? 0 : roundMemoryDiaryRatio(duplicateCount / observedTextCount)

  return {
    activeMinutes,
    bucketCount,
    recordCount,
    uniqueTextCount,
    duplicateRatio,
    topApps: buildMemoryDiaryTopEntries(
      buckets.map((bucket) => bucket.insight.dominantAppName).filter((value) => value && value !== '未知应用'),
      bucketCount
    ),
    activityMix: buildMemoryDiaryActivityMix(buckets),
    focusBlocks: buildMemoryDiaryFocusBlocks(buckets)
  }
}

function dedupeMemoryDiaryTexts(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const compacted = compactMemoryDiaryText(value, 220)
    const key = normalizeMemoryDiaryTextKey(compacted)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(compacted)
  }

  return result
}

function compactMemoryDiaryText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function normalizeMemoryDiaryTextKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getDominantMemoryDiaryValue(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) continue
    counts.set(normalized, (counts.get(normalized) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .at(0)?.[0] || ''
}

function classifyMemoryDiaryActivity(
  items: MemoryDiaryItem[],
  evidenceTexts: string[]
): { kind: MemoryDiaryActivityKind, confidence: number } {
  const searchable = [
    ...items.flatMap((item) => [item.appName, item.windowName, item.url]),
    ...evidenceTexts
  ].join(' ').toLowerCase()
  const scores = new Map<MemoryDiaryActivityKind, number>()

  for (const definition of MEMORY_DIARY_ACTIVITY_KEYWORDS) {
    const score = definition.keywords.reduce((sum, keyword) => (
      searchable.includes(keyword.toLowerCase()) ? sum + 1 : sum
    ), 0)
    if (score > 0) {
      scores.set(definition.kind, score)
    }
  }

  const [kind, score] = Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .at(0) || ['other' as MemoryDiaryActivityKind, 0]

  return {
    kind,
    confidence: score === 0 ? 0.35 : roundMemoryDiaryRatio(Math.min(0.95, 0.45 + score * 0.1))
  }
}

function extractMemoryDiaryProjectHints(
  items: MemoryDiaryItem[],
  evidenceTexts: string[]
): string[] {
  const projectHints: string[] = []
  const fileHints: string[] = []
  const candidateText = [
    ...items.flatMap((item) => [item.windowName, item.url]),
    ...evidenceTexts
  ].join(' ')

  for (const item of items) {
    const parts = item.windowName.split(/\s[-|—]\s| - /).map((part) => part.trim()).filter(Boolean)
    for (const part of parts) {
      if (/\.[a-z0-9]{1,6}\b/i.test(part)) {
        fileHints.push(part)
      } else if (isUsefulMemoryDiaryProjectHint(part)) {
        projectHints.push(part)
      }
    }
  }

  const titleCaseMatches = candidateText.match(/\b[A-Z][A-Za-z0-9]*(?:[A-Z][A-Za-z0-9]+)+\b/g) || []
  for (const match of titleCaseMatches) {
    if (fileHints.some((hint) => hint.toLowerCase().startsWith(`${match.toLowerCase()}.`))) {
      continue
    }
    if (isUsefulMemoryDiaryProjectHint(match) && !/\.[a-z0-9]{1,6}$/i.test(match)) {
      projectHints.push(match)
    }
  }

  const fileMatches = candidateText.match(/\b[\w.-]+\.(?:ts|tsx|js|jsx|md|json|css|html|py|ps1|rs|go)\b/gi) || []
  fileHints.push(...fileMatches)

  return uniqueMemoryDiaryValues([...projectHints, ...fileHints]).slice(0, 5)
}

function isUsefulMemoryDiaryProjectHint(value: string): boolean {
  const normalized = value.trim()
  if (normalized.length < 3 || normalized.length > 80) return false
  if (MEMORY_DIARY_GENERIC_PROJECT_WORDS.has(normalized.toLowerCase())) return false
  return /[\p{L}\p{N}]/u.test(normalized)
}

function extractMemoryDiaryKeywords(evidenceTexts: string[]): string[] {
  const counts = new Map<string, number>()
  const text = evidenceTexts.join(' ').toLowerCase()
  const tokens = text.match(/[\p{L}\p{N}_-]{3,}/gu) || []

  for (const token of tokens) {
    const normalized = token.replace(/^[-_]+|[-_]+$/g, '')
    if (normalized.length < 3 || MEMORY_DIARY_STOP_WORDS.has(normalized)) continue
    counts.set(normalized, (counts.get(normalized) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([keyword]) => keyword)
    .slice(0, 8)
}

function buildMemoryDiaryTopEntries(values: string[], total: number): MemoryDiaryTopEntry[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) continue
    counts.set(normalized, (counts.get(normalized) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([label, count]) => ({
      label,
      count,
      share: total === 0 ? 0 : roundMemoryDiaryRatio(count / total)
    }))
}

function buildMemoryDiaryActivityMix(
  buckets: MemoryDiaryTimelineBucket[]
): MemoryDiaryActivityMixEntry[] {
  const total = buckets.length
  const counts = new Map<MemoryDiaryActivityKind, number>()
  for (const bucket of buckets) {
    counts.set(bucket.insight.activityKind, (counts.get(bucket.insight.activityKind) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([kind, count]) => ({
      kind,
      label: MEMORY_DIARY_ACTIVITY_LABELS[kind],
      count,
      share: total === 0 ? 0 : roundMemoryDiaryRatio(count / total)
    }))
}

function buildMemoryDiaryFocusBlocks(
  buckets: MemoryDiaryTimelineBucket[]
): MemoryDiaryFocusBlock[] {
  const blocks: MemoryDiaryFocusBlock[] = []

  for (const bucket of buckets) {
    const insight = bucket.insight
    const previous = blocks.at(-1)
    const sameActivity = previous?.activityKind === insight.activityKind
    const sameApp = previous?.appName === insight.dominantAppName
    const touchesPrevious = previous?.end === bucket.start

    if (previous && sameActivity && sameApp && touchesPrevious) {
      previous.end = bucket.end
      previous.bucketCount += 1
      previous.recordCount += bucket.items.length
      previous.projectHints = uniqueMemoryDiaryValues([...previous.projectHints, ...insight.projectHints]).slice(0, 4)
      continue
    }

    blocks.push({
      title: `${insight.activityLabel} · ${insight.dominantAppName}`,
      start: bucket.start,
      end: bucket.end,
      activityKind: insight.activityKind,
      activityLabel: insight.activityLabel,
      appName: insight.dominantAppName,
      projectHints: insight.projectHints.slice(0, 4),
      bucketCount: 1,
      recordCount: bucket.items.length
    })
  }

  return blocks
    .sort((left, right) => right.bucketCount - left.bucketCount || right.recordCount - left.recordCount)
    .slice(0, 6)
}

function uniqueMemoryDiaryValues(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function roundMemoryDiaryRatio(value: number): number {
  return Math.round(value * 100) / 100
}
