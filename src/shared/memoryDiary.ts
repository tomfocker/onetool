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
export type MemoryDiaryStyle = 'brief' | 'worklog' | 'blog'
export type MemoryDiaryTone = 'daily' | 'professional'

export interface MemoryDiaryConfig {
  apiUrl: string
  screenpipeExecutablePath: string
  apiKey: string
  enabledContentTypes: MemoryDiaryContentType[]
  includeAudio: boolean
  includeInput: boolean
  aiEventOptimizationEnabled: boolean
  sensitiveAppPatterns: string[]
  sensitiveWindowPatterns: string[]
  timelineBucketMinutes: 5 | 15 | 30 | 60
  diaryStyle: MemoryDiaryStyle
  diaryTone: MemoryDiaryTone
  autoDailySummaryEnabled: boolean
  autoDailySummaryTime: string
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

export interface MemoryDiaryWorkEvent {
  title: string
  summary: string
  activityKind: MemoryDiaryActivityKind
  activityLabel: string
  primaryApp: string
  primaryProject: string
  topics: string[]
  keywords: string[]
  confidence: number
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
  event: MemoryDiaryWorkEvent
}

export interface MemoryDiaryEventOptimizationRequest {
  date: string
  timezone: string
  buckets: MemoryDiaryTimelineBucket[]
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
    aiEventOptimizationEnabled: true,
    sensitiveAppPatterns: ['1Password', 'Bitwarden', 'KeePass'],
    sensitiveWindowPatterns: ['password', 'login', '支付', '密码'],
    timelineBucketMinutes: 15,
    diaryStyle: 'brief',
    diaryTone: 'daily',
    autoDailySummaryEnabled: false,
    autoDailySummaryTime: '21:30'
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
  return items.map(normalizeMemoryDiaryItem).filter((item) => {
    if (!allowedTypes.has(item.contentType)) return false
    if (matchesAnyPattern(item.appName, config.sensitiveAppPatterns)) return false
    if (matchesAnyPattern(item.windowName, config.sensitiveWindowPatterns)) return false
    return item.text.trim().length > 0
  })
}

export function normalizeMemoryDiaryItem(item: MemoryDiaryItem): MemoryDiaryItem {
  const text = sanitizeMemoryDiaryText(item.text)
  const windowName = sanitizeMemoryDiaryTitle(item.windowName)
  const url = sanitizeMemoryDiaryUrl(item.url)
  return {
    ...item,
    appName: normalizeMemoryDiaryAppName(item.appName, windowName, text),
    windowName,
    url,
    text
  }
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
      'code', 'codex', 'vscode', 'visual studio code', 'terminal',
      'powershell', 'typescript', 'javascript', 'github', 'git', 'pull request',
      'commit', 'tsx', '.ts', '.js', '.tsx', 'service', 'test', 'npm',
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
  'electron.exe',
  'api',
  'ocr',
  'token',
  'input',
  'accessibility',
  'screenpipe',
  'localhost',
  'implement',
  'codex',
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
  'api', 'url_with_credentials', 'localhost', 'token', 'screenpipe', 'codex',
  'electron', 'accessibility', 'ocr', 'records', 'record', 'reads', 'read', 'now',
  '正在', '最大化', '最小化', '关闭', '文件', '编辑', '查看', '窗口', '帮助',
  '隐藏边栏', '返回', '前进', '保存设置', '高级设置'
])

const MEMORY_DIARY_LOW_VALUE_PATTERNS = [
  /file\s+edit\s+(?:selection\s+)?view\s+window\s+help/i,
  /file\s+edit\s+(?:selection\s+)?view\s+terminal\s+help/i,
  /minimi[sz]e\s+maximi[sz]e\s+close/i,
  /隐藏边栏\s+返回\s+前进\s+文件\s+编辑\s+查看\s+窗口\s+帮助/,
  /screenpipe\s+路径\s+api\s+地址\s+api\s+token/i,
  /api\s+地址\s+api\s+token/i,
  /保存设置\s+accessibility\s+accessibility\s+ocr\s+ocr/i,
  /screenpipe\s+管理\s+今日时间线\s+数据来源\s+原始重复度\s+记忆日报/i,
  /\[url_with_credentials\]/i
]

