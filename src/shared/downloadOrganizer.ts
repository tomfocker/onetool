export type DownloadOrganizerCategory =
  | 'installer'
  | 'archive'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'code'
  | 'other'

export type DownloadOrganizerEntryType = 'file' | 'directory'

export type DownloadOrganizerConflictPolicy = 'skip' | 'rename' | 'overwrite'

export type DownloadOrganizerRuleConditions = {
  categories?: DownloadOrganizerCategory[]
  extensions?: string[]
  nameIncludes?: string[]
  minSizeBytes?: number | null
  maxSizeBytes?: number | null
  minAgeDays?: number | null
  maxAgeDays?: number | null
}

export type DownloadOrganizerRuleAction = {
  targetPathTemplate: string
}

export type DownloadOrganizerRule = {
  id: string
  name: string
  enabled: boolean
  conditions: DownloadOrganizerRuleConditions
  action: DownloadOrganizerRuleAction
}

export type DownloadOrganizerConfig = {
  enabled: boolean
  watchPath: string
  destinationRoot: string
  conflictPolicy: DownloadOrganizerConflictPolicy
  stableWindowMs: number
  ignoredExtensions: string[]
  rules: DownloadOrganizerRule[]
}

export type DownloadOrganizerCandidate = {
  entryType: DownloadOrganizerEntryType
  sourcePath: string
  fileName: string
  extension: string
  sizeBytes: number
  modifiedAt: string
  category: DownloadOrganizerCategory
}

export type DownloadOrganizerPreviewStatus =
  | 'ready'
  | 'moved'
  | 'skipped'
  | 'failed'

export type DownloadOrganizerPreviewItem = DownloadOrganizerCandidate & {
  id: string
  matchedRuleId: string | null
  matchedRuleName: string | null
  targetRelativePath: string | null
  targetPath: string | null
  status: DownloadOrganizerPreviewStatus
  reason: string | null
}

export type DownloadOrganizerActivity = {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
  sourcePath?: string | null
  targetPath?: string | null
}

export type DownloadOrganizerStoredState = {
  config: DownloadOrganizerConfig
  lastPreviewAt: string | null
  lastPreviewItems: DownloadOrganizerPreviewItem[]
  activity: DownloadOrganizerActivity[]
}

export type DownloadOrganizerState = DownloadOrganizerStoredState & {
  watcherActive: boolean
  lastError: string | null
}

const DEFAULT_RULE_ORDER = [
  'installers',
  'archives',
  'images',
  'videos',
  'audio',
  'documents',
  'code',
  'others'
] as const

const CATEGORY_EXTENSIONS: Record<DownloadOrganizerCategory, string[]> = {
  installer: ['.exe', '.msi', '.msix', '.appx', '.appxbundle'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
  video: ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'],
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv'],
  code: ['.js', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml', '.ps1', '.bat', '.sh', '.py'],
  other: []
}

function normalizeExtension(input: string) {
  if (!input) {
    return ''
  }

  const extension = input.startsWith('.') ? input : `.${input}`
  return extension.toLowerCase()
}

function sanitizePathSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim()
}

export function classifyDownloadOrganizerCategory(fileName: string): DownloadOrganizerCategory {
  const extension = normalizeExtension(fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '')

  for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS) as Array<[DownloadOrganizerCategory, string[]]>) {
    if (extensions.includes(extension)) {
      return category
    }
  }

  return 'other'
}

export function matchDownloadOrganizerRule(
  candidate: DownloadOrganizerCandidate,
  rule: DownloadOrganizerRule,
  now = Date.now()
) {
  if (!rule.enabled) {
    return false
  }

  const { conditions } = rule
  const candidateName = candidate.fileName.toLowerCase()
  const candidateExtension = normalizeExtension(candidate.extension)
  const ageDays = Math.max(0, (now - new Date(candidate.modifiedAt).getTime()) / 86400000)

  if (conditions.categories?.length && !conditions.categories.includes(candidate.category)) {
    return false
  }

  if (conditions.extensions?.length) {
    const normalizedExtensions = conditions.extensions.map(normalizeExtension)
    if (!normalizedExtensions.includes(candidateExtension)) {
      return false
    }
  }

  if (conditions.nameIncludes?.length) {
    const hasKeyword = conditions.nameIncludes.every((keyword) => candidateName.includes(keyword.toLowerCase()))
    if (!hasKeyword) {
      return false
    }
  }

  if (typeof conditions.minSizeBytes === 'number' && candidate.sizeBytes < conditions.minSizeBytes) {
    return false
  }

  if (typeof conditions.maxSizeBytes === 'number' && candidate.sizeBytes > conditions.maxSizeBytes) {
    return false
  }

  if (typeof conditions.minAgeDays === 'number' && ageDays < conditions.minAgeDays) {
    return false
  }

  if (typeof conditions.maxAgeDays === 'number' && ageDays > conditions.maxAgeDays) {
    return false
  }

  return true
}

