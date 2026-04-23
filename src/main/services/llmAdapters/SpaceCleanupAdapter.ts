import type { LlmInsight, LlmSpaceCleanupSuggestionRequest } from '../../../shared/llm'
import { formatBytes, normalizeInsight, type StructuredCompletionPrompts } from './shared'

export class SpaceCleanupAdapter {
  buildCompletion(input: LlmSpaceCleanupSuggestionRequest): StructuredCompletionPrompts {
    const largestFileLines = input.largestFiles
      .slice(0, 10)
      .map((item, index) => `${index + 1}. ${item.name} (${formatBytes(item.sizeBytes)}) ${item.path}`)
      .join('\n')

    return {
      systemPrompt: [
        '你是磁盘空间清理助手。',
        '目标是给出低风险、可执行的清理建议。',
        '默认先建议可回收、可迁移、可归档的内容，不要建议直接删除系统文件。',
        '只返回 JSON：{"summary":"","bullets":[],"warnings":[],"actions":[]}'
      ].join('\n'),
      userPrompt: [
        `扫描根目录：${input.rootPath}`,
        `总占用：${formatBytes(input.summary.totalBytes)}`,
        `文件数：${input.summary.scannedFiles}`,
        `目录数：${input.summary.scannedDirectories}`,
        `跳过项：${input.summary.skippedEntries}`,
        largestFileLines ? `[最大文件]\n${largestFileLines}` : ''
      ].filter(Boolean).join('\n')
    }
  }

  mapInsightResult(payload: Partial<LlmInsight>): LlmInsight {
    return normalizeInsight(payload, '已生成当前目录的清理建议')
  }
}
