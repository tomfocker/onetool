import path from 'path'
import type { IpcResponse } from '../../shared/types'
import type {
  LlmConfigField,
  LlmConfigStatus,
  LlmConnectionStatus,
  LlmInsight,
  LlmRenameInputFile,
  LlmRenameSuggestion,
  LlmRenameSuggestionItem,
  ScreenOverlayLineResult,
  ScreenOverlayMode,
  LlmSpaceCleanupSuggestionRequest,
  LlmSystemAnalysisRequest
} from '../../shared/llm'
import { settingsService } from './SettingsService'
import { ocrService, type OcrLine } from './OcrService'

type FetchLike = typeof fetch
type SettingsLike = Pick<typeof settingsService, 'getSettings'>
type OcrLike = Pick<typeof ocrService, 'recognize'>

type StructuredCompletionInput = {
  systemPrompt: string
  userPrompt: string
}

type SharedLlmSettings = {
  apiUrl: string
  apiKey: string
  model: string
}

type LlmServiceDependencies = {
  fetch?: FetchLike
  settingsService?: SettingsLike
  ocrService?: OcrLike
}

function sanitizeList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean)
    .slice(0, 8)
}

function sanitizeText(input: unknown, fallback: string): string {
  return typeof input === 'string' && input.trim() ? input.trim() : fallback
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function getExtension(fileName: string): string {
  return path.extname(fileName || '')
}

function ensureExtension(newName: string, originalName: string): string {
  const originalExtension = getExtension(originalName)
  if (!originalExtension) {
    return newName.trim()
  }

  return getExtension(newName) ? newName.trim() : `${newName.trim()}${originalExtension}`
}

export class LlmService {
  private readonly fetchImpl: FetchLike
  private readonly settings: SettingsLike
  private readonly ocr: OcrLike

  constructor(dependencies: LlmServiceDependencies = {}) {
    this.fetchImpl = dependencies.fetch ?? fetch
    this.settings = dependencies.settingsService ?? settingsService
    this.ocr = dependencies.ocrService ?? ocrService
  }

  getConfigStatus(): IpcResponse<LlmConfigStatus> {
    const config = this.getSharedConfig()
    const missing = this.getMissingConfigFields(config)

    return {
      success: true,
      data: {
        configured: missing.length === 0,
        baseUrl: config.apiUrl,
        model: config.model,
        missing
      }
    }
  }

  async testConnection(): Promise<IpcResponse<LlmConnectionStatus>> {
    const config = this.getSharedConfig()
    const missing = this.getMissingConfigFields(config)
    if (missing.length > 0) {
      return { success: false, error: `LLM 配置不完整：${missing.join(', ')}` }
    }

    try {
      await this.createStructuredCompletion<{ ok?: boolean }>({
        systemPrompt: '你是接口连通性检查器。只返回 JSON：{"ok": true}',
        userPrompt: '请返回 {"ok": true}。'
      })

      return {
        success: true,
        data: {
          provider: new URL(config.apiUrl).host,
          model: config.model
        }
      }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async translateImage(base64Image: string, mode: ScreenOverlayMode = 'translate'): Promise<IpcResponse<ScreenOverlayLineResult[]>> {
    try {
      const ocrResult = await this.ocr.recognize(base64Image)
      if (!ocrResult.success || !ocrResult.data || ocrResult.data.length === 0) {
        return { success: false, error: ocrResult.error || '未识别到有效文字' }
      }

      const ocrLines = ocrResult.data
      if (mode === 'ocr') {
        return {
          success: true,
          data: ocrLines.map((line) => ({
            ...line,
            translatedText: null
          }))
        }
      }

      const payload = await this.createStructuredCompletion<{ lines?: Array<{ index?: number; translatedText?: string }> }>({
        systemPrompt: [
          '你是一个专业的屏幕翻译专家。',
          '输入是带 [index] 标号的 OCR 行文本。',
          '如果原文是中文则翻成英文，否则翻成中文。',
          '保持与输入相同的行数和顺序。',
          '只返回 JSON：{"lines":[{"index":0,"translatedText":"..." }]}。'
        ].join('\n'),
        userPrompt: ocrLines.map((line) => `[${line.index}] ${line.text}`).join('\n')
      })

      const translatedLines = Array.isArray(payload.lines) ? payload.lines : []
      return {
        success: true,
        data: ocrLines.map((line) => {
          const matched = translatedLines.find((item) => item?.index === line.index)
          return {
            ...line,
            translatedText: sanitizeText(matched?.translatedText, '翻译失败')
          }
        })
      }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async analyzeSystem(input: LlmSystemAnalysisRequest): Promise<IpcResponse<LlmInsight>> {
    try {
      const doctorLines = Object.entries(input.doctorReport ?? {})
        .map(([key, value]) => `${key}: ${value.ok ? 'OK' : 'FAIL'} ${value.version || value.path || value.executionPolicy || value.error || ''}`.trim())
        .join('\n')

      const payload = await this.createStructuredCompletion<Partial<LlmInsight>>({
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
      })

      return { success: true, data: this.normalizeInsight(payload, '当前设备整体状态可用') }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async suggestRename(input: {
    instructions: string
    files: LlmRenameInputFile[]
  }): Promise<IpcResponse<LlmRenameSuggestion>> {
    if (!input.instructions.trim()) {
      return { success: false, error: '请先输入重命名目标' }
    }

    if (input.files.length === 0) {
      return { success: false, error: '请先添加待重命名文件' }
    }

    try {
      const payload = await this.createStructuredCompletion<{
        summary?: string
        namingPattern?: string
        warnings?: unknown
        suggestions?: Array<{ index?: number; newName?: string; reason?: string | null }>
      }>({
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
      })

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
        success: true,
        data: {
          summary: sanitizeText(payload.summary, '已生成一组建议命名'),
          namingPattern: sanitizeText(payload.namingPattern, '统一命名'),
          warnings: sanitizeList(payload.warnings),
          suggestions: normalizedSuggestions
        }
      }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async suggestSpaceCleanup(input: LlmSpaceCleanupSuggestionRequest): Promise<IpcResponse<LlmInsight>> {
    try {
      const largestFileLines = input.largestFiles
        .slice(0, 10)
        .map((item, index) => `${index + 1}. ${item.name} (${formatBytes(item.sizeBytes)}) ${item.path}`)
        .join('\n')

      const payload = await this.createStructuredCompletion<Partial<LlmInsight>>({
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
      })

      return { success: true, data: this.normalizeInsight(payload, '已生成当前目录的清理建议') }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  private getSharedConfig(): SharedLlmSettings {
    const settings = this.settings.getSettings()
    return {
      apiUrl: settings.translateApiUrl?.trim() || '',
      apiKey: settings.translateApiKey?.trim() || '',
      model: settings.translateModel?.trim() || ''
    }
  }

  private getMissingConfigFields(config: SharedLlmSettings): LlmConfigField[] {
    const missing: LlmConfigField[] = []
    if (!config.apiUrl) missing.push('baseUrl')
    if (!config.apiKey) missing.push('apiKey')
    if (!config.model) missing.push('model')
    return missing
  }

  private async createStructuredCompletion<T>({ systemPrompt, userPrompt }: StructuredCompletionInput): Promise<T> {
    const config = this.getSharedConfig()
    const missing = this.getMissingConfigFields(config)
    if (missing.length > 0) {
      throw new Error(`LLM 配置不完整：${missing.join(', ')}`)
    }

    const response = await this.fetchImpl(`${config.apiUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!response.ok) {
      let errorMessage = `LLM 请求失败 (${response.status})`
      try {
        const errorPayload = await response.json() as { error?: { message?: string } }
        errorMessage = errorPayload?.error?.message || errorMessage
      } catch {
        // ignore
      }
      throw new Error(errorMessage)
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload?.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('LLM 返回内容为空')
    }

    try {
      return JSON.parse(content) as T
    } catch {
      throw new Error(`LLM 返回的 JSON 解析失败: ${content.slice(0, 80)}`)
    }
  }

  private normalizeInsight(payload: Partial<LlmInsight>, fallbackSummary: string): LlmInsight {
    return {
      summary: sanitizeText(payload.summary, fallbackSummary),
      bullets: sanitizeList(payload.bullets),
      warnings: sanitizeList(payload.warnings),
      actions: sanitizeList(payload.actions)
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const llmService = new LlmService()
