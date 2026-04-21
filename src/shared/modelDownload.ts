export type ModelDownloadPlatform = 'huggingface' | 'modelscope'

export type ModelDownloadStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

export type ModelDownloadLogLevel = 'info' | 'progress' | 'success' | 'error'

export type ModelDownloadRequest = {
  platform: ModelDownloadPlatform
  repoId: string
  filePath: string
  savePath: string
  hfToken: string
  useHfMirror: boolean
}

export type ModelDownloadLogEntry = {
  id: string
  timestamp: string
  level: ModelDownloadLogLevel
  message: string
}

export type ModelDownloadRuntimeState = {
  ready: boolean
  resourceRoot: string | null
  pythonPath: string | null
  scriptPath: string | null
}

export type ModelDownloadState = {
  status: ModelDownloadStatus
  defaultSavePath: string
  currentRequest: ModelDownloadRequest | null
  logs: ModelDownloadLogEntry[]
  runtime: ModelDownloadRuntimeState
  lastOutputPath: string | null
  lastError: string | null
}

export function trimModelDownloadLogs(logs: ModelDownloadLogEntry[], limit = 300) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return []
  }

  if (logs.length <= limit) {
    return logs
  }

  return logs.slice(-limit)
}

export function createDefaultModelDownloadState(defaultSavePath: string): ModelDownloadState {
  return {
    status: 'idle',
    defaultSavePath,
    currentRequest: null,
    logs: [],
    runtime: {
      ready: false,
      resourceRoot: null,
      pythonPath: null,
      scriptPath: null
    },
    lastOutputPath: null,
    lastError: null
  }
}
