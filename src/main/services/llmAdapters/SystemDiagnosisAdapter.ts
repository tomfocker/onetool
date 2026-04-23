import type { LlmInsight, LlmSystemAnalysisRequest } from '../../../shared/llm'
import { normalizeInsight, type StructuredCompletionPrompts } from './shared'

export class SystemDiagnosisAdapter {
  buildCompletion(input: LlmSystemAnalysisRequest): StructuredCompletionPrompts {
    const doctorLines = Object.entries(input.doctorReport ?? {})
      .map(([key, value]) => `${key}: ${value.ok ? 'OK' : 'FAIL'} ${value.version || value.path || value.executionPolicy || value.error || ''}`.trim())
      .join('\n')

    return {
      systemPrompt: [
        '你是 Windows 工具箱的硬件与环境诊断助手。',
        '只根据给定快照和依赖自检结果给建议，不要编造不存在的信息。',
        '优先输出可执行建议，避免泛泛而谈。',
        '只返回 JSON：{"summary":"","bullets":[],"warnings":[],"actions":[]}'
      ].join('\n'),
      userPrompt: [
        `设备型号: ${input.config.deviceModel}`,
        `CPU: ${input.config.cpu}`,
        `GPU: ${input.config.gpu}`,
        `内存: ${input.config.memory}`,
        `显示器: ${input.config.monitor}`,
        `磁盘: ${input.config.disk}`,
        `系统: ${input.config.os}`,
        doctorLines ? `[依赖自检]\n${doctorLines}` : ''
      ].filter(Boolean).join('\n')
    }
  }

  mapInsightResult(payload: Partial<LlmInsight>): LlmInsight {
    return normalizeInsight(payload, '当前设备整体状态可用')
  }
}
