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
import { ScreenshotInsightAdapter } from './llmAdapters/ScreenshotInsightAdapter'
import { RenameSuggestionAdapter } from './llmAdapters/RenameSuggestionAdapter'
import { SpaceCleanupAdapter } from './llmAdapters/SpaceCleanupAdapter'
import { SystemDiagnosisAdapter } from './llmAdapters/SystemDiagnosisAdapter'

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

export class LlmService {
  private readonly fetchImpl: FetchLike
  private readonly settings: SettingsLike
  private readonly ocr: OcrLike
  private readonly screenshotInsightAdapter: ScreenshotInsightAdapter
  private readonly renameSuggestionAdapter: RenameSuggestionAdapter
  private readonly systemDiagnosisAdapter: SystemDiagnosisAdapter
  private readonly spaceCleanupAdapter: SpaceCleanupAdapter

  constructor(dependencies: LlmServiceDependencies = {}) {
    this.fetchImpl = dependencies.fetch ?? fetch
    this.settings = dependencies.settingsService ?? settingsService
    this.ocr = dependencies.ocrService ?? ocrService
    this.screenshotInsightAdapter = new ScreenshotInsightAdapter()
    this.renameSuggestionAdapter = new RenameSuggestionAdapter()
    this.systemDiagnosisAdapter = new SystemDiagnosisAdapter()
    this.spaceCleanupAdapter = new SpaceCleanupAdapter()
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

      const prompts = this.screenshotInsightAdapter.buildTranslationCompletion(ocrLines)
      const payload = await this.createStructuredCompletion<{ lines?: Array<{ index?: number; translatedText?: string }> }>(prompts)
      return {
        success: true,
        data: this.screenshotInsightAdapter.mapTranslationResults(ocrLines, payload)
      }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async analyzeSystem(input: LlmSystemAnalysisRequest): Promise<IpcResponse<LlmInsight>> {
    try {
      const payload = await this.createStructuredCompletion<Partial<LlmInsight>>(
        this.systemDiagnosisAdapter.buildCompletion(input)
      )
      return { success: true, data: this.systemDiagnosisAdapter.mapInsightResult(payload) }
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
      }>(this.renameSuggestionAdapter.buildCompletion(input))

      return {
        success: true,
        data: this.renameSuggestionAdapter.mapSuggestionResult(input, payload)
      }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async suggestSpaceCleanup(input: LlmSpaceCleanupSuggestionRequest): Promise<IpcResponse<LlmInsight>> {
    try {
      const payload = await this.createStructuredCompletion<Partial<LlmInsight>>(
        this.spaceCleanupAdapter.buildCompletion(input)
      )
      return { success: true, data: this.spaceCleanupAdapter.mapInsightResult(payload) }
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

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const llmService = new LlmService()
