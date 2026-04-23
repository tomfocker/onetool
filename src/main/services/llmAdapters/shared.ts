import path from 'path'
import type {
  LlmInsight,
  LlmRenameInputFile,
  LlmRenameSuggestion,
  LlmRenameSuggestionItem
} from '../../../shared/llm'

export type StructuredCompletionPrompts = {
  systemPrompt: string
  userPrompt: string
}

export function sanitizeList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean)
    .slice(0, 8)
}

export function sanitizeText(input: unknown, fallback: string): string {
  return typeof input === 'string' && input.trim() ? input.trim() : fallback
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function getExtension(fileName: string): string {
  return path.extname(fileName || '')
}

export function ensureExtension(newName: string, originalName: string): string {
  const originalExtension = getExtension(originalName)
  if (!originalExtension) {
    return newName.trim()
  }

  return getExtension(newName) ? newName.trim() : `${newName.trim()}${originalExtension}`
}

export function normalizeInsight(payload: Partial<LlmInsight>, fallbackSummary: string): LlmInsight {
  return {
    summary: sanitizeText(payload.summary, fallbackSummary),
    bullets: sanitizeList(payload.bullets),
    warnings: sanitizeList(payload.warnings),
    actions: sanitizeList(payload.actions)
  }
}

export function normalizeRenameSuggestions(
  input: { files: LlmRenameInputFile[] },
  payload: {
    summary?: unknown
    namingPattern?: unknown
    warnings?: unknown
    suggestions?: Array<{ index?: number; newName?: string; reason?: string | null }>
  }
): LlmRenameSuggestion {
  const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : []
  const normalizedSuggestions: LlmRenameSuggestionItem[] = input.files.map((file, index) => {
    const matched = suggestions.find((item) => item?.index === index)
    const rawNewName = sanitizeText(matched?.newName, file.name)
    return {
      index,
      oldName: file.name,
      newName: ensureExtension(rawNewName, file.name),
      reason: typeof matched?.reason === 'string' ? matched.reason.trim() : null
    }
  })

  return {
    summary: sanitizeText(payload.summary, '已生成一组建议命名'),
    namingPattern: sanitizeText(payload.namingPattern, '统一命名'),
    warnings: sanitizeList(payload.warnings),
    suggestions: normalizedSuggestions
  }
}
