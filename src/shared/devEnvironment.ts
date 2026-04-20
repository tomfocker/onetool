export const DEV_ENVIRONMENT_IDS = [
  'nodejs',
  'npm',
  'git',
  'python',
  'pip',
  'go',
  'java',
  'wsl'
] as const

export type DevEnvironmentId = typeof DEV_ENVIRONMENT_IDS[number]

export type DevEnvironmentStatus =
  | 'installed'
  | 'missing'
  | 'broken'
  | 'available-update'
  | 'linked'
  | 'external'

export type DevEnvironmentManager =
  | 'winget'
  | 'bundled-with-node'
  | 'bundled-with-python'
  | 'external-wsl'
  | 'unknown'

export type DevEnvironmentRecord = {
  id: DevEnvironmentId
  status: DevEnvironmentStatus
  detectedVersion: string | null
  resolvedPath: string | null
  manager: DevEnvironmentManager
  canInstall: boolean
  canUpdate: boolean
  notes: string[]
}

export type DevEnvironmentOverview = {
  records: DevEnvironmentRecord[]
  summary: ReturnType<typeof getDevEnvironmentSummary>
  checkedAt: string
  wingetAvailable: boolean
}

export const DEV_ENVIRONMENT_WINGET_TARGETS: Record<string, string> = {
  nodejs: 'OpenJS.NodeJS.LTS',
  git: 'Git.Git',
  python: 'Python.Python.3.12',
  go: 'GoLang.Go',
  java: 'Microsoft.OpenJDK.17'
}

export const DEFAULT_PINNED_TOOL_IDS = [
  'quick-installer',
  'screen-recorder',
  'screenshot-tool',
  'clipboard-manager'
] as const

export function normalizePinnedToolIds(
  value: string[] | null | undefined,
  validToolIds: string[],
  maxCount = 6
) {
  const validToolIdSet = new Set(validToolIds)
  const normalized: string[] = []

  for (const item of value ?? []) {
    if (!validToolIdSet.has(item) || normalized.includes(item)) {
      continue
    }

    normalized.push(item)
    if (normalized.length >= maxCount) {
      break
    }
  }

  return normalized
}

export function getDevEnvironmentSummary(records: Array<{ status: DevEnvironmentStatus }>) {
  return records.reduce(
    (summary, record) => {
      if (record.status === 'installed') summary.installedCount += 1
      if (record.status === 'missing') summary.missingCount += 1
      if (record.status === 'broken') summary.brokenCount += 1
      if (record.status === 'available-update') summary.updateCount += 1
      if (record.status === 'linked') summary.linkedCount += 1
      if (record.status === 'external') summary.externalCount += 1
      return summary
    },
    {
      installedCount: 0,
      missingCount: 0,
      brokenCount: 0,
      updateCount: 0,
      linkedCount: 0,
      externalCount: 0
    }
  )
}
