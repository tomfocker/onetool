export const TABLE_OCR_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] as const

export type TableOcrInstallStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

export type TableOcrLogLevel = 'info' | 'progress' | 'success' | 'error'

export interface TableOcrLogEntry {
  id: string
  timestamp: string
  level: TableOcrLogLevel
  message: string
}

export interface TableOcrRuntimeStatus {
  ready: boolean
  resourceRoot: string | null
  userRuntimeRoot: string | null
  pythonPath: string | null
  scriptPath: string | null
  installScriptPath: string | null
  missingPackages: string[]
  missingRuntimeFiles: string[]
  installStatus: TableOcrInstallStatus
  logs: TableOcrLogEntry[]
  lastError: string | null
}

export interface TableOcrRecognizeRequest {
  inputPath?: string
  imageDataUrl?: string
  outputDirectory?: string
  fileName?: string
}

export interface TableOcrRecognizeResult {
  outputPath: string
  outputDirectory: string
  htmlPath?: string | null
  jsonPath?: string | null
}

export interface TableOcrChoosePathResult {
  canceled: boolean
  path: string | null
}

export function trimTableOcrLogs(logs: TableOcrLogEntry[], limit = 300) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return []
  }

  if (logs.length <= limit) {
    return logs
  }

  return logs.slice(-limit)
}