export function renderDownloadOrganizerTargetPath(
  template: string,
  candidate: Pick<DownloadOrganizerCandidate, 'fileName' | 'extension' | 'category' | 'modifiedAt'>
) {
  const modifiedAt = new Date(candidate.modifiedAt)
  const year = String(modifiedAt.getUTCFullYear())
  const month = String(modifiedAt.getUTCMonth() + 1).padStart(2, '0')
  const ext = normalizeExtension(candidate.extension).replace(/^\./, '') || 'unknown'

  const rendered = template
    .replaceAll('{category}', candidate.category)
    .replaceAll('{ext}', ext)
    .replaceAll('{yyyy}', year)
    .replaceAll('{mm}', month)
    .replaceAll('{yyyy-mm}', `${year}-${month}`)

  return rendered
    .split(/[\\/]+/)
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean)
    .join('/')
}

export function createConflictResolvedPath(targetPath: string, attempt: number) {
  if (!Number.isFinite(attempt) || attempt <= 0) {
    return targetPath
  }

  const lastSeparator = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'))
  const directory = lastSeparator >= 0 ? targetPath.slice(0, lastSeparator + 1) : ''
  const fileName = lastSeparator >= 0 ? targetPath.slice(lastSeparator + 1) : targetPath
  const dotIndex = fileName.lastIndexOf('.')

  if (dotIndex <= 0) {
    return `${directory}${fileName} (${attempt})`
  }

  const baseName = fileName.slice(0, dotIndex)
  const extension = fileName.slice(dotIndex)
  return `${directory}${baseName} (${attempt})${extension}`
}

export function createDefaultDownloadOrganizerRules(): DownloadOrganizerRule[] {
  return [
    {
      id: 'installers',
      name: '安装包',
      enabled: true,
      conditions: {
        categories: ['installer']
      },
      action: {
        targetPathTemplate: '安装包/{yyyy-mm}'
      }
    },
    {
      id: 'archives',
      name: '压缩包',
      enabled: true,
      conditions: {
        categories: ['archive']
      },
      action: {
        targetPathTemplate: '压缩包/{yyyy-mm}'
      }
    },
    {
      id: 'images',
      name: '图片',
      enabled: true,
      conditions: {
        categories: ['image']
      },
      action: {
        targetPathTemplate: '图片/{yyyy-mm}'
      }
    },
    {
      id: 'videos',
      name: '视频',
      enabled: true,
      conditions: {
        categories: ['video']
      },
      action: {
        targetPathTemplate: '视频/{yyyy-mm}'
      }
    },
    {
      id: 'audio',
      name: '音频',
      enabled: true,
      conditions: {
        categories: ['audio']
      },
      action: {
        targetPathTemplate: '音频/{yyyy-mm}'
      }
    },
    {
      id: 'documents',
      name: '文档',
      enabled: true,
      conditions: {
        categories: ['document']
      },
      action: {
        targetPathTemplate: '文档/{yyyy-mm}'
      }
    },
    {
      id: 'code',
      name: '代码',
      enabled: true,
      conditions: {
        categories: ['code']
      },
      action: {
        targetPathTemplate: '代码/{yyyy-mm}'
      }
    },
    {
      id: 'others',
      name: '其他',
      enabled: true,
      conditions: {
        categories: ['other']
      },
      action: {
        targetPathTemplate: '其他/{yyyy-mm}'
      }
    }
  ]
}

export function mergeMissingDefaultDownloadOrganizerRules(rules: DownloadOrganizerRule[]) {
  const existingIds = new Set(rules.map((rule) => rule.id))
  const mergedRules = [...rules]

  for (const rule of createDefaultDownloadOrganizerRules()) {
    if (!existingIds.has(rule.id)) {
      mergedRules.push(rule)
    }
  }

  return mergedRules.sort((left, right) => {
    const leftIndex = DEFAULT_RULE_ORDER.indexOf(left.id as (typeof DEFAULT_RULE_ORDER)[number])
    const rightIndex = DEFAULT_RULE_ORDER.indexOf(right.id as (typeof DEFAULT_RULE_ORDER)[number])

    if (leftIndex === -1 && rightIndex === -1) {
      return 0
    }

    if (leftIndex === -1) {
      return 1
    }

    if (rightIndex === -1) {
      return -1
    }

    return leftIndex - rightIndex
  })
}

export function createDefaultDownloadOrganizerStoredState(): DownloadOrganizerStoredState {
  return {
    config: {
      enabled: false,
      watchPath: '',
      destinationRoot: '',
      conflictPolicy: 'rename',
      stableWindowMs: 1200,
      ignoredExtensions: ['.crdownload', '.tmp', '.part'],
      rules: createDefaultDownloadOrganizerRules()
    },
    lastPreviewAt: null,
    lastPreviewItems: [],
    activity: []
  }
}
