import type { SystemConfig } from './types'

export type LlmConfigField = 'baseUrl' | 'apiKey' | 'model'

export interface LlmConfigStatus {
  configured: boolean
  baseUrl: string
  model: string
  missing: LlmConfigField[]
}

export interface LlmConnectionStatus {
  provider: string
  model: string
}

export interface LlmInsight {
  summary: string
  bullets: string[]
  warnings: string[]
  actions: string[]
}

export interface LlmRenameInputFile {
  name: string
  path: string
  size: number
}

export interface LlmRenameSuggestionItem {
  index: number
  oldName?: string
  newName: string
  reason?: string | null
}

export interface LlmRenameSuggestion {
  summary: string
  namingPattern: string
  warnings: string[]
  suggestions: LlmRenameSuggestionItem[]
}

export interface LlmSystemAuditEntry {
  ok: boolean
  version?: string
  error?: string
  path?: string
  executionPolicy?: string
  writable?: boolean
}

export type LlmSystemAuditReport = Record<string, LlmSystemAuditEntry>

export interface LlmSystemAnalysisRequest {
  config: SystemConfig
  doctorReport: LlmSystemAuditReport | null
}

export interface LlmSpaceCleanupSummaryInput {
  totalBytes: number
  scannedFiles: number
  scannedDirectories: number
  skippedEntries: number
}

export interface LlmSpaceCleanupLargestFileInput {
  path: string
  name: string
  sizeBytes: number
  extension?: string
}

export interface LlmSpaceCleanupSuggestionRequest {
  rootPath: string
  summary: LlmSpaceCleanupSummaryInput
  largestFiles: LlmSpaceCleanupLargestFileInput[]
}

export type ScreenOverlayMode = 'ocr' | 'translate'

export interface ScreenOverlaySessionStartPayload {
  mode: ScreenOverlayMode
}

export interface ScreenOverlayLineResult {
  index: number
  text: string
  translatedText: string | null
  x: number
  y: number
  width: number
  height: number
}