const MEMORY_DIARY_SHELL_APP_ALIASES = new Map([
  ['electron.exe', 'Electron'],
  ['electron', 'Electron'],
  ['gameviewer.exe', 'GameViewer'],
  ['dwm.exe', '桌面窗口管理器'],
  ['explorer.exe', '资源管理器']
])

const MEMORY_DIARY_CONTEXT_APP_ALIASES: Array<{
  app: string
  patterns: RegExp[]
}> = [
  {
    app: 'OneTool',
    patterns: [/onetool/i, /记忆日报/, /高颜值本地小工具箱/, /screenpipe\s+memory/i]
  },
  {
    app: 'Codex',
    patterns: [/codex/i]
  },
  {
    app: '豆包',
    patterns: [/doubao/i, /豆包/]
  },
  {
    app: 'PixPin',
    patterns: [/pixpin/i]
  }
]

const MEMORY_DIARY_FEATURE_TOPICS: Array<{ label: string, patterns: RegExp[] }> = [
  { label: 'ScreenPipe', patterns: [/screenpipe/i] },
  { label: '时间线', patterns: [/时间线/, /timeline/i] },
  { label: '数据理解层', patterns: [/数据理解层/, /理解层/, /work\s*event/i] },
  { label: '数据来源', patterns: [/数据来源/, /采集诊断/, /来源/] },
  { label: '界面', patterns: [/界面/, /\bui\b/i, /布局/, /展示/] }
]

export function buildMemoryDiaryTimelineInsight(items: MemoryDiaryItem[]): MemoryDiaryTimelineInsight {
  const sourceCounts = countMemoryDiaryItemsByType(items)
  const normalizedItems = items.map(normalizeMemoryDiaryItem)
  const textItems = normalizedItems.filter((item) => item.text.trim().length > 0)
  const readableItems = [...textItems].sort((left, right) => (
    MEMORY_DIARY_TEXT_SOURCE_PRIORITY[left.contentType] - MEMORY_DIARY_TEXT_SOURCE_PRIORITY[right.contentType]
  ))
  const evidenceTexts = selectMemoryDiaryEvidenceTexts(readableItems).slice(0, 6)
  const duplicateTextCount = Math.max(0, textItems.length - evidenceTexts.length)
  const duplicateRatio = textItems.length === 0 ? 0 : roundMemoryDiaryRatio(duplicateTextCount / textItems.length)
  const dominantAppName = getDominantMemoryDiaryValue(normalizedItems.map((item) => item.appName)) || '未知应用'
  const dominantWindowName = getDominantMemoryDiaryValue(normalizedItems.map((item) => item.windowName)) || '未知窗口'
  const activity = classifyMemoryDiaryActivity(normalizedItems, evidenceTexts)

  return {
    activityKind: activity.kind,
    activityLabel: MEMORY_DIARY_ACTIVITY_LABELS[activity.kind],
    confidence: activity.confidence,
    dominantAppName,
    dominantWindowName,
    projectHints: extractMemoryDiaryProjectHints(normalizedItems, evidenceTexts),
    keywords: extractMemoryDiaryKeywords(evidenceTexts),
    sourceCounts,
    uniqueTextCount: evidenceTexts.length,
    duplicateTextCount,
    duplicateRatio,
    evidenceTexts
  }
}

