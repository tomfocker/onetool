export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  latestVersion: string | null
  releaseNotes: string | null
  progressPercent: number | null
  errorMessage: string | null
}

export interface UpdateVersionDetails {
  currentVersion: string
  latestVersion: string
  releaseNotes: string | null
}

export interface UpdateDownloadDetails {
  currentVersion: string
  latestVersion: string
  progressPercent: number
}

export function createIdleUpdateState(currentVersion: string): UpdateState {
  return {
    status: 'idle',
    currentVersion,
    latestVersion: null,
    releaseNotes: null,
    progressPercent: null,
    errorMessage: null
  }
}

export function createAvailableUpdateState(details: UpdateVersionDetails): UpdateState {
  return {
    status: 'available',
    currentVersion: details.currentVersion,
    latestVersion: details.latestVersion,
    releaseNotes: details.releaseNotes,
    progressPercent: null,
    errorMessage: null
  }
}

export function createDownloadingUpdateState(details: UpdateDownloadDetails): UpdateState {
  return {
    status: 'downloading',
    currentVersion: details.currentVersion,
    latestVersion: details.latestVersion,
    releaseNotes: null,
    progressPercent: Math.round(details.progressPercent),
    errorMessage: null
  }
}
