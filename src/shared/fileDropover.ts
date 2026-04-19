export interface DroppedFileLike {
  name?: string
  path?: string | null
}

export interface StoredFileLike {
  id: string
  path: string
  name: string
  isDirectory: boolean
}

function getFileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] || normalized
}

function resolveDroppedFilePath(
  file: DroppedFileLike,
  getPathForFile?: (file: DroppedFileLike) => string | null | undefined
): string {
  try {
    const resolved = String(getPathForFile?.(file) ?? '').trim()
    if (resolved !== '') {
      return resolved
    }
  } catch (_error) {
    // Fall back to the legacy file.path field when Electron path helpers are unavailable.
  }

  return String(file.path ?? '').trim()
}

export function buildStoredFiles(
  files: DroppedFileLike[],
  getPathForFile?: (file: DroppedFileLike) => string | null | undefined,
  now = Date.now()
): StoredFileLike[] {
  return files.flatMap((file, index) => {
    const resolvedPath = resolveDroppedFilePath(file, getPathForFile)
    if (resolvedPath === '') {
      return []
    }

    return [{
      id: `${now}-${index}`,
      path: resolvedPath,
      name: String(file.name || '').trim() || getFileNameFromPath(resolvedPath),
      isDirectory: false
    }]
  })
}

export function getInitialFloatBallVisibility(savedValue: string | null | undefined): boolean {
  return savedValue !== 'false'
}

export function resolveFloatBallVisibilityState(
  actualVisible: boolean | null | undefined,
  savedValue: string | null | undefined
): boolean {
  if (typeof actualVisible === 'boolean') {
    return actualVisible
  }

  return getInitialFloatBallVisibility(savedValue)
}
