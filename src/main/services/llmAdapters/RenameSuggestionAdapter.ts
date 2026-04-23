import type { LlmRenameInputFile, LlmRenameSuggestion } from '../../../shared/llm'
import { formatBytes, normalizeRenameSuggestions, type StructuredCompletionPrompts } from './shared'

export class RenameSuggestionAdapter {
  buildCompletion(input: { instructions: string; files: LlmRenameInputFile[] }): StructuredCompletionPrompts {
    return {
      systemPrompt: [
        '你是文件批量重命名助手。',
        '根据用户目标，为每个文件生成清晰、一致、可落地的新文件名。',
        '不要返回路径，只返回文件名。',
        '只返回 JSON：{"summary":"","namingPattern":"","warnings":[],"suggestions":[{"index":0,"newName":"","reason":""}]}'
      ].join('\n'),
      userPrompt: [
        `用户要求：${input.instructions}`,
        '[文件列表]',
        ...input.files.map((file, index) => `${index}. ${file.name} (${formatBytes(file.size)})`)
      ].join('\n')
    }
  }

  mapSuggestionResult(
    input: { instructions: string; files: LlmRenameInputFile[] },
    payload: {
      summary?: unknown
      namingPattern?: unknown
      warnings?: unknown
      suggestions?: Array<{ index?: number; newName?: string; reason?: string | null }>
    }
  ): LlmRenameSuggestion {
    return normalizeRenameSuggestions(input, payload)
  }
}