export function buildMemoryDiaryWorkEvent(
  items: MemoryDiaryItem[],
  providedInsight?: MemoryDiaryTimelineInsight
): MemoryDiaryWorkEvent {
  const normalizedItems = items.map(normalizeMemoryDiaryItem)
  const insight = providedInsight ?? buildMemoryDiaryTimelineInsight(normalizedItems)
  const primaryProject = getMemoryDiaryPrimaryProject(insight, normalizedItems)
  const projectApp = primaryProject
    ? normalizedItems.find((item) => item.appName === primaryProject)?.appName
    : ''
  const primaryApp = projectApp || (insight.dominantAppName !== '未知应用'
    ? insight.dominantAppName
    : normalizedItems.find((item) => item.appName)?.appName || '未知应用')
  const topics = extractMemoryDiaryEventTopics(insight, normalizedItems, primaryProject)
  const verb = getMemoryDiaryEventVerb(insight, topics)
  const title = buildMemoryDiaryEventTitle(insight, verb, primaryProject, primaryApp, topics)
  const summary = buildMemoryDiaryEventSummary(insight, verb, primaryApp, primaryProject, topics)

  return {
    title,
    summary,
    activityKind: insight.activityKind,
    activityLabel: insight.activityLabel,
    primaryApp,
    primaryProject,
    topics,
    keywords: insight.keywords,
    confidence: insight.confidence,
    evidenceTexts: insight.evidenceTexts
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

function selectMemoryDiaryEvidenceTexts(items: MemoryDiaryItem[]): string[] {
  const ranked = items
    .map((item) => ({
      text: compactMemoryDiaryText(item.text, 220),
      score: scoreMemoryDiaryEvidenceItem(item)
    }))
    .filter((item) => item.text.length > 0)
  const meaningful = ranked.filter((item) => item.score > 0)
  const candidates = meaningful.length > 0 ? meaningful : ranked

  return dedupeMemoryDiaryTexts(
    candidates
      .sort((left, right) => right.score - left.score || left.text.length - right.text.length)
      .map((item) => item.text)
  )
}

function scoreMemoryDiaryEvidenceItem(item: MemoryDiaryItem): number {
  const text = item.text.trim()
  const key = normalizeMemoryDiaryTextKey(text)
  let score = 0

  if (item.contentType === 'accessibility') score += 4
  if (item.contentType === 'audio') score += 4
  if (item.contentType === 'input') score += 2
  if (item.contentType === 'ocr') score += 1
  if (text.length >= 20) score += 1
  if (/[\u4e00-\u9fa5]/.test(text)) score += 1
  if (/\b(?:fix|build|write|review|debug|implement|generate|安装|配置|生成|修复|调试|整理|阅读|优化|回退|开启|显示)\b/i.test(text)) {
    score += 2
  }
  if (/\b[\w.-]+\.(?:ts|tsx|js|jsx|md|json|css|html|py|ps1|rs|go)\b/i.test(text)) {
    score += 1
  }
  if (isLowValueMemoryDiaryText(text)) score -= 4
  if (key.length < 10) score -= 2

  return score
}

function dedupeMemoryDiaryTexts(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const compacted = compactMemoryDiaryText(sanitizeMemoryDiaryText(value), 220)
    const key = normalizeMemoryDiaryTextKey(compacted)
    if (!key || hasSimilarMemoryDiaryTextKey(seen, key)) continue
    seen.add(key)
    result.push(compacted)
  }

  return result
}

function compactMemoryDiaryText(value: string, maxLength: number): string {
  const normalized = sanitizeMemoryDiaryText(value)
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function normalizeMemoryDiaryTextKey(value: string): string {
  return sanitizeMemoryDiaryText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[url_with_credentials\]/g, '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
    .replace(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasSimilarMemoryDiaryTextKey(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) return true
  if (key.length < 40) return false

  for (const existing of seen) {
    if (existing.length < 40) continue
    if (existing.includes(key) || key.includes(existing)) return true
    if (calculateMemoryDiaryTextSimilarity(existing, key) >= 0.82) return true
  }

  return false
}

function calculateMemoryDiaryTextSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.split(/\s+/).filter((token) => token.length >= 3))
  const rightTokens = new Set(right.split(/\s+/).filter((token) => token.length >= 3))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1
  }
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union === 0 ? 0 : intersection / union
}

function isLowValueMemoryDiaryText(value: string): boolean {
  const normalized = sanitizeMemoryDiaryText(value)
  return MEMORY_DIARY_LOW_VALUE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function sanitizeMemoryDiaryText(value: string): string {
  return value
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\[URL_WITH_CREDENTIALS\]/gi, '')
    .replace(/https?:\/\/localhost:\d+\S*/gi, '本地服务')
    .replace(/\bsp-[A-Za-z0-9_-]{4,}\b/g, 'API_TOKEN')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeMemoryDiaryTitle(value: string): string {
  return sanitizeMemoryDiaryText(value)
    .replace(/\s+[-|—]\s+$/, '')
    .trim()
}

function sanitizeMemoryDiaryUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || /\[URL_WITH_CREDENTIALS\]/i.test(trimmed)) return ''
  return trimmed
}

