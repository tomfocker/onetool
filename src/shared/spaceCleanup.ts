export type SpaceCleanupScanStatus =
  | 'idle'
  | 'scanning'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type SpaceCleanupNodeType = 'file' | 'directory'

export type SpaceCleanupLargestFile = {
  path: string
  name: string
  sizeBytes: number
  extension: string | null
}

export type SpaceCleanupNode = {
  id: string
  name: string
  path: string
  type: SpaceCleanupNodeType
  sizeBytes: number
  childrenCount: number
  fileCount: number
  directoryCount: number
  skippedChildren: number
  extension?: string | null
  children?: SpaceCleanupNode[]
}

export type SpaceCleanupSummary = {
  totalBytes: number
  scannedFiles: number
  scannedDirectories: number
  skippedEntries: number
  largestFile: SpaceCleanupLargestFile | null
}

export type SpaceCleanupSession = {
  sessionId: string
  rootPath: string | null
  status: SpaceCleanupScanStatus
  startedAt: string | null
  finishedAt: string | null
  summary: SpaceCleanupSummary
  largestFiles: SpaceCleanupLargestFile[]
  tree: SpaceCleanupNode | null
  error: string | null
}

export function createEmptySpaceCleanupSummary(): SpaceCleanupSummary {
  return {
    totalBytes: 0,
    scannedFiles: 0,
    scannedDirectories: 0,
    skippedEntries: 0,
    largestFile: null
  }
}

export function createIdleSpaceCleanupSession(): SpaceCleanupSession {
  return {
    sessionId: 'idle',
    rootPath: null,
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    summary: createEmptySpaceCleanupSummary(),
    largestFiles: [],
    tree: null,
    error: null
  }
}

export function trimLargestFiles(
  current: SpaceCleanupLargestFile[],
  candidate: SpaceCleanupLargestFile,
  maxCount = 100
) {
  return [...current, candidate]
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .slice(0, maxCount)
}

export function getSpaceCleanupSummary(root: SpaceCleanupNode | null): SpaceCleanupSummary {
  if (!root) {
    return createEmptySpaceCleanupSummary()
  }

  return {
    totalBytes: root.sizeBytes,
    scannedFiles: root.fileCount,
    scannedDirectories: root.directoryCount + (root.type === 'directory' ? 1 : 0),
    skippedEntries: root.skippedChildren,
    largestFile: null
  }
}

export function getRenderableTreemapChildren(children: SpaceCleanupNode[] | undefined | null) {
  return (children ?? [])
    .filter((child) => child.sizeBytes > 0)
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
}

export function formatSpaceCleanupBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}