function normalizeMemoryDiaryAppName(appName: string, windowName: string, text: string): string {
  const raw = sanitizeMemoryDiaryTitle(appName)
  const lowerRaw = raw.toLowerCase()
  const context = `${raw} ${windowName} ${text}`.toLowerCase()
  const shellAlias = MEMORY_DIARY_SHELL_APP_ALIASES.get(lowerRaw)

  if (!raw || shellAlias) {
    for (const alias of MEMORY_DIARY_CONTEXT_APP_ALIASES) {
      if (alias.patterns.some((pattern) => pattern.test(context))) {
        return alias.app
      }
    }
  }

  if (shellAlias) return shellAlias
  if (lowerRaw.endsWith('.exe')) return raw.slice(0, -4) || raw
  return raw
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
      const normalizedPart = normalizeMemoryDiaryProjectHint(part)
      if (!normalizedPart) continue
      if (/\.[a-z0-9]{1,6}\b/i.test(normalizedPart)) {
        fileHints.push(normalizedPart)
      } else if (isUsefulMemoryDiaryProjectHint(part)) {
        projectHints.push(normalizedPart)
      }
    }
  }

  const titleCaseMatches = candidateText.match(/\b[A-Z][A-Za-z0-9]*(?:[A-Z][A-Za-z0-9]+)+\b/g) || []
  for (const match of titleCaseMatches) {
    if (fileHints.some((hint) => hint.toLowerCase().startsWith(`${match.toLowerCase()}.`))) {
      continue
    }
    const normalizedMatch = normalizeMemoryDiaryProjectHint(match)
    if (normalizedMatch && isUsefulMemoryDiaryProjectHint(normalizedMatch) && !/\.[a-z0-9]{1,6}$/i.test(normalizedMatch)) {
      projectHints.push(normalizedMatch)
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

function normalizeMemoryDiaryProjectHint(value: string): string {
  const normalized = sanitizeMemoryDiaryTitle(value)
  if (!normalized) return ''
  if (/onetool/i.test(normalized)) return 'OneTool'
  if (/screenpipe/i.test(normalized)) return 'ScreenPipe'
  return normalized
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

function getMemoryDiaryPrimaryProject(
  insight: MemoryDiaryTimelineInsight,
  items: MemoryDiaryItem[]
): string {
  const hint = insight.projectHints.find((value) => isPrimaryMemoryDiaryProjectHint(value))
  if (hint) return hint

  const context = [
    ...items.flatMap((item) => [item.appName, item.windowName, item.text]),
    ...insight.evidenceTexts
  ].join(' ')
  if (/onetool/i.test(context)) return 'OneTool'
  if (/screenpipe/i.test(context)) return 'ScreenPipe'
  return ''
}

function isPrimaryMemoryDiaryProjectHint(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false
  if (/\.[a-z0-9]{1,6}\b/i.test(normalized)) return false
  if (MEMORY_DIARY_GENERIC_PROJECT_WORDS.has(normalized.toLowerCase())) return false
  if (['记忆日报', '时间线', '数据来源', '数据理解层', '界面'].includes(normalized)) return false
  return true
}

function extractMemoryDiaryEventTopics(
  insight: MemoryDiaryTimelineInsight,
  items: MemoryDiaryItem[],
  primaryProject: string
): string[] {
  const context = [
    ...items.flatMap((item) => [item.appName, item.windowName, item.url, item.text]),
    ...insight.evidenceTexts,
    ...insight.keywords,
    ...insight.projectHints
  ].join(' ')
  const topics: string[] = []

  for (const topic of MEMORY_DIARY_FEATURE_TOPICS) {
    if (topic.label !== primaryProject && topic.patterns.some((pattern) => pattern.test(context))) {
      topics.push(topic.label)
    }
  }

  for (const hint of insight.projectHints) {
    if (hint === primaryProject) continue
    if (/\.[a-z0-9]{1,6}\b/i.test(hint)) {
      topics.push(hint)
    }
  }

  for (const keyword of insight.keywords) {
    const normalized = normalizeMemoryDiaryTopicKeyword(keyword)
    if (normalized && normalized !== primaryProject) {
      topics.push(normalized)
    }
  }

  return uniqueMemoryDiaryValues(topics).slice(0, 6)
}

function normalizeMemoryDiaryTopicKeyword(value: string): string {
  const normalized = value.trim()
  const lower = normalized.toLowerCase()
  if (!normalized || MEMORY_DIARY_STOP_WORDS.has(lower)) return ''
  if (/记忆日报|日报草稿/.test(normalized)) return ''
  if (/相关内容|相关工作|不要|了解/.test(normalized)) return ''
  if (/screenpipe/i.test(normalized)) return 'ScreenPipe'
  if (/timeline/i.test(normalized)) return '时间线'
  if (/memorydiary/i.test(normalized)) return ''
  if (lower === 'bridge') return '桥接'
  if (lower === 'understanding') return '数据理解层'
  if (normalized.length > 24) return ''
  return normalized
}

function getMemoryDiaryEventVerb(
  insight: MemoryDiaryTimelineInsight,
  topics: string[]
): string {
  const text = [...insight.evidenceTexts, ...insight.keywords, ...topics].join(' ').toLowerCase()
  if (insight.activityKind === 'development') {
    if (/screenpipe|数据理解层|调试|debug|修复|fix|失败|报错|启动/.test(text)) return '调试'
    if (/界面|ui|布局|展示|优化/.test(text)) return '优化'
    return '开发'
  }
  if (insight.activityKind === 'research') return '查阅'
  if (insight.activityKind === 'writing') return '撰写'
  if (insight.activityKind === 'communication') return '处理'
  if (insight.activityKind === 'media') return '处理'
  if (insight.activityKind === 'operations') return '配置'
  if (insight.activityKind === 'browsing') return '浏览'
  return '处理'
}

function buildMemoryDiaryEventTitle(
  insight: MemoryDiaryTimelineInsight,
  verb: string,
  primaryProject: string,
  primaryApp: string,
  topics: string[]
): string {
  if (primaryProject) {
    return `${verb} ${primaryProject}`
  }
  if (topics[0]) {
    return `${verb} ${topics[0]}`
  }
  return `${insight.activityLabel} · ${primaryApp}`
}

function buildMemoryDiaryEventSummary(
  insight: MemoryDiaryTimelineInsight,
  verb: string,
  primaryApp: string,
  primaryProject: string,
  topics: string[]
): string {
  const target = primaryProject || topics[0] || '当前任务'
  const details = selectMemoryDiaryConcreteDetails(insight.evidenceTexts)

  if (details.length > 0) {
    const action = target === primaryApp ? verb : `${verb} ${target}`
    return `主要在 ${primaryApp} ${action}：${details.slice(0, 2).join('；')}。`
  }

  const summaryTopics = topics.slice(0, 3)
  return summaryTopics.length > 0
    ? `围绕 ${summaryTopics.join('、')}进行${insight.activityLabel}，主要使用 ${primaryApp}。`
    : `主要使用 ${primaryApp}进行${insight.activityLabel}。`
}

function selectMemoryDiaryConcreteDetails(values: string[]): string[] {
  const details = values
    .map((value) => compactMemoryDiaryText(value, 96))
    .filter((value) => value.length >= 12)
    .filter((value) => !isLowValueMemoryDiaryText(value))
    .filter((value) => !/^在.+上.+了解.+相关内容。?$/.test(value))

  return dedupeMemoryDiaryTexts(details).slice(0, 3)
}

function getMemoryDiaryBucketWorkSubject(bucket: MemoryDiaryTimelineBucket): string {
  if (bucket.event?.primaryProject) return bucket.event.primaryProject
  const project = bucket.insight.projectHints.find((hint) => isPrimaryMemoryDiaryProjectHint(hint))
  if (project) return project
  return bucket.insight.dominantAppName
}

function getMemoryDiaryFocusBlockSubject(block: MemoryDiaryFocusBlock): string {
  return block.projectHints.find((hint) => isPrimaryMemoryDiaryProjectHint(hint)) || block.appName
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
    const subject = getMemoryDiaryBucketWorkSubject(bucket)
    const previousSubject = previous ? getMemoryDiaryFocusBlockSubject(previous) : ''
    const sameActivity = previous?.activityKind === insight.activityKind
    const sameApp = previous?.appName === insight.dominantAppName
    const sameSubject = previousSubject && subject && previousSubject === subject
    const touchesPrevious = previous?.end === bucket.start

    if (previous && sameActivity && touchesPrevious && (sameSubject || sameApp)) {
      previous.end = bucket.end
      previous.bucketCount += 1
      previous.recordCount += bucket.items.length
      previous.projectHints = uniqueMemoryDiaryValues([...previous.projectHints, ...insight.projectHints]).slice(0, 4)
      previous.title = `${insight.activityLabel} · ${sameSubject ? subject : insight.dominantAppName}`
      continue
    }

    blocks.push({
      title: `${insight.activityLabel} · ${subject || insight.dominantAppName}`,
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
